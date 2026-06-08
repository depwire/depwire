/**
 * Method-aware cross-service impact flow.
 *
 * Unlike the service-level traceFlow (which hops service→service through any
 * channel), this connects a *specific method* to the channels it actually
 * reaches through the service's INTERNAL call graph:
 *
 *   - upstream:   inbound channel handler ──calls──▶ ... ──▶ M
 *                 (which external triggers eventually invoke M)
 *   - downstream: M ──calls──▶ ... ──▶ outbound channel emitter
 *                 (which external calls M's behavior can trigger)
 *
 * It uses depwire's own symbol graph (parseProject + buildGraph + getImpact),
 * which now resolves cross-file Java instance calls. Channel sites are mapped
 * to symbol nodes via (filePath, enclosingMethod). Then it hops to the
 * connected services and recurses.
 *
 * Fully deterministic: call edges from tree-sitter, channel edges from the
 * service detectors, property resolution from config. No LLM.
 */

import { DirectedGraph } from 'graphology';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { getImpact, getDependencies } from '../graph/queries.js';
import type { ServiceGraph, ServiceNode, Channel } from './types.js';

export interface MethodFlowStep {
  depth: number;
  fromService: string;
  fromMethod?: string;
  toService: string;
  toMethod?: string;
  kind: string;
  identifier: string;
  httpMethod?: string;
  fromSite?: string;
  toSite?: string;
  /** How the start method connects to this channel within its service. */
  via: 'reaches-emitter' | 'reached-by-handler' | 'service-hop';
  confidence: 'high' | 'medium' | 'low';
}

export interface MethodFlowResult {
  start: string;
  method: string;
  internalDependents: number;
  internalAffectedFiles: number;
  steps: MethodFlowStep[];
  reachedServices: string[];
  note?: string;
}

/**
 * Build (once) and cache a service's intra symbol graph.
 */
async function buildServiceSymbolGraph(svc: ServiceNode): Promise<DirectedGraph> {
  const files = await parseProject(svc.rootPath);
  return buildGraph(files, svc.rootPath);
}

/**
 * Find symbol node IDs in `graph` matching `target`. Accepts any symbol kind
 * (class, interface, enum, method, function, field/property, constant).
 *
 * Matching forms (case-insensitive):
 *   - exact node id ("path::Name" or "path::Class.member")
 *   - bare name           ("validateTemplateParameters", "CommonHelper")
 *   - scoped name         ("CommonHelper.someField")
 */
function findSymbolNodes(graph: DirectedGraph, target: string): string[] {
  const lower = target.toLowerCase();
  const ids: string[] = [];

  // Exact node id.
  if (target.includes('::') && graph.hasNode(target)) return [target];

  graph.forEachNode((id, attrs) => {
    const name = String(attrs.name).toLowerCase();
    const scoped = attrs.scope ? `${String(attrs.scope).toLowerCase()}.${name}` : name;
    if (name === lower || scoped === lower) {
      ids.push(id);
    }
  });
  return ids;
}

/**
 * Set of symbol IDs that transitively DEPEND ON (call) any of `seeds`.
 * (BFS over in-edges = callers.)
 */
function collectCallers(graph: DirectedGraph, seeds: string[]): Set<string> {
  const visited = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const pred of graph.inNeighbors(cur)) {
      if (!visited.has(pred)) { visited.add(pred); queue.push(pred); }
    }
  }
  return visited;
}

/**
 * Set of symbol IDs transitively CALLED BY any of `seeds`.
 * (BFS over out-edges = callees.)
 */
function collectCallees(graph: DirectedGraph, seeds: string[]): Set<string> {
  const visited = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const succ of graph.outNeighbors(cur)) {
      if (!visited.has(succ)) { visited.add(succ); queue.push(succ); }
    }
  }
  return visited;
}

/**
 * Does any symbol ID in `set` correspond to the given channel's enclosing
 * method + file? We match on file path suffix and method name because the
 * symbol graph uses paths relative to the service root, same as channels.
 */
function channelInSet(ch: Channel, set: Set<string>, graph: DirectedGraph): boolean {
  if (!ch.enclosingMethod) return false;
  const wantMethod = ch.enclosingMethod.toLowerCase();
  const wantFile = ch.filePath;
  for (const id of set) {
    if (!graph.hasNode(id)) continue;
    const attrs = graph.getNodeAttributes(id);
    if (String(attrs.name).toLowerCase() !== wantMethod) continue;
    // filePath match (channel paths and symbol paths are both service-relative)
    if (attrs.filePath === wantFile || String(attrs.filePath).endsWith(wantFile) || wantFile.endsWith(String(attrs.filePath))) {
      return true;
    }
  }
  return false;
}

export async function traceMethodFlow(
  serviceGraph: ServiceGraph,
  startServiceName: string,
  method: string,
  options: { maxDepth?: number; verbose?: boolean } = {},
): Promise<MethodFlowResult> {
  const maxDepth = options.maxDepth ?? 8;
  const startSvc = serviceGraph.services.find(s => s.name === startServiceName);
  if (!startSvc) {
    return {
      start: startServiceName, method, internalDependents: 0,
      internalAffectedFiles: 0, steps: [], reachedServices: [],
      note: `Service ${startServiceName} not found.`,
    };
  }

  // 1. Build the start service's intra symbol graph.
  if (options.verbose) console.error(`[flow] building symbol graph for ${startServiceName}`);
  const symGraph = await buildServiceSymbolGraph(startSvc);

  const methodNodes = findSymbolNodes(symGraph, method);
  if (methodNodes.length === 0) {
    return {
      start: startServiceName, method, internalDependents: 0,
      internalAffectedFiles: 0, steps: [], reachedServices: [startServiceName],
      note: `Symbol "${method}" not found in ${startServiceName}.`,
    };
  }

  // Expand seeds: if a seed is a class/interface/enum, also seed all of its
  // members (methods, fields), because changing a type affects everything
  // declared inside it. Members are identified by scope === class name and
  // same file.
  const seedSet = new Set<string>(methodNodes);
  for (const seedId of methodNodes) {
    if (!symGraph.hasNode(seedId)) continue;
    const a = symGraph.getNodeAttributes(seedId);
    if (a.kind === 'class' || a.kind === 'interface' || a.kind === 'enum') {
      const className = String(a.name);
      symGraph.forEachNode((id, attrs) => {
        if (attrs.scope === className && attrs.filePath === a.filePath) {
          seedSet.add(id);
        }
      });
    }
  }
  const seeds = [...seedSet];

  // 2. Internal reachability.
  //    callers   = everything that transitively calls/uses the seeds (impacted)
  //    callees   = everything the seeds transitively call (their behavior can trigger)
  const callers = collectCallers(symGraph, seeds);
  const callees = collectCallees(symGraph, seeds);

  // Aggregate impact stats from depwire's own analysis across all seeds.
  let totalDependents = 0;
  const affectedFiles = new Set<string>();
  for (const mn of seeds) {
    const imp = getImpact(symGraph, mn);
    totalDependents += imp.transitiveDependents.length;
    for (const f of imp.affectedFiles) affectedFiles.add(f);
  }

  // 3. Map the start service's channels into the flow.
  //    - an OUTBOUND channel whose emitter method is in `callees` ⇒ M can
  //      trigger that external call ("downstream").
  //    - an INBOUND channel whose handler method is in `callers` ⇒ that
  //      external entry point flows into M ("upstream", reached-by-handler).
  const steps: MethodFlowStep[] = [];
  const reached = new Set<string>([startServiceName]);
  const seededServices: Array<{ service: string; direction: 'downstream' | 'upstream' }> = [];

  for (const e of serviceGraph.edges) {
    // downstream: start service emits → find the emitting channel site
    if (e.source === startServiceName) {
      const site = (e.sites || []).find(s =>
        s.method && callees.size > 0 &&
        [...callees].some(id => {
          if (!symGraph.hasNode(id)) return false;
          const a = symGraph.getNodeAttributes(id);
          return String(a.name).toLowerCase() === s.method!.toLowerCase() &&
            (a.filePath === s.filePath || String(a.filePath).endsWith(s.filePath) || s.filePath.endsWith(String(a.filePath)));
        }),
      );
      if (site) {
        const tgt = (e.targetSites || [])[0];
        steps.push({
          depth: 1,
          fromService: e.source, fromMethod: site.method,
          toService: e.target, toMethod: tgt?.method,
          kind: e.kind, identifier: e.identifier, httpMethod: e.httpMethod,
          fromSite: `${site.filePath}:${site.line}`,
          toSite: tgt ? `${tgt.filePath}:${tgt.line}` : undefined,
          via: 'reaches-emitter', confidence: e.confidence,
        });
        if (!reached.has(e.target)) { reached.add(e.target); seededServices.push({ service: e.target, direction: 'downstream' }); }
      }
    }
    // upstream: someone calls into start service → does that inbound handler reach M?
    if (e.target === startServiceName) {
      const tgtSite = (e.targetSites || []).find(s =>
        s.method && callers.size > 0 &&
        [...callers].some(id => {
          if (!symGraph.hasNode(id)) return false;
          const a = symGraph.getNodeAttributes(id);
          return String(a.name).toLowerCase() === s.method!.toLowerCase() &&
            (a.filePath === s.filePath || String(a.filePath).endsWith(s.filePath) || s.filePath.endsWith(String(a.filePath)));
        }),
      );
      if (tgtSite) {
        const src = (e.sites || [])[0];
        steps.push({
          depth: 1,
          fromService: e.source, fromMethod: src?.method,
          toService: e.target, toMethod: tgtSite.method,
          kind: e.kind, identifier: e.identifier, httpMethod: e.httpMethod,
          fromSite: src ? `${src.filePath}:${src.line}` : undefined,
          toSite: `${tgtSite.filePath}:${tgtSite.line}`,
          via: 'reached-by-handler', confidence: e.confidence,
        });
        if (!reached.has(e.source)) { reached.add(e.source); seededServices.push({ service: e.source, direction: 'upstream' }); }
      }
    }
  }

  // 4. Continue hopping at the service level from each seeded peer (further
  //    hops are service-level since we don't re-parse every peer's call graph).
  const adjDown = new Map<string, ServiceGraph['edges']>();
  const adjUp = new Map<string, ServiceGraph['edges']>();
  for (const e of serviceGraph.edges) {
    (adjDown.get(e.source) ?? adjDown.set(e.source, []).get(e.source)!).push(e);
    (adjUp.get(e.target) ?? adjUp.set(e.target, []).get(e.target)!).push(e);
  }

  const queue: Array<{ service: string; direction: 'downstream' | 'upstream'; depth: number }> =
    seededServices.map(s => ({ ...s, depth: 1 }));
  const visitedEdge = new Set<string>();
  while (queue.length) {
    const { service, direction, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    const edges = (direction === 'downstream' ? adjDown.get(service) : adjUp.get(service)) ?? [];
    for (const e of edges) {
      const peer = direction === 'downstream' ? e.target : e.source;
      const ek = `${e.source}|${e.target}|${e.kind}|${e.identifier}|${depth}`;
      if (visitedEdge.has(ek)) continue;
      visitedEdge.add(ek);
      const src = (e.sites || [])[0];
      const tgt = (e.targetSites || [])[0];
      steps.push({
        depth: depth + 1,
        fromService: e.source, fromMethod: src?.method,
        toService: e.target, toMethod: tgt?.method,
        kind: e.kind, identifier: e.identifier, httpMethod: e.httpMethod,
        fromSite: src ? `${src.filePath}:${src.line}` : undefined,
        toSite: tgt ? `${tgt.filePath}:${tgt.line}` : undefined,
        via: 'service-hop', confidence: e.confidence,
      });
      if (!reached.has(peer)) {
        reached.add(peer);
        queue.push({ service: peer, direction, depth: depth + 1 });
      }
    }
  }

  return {
    start: startServiceName,
    method,
    internalDependents: totalDependents,
    internalAffectedFiles: affectedFiles.size,
    steps,
    reachedServices: [...reached],
  };
}

export function renderMethodFlow(result: MethodFlowResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Symbol impact: ${result.method} in ${result.start}`);
  lines.push('═'.repeat(78));
  if (result.note) {
    lines.push(result.note);
    lines.push('');
    return lines.join('\n');
  }
  lines.push(`Within ${result.start}:  ${result.internalDependents} transitive dependents across ${result.internalAffectedFiles} files`);
  lines.push('');

  const upstreamHops = result.steps.filter(s => s.via === 'reached-by-handler');
  if (upstreamHops.length) {
    lines.push('▲ Upstream — external entry points that flow INTO this symbol:');
    lines.push('─'.repeat(70));
    for (const s of upstreamHops) {
      const label = s.kind === 'rest' ? `REST ${s.httpMethod ?? ''}`.trim() : s.kind;
      lines.push(`  ${s.fromService}${s.fromMethod ? '.' + s.fromMethod + '()' : ''}`);
      lines.push(`     ── ${label} : ${s.identifier} ──▶ ${s.toService}.${s.toMethod ?? '?'}()  →(reaches ${result.method})`);
      if (s.fromSite) lines.push(`        caller:   ${s.fromSite}`);
      if (s.toSite)   lines.push(`        handler:  ${s.toSite}`);
    }
    lines.push('');
  }

  const directDown = result.steps.filter(s => s.via === 'reaches-emitter');
  if (directDown.length) {
    lines.push('▼ Downstream — external calls this symbol can trigger:');
    lines.push('─'.repeat(70));
    for (const s of directDown) {
      const label = s.kind === 'rest' ? `REST ${s.httpMethod ?? ''}`.trim() : s.kind;
      lines.push(`  ${result.method} →…→ ${s.fromService}.${s.fromMethod ?? '?'}()`);
      lines.push(`     ── ${label} : ${s.identifier} ──▶ ${s.toService}${s.toMethod ? '.' + s.toMethod + '()' : ''}`);
      if (s.fromSite) lines.push(`        emitter:  ${s.fromSite}`);
      if (s.toSite)   lines.push(`        consumer: ${s.toSite}`);
    }
    lines.push('');
  }

  const hops = result.steps.filter(s => s.via === 'service-hop');
  if (hops.length) {
    lines.push('↪ Further service hops:');
    lines.push('─'.repeat(70));
    for (const s of hops) {
      const label = s.kind === 'rest' ? `REST ${s.httpMethod ?? ''}`.trim() : s.kind;
      lines.push(`  [hop ${s.depth}] ${s.fromService} ── ${label} : ${s.identifier} ──▶ ${s.toService}`);
    }
    lines.push('');
  }

  if (!upstreamHops.length && !directDown.length) {
    lines.push('No cross-service channel is reachable from this symbol through the');
    lines.push('internal call/reference graph. The change is contained within ' + result.start + '.');
    lines.push('');
  }

  lines.push(`Reached ${result.reachedServices.length} services: ${result.reachedServices.join(', ')}`);
  lines.push('');
  return lines.join('\n');
}
