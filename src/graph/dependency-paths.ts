import { DirectedGraph } from 'graphology';

interface PathCandidate {
  component: number;
  next?: PathCandidate;
  length: number;
}

interface Bridge {
  source: string;
  target: string;
}

export interface DependencyPathAnalysis {
  maxDepth: number;
  nodeCount: number;
  paths: string[][];
  sccCount: number;
}

/**
 * Analyze file-level dependency paths for graph consumers in bounded
 * O(K(V+E)) space/time, where
 * K is the requested number of representative paths. Cycles are condensed to
 * strongly connected components before path ranking.
 */
export function analyzeDependencyPaths(
  graph: DirectedGraph,
  pathLimit = 0,
): DependencyPathAnalysis {
  const fileGraph = buildFileGraph(graph);
  if (fileGraph.size === 0) {
    return { maxDepth: 0, nodeCount: 0, paths: [], sccCount: 0 };
  }

  const componentOf = findStronglyConnectedComponents(fileGraph);
  const members = new Map<number, string[]>();
  const condensedEdges = new Map<number, Set<number>>();
  const condensedInDegree = new Map<number, number>();
  const bridges = new Map<number, Map<number, Bridge>>();

  for (const [file, component] of componentOf) {
    const componentMembers = members.get(component) ?? [];
    componentMembers.push(file);
    members.set(component, componentMembers);
    condensedEdges.set(component, new Set());
    condensedInDegree.set(component, 0);
  }

  for (const [source, neighbors] of fileGraph) {
    const from = componentOf.get(source)!;
    for (const target of neighbors) {
      const to = componentOf.get(target)!;
      if (from === to || condensedEdges.get(from)!.has(to)) continue;

      condensedEdges.get(from)!.add(to);
      condensedInDegree.set(to, condensedInDegree.get(to)! + 1);

      if (!bridges.has(from)) bridges.set(from, new Map());
      bridges.get(from)!.set(to, { source, target });
    }
  }

  const roots = Array.from(condensedInDegree)
    .filter(([, degree]) => degree === 0)
    .map(([component]) => component);
  const topologicalOrder = getTopologicalOrder(condensedEdges, new Map(condensedInDegree));
  const candidateLimit = Math.max(1, pathLimit);
  const bestFrom = new Map<number, PathCandidate[]>();

  for (let index = topologicalOrder.length - 1; index >= 0; index--) {
    const component = topologicalOrder[index];
    const neighbors = condensedEdges.get(component)!;
    const candidates: PathCandidate[] = [];

    if (neighbors.size === 0) {
      candidates.push({ component, length: 1 });
    } else {
      for (const neighbor of neighbors) {
        for (const tail of bestFrom.get(neighbor) ?? []) {
          candidates.push({ component, next: tail, length: tail.length + 1 });
        }
      }
    }

    candidates.sort((a, b) => b.length - a.length);
    bestFrom.set(component, candidates.slice(0, candidateLimit));
  }

  const rootCandidates = roots.flatMap(component => bestFrom.get(component) ?? []);
  rootCandidates.sort((a, b) => b.length - a.length);

  const longest = rootCandidates[0];
  const selected = pathLimit > 0 ? rootCandidates.slice(0, pathLimit) : [];
  const paths = selected.map(candidate => materializeRealPath(
    candidate,
    fileGraph,
    componentOf,
    members,
    bridges,
  ));

  return {
    maxDepth: longest ? longest.length - 1 : 0,
    nodeCount: fileGraph.size,
    paths,
    sccCount: members.size,
  };
}

function buildFileGraph(graph: DirectedGraph): Map<string, Set<string>> {
  const fileGraph = new Map<string, Set<string>>();

  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    if (sourceFile === targetFile) return;

    if (!fileGraph.has(sourceFile)) fileGraph.set(sourceFile, new Set());
    if (!fileGraph.has(targetFile)) fileGraph.set(targetFile, new Set());
    fileGraph.get(sourceFile)!.add(targetFile);
  });

  return fileGraph;
}

function findStronglyConnectedComponents(fileGraph: Map<string, Set<string>>): Map<string, number> {
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const componentOf = new Map<string, number>();
  let nextIndex = 0;
  let nextComponent = 0;

  for (const start of fileGraph.keys()) {
    if (indices.has(start)) continue;

    type Frame = { node: string; neighborIter: Iterator<string> };
    const workStack: Frame[] = [{
      node: start,
      neighborIter: (fileGraph.get(start) ?? new Set()).values(),
    }];
    indices.set(start, nextIndex);
    lowlinks.set(start, nextIndex);
    nextIndex++;
    stack.push(start);
    onStack.add(start);

    while (workStack.length > 0) {
      const frame = workStack[workStack.length - 1];
      const { node } = frame;
      const next = frame.neighborIter.next();

      if (!next.done) {
        const neighbor = next.value;
        if (!indices.has(neighbor)) {
          indices.set(neighbor, nextIndex);
          lowlinks.set(neighbor, nextIndex);
          nextIndex++;
          stack.push(neighbor);
          onStack.add(neighbor);
          workStack.push({
            node: neighbor,
            neighborIter: (fileGraph.get(neighbor) ?? new Set()).values(),
          });
        } else if (onStack.has(neighbor)) {
          lowlinks.set(node, Math.min(lowlinks.get(node)!, indices.get(neighbor)!));
        }
      } else {
        workStack.pop();
        if (workStack.length > 0) {
          const parent = workStack[workStack.length - 1].node;
          lowlinks.set(parent, Math.min(lowlinks.get(parent)!, lowlinks.get(node)!));
        }
        if (lowlinks.get(node) === indices.get(node)) {
          let member: string;
          do {
            member = stack.pop()!;
            onStack.delete(member);
            componentOf.set(member, nextComponent);
          } while (member !== node);
          nextComponent++;
        }
      }
    }
  }

  return componentOf;
}

function getTopologicalOrder(
  edges: Map<number, Set<number>>,
  inDegree: Map<number, number>,
): number[] {
  const queue = Array.from(inDegree)
    .filter(([, degree]) => degree === 0)
    .map(([component]) => component);
  const order: number[] = [];

  for (let index = 0; index < queue.length; index++) {
    const component = queue[index];
    order.push(component);
    for (const neighbor of edges.get(component) ?? []) {
      const nextDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, nextDegree);
      if (nextDegree === 0) queue.push(neighbor);
    }
  }

  return order;
}

function materializeRealPath(
  candidate: PathCandidate,
  fileGraph: Map<string, Set<string>>,
  componentOf: Map<string, number>,
  members: Map<number, string[]>,
  bridges: Map<number, Map<number, Bridge>>,
): string[] {
  const components: number[] = [];
  let current: PathCandidate | undefined = candidate;
  while (current) {
    components.push(current.component);
    current = current.next;
  }

  if (components.length === 1) {
    return [members.get(components[0])![0]];
  }

  const path: string[] = [];
  for (let index = 0; index < components.length - 1; index++) {
    const from = components[index];
    const to = components[index + 1];
    const bridge = bridges.get(from)?.get(to);
    if (!bridge) throw new Error(`Missing dependency bridge from component ${from} to ${to}`);

    if (path.length === 0) {
      path.push(bridge.source);
    } else {
      const internalPath = findPathWithinComponent(
        path[path.length - 1],
        bridge.source,
        from,
        fileGraph,
        componentOf,
      );
      path.push(...internalPath.slice(1));
    }
    path.push(bridge.target);
  }

  return path;
}

function findPathWithinComponent(
  start: string,
  target: string,
  component: number,
  fileGraph: Map<string, Set<string>>,
  componentOf: Map<string, number>,
): string[] {
  if (start === target) return [start];

  const queue = [start];
  const previous = new Map<string, string | null>([[start, null]]);

  for (let index = 0; index < queue.length; index++) {
    const file = queue[index];
    for (const neighbor of fileGraph.get(file) ?? []) {
      if (componentOf.get(neighbor) !== component || previous.has(neighbor)) continue;
      previous.set(neighbor, file);
      if (neighbor === target) {
        const path = [target];
        let cursor: string | null = file;
        while (cursor !== null) {
          path.push(cursor);
          cursor = previous.get(cursor) ?? null;
        }
        return path.reverse();
      }
      queue.push(neighbor);
    }
  }

  throw new Error(`No path inside dependency component from ${start} to ${target}`);
}
