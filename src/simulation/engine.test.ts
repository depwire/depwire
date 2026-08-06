import { describe, it, expect } from 'vitest';
import { DirectedGraph } from 'graphology';
import { SimulationEngine } from './engine.js';

function createTestGraph(): DirectedGraph {
  const graph = new DirectedGraph();

  // File A: two symbols
  graph.addNode('src/a.ts::Foo', {
    name: 'Foo', kind: 'class', filePath: 'src/a.ts',
    startLine: 1, endLine: 10, exported: true,
  });
  graph.addNode('src/a.ts::helperA', {
    name: 'helperA', kind: 'function', filePath: 'src/a.ts',
    startLine: 12, endLine: 20, exported: true,
  });

  // File B: one symbol that imports from A
  graph.addNode('src/b.ts::Bar', {
    name: 'Bar', kind: 'class', filePath: 'src/b.ts',
    startLine: 1, endLine: 15, exported: true,
  });

  // File C: one symbol that imports from A and B
  graph.addNode('src/c.ts::Baz', {
    name: 'Baz', kind: 'function', filePath: 'src/c.ts',
    startLine: 1, endLine: 8, exported: false,
  });

  // Edges: B depends on A, C depends on A and B
  graph.mergeEdge('src/b.ts::Bar', 'src/a.ts::Foo', { kind: 'import' });
  graph.mergeEdge('src/c.ts::Baz', 'src/a.ts::Foo', { kind: 'import' });
  graph.mergeEdge('src/c.ts::Baz', 'src/b.ts::Bar', { kind: 'import' });

  return graph;
}

describe('SimulationEngine', () => {
  it('should never mutate the original graph', () => {
    const graph = createTestGraph();
    const originalOrder = graph.order;
    const originalSize = graph.size;

    const engine = new SimulationEngine(graph);
    engine.simulate({ type: 'delete', target: 'src/a.ts' });

    expect(graph.order).toBe(originalOrder); // Node count should be unchanged
    expect(graph.size).toBe(originalSize); // Edge count should be unchanged
    expect(graph.hasNode('src/a.ts::Foo')).toBeTruthy(); // Original node should still exist
  });

  it('should produce independent results across multiple simulate() calls', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const r1 = engine.simulate({ type: 'delete', target: 'src/a.ts' });
    const r2 = engine.simulate({ type: 'delete', target: 'src/b.ts' });

    // Both should report the same original graph stats
    expect(r1.originalGraph.nodeCount).toBe(r2.originalGraph.nodeCount);
    expect(r1.originalGraph.edgeCount).toBe(r2.originalGraph.edgeCount);

    // But different simulated results
    expect(r1.simulatedGraph.nodeCount).not.toBe(r2.simulatedGraph.nodeCount);
  });

  it('move action should relocate nodes and detect broken imports', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const result = engine.simulate({
      type: 'move',
      target: 'src/a.ts',
      destination: 'src/core/a.ts',
    });

    // Nodes moved: Foo and helperA from src/a.ts
    expect(result.simulatedGraph.nodeCount).toBe(graph.order); // Node count should stay the same

    // Broken imports: B and C both imported from src/a.ts
    expect(result.diff.brokenImports.length).toBeGreaterThan(0); // Should have broken imports

    // Check that broken imports reference the correct files
    const brokenFiles = result.diff.brokenImports.map((bi) => bi.file);
    expect(brokenFiles).toContain('src/b.ts'); // src/b.ts should have broken imports
    expect(brokenFiles).toContain('src/c.ts'); // src/c.ts should have broken imports
  });

  it('delete action should remove nodes and flag all dependents as broken', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const result = engine.simulate({ type: 'delete', target: 'src/a.ts' });

    // 2 nodes deleted (Foo, helperA), 2 remaining (Bar, Baz)
    expect(result.simulatedGraph.nodeCount).toBe(2);

    // Broken imports from B and C
    expect(result.diff.brokenImports.length).toBeGreaterThan(0); // Should have broken imports
    expect(result.diff.removedEdges.length).toBeGreaterThan(0); // Should have removed edges
  });

  it('rename action should work like move with dirname preserved', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const result = engine.simulate({
      type: 'rename',
      target: 'src/a.ts',
      newName: 'alpha.ts',
    });

    // Node count should stay the same (renamed, not deleted)
    expect(result.simulatedGraph.nodeCount).toBe(graph.order);

    // Broken imports from B and C
    expect(result.diff.brokenImports.length).toBeGreaterThan(0);
  });

  it('health delta should be computed correctly', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const result = engine.simulate({ type: 'delete', target: 'src/a.ts' });

    expect(typeof result.healthDelta.before).toBe('number');
    expect(typeof result.healthDelta.after).toBe('number');
    expect(result.healthDelta.delta).toBe(result.healthDelta.after - result.healthDelta.before);
    expect(result.healthDelta.improved).toBe(result.healthDelta.after > result.healthDelta.before);
    expect(result.healthDelta.dimensionChanges.length).toBeGreaterThan(0); // Should have dimension changes

    // Each dimension change should have valid fields
    for (const dc of result.healthDelta.dimensionChanges) {
      expect(typeof dc.name).toBe('string');
      expect(typeof dc.before).toBe('number');
      expect(typeof dc.after).toBe('number');
      expect(dc.delta).toBe(dc.after - dc.before);
    }
  });

  it('merge action should combine source into target', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const result = engine.simulate({
      type: 'merge',
      target: 'src/a.ts',
      source: 'src/b.ts',
    });

    // src/b.ts node (Bar) moved into src/a.ts, so one fewer file
    // Total nodes stay same (Bar just gets new ID under src/a.ts)
    expect(result.simulatedGraph.nodeCount).toBe(graph.order);
  });

  it('merge action should fail on symbol name collision', () => {
    const graph = new DirectedGraph();
    graph.addNode('src/a.ts::Dup', {
      name: 'Dup', kind: 'class', filePath: 'src/a.ts',
      startLine: 1, endLine: 5, exported: true,
    });
    graph.addNode('src/b.ts::Dup', {
      name: 'Dup', kind: 'class', filePath: 'src/b.ts',
      startLine: 1, endLine: 5, exported: true,
    });

    const engine = new SimulationEngine(graph);

    expect(() => engine.simulate({ type: 'merge', target: 'src/a.ts', source: 'src/b.ts' })).toThrow(
      /Merge conflict.*Dup/
    );
  });

  it('split action should move only specified symbols', () => {
    const graph = createTestGraph();
    const engine = new SimulationEngine(graph);

    const result = engine.simulate({
      type: 'split',
      target: 'src/a.ts',
      newFile: 'src/a-helpers.ts',
      symbols: ['helperA'],
    });

    // Node count stays same, but helperA is now under src/a-helpers.ts
    expect(result.simulatedGraph.nodeCount).toBe(graph.order);
  });
});
