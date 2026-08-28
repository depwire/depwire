import { describe, expect, it } from 'vitest';
import { exportToJSON, importFromJSON } from '../src/graph/serializer.js';
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

describe('graph format compatibility for references-type', () => {
  it('bumps the parser resolution cache version', () => {
    expect(RESOLUTION_VERSION).toBe(2);
  });

  it('loads a pre-1.17 payload and preserves an unknown edge kind', () => {
    const graph = importFromJSON(payload());
    expect(graph.getEdgeAttribute('b.ts::B', 'a.ts::A', 'kind')).toBe('references-type');
  });

  it('round-trips a 1.17 graph without changing formatVersion', () => {
    const graph = importFromJSON(payload(1));
    const exported = exportToJSON(graph, '/repo');
    expect(exported.formatVersion).toBe(1);
    expect(exported.edges).toContainEqual(expect.objectContaining({ kind: 'references-type' }));
  });
});
