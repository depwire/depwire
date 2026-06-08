/**
 * Configuration ↔ code drift detection.
 *
 * Two independent views of cross-service wiring exist:
 *   1. CODE   — channels depwire detects from source (publish/consume calls).
 *   2. CONFIG — Spring Cloud Stream bindings declared in *.properties /
 *               *.yml (`spring.cloud.stream.bindings.<x>.destination`, etc).
 *
 * Drift = where these disagree. Two directions:
 *   - CONFIG_ONLY : a binding/destination is declared in config but no code
 *                   publishes or consumes it (stale/dead config, or wiring the
 *                   scanned source doesn't cover).
 *   - CODE_ONLY   : code publishes/consumes a destination that has no matching
 *                   config binding (missing config, or a hard-coded name).
 *
 * Deterministic: both sides come from parsing, no LLM. Useful as an agent
 * guardrail — surfaces config that lies about the real runtime wiring.
 */

import type { ServiceGraph } from './types.js';
import { PropertyResolver } from './property-resolver.js';

export interface DriftEntry {
  service: string;
  destination: string;
  binding?: string;
  detail: string;
}

export interface DriftReport {
  configOnly: DriftEntry[];   // declared in config, not seen in code
  codeOnly: DriftEntry[];     // seen in code, not declared in config
  stats: {
    configBindings: number;
    codeChannels: number;
    configOnly: number;
    codeOnly: number;
  };
}

/**
 * Build a drift report. Requires the already-computed service graph (for code
 * channels) plus the config repos / profiles used to load each service's
 * properties (so we can independently enumerate config bindings).
 *
 * `loadResolver` is a callback that returns a PropertyResolver for a given
 * service (the orchestrator supplies one that mirrors how the graph was built,
 * including profile filtering), keeping this module free of IO policy.
 */
export function detectDrift(
  graph: ServiceGraph,
  loadResolver: (serviceName: string, rootPath: string) => PropertyResolver,
): DriftReport {
  const configOnly: DriftEntry[] = [];
  const codeOnly: DriftEntry[] = [];
  let configBindings = 0;
  let codeChannels = 0;

  for (const svc of graph.services) {
    const resolver = loadResolver(svc.name, svc.rootPath);

    // --- config side: every stream binding destination this service declares ---
    const cfg = new Map<string, string>(); // destination -> binding name
    for (const key of resolver.ownKeysMatching(/^spring\.cloud\.stream\.bindings\.[^.]+\.destination$/)) {
      const m = key.match(/^spring\.cloud\.stream\.bindings\.([^.]+)\.destination$/);
      if (!m) continue;
      const val = resolver.getOwn(key);
      if (val === undefined) continue;
      const dest = resolver.resolve(val);
      cfg.set(dest, m[1]);
      configBindings++;
    }

    // --- code side: destinations this service actually publishes/consumes ---
    const codeDests = new Set<string>();
    for (const ch of svc.channels) {
      if (ch.kind === 'rest') continue; // drift only covers broker bindings
      codeDests.add(ch.identifier);
      // RabbitMQ producers may carry a "queue.routing-key" form; index the head too.
      const dot = ch.identifier.indexOf('.');
      if (dot > 0) codeDests.add(ch.identifier.slice(0, dot));
      codeChannels++;
    }

    // CONFIG_ONLY: declared destination that code never touches.
    for (const [dest, binding] of cfg) {
      const touched = codeDests.has(dest) ||
        [...codeDests].some(d => d === dest || d.startsWith(dest + '.') || dest.startsWith(d + '.'));
      if (!touched) {
        configOnly.push({
          service: svc.name,
          destination: dest,
          binding,
          detail: `binding "${binding}" → destination "${dest}" declared in config but no publish/consume found in code`,
        });
      }
    }

    // CODE_ONLY: a code destination with no config binding declaring it.
    for (const ch of svc.channels) {
      if (ch.kind === 'rest') continue;
      // Skip channels that came straight from a binding (they're config-backed).
      const bindingName = ch.metadata?.bindingName as string | undefined;
      if (bindingName && resolver.getOwn(`spring.cloud.stream.bindings.${bindingName}.destination`) !== undefined) {
        continue;
      }
      const dest = ch.identifier;
      const head = dest.includes('.') ? dest.slice(0, dest.indexOf('.')) : dest;
      const declared = cfg.has(dest) || cfg.has(head);
      if (!declared) {
        codeOnly.push({
          service: svc.name,
          destination: dest,
          detail: `${ch.direction} ${ch.kind} "${dest}" in code (${ch.filePath}:${ch.line}) has no matching stream binding in config`,
        });
      }
    }
  }

  // Stable ordering.
  const sortFn = (a: DriftEntry, b: DriftEntry) =>
    (a.service + a.destination).localeCompare(b.service + b.destination);
  configOnly.sort(sortFn);
  codeOnly.sort(sortFn);

  return {
    configOnly,
    codeOnly,
    stats: {
      configBindings,
      codeChannels,
      configOnly: configOnly.length,
      codeOnly: codeOnly.length,
    },
  };
}

export function renderDriftText(report: DriftReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('Config ↔ Code drift report');
  lines.push('═'.repeat(72));
  lines.push(`Config stream bindings: ${report.stats.configBindings}`);
  lines.push(`Code broker channels:   ${report.stats.codeChannels}`);
  lines.push(`CONFIG-ONLY (declared, not used in code): ${report.stats.configOnly}`);
  lines.push(`CODE-ONLY   (used in code, not declared): ${report.stats.codeOnly}`);
  lines.push('');

  if (report.configOnly.length) {
    lines.push('▼ CONFIG-ONLY — stream bindings declared but no code publishes/consumes them');
    lines.push('─'.repeat(72));
    let cur = '';
    for (const e of report.configOnly) {
      if (e.service !== cur) { lines.push(`  ${e.service}`); cur = e.service; }
      lines.push(`    · ${e.destination}  (binding: ${e.binding})`);
    }
    lines.push('');
  }

  if (report.codeOnly.length) {
    lines.push('▲ CODE-ONLY — broker destinations used in code but not declared in config');
    lines.push('─'.repeat(72));
    let cur = '';
    for (const e of report.codeOnly) {
      if (e.service !== cur) { lines.push(`  ${e.service}`); cur = e.service; }
      lines.push(`    · ${e.destination}`);
    }
    lines.push('');
  }

  if (!report.configOnly.length && !report.codeOnly.length) {
    lines.push('No drift — config bindings and code channels are consistent.');
    lines.push('');
  }
  return lines.join('\n');
}
