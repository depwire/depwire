import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import type { ParsedFile } from '../src/parser/types.js';

const root = resolve(import.meta.dirname, 'fixtures/ts-edge-contract');

describe('parser-to-graph edge contract', () => {
  it('rejects an ambiguous wildcard call and records every candidate', async () => {
    const files = await parseProject(root, { useCache: false });
    const consumer = files.find(file => file.filePath === 'consumer.ts')!;
    expect(consumer.edges.some(edge => edge.kind === 'calls' && edge.line === 4)).toBe(false);
    expect(consumer.unresolvedCalls).toContainEqual(expect.objectContaining({
      reason: 'ambiguous-reexport',
      attemptedTarget: 'barrel.ts::Client',
      candidates: ['client.ts::Client', 'private-a.ts::Client', 'private-b.ts::Client'],
    }));
    expect(consumer.unresolvedEdges).toContainEqual(expect.objectContaining({
      kind: 'calls', reason: 'ambiguous-reexport', attemptedTarget: 'barrel.ts::Client',
    }));
  });

  it('rejects a constructed import call target without a declaration', async () => {
    const files = await parseProject(root, { useCache: false });
    const consumer = files.find(file => file.filePath === 'consumer.ts')!;
    expect(consumer.edges.some(edge => edge.kind === 'calls' && edge.line === 8)).toBe(false);
    expect(consumer.unresolvedCalls).toContainEqual(expect.objectContaining({
      reason: 'unproven-target', attemptedTarget: 'empty.ts::missing',
    }));
  });

  it('records a builder-level missing endpoint instead of silently discarding it', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const files: ParsedFile[] = [{ filePath: 'one.ts', symbols: [{
        id: 'one.ts::run', name: 'run', kind: 'function', filePath: 'one.ts',
        startLine: 1, endLine: 1, exported: false,
      }], edges: [{ source: 'one.ts::run', target: 'two.ts::missing', kind: 'calls', filePath: 'one.ts', line: 1 }] }];
      const graph = buildGraph(files);
      expect(graph.size).toBe(0);
      expect(graph.getAttribute('edgeDrops')).toContainEqual(expect.objectContaining({
        source: 'one.ts::run', attemptedTarget: 'two.ts::missing', reason: 'missing-target',
      }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 parsed edges had missing endpoints'));
    } finally {
      warn.mockRestore();
    }
  });
});
