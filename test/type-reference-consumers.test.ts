import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DirectedGraph } from 'graphology';
import { generateDependencies } from '../src/docs/dependencies.js';
import { buildGraph } from '../src/graph/index.js';
import { getImpact } from '../src/graph/queries.js';
import { calculateOrphansScore } from '../src/health/metrics.js';
import { prepareVizData } from '../src/viz/data.js';

function typeReferenceGraph(includeReference = true): DirectedGraph {
  const graph = new DirectedGraph();
  graph.addNode('a.ts::A', {
    name: 'A', kind: 'interface', filePath: 'a.ts', startLine: 1, endLine: 1, exported: true,
  });
  graph.addNode('b.ts::B', {
    name: 'B', kind: 'interface', filePath: 'b.ts', startLine: 1, endLine: 2, exported: false,
  });
  if (includeReference) {
    graph.addEdge('b.ts::B', 'a.ts::A', {
      kind: 'references-type', filePath: 'b.ts', line: 2,
    });
  }
  return graph;
}

describe('references-type consumer policy', () => {
  it('does not relabel an existing edge kind when the same pair also has a type reference', () => {
    const graph = buildGraph([{
      filePath: 'b.ts',
      symbols: [
        { id: 'a.ts::A', name: 'A', kind: 'interface', filePath: 'a.ts', startLine: 1, endLine: 1, exported: true },
        { id: 'b.ts::B', name: 'B', kind: 'class', filePath: 'b.ts', startLine: 1, endLine: 2, exported: true },
      ],
      edges: [
        { source: 'b.ts::B', target: 'a.ts::A', kind: 'imports', filePath: 'b.ts', line: 1 },
        { source: 'b.ts::B', target: 'a.ts::A', kind: 'references-type', filePath: 'b.ts', line: 2 },
      ],
    }]);
    expect(graph.getEdgeAttribute('b.ts::B', 'a.ts::A', 'kind')).toBe('imports');
  });

  it('is traversed by impact analysis by default', () => {
    const graph = typeReferenceGraph();
    graph.addNode('c.ts::C', {
      name: 'C', kind: 'interface', filePath: 'c.ts', startLine: 1, endLine: 1, exported: false,
    });
    graph.addEdge('c.ts::C', 'a.ts::A', { kind: 'analysis-only', filePath: 'c.ts', line: 1 });
    const impact = getImpact(graph, 'a.ts::A');
    expect(impact.directDependents.map((symbol) => symbol.id)).toContain('b.ts::B');
    expect(impact.directDependents.map((symbol) => symbol.id)).not.toContain('c.ts::C');
    expect(impact.affectedFiles).toContain('b.ts');
  });

  it('counts as a use for dead-code scoring', () => {
    const withoutReference = calculateOrphansScore(typeReferenceGraph(false));
    const withReference = calculateOrphansScore(typeReferenceGraph(true));
    expect(withoutReference.metrics.deadSymbols).toBe(1);
    expect(withReference.metrics.deadSymbols).toBe(0);
  });

  it('is included and labeled in generated dependency docs but excluded from cycles', () => {
    const graph = typeReferenceGraph();
    graph.addEdge('a.ts::A', 'b.ts::B', {
      kind: 'references-type', filePath: 'a.ts', line: 1,
    });
    const markdown = generateDependencies(graph, '/repo', 'test');
    expect(markdown).toContain('## Type References');
    expect(markdown).toContain('type reference');
    expect(markdown).toContain('No circular dependencies detected');
  });

  it('is exposed to viz data and rendered with a distinct dashed stroke', () => {
    const data = prepareVizData(typeReferenceGraph(), '/repo');
    expect(data.arcs[0].edgeKinds).toContain('references-type');
    const arcSource = readFileSync(resolve(import.meta.dirname, '../src/viz/public/arc.js'), 'utf8');
    expect(arcSource).toContain("d.edgeKinds.includes('references-type') ? '5,4' : null");
  });
});
