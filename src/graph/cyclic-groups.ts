import type { DirectedGraph } from 'graphology';

export const DIMENSIONS_VERSION = '2026-09-30-cyclic-groups-v1' as const;
export const HEALTH_METHODOLOGY_CHANGE = 'Health methodology changed: Cyclic Dependency Groups now measures the share of files in mutually dependent groups and the size of the largest group. The previous cycle count was incomplete and order-dependent. Scores across this boundary are not directly comparable; no improvement or regression delta is shown.';
export type CyclicEdgeView = 'legacy-normalized-dependencies-v1' | 'value-dependencies-v1' | 'all-dependencies-v1';
export interface CyclicEvidence {
  sourceFile: string; targetFile: string; sourceSymbol: string; targetSymbol: string;
  kind: string; line: number | null; normalizedTypeOnlyImport: boolean;
}
export interface CyclicGroup {
  key: string; files: string[]; size: number;
  witness: { files: string[]; edges: CyclicEvidence[] };
}
interface Identity {
  contractVersion: 'cyclic-groups-v1'; dimensions_v: typeof DIMENSIONS_VERSION;
  edgeView: CyclicEdgeView; sourceCoverage: 'complete' | 'partial' | 'unknown';
}
export interface AnalyzedCyclicGroups extends Identity {
  status: 'analyzed'; graphFileCount: number; groupCount: number; cyclicFileCount: number;
  cyclicFileRatio: number; largestGroupSize: number; score: number | null; groups: CyclicGroup[];
}
export type CyclicGroupsResult = AnalyzedCyclicGroups | (Identity & {
  status: 'no_graph_files' | 'unavailable'; score: null; reason: string;
});
export interface CyclicOptions {
  edgeView?: CyclicEdgeView;
  sourceCoverage?: Identity['sourceCoverage'];
  witnessAnchor?: (file: string) => boolean;
}

/** Unicode scalar ordering, independent of locale and UTF-16 surrogate order. */
export function compareCanonical(a: string, b: string): number {
  const x = Array.from(a, c => c.codePointAt(0)!);
  const y = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
function compareEvidence(a: CyclicEvidence, b: CyclicEvidence): number {
  for (const key of ['sourceFile','targetFile','sourceSymbol','targetSymbol','kind'] as const) {
    const order = compareCanonical(a[key],b[key]);
    if (order) return order;
  }
  if (a.line !== b.line) return a.line === null ? 1 : b.line === null ? -1 : a.line - b.line;
  return Number(a.normalizedTypeOnlyImport) - Number(b.normalizedTypeOnlyImport);
}
const sorted = (values: Iterable<string>) => Array.from(values).sort(compareCanonical);
const sortedPairs = (values: Iterable<string>) => Array.from(values, value => JSON.parse(value) as string[]).sort((a,b) => compareCanonical(a[0],b[0]) || compareCanonical(a[1],b[1]));
const pairKey = (a: string, b: string) => JSON.stringify([a, b]);
const KINDS = new Set(['imports', 'calls', 'extends', 'implements', 'inherits', 'decorates', 'references', 'injects', 'uses', 'rest-api', 'subprocess', 'references-type']);
function interpolate(value: number, anchors: number[][]): number {
  for (let i = 1; i < anchors.length; i++) {
    const [x, y] = anchors[i]; const [px, py] = anchors[i - 1];
    if (value <= x) return py + (y - py) * (value - px) / (x - px);
  }
  return anchors[anchors.length - 1][1];
}
export function scoreCyclicGroups(fileCount: number, cyclicFiles: number, largest: number): number | null {
  if (!fileCount) return null;
  const p = interpolate(100 * cyclicFiles / fileCount, [[0,0],[1,5],[5,20],[15,40],[30,60],[50,70],[100,80]]);
  const q = interpolate(largest, [[0,0],[2,0],[5,2],[10,5],[25,10],[50,15],[100,18],[200,20]]);
  return Math.min(cyclicFiles ? 99 : 100, Math.max(0, Math.round(100 - p - q)));
}

function project(graph: DirectedGraph, view: CyclicEdgeView) {
  const files = new Set<string>();
  graph.forEachNode((_id, attrs) => {
    if (typeof attrs.filePath !== 'string' || !attrs.filePath) throw new Error('Graph node has no filePath');
    files.add(attrs.filePath);
  });
  const adjacency = new Map(sorted(files).map(file => [file, new Set<string>()]));
  const reverse = new Map(sorted(files).map(file => [file, new Set<string>()]));
  const evidence = new Map<string, CyclicEvidence>();
  graph.forEachEdge((_id, attrs, source, originalTarget) => {
    if (!KINDS.has(attrs.kind)) throw new Error(`Unknown dependency kind: ${String(attrs.kind)}`);
    let target = originalTarget; let kind = attrs.kind; let normalized = false;
    if (kind === 'references-type' && view !== 'all-dependencies-v1') {
      if (view !== 'legacy-normalized-dependencies-v1' || attrs.typeOnlyImport !== true || attrs.typeOnlyFallback === true) return;
      if (typeof attrs.originalImportTarget === 'string' && graph.hasNode(attrs.originalImportTarget)) target = attrs.originalImportTarget;
      kind = 'imports'; normalized = true;
    }
    const a = graph.getNodeAttribute(source, 'filePath') as string;
    const b = graph.getNodeAttribute(target, 'filePath') as string;
    if (a === b) return;
    adjacency.get(a)!.add(b); reverse.get(b)!.add(a);
    const item: CyclicEvidence = {sourceFile:a, targetFile:b, sourceSymbol:source, targetSymbol:target, kind,
      line: typeof attrs.line === 'number' ? attrs.line : null, normalizedTypeOnlyImport:normalized};
    const key = pairKey(a,b); const previous = evidence.get(key);
    if (!previous || compareEvidence(item, previous) < 0) evidence.set(key,item);
  });
  return {files:sorted(files), adjacency, reverse, evidence};
}

/** Iterative Kosaraju: no recursion limit, no bounded/simple-cycle enumeration. */
function components(files: string[], adjacency: Map<string, Set<string>>, reverse: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>(); const finish: string[] = [];
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    const stack: Array<{file:string; neighbors:string[]; next:number}> = [{file,neighbors:sorted(adjacency.get(file)!),next:0}];
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.next === top.neighbors.length) { finish.push(top.file); stack.pop(); continue; }
      const next = top.neighbors[top.next++];
      if (!seen.has(next)) { seen.add(next); stack.push({file:next,neighbors:sorted(adjacency.get(next)!),next:0}); }
    }
  }
  seen.clear(); const groups: string[][] = [];
  for (const file of finish.reverse()) {
    if (seen.has(file)) continue;
    const members: string[] = []; const stack = [file]; seen.add(file);
    while (stack.length) {
      const current = stack.pop()!; members.push(current);
      for (const next of reverse.get(current)!) if (!seen.has(next)) {seen.add(next); stack.push(next);}
    }
    if (members.length > 1) groups.push(sorted(members));
  }
  // Disjoint groups have different first members.
  return groups.sort((a,b) => compareCanonical(a[0],b[0]));
}

export function analyzeCyclicGroups(graph: DirectedGraph, options: CyclicOptions = {}): CyclicGroupsResult {
  const identity: Identity = {contractVersion:'cyclic-groups-v1', dimensions_v:DIMENSIONS_VERSION,
    edgeView:options.edgeView ?? 'legacy-normalized-dependencies-v1', sourceCoverage:options.sourceCoverage ?? 'unknown'};
  try {
    const {files,adjacency,reverse,evidence} = project(graph,identity.edgeView);
    if (!files.length) return {...identity,status:'no_graph_files',score:null,reason:'No graph-bearing files were analyzed.'};
    const groups = components(files,adjacency,reverse).map(members => {
      const memberSet = new Set(members);
      const anchor = members.find(options.witnessAnchor ?? (() => true)) ?? members[0];
      // Reverse BFS yields shortest distances back to the anchor.
      const distances = new Map([[anchor,0]]); const queue = [anchor];
      for (let i = 0; i < queue.length; i++) for (const next of reverse.get(queue[i])!) {
        if (memberSet.has(next) && !distances.has(next)) {distances.set(next,distances.get(queue[i])! + 1); queue.push(next);}
      }
      const starts = sorted(adjacency.get(anchor)!).filter(x => memberSet.has(x));
      starts.sort((a,b) => distances.get(a)! - distances.get(b)! || compareCanonical(a,b));
      const path = [anchor,starts[0]];
      while (path[path.length - 1] !== anchor) {
        const current = path[path.length - 1];
        path.push(sorted(adjacency.get(current)!).find(next => distances.get(next) === distances.get(current)! - 1)!);
      }
      return {key:JSON.stringify(members), files:members,size:members.length,
        witness:{files:path,edges:path.slice(1).map((target,i) => evidence.get(pairKey(path[i],target))!)}};
    });
    const cyclicFileCount = groups.reduce((sum,g) => sum + g.size,0);
    const largestGroupSize = Math.max(0,...groups.map(g => g.size));
    return {...identity,status:'analyzed',graphFileCount:files.length,groupCount:groups.length,cyclicFileCount,
      cyclicFileRatio:cyclicFileCount/files.length,largestGroupSize,
      score:identity.edgeView === 'legacy-normalized-dependencies-v1' ? scoreCyclicGroups(files.length,cyclicFileCount,largestGroupSize) : null,groups};
  } catch (error) {
    return {...identity,status:'unavailable',score:null,reason:error instanceof Error ? error.message : String(error)};
  }
}

export type CyclicGroupChanges = ReturnType<typeof compareCyclicGroups>;
export function compareCyclicGroups(beforeGraph: DirectedGraph, afterGraph: DirectedGraph, options: CyclicOptions & {renames?: Record<string,string>} = {}) {
  const before = analyzeCyclicGroups(beforeGraph,options); const after = analyzeCyclicGroups(afterGraph,options);
  const identity = {contractVersion:'cyclic-groups-v1' as const,dimensions_v:DIMENSIONS_VERSION,edgeView:before.edgeView};
  if (before.status !== 'analyzed' || after.status !== 'analyzed' || options.sourceCoverage === 'partial') {
    return {...identity,status:'not_comparable' as const,reason:'Both graphs must have analyzed, non-partial coverage.',before,after};
  }
  const renames = options.renames ?? {};
  const mapped = (file:string) => renames[file] ?? file;
  const a = project(beforeGraph,before.edgeView); const b = project(afterGraph,after.edgeView);
  const beforeFiles = new Set(a.files.map(mapped)); const afterFiles = new Set(b.files);
  if (beforeFiles.size !== a.files.length || Object.entries(renames).some(([from,to]) => !a.files.includes(from) || !afterFiles.has(to))) {
    return {...identity,status:'not_comparable' as const,reason:'Rename identities must be a bijection between existing files.',before,after};
  }
  const bc = new Set(before.groups.flatMap(g => g.files.map(mapped))); const ac = new Set(after.groups.flatMap(g => g.files));
  const overlaps = (x:CyclicGroup,y:CyclicGroup) => x.files.some(f => afterFiles.has(mapped(f)) && y.files.includes(mapped(f)));
  const predecessors = (group:CyclicGroup) => before.groups.filter(x => overlaps(x,group));
  const successors = (group:CyclicGroup) => after.groups.filter(x => overlaps(group,x));
  const membershipsChanged: Array<{beforeKey:string;afterKey:string;addedMembers:string[];removedMembers:string[]}> = [];
  const internalEdgesChanged: Array<{beforeKey:string;afterKey:string;addedFileEdges:string[][];removedFileEdges:string[][]}> = [];
  for (const old of before.groups) {
    const next = successors(old);
    if (next.length !== 1 || predecessors(next[0]).length !== 1) continue;
    const current = next[0]; const oldMembers = new Set(old.files.map(mapped)); const newMembers = new Set(current.files);
    const addedMembers = current.files.filter(f => !oldMembers.has(f)); const removedMembers = sorted([...oldMembers].filter(f => !newMembers.has(f)));
    if (addedMembers.length || removedMembers.length) membershipsChanged.push({beforeKey:old.key,afterKey:current.key,addedMembers,removedMembers});
    const edges = (members:Set<string>,adj:Map<string,Set<string>>,map:(s:string)=>string) => new Set([...adj].flatMap(([s,targets]) => [...targets].filter(t => members.has(map(s)) && members.has(map(t))).map(t => pairKey(map(s),map(t)))));
    const oldEdges = edges(oldMembers,a.adjacency,mapped); const newEdges = edges(newMembers,b.adjacency,s=>s);
    const addedFileEdges = sortedPairs([...newEdges].filter(e=>!oldEdges.has(e)));
    const removedFileEdges = sortedPairs([...oldEdges].filter(e=>!newEdges.has(e)));
    if (addedFileEdges.length || removedFileEdges.length) internalEdgesChanged.push({beforeKey:old.key,afterKey:current.key,addedFileEdges,removedFileEdges});
  }
  return {...identity,status:'compared' as const,before,after,
    newlyCyclicFiles:sorted([...ac].filter(f=>beforeFiles.has(f) && !bc.has(f))),
    freedFiles:sorted([...bc].filter(f=>afterFiles.has(f) && !ac.has(f))),
    addedCyclicFiles:sorted([...ac].filter(f=>!beforeFiles.has(f))),
    removedCyclicFiles:sorted([...bc].filter(f=>!afterFiles.has(f))),
    groupsMerged:after.groups.filter(g=>predecessors(g).length>1).map(g=>({beforeKeys:predecessors(g).map(x=>x.key),afterKey:g.key})),
    groupsSplit:before.groups.filter(g=>successors(g).length>1).map(g=>({beforeKey:g.key,afterKeys:successors(g).map(x=>x.key)})),
    groupsFormed:after.groups.filter(g=>predecessors(g).length===0).map(g=>g.key),
    groupsEliminated:before.groups.filter(g=>successors(g).length===0).map(g=>g.key),
    membershipsChanged,internalEdgesChanged};
}
