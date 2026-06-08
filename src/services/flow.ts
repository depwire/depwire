/**
 * Cross-service impact-flow traversal.
 *
 * Given a starting point (a service, optionally narrowed to a method/class/file),
 * walk the service-to-service channel graph and report every downstream flow:
 *   "if you touch <start>, these services/methods are reachable through these
 *    channels."
 *
 * Deterministic BFS over ServiceEdges. Each hop records the channel that
 * connects the two services and the method on each side (when known).
 */

import type { ServiceGraph, ServiceEdge } from './types.js';

export interface FlowStep {
  depth: number;
  fromService: string;
  toService: string;
  kind: string;
  identifier: string;
  httpMethod?: string;
  fromMethod?: string;
  toMethod?: string;
  fromSite?: string;   // filePath:line
  toSite?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface FlowResult {
  start: string;
  startFilter?: string;
  direction: 'downstream' | 'upstream';
  steps: FlowStep[];
  reachedServices: string[];
}

export interface FlowOptions {
  /** Restrict the starting edges to those whose source method/class/file matches this substring. */
  filter?: string;
  /** 'downstream' = what this service affects; 'upstream' = what affects this service. */
  direction?: 'downstream' | 'upstream';
  /** Max hop depth (default 10). */
  maxDepth?: number;
}

export function traceFlow(
  graph: ServiceGraph,
  startService: string,
  options: FlowOptions = {},
): FlowResult {
  const direction = options.direction ?? 'downstream';
  const maxDepth = options.maxDepth ?? 10;
  const filter = options.filter?.toLowerCase();

  // Adjacency: for downstream, index edges by source service; for upstream, by target.
  const adj = new Map<string, ServiceEdge[]>();
  for (const e of graph.edges) {
    const key = direction === 'downstream' ? e.source : e.target;
    const list = adj.get(key) ?? [];
    list.push(e);
    adj.set(key, list);
  }

  const steps: FlowStep[] = [];
  const reached = new Set<string>([startService]);
  const visitedEdges = new Set<string>();

  // Seed queue with start service's edges. If a filter is given, only seed
  // edges whose source-side method/class/file matches it.
  interface QueueItem { service: string; depth: number; }
  const queue: QueueItem[] = [{ service: startService, depth: 0 }];

  // Track whether we've applied the start filter yet (only at depth 0).
  while (queue.length > 0) {
    const { service, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const outgoing = adj.get(service) ?? [];
    for (const e of outgoing) {
      const peer = direction === 'downstream' ? e.target : e.source;

      // Apply start filter only at the first hop.
      if (depth === 0 && filter) {
        const sites = direction === 'downstream' ? e.sites : (e.targetSites ?? []);
        const matchesFilter = sites.some(s =>
          (s.method && s.method.toLowerCase().includes(filter)) ||
          (s.cls && s.cls.toLowerCase().includes(filter)) ||
          (s.filePath && s.filePath.toLowerCase().includes(filter)),
        );
        if (!matchesFilter) continue;
      }

      const edgeKey = `${e.source}|${e.target}|${e.kind}|${e.identifier}|${depth}`;
      if (visitedEdges.has(edgeKey)) continue;
      visitedEdges.add(edgeKey);

      const srcSite = (e.sites && e.sites[0]) || undefined;
      const tgtSite = (e.targetSites && e.targetSites[0]) || undefined;

      steps.push({
        depth: depth + 1,
        fromService: e.source,
        toService: e.target,
        kind: e.kind,
        identifier: e.identifier,
        httpMethod: e.httpMethod,
        fromMethod: srcSite?.method,
        toMethod: tgtSite?.method,
        fromSite: srcSite ? `${srcSite.filePath}:${srcSite.line}` : undefined,
        toSite: tgtSite ? `${tgtSite.filePath}:${tgtSite.line}` : undefined,
        confidence: e.confidence,
      });

      if (!reached.has(peer)) {
        reached.add(peer);
        queue.push({ service: peer, depth: depth + 1 });
      } else {
        // Still enqueue to continue exploring its edges at this depth, but
        // avoid infinite loops via visitedEdges above.
        queue.push({ service: peer, depth: depth + 1 });
      }
    }
  }

  return {
    start: startService,
    startFilter: options.filter,
    direction,
    steps,
    reachedServices: [...reached],
  };
}

export function renderFlowText(result: FlowResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Impact flow (${result.direction}) from: ${result.start}${result.startFilter ? ` [filter: ${result.startFilter}]` : ''}`);
  lines.push('═'.repeat(78));

  if (result.steps.length === 0) {
    lines.push('No cross-service flows found.');
    lines.push('');
    return lines.join('\n');
  }

  // Group steps by depth for a readable hop-by-hop view.
  const byDepth = new Map<number, FlowStep[]>();
  for (const s of result.steps) {
    const list = byDepth.get(s.depth) ?? [];
    list.push(s);
    byDepth.set(s.depth, list);
  }

  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    lines.push('');
    lines.push(`── hop ${depth} ${'─'.repeat(60)}`);
    for (const s of byDepth.get(depth)!) {
      const arrowLabel = s.kind === 'rest'
        ? `REST ${s.httpMethod ?? ''}`.trim()
        : s.kind;
      const fromM = s.fromMethod ? `${s.fromService}.${s.fromMethod}()` : s.fromService;
      const toM = s.toMethod ? `${s.toService}.${s.toMethod}()` : s.toService;
      const conf = s.confidence === 'low' ? ' (low)' : '';
      lines.push(`  ${fromM}`);
      lines.push(`    ── ${arrowLabel} : ${s.identifier}${conf} ──▶`);
      lines.push(`  ${toM}`);
      if (s.fromSite) lines.push(`       producer: ${s.fromSite}`);
      if (s.toSite) lines.push(`       consumer: ${s.toSite}`);
    }
  }

  lines.push('');
  lines.push(`Reached ${result.reachedServices.length} services: ${result.reachedServices.join(', ')}`);
  lines.push('');
  return lines.join('\n');
}
