import type { DirectedGraph } from 'graphology';

/** Structural file nodes participate in graph topology but are not symbols. */
export function isCountableSymbol(kind: unknown): boolean {
  return kind !== 'file';
}

/** Count real symbols without changing the graph's internal node semantics. */
export function countGraphSymbols(graph: DirectedGraph): number {
  let count = 0;
  graph.forEachNode((_nodeId, attrs) => {
    if (isCountableSymbol(attrs.kind)) count++;
  });
  return count;
}
