import { describe, expect, it } from 'vitest';
import {
  exportToJSON,
  GRAPH_FORMAT_VERSION,
  importFromJSON,
  UnsupportedGraphFormatError,
} from '../src/graph/serializer.js';
import type { ProjectGraph } from '../src/parser/types.js';
import { RESOLUTION_VERSION } from '../src/parser/cache.js';

function payload(formatVersion?: number): ProjectGraph {
  return {
    ...(formatVersion === undefined ? {} : { formatVersion }),
    projectRoot: '/repo',
    files: ['a.ts', 'b.ts'],
    nodes: [
      { id: 'a.ts::A', name: 'A', kind: 'interface', filePath: 'a.ts', startLine: 1, endLine: 1, exported: true },
      { id: 'b.ts::B', name: 'B', kind: 'interface', filePath: 'b.ts', startLine: 1, endLine: 1, exported: true },
    ],
    edges: [
      { source: 'b.ts::B', target: 'a.ts::A', kind: 'references-type', filePath: 'b.ts', line: 1 },
    ],
    metadata: { parsedAt: '2026-08-28T00:00:00.000Z', fileCount: 2, nodeCount: 2, edgeCount: 1 },
  };
}

describe('graph format v2 compatibility', () => {
  it('bumps the parser resolution cache version', () => {
    expect(RESOLUTION_VERSION).toBe(4);
  });

  it.each([undefined, 1])('rejects a %s graph with an actionable reparse error', (version) => {
    expect(() => importFromJSON(payload(version))).toThrowError(UnsupportedGraphFormatError);
    expect(() => importFromJSON(payload(version))).toThrow(/cannot be reconstructed.*reparse the source/i);
  });

  it('round-trips a v2 graph without changing formatVersion', () => {
    const graph = importFromJSON(payload(GRAPH_FORMAT_VERSION));
    const exported = exportToJSON(graph, '/repo');
    expect(exported.formatVersion).toBe(2);
    expect(exported.edges).toContainEqual(expect.objectContaining({ kind: 'references-type' }));
  });

  it('preserves the legacy extends inheritance kind without normalization', () => {
    const oldGraph = payload(GRAPH_FORMAT_VERSION);
    oldGraph.edges[0].kind = 'extends';

    const graph = importFromJSON(oldGraph);
    const exported = exportToJSON(graph, '/repo');

    expect(exported.formatVersion).toBe(2);
    expect(exported.edges).toContainEqual(expect.objectContaining({ kind: 'extends' }));
    expect(exported.edges).not.toContainEqual(expect.objectContaining({ kind: 'inherits' }));
  });
});
