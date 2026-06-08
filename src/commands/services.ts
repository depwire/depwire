import { resolve } from 'path';
import { writeFileSync } from 'fs';
import { analyzeServices, analyzeServicesWithDrift } from '../services/index.js';
import { renderText, renderMermaid, renderDot } from '../services/render.js';
import { renderHtml } from '../services/render-html.js';
import { renderDriftText } from '../services/drift.js';
import { traceFlow, renderFlowText } from '../services/flow.js';
import { traceMethodFlow, renderMethodFlow } from '../services/method-flow.js';

export interface ServicesOptions {
  configRepo?: string[];
  profile?: string[];
  externalSources?: boolean;
  minConfidence?: 'low' | 'medium' | 'high';
  format?: 'text' | 'json' | 'mermaid' | 'dot' | 'html';
  output?: string;
  includeNested?: boolean;
  includeTests?: boolean;
  maxDepth?: string;
  unresolved?: boolean;
  verbose?: boolean;
  open?: boolean;
}

export async function servicesCommand(
  parentPath: string | undefined,
  options: ServicesOptions,
): Promise<void> {
  const root = resolve(parentPath || '.');
  const format = options.format ?? 'text';

  const graph = await analyzeServices(root, {
    configRepos: options.configRepo?.map(p => resolve(p)),
    profiles: options.profile,
    showExternalSources: options.externalSources,
    minConfidence: options.minConfidence,
    includeNested: options.includeNested,
    includeTests: options.includeTests,
    maxDepth: options.maxDepth ? parseInt(options.maxDepth, 10) : undefined,
    verbose: options.verbose,
  });

  let output: string;
  switch (format) {
    case 'json':
      output = JSON.stringify(graph, null, 2);
      break;
    case 'mermaid':
      output = renderMermaid(graph);
      break;
    case 'dot':
      output = renderDot(graph);
      break;
    case 'html':
      output = renderHtml(graph);
      break;
    case 'text':
    default:
      output = renderText(graph);
      break;
  }

  if (options.output) {
    writeFileSync(resolve(options.output), output, 'utf-8');
    console.error(`Wrote ${format} output to ${options.output}`);
    if (format === 'html' && options.open !== false) {
      try {
        const open = (await import('open')).default;
        await open(resolve(options.output));
      } catch {
        // best effort
      }
    }
  } else if (format === 'html') {
    // Default: write to a temp file and open it
    const { tmpdir } = await import('os');
    const path = resolve(tmpdir(), `depwire-services-${Date.now()}.html`);
    writeFileSync(path, output, 'utf-8');
    console.error(`Wrote ${format} output to ${path}`);
    if (options.open !== false) {
      try {
        const open = (await import('open')).default;
        await open(path);
      } catch {
        console.error(`Open it manually: ${path}`);
      }
    }
  } else {
    console.log(output);
  }
}

export interface FlowOptions {
  configRepo?: string[];
  profile?: string[];
  externalSources?: boolean;
  service?: string;
  symbol?: string;
  method?: string;
  direction?: 'downstream' | 'upstream';
  depth?: string;
  format?: 'text' | 'json';
  output?: string;
  includeNested?: boolean;
  includeTests?: boolean;
  maxDepth?: string;
  verbose?: boolean;
}

/**
 * `depwire services-flow` — trace cross-service impact from a method/service.
 */
export async function servicesFlowCommand(
  parentPath: string | undefined,
  options: FlowOptions,
): Promise<void> {
  const root = resolve(parentPath || '.');
  if (!options.service) {
    console.error('Error: --service <name> is required (the service that owns the method you are changing).');
    process.exitCode = 1;
    return;
  }

  const graph = await analyzeServices(root, {
    configRepos: options.configRepo?.map(p => resolve(p)),
    profiles: options.profile,
    showExternalSources: options.externalSources,
    includeNested: options.includeNested,
    includeTests: options.includeTests,
    maxDepth: options.maxDepth ? parseInt(options.maxDepth, 10) : undefined,
    verbose: options.verbose,
  });

  // Resolve the start service name (allow fuzzy/substring match).
  const match = graph.services.find(s => s.name === options.service)
    ?? graph.services.find(s => s.name.toLowerCase().includes(options.service!.toLowerCase()));
  if (!match) {
    console.error(`Error: service "${options.service}" not found. Available services:`);
    for (const s of graph.services) console.error('  ' + s.name);
    process.exitCode = 1;
    return;
  }

  // When a specific symbol is named, use the symbol-aware flow: connect the
  // symbol through the service's internal call/reference graph to its
  // inbound/outbound channels, then hop across services. Otherwise fall back
  // to the service-level flow.
  const symbol = options.symbol || options.method;
  if (symbol) {
    const result = await traceMethodFlow(graph, match.name, symbol, {
      maxDepth: options.depth ? parseInt(options.depth, 10) : undefined,
      verbose: options.verbose,
    });
    const output = options.format === 'json'
      ? JSON.stringify(result, null, 2)
      : renderMethodFlow(result);
    if (options.output) {
      writeFileSync(resolve(options.output), output, 'utf-8');
      console.error(`Wrote flow output to ${options.output}`);
    } else {
      console.log(output);
    }
    return;
  }

  const result = traceFlow(graph, match.name, {
    filter: options.method,
    direction: options.direction ?? 'downstream',
    maxDepth: options.depth ? parseInt(options.depth, 10) : undefined,
  });

  const output = options.format === 'json'
    ? JSON.stringify(result, null, 2)
    : renderFlowText(result);

  if (options.output) {
    writeFileSync(resolve(options.output), output, 'utf-8');
    console.error(`Wrote flow output to ${options.output}`);
  } else {
    console.log(output);
  }
}

export interface DriftOptions {
  configRepo?: string[];
  profile?: string[];
  format?: 'text' | 'json';
  output?: string;
  includeNested?: boolean;
  includeTests?: boolean;
  maxDepth?: string;
  failOnDrift?: boolean;
  verbose?: boolean;
}

/**
 * `depwire services-drift` — report where config-declared bindings disagree
 * with the channels detected in code (both directions).
 */
export async function servicesDriftCommand(
  parentPath: string | undefined,
  options: DriftOptions,
): Promise<void> {
  const root = resolve(parentPath || '.');
  const { drift } = await analyzeServicesWithDrift(root, {
    configRepos: options.configRepo?.map(p => resolve(p)),
    profiles: options.profile,
    includeNested: options.includeNested,
    includeTests: options.includeTests,
    maxDepth: options.maxDepth ? parseInt(options.maxDepth, 10) : undefined,
    verbose: options.verbose,
  });

  const output = options.format === 'json'
    ? JSON.stringify(drift, null, 2)
    : renderDriftText(drift);

  if (options.output) {
    writeFileSync(resolve(options.output), output, 'utf-8');
    console.error(`Wrote drift report to ${options.output}`);
  } else {
    console.log(output);
  }

  if (options.failOnDrift && (drift.stats.configOnly > 0 || drift.stats.codeOnly > 0)) {
    process.exitCode = 1;
  }
}
