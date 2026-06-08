/**
 * Service-graph orchestrator. Public API:
 *
 *   import { analyzeServices } from 'depwire-cli/services';
 *   const graph = analyzeServices('/path/to/parent', { configRepos: ['/path/to/config'] });
 *
 * Pure deterministic. No LLM, no embeddings.
 */

import type { ServiceGraph, ServiceNode } from './types.js';
import { discoverServices, readSpringApplicationName } from './discovery.js';
import { walkServiceSources, findEnclosingMethod } from './file-walker.js';
import type { SourceFile } from './file-walker.js';
import { PropertyResolver } from './property-resolver.js';
import { detectRestChannels } from './detectors/rest.js';
import { detectMessagingChannels } from './detectors/messaging.js';
import { detectConfiguredUrlChannels } from './detectors/config-url.js';
import { matchServices } from './matcher.js';
import type { Channel } from './types.js';

/**
 * Fill enclosingMethod / enclosingClass for each channel by locating the
 * channel's line in its source file and walking enclosing braces.
 */
function enrichEnclosingMethods(channels: Channel[], sources: SourceFile[]): void {
  const byPath = new Map<string, SourceFile>();
  for (const s of sources) byPath.set(s.relativePath, s);

  for (const ch of channels) {
    const file = byPath.get(ch.filePath);
    if (!file) continue;
    // Convert 1-based line to a character offset.
    const lines = file.content.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < ch.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    const { method, cls } = findEnclosingMethod(file.content, offset);
    if (method) ch.enclosingMethod = method;
    if (cls) ch.enclosingClass = cls;
  }
}

export interface AnalyzeServicesOptions {
  /** External Spring config repos (e.g. ucc-hub-apps-configurations). */
  configRepos?: string[];
  /**
   * Restrict external config loading to files whose name contains one of
   * these Spring profile tokens (e.g. ["prod"], ["qa1", "qa2"]). When omitted,
   * all environment files are loaded. Service-bundled application.yml /
   * application.properties are always loaded regardless of this filter.
   */
  profiles?: string[];
  /** Include nested services (multi-module Gradle builds). */
  includeNested?: boolean;
  /** Include test sources in detection. */
  includeTests?: boolean;
  /** Maximum directory depth when scanning for services (default: 2). */
  maxDepth?: number;
  /**
   * Add synthetic "external" nodes for inbound channels whose producer is not
   * in the scanned set (Kafka topics from upstream enterprise systems, REST
   * endpoints exposed by third-party services, etc.). When enabled, every
   * unmatched inbound channel becomes an edge from `external:<topic>` to the
   * consuming service, making external dependencies visible in the graph.
   */
  showExternalSources?: boolean;
  /** Verbose progress to stderr. */
  verbose?: boolean;
  /**
   * Drop edges below this confidence level. 'low' (default) keeps everything,
   * 'medium' drops low-confidence inferred edges, 'high' keeps only exact
   * matches. Agents acting on the graph should use 'medium' or 'high'.
   */
  minConfidence?: 'low' | 'medium' | 'high';
}

export async function analyzeServices(
  parentPath: string,
  options: AnalyzeServicesOptions = {},
): Promise<ServiceGraph> {
  const startTime = Date.now();

  const discovered = discoverServices(parentPath, {
    includeNested: options.includeNested,
    maxDepth: options.maxDepth,
  });

  if (options.verbose) {
    console.error(`[services] Discovered ${discovered.length} services under ${parentPath}`);
  }

  const services: ServiceNode[] = [];

  for (const svc of discovered) {
    if (options.verbose) {
      console.error(`[services]   scanning ${svc.name} (${svc.buildSystem})`);
    }

    const resolver = new PropertyResolver();
    resolver.load(svc.rootPath, options.configRepos ?? [], svc.name, options.profiles);

    const sources = walkServiceSources(svc.rootPath, { includeTests: options.includeTests });
    const restChannels = detectRestChannels(svc.name, sources, resolver);
    const messagingChannels = detectMessagingChannels(svc.name, sources, resolver);
    const configUrlChannels = detectConfiguredUrlChannels(svc.name, sources, resolver);
    const channels = [...restChannels, ...messagingChannels, ...configUrlChannels];

    // Enrich each channel with its enclosing method/class (deterministic,
    // brace-matched) so cross-service flow traversal can report method-level
    // impact ("touch method X → these flows break").
    enrichEnclosingMethods(channels, sources);

    services.push({
      name: svc.name,
      rootPath: svc.rootPath,
      buildSystem: svc.buildSystem,
      springApplicationName: readSpringApplicationName(svc.rootPath),
      filesScanned: sources.length,
      channels,
    });
  }

  const { edges, unresolved } = matchServices(services);

  // Optionally synthesize "external" nodes for inbound channels whose producer
  // is not in the scanned set. This makes upstream Kafka feeds, third-party
  // REST callers, and similar dependencies visible in the graph.
  let externalEdges: typeof edges = [];
  if (options.showExternalSources) {
    externalEdges = synthesizeExternalSourceEdges(services, edges);
  }
  const allEdges = [...edges, ...externalEdges];

  // Confidence filter for agent use: drop edges below the requested threshold.
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const minRank = rank[options.minConfidence ?? 'low'];
  const filteredEdges = allEdges.filter(e => rank[e.confidence] >= minRank);

  // Canonical ordering so output is reproducible across machines/filesystems
  // (readdir order can differ across OSes). Critical for agent diffing.
  const edgeKey = (e: ServiceGraph['edges'][number]) =>
    `${e.source}\u0000${e.target}\u0000${e.kind}\u0000${e.httpMethod ?? ''}\u0000${e.identifier}`;
  filteredEdges.sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  for (const e of filteredEdges) {
    e.sites.sort((x, y) => (x.filePath + ':' + x.line).localeCompare(y.filePath + ':' + y.line));
    if (e.targetSites) e.targetSites.sort((x, y) => (x.filePath + ':' + x.line).localeCompare(y.filePath + ':' + y.line));
  }

  services.sort((a, b) => a.name.localeCompare(b.name));
  for (const s of services) {
    s.channels.sort((a, b) =>
      `${a.direction}\u0000${a.kind}\u0000${a.identifier}\u0000${a.filePath}\u0000${a.line}`
        .localeCompare(`${b.direction}\u0000${b.kind}\u0000${b.identifier}\u0000${b.filePath}\u0000${b.line}`),
    );
  }

  unresolved.sort((a, b) =>
    `${a.serviceName}\u0000${a.kind}\u0000${a.identifier}\u0000${a.filePath}\u0000${a.line}`
      .localeCompare(`${b.serviceName}\u0000${b.kind}\u0000${b.identifier}\u0000${b.filePath}\u0000${b.line}`),
  );

  const stats = {
    serviceCount: services.length,
    edgeCount: filteredEdges.length,
    restEdges: filteredEdges.filter(e => e.kind === 'rest').length,
    kafkaEdges: filteredEdges.filter(e => e.kind === 'kafka').length,
    rabbitmqEdges: filteredEdges.filter(e => e.kind === 'rabbitmq').length,
    sqsEdges: filteredEdges.filter(e => e.kind === 'sqs').length,
    kinesisEdges: filteredEdges.filter(e => e.kind === 'kinesis').length,
    detectionTimeMs: Date.now() - startTime,
  };

  return {
    rootPath: parentPath,
    services,
    edges: filteredEdges,
    unresolved,
    stats,
  };
}

/**
 * For every inbound channel whose identifier has no matching outbound
 * producer in the scanned services, emit a synthetic "external" source edge
 * `external-<kind>:<identifier>` → consumingService. This surfaces upstream
 * Kafka feeds, third-party REST callbacks, and similar inbound dependencies
 * that originate outside the scanned repos.
 */
function synthesizeExternalSourceEdges(
  services: ServiceNode[],
  realEdges: ServiceGraph['edges'],
): ServiceGraph['edges'] {
  // Index outbound channels by `kind:identifier` so we can detect "covered" inbounds.
  const covered = new Set<string>();
  for (const svc of services) {
    for (const ch of svc.channels) {
      if (ch.direction !== 'outbound') continue;
      covered.add(ch.kind + ':' + ch.identifier);
    }
  }

  // Skip inbounds that are already a real edge target (some matchers pull in
  // partial-match inbounds from the same service estate).
  const realInboundTargets = new Set<string>();
  for (const e of realEdges) {
    realInboundTargets.add(e.kind + ':' + e.identifier + ':' + e.target);
  }

  const synthetic: ServiceGraph['edges'] = [];
  const seen = new Set<string>();
  for (const svc of services) {
    for (const ch of svc.channels) {
      if (ch.direction !== 'inbound') continue;
      // REST inbounds without an outside caller would just clutter the graph,
      // so we limit synthetic sources to message-broker channels.
      if (ch.kind === 'rest') continue;
      const k = ch.kind + ':' + ch.identifier;
      if (covered.has(k)) continue;
      if (realInboundTargets.has(k + ':' + svc.name)) continue;
      const externalName = `external-${ch.kind}:${ch.identifier}`;
      const dedupKey = externalName + '->' + svc.name;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      synthetic.push({
        source: externalName,
        target: svc.name,
        kind: ch.kind,
        identifier: ch.identifier,
        confidence: 'medium',
        sites: [{ filePath: ch.filePath, line: ch.line }],
      });
    }
  }
  return synthetic;
}

export type { ServiceGraph, ServiceNode, ServiceEdge, Channel, ChannelKind } from './types.js';

/**
 * Build the service graph and a config↔code drift report in one pass, reusing
 * the same property-resolution policy (config repos + profiles) so both views
 * are consistent.
 */
export async function analyzeServicesWithDrift(
  parentPath: string,
  options: AnalyzeServicesOptions = {},
): Promise<{ graph: ServiceGraph; drift: import('./drift.js').DriftReport }> {
  const graph = await analyzeServices(parentPath, options);
  const { detectDrift } = await import('./drift.js');
  const drift = detectDrift(graph, (serviceName, rootPath) => {
    const r = new PropertyResolver();
    r.load(rootPath, options.configRepos ?? [], serviceName, options.profiles);
    return r;
  });
  return { graph, drift };
}
