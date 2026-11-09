import { DirectedGraph } from 'graphology';
import type { SimulationAction } from '../src/simulation/engine.js';
export function simulationFixture() {
  const graph = new DirectedGraph();
  for (const [file, name] of [['a.ts', 'a'], ['b.ts', 'b'], ['c.ts', 'c']]) {
    graph.addNode(`${file}::${name}`, { filePath: file, name, kind: 'function', exported: true, startLine: 1, endLine: 1 });
  }
  graph.addEdge('a.ts::a', 'b.ts::b', { kind: 'imports', line: 1 });
  graph.addEdge('b.ts::b', 'a.ts::a', { kind: 'calls', line: 2 });
  return graph;
}
export const simulationActions: SimulationAction[] = [
  { type: 'delete', target: 'a.ts' },
  { type: 'delete', target: 'c.ts' },
  { type: 'move', target: 'a.ts', destination: 'moved.ts' },
  { type: 'rename', target: 'a.ts', newName: 'renamed.ts' },
  { type: 'split', target: 'a.ts', newFile: 'split.ts', symbols: ['a'] },
  { type: 'merge', target: 'a.ts', source: 'b.ts' },
];
