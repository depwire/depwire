import { describe, expect, it } from 'vitest';
import { DirectedGraph } from 'graphology';
import { analyzeDependencyPaths } from '../src/docs/dependency-paths.js';
import { calculateDepthScore } from '../src/health/metrics.js';

function graphFromFileEdges(edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();
  const files = new Set(edges.flat());

  for (const file of files) {
    graph.addNode(file, { filePath: file });
  }
  for (const [source, target] of edges) {
    graph.addEdge(source, target);
  }

  return graph;
}

function expectRealPaths(graph: DirectedGraph, paths: string[][]): void {
  const fileEdges = new Set<string>();
  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    fileEdges.add(`${sourceFile}\0${targetFile}`);
  });

  for (const path of paths) {
    for (let index = 0; index < path.length - 1; index++) {
      expect(fileEdges.has(`${path[index]}\0${path[index + 1]}`)).toBe(true);
    }
  }
}

describe('dependency path analysis', () => {
  it('expands SCC-ranked chains into real file dependency paths', () => {
    const graph = graphFromFileEdges([
      ['src/root.ts', 'src/a.ts'],
      ['src/a.ts', 'src/b.ts'],
      ['src/b.ts', 'src/a.ts'],
      ['src/b.ts', 'src/leaf.ts'],
    ]);

    const analysis = analyzeDependencyPaths(graph, 5);

    expect(analysis.maxDepth).toBe(2);
    expect(analysis.nodeCount).toBe(4);
    expect(analysis.sccCount).toBe(3);
    expect(analysis.paths[0]).toEqual([
      'src/root.ts',
      'src/a.ts',
      'src/b.ts',
      'src/leaf.ts',
    ]);
    expectRealPaths(graph, analysis.paths);

    const health = calculateDepthScore(graph);
    expect(health.metrics.maxDepth).toBe(2);
    expect(health.details).toContain('cycles collapsed to one hop each');
  });

  it('keeps only the requested candidates on an exponentially branching DAG', () => {
    const edges: Array<[string, string]> = [['src/root.ts', 'src/0-a.ts']];
    edges.push(['src/root.ts', 'src/0-b.ts']);

    for (let layer = 0; layer < 30; layer++) {
      for (const from of ['a', 'b']) {
        for (const to of ['a', 'b']) {
          edges.push([
            `src/${layer}-${from}.ts`,
            `src/${layer + 1}-${to}.ts`,
          ]);
        }
      }
    }

    const graph = graphFromFileEdges(edges);
    const analysis = analyzeDependencyPaths(graph, 5);

    expect(analysis.paths).toHaveLength(5);
    expect(analysis.paths.every(path => path.length === 32)).toBe(true);
    expect(analysis.maxDepth).toBe(31);
    expectRealPaths(graph, analysis.paths);
  });
});
