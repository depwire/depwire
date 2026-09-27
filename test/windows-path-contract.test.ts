import { describe, it, expect } from 'vitest';
import { importFromJSON } from '../src/graph/serializer.js';
import { getAffectedFiles, getImpact } from '../src/graph/queries.js';
import { verifyChange } from '../src/core/verify-change.js';
import { handleToolCall } from '../src/mcp/tools.js';
import type { ProjectGraph } from '../src/parser/types.js';

function fixture(): ProjectGraph {
  const nodes = [
    ['src\\app\\model.ts', 'Model', 'interface'],
    ['src\\app\\consumer.ts', 'Consumer', 'class'],
    ['src/app/consumer.ts', 'consume', 'function'],
  ].map(([filePath, name, kind]) => ({ id: `${filePath}::${name}`, filePath, name, kind,
    startLine: 1, endLine: 1, exported: true }));
  return { formatVersion: 2, projectRoot: 'C:\\repo', nodes,
    edges: nodes.slice(1).map(n => ({ source: n.id, target: nodes[0].id,
      filePath: n.filePath, kind: 'references-type', line: 1 })),
    files: nodes.map(n => n.filePath), metadata: { fileCount: 3, nodeCount: 3, edgeCount: 2, parsedAt: '' },
  } as ProjectGraph;
}

describe('Windows graph path contract', () => {
  it('affected_files matches impact_analysis on a backslash graph', async () => {
    const graph = importFromJSON(fixture());
    const state = { graph, projectRoot: 'C:\\repo', projectName: 'fixture', watcher: null };
    const affected = JSON.parse((await handleToolCall('affected_files', { file_path: 'src/app/model.ts' }, state)).content[0].text);
    const impact = JSON.parse((await handleToolCall('impact_analysis', { symbol: 'Model' }, state)).content[0].text);
    console.log('Windows repro:', JSON.stringify({ affected, impact }));
    expect(affected.total_affected).toBe(1);
    expect(affected.affected_files.map((f: any) => f.filePath)).toEqual(['src/app/consumer.ts']);
    expect(getImpact(graph, 'src/app/model.ts::Model').affectedFiles).toEqual(['src/app/consumer.ts']);
  });
  it('verify-change deduplicates a mixed-separator blast radius', async () => {
    const graph = importFromJSON(fixture());
    // Exercise the separate dedupe defense even for a caller-mutated graph.
    graph.setNodeAttribute('src/app/consumer.ts::Consumer', 'filePath', 'src\\app\\consumer.ts');
    const result = await verifyChange({ file_path: 'src/app/model.ts', new_content: 'export interface Model {}' }, { graph, projectRoot: process.cwd() });
    console.log('Windows verify repro:', result.blast_radius, result.affected_files);
    expect(result.blast_radius).toBe(2);
    expect(result.affected_files).toEqual(['src/app/consumer.ts', 'src/app/model.ts']);
  });
  it('distinguishes an unknown path from a resolved leaf', () => {
    const graph = importFromJSON(fixture());
    expect(() => getAffectedFiles(graph, 'missing.ts')).toThrow(/not found/i);
    expect(getAffectedFiles(graph, 'src/app/consumer.ts').affected).toEqual([]);
  });
});

import { canonicalPath, canonicalSymbolId } from '../src/graph/paths.js';
import { buildGraph } from '../src/graph/index.js';
import { canonicalParsedFile } from '../src/graph/path-boundary.js';
import { SimulationEngine } from '../src/simulation/engine.js';
import { toolRegistry } from '../src/tools.js';

it.each([
  ['.\\src\\app\\..\\model.ts', '', 'src/model.ts'],
  ['C:\\repo\\src\\model.ts', 'C:/repo', 'src/model.ts'],
  ['c:/repo/src/model.ts', 'C:\\repo', 'src/model.ts'],
  ['\\\\server\\share\\repo\\src\\model.ts', '//server/share/repo', 'src/model.ts'],
  ['/repo/src/../model.ts', '/repo', 'model.ts'],
  ['/src/model.ts', '/', 'src/model.ts'],
  ['src/Model.ts', '/repo', 'src/Model.ts'],
])('canonical boundary: %s', (input, root, expected) => {
  expect(canonicalPath(input, root)).toBe(expected);
  expect(canonicalSymbolId(`${input}::A.$b0.method`, root)).toBe(`${expected}::A.$b0.method`);
});

it('canonicalizes parser records and pending resolver hints before graph construction', () => {
  const json = fixture();
  const file = canonicalParsedFile({ filePath: 'C:\\repo\\src\\app\\model.ts', symbols: json.nodes, edges: json.edges,
    pendingNamespaceCalls: [{ source: json.nodes[1].id, namespaceRoot: json.nodes[0].id, target: json.nodes[0].id + '.method', callee: 'a.method', line: 1 }],
    wildcardReExports: ['src\\barrel.ts'], unresolvedImports: [{ fromFile: 'src\\app\\model.ts', specifier: 'external', reason: 'external-package' }],
  }, json.projectRoot);
  expect(file.pendingNamespaceCalls![0].namespaceRoot).toBe('src/app/model.ts::Model');
  expect(file.wildcardReExports).toEqual(['src/barrel.ts']);
  const graph = buildGraph([file], json.projectRoot);
  expect(getAffectedFiles(graph, 'C:\\repo\\src\\app\\model.ts').totalCount).toBe(1);
});

it('canonicalizes whatif actions and emits one spelling for affected files', () => {
  const graph = importFromJSON(fixture());
  const result = new SimulationEngine(graph).simulate({ type: 'move', target: 'src\\app\\model.ts', destination: 'src\\lib\\model.ts' });
  expect(result.action).toEqual({ type: 'move', target: 'src/app/model.ts', destination: 'src/lib/model.ts' });
  expect(JSON.stringify(result.diff)).not.toContain('\\\\');
});

it('both MCP adapters carry an error for a missing file and a resolved empty result for a leaf', async () => {
  const graph = importFromJSON(fixture());
  const state = { graph, projectRoot: 'C:\\repo', projectName: 'fixture', watcher: null };
  const ctx = { graph, getRepoMeta: () => ({ root: 'C:\\repo', name: 'fixture' }), getPrecomputed: async () => ({ status: 'unavailable' as const, reason: 'unused' }) };
  for (const file_path of ['missing.ts', 'src\\app\\consumer.ts']) {
    const a = await handleToolCall('affected_files', { file_path }, state);
    const b = await toolRegistry.find(t => t.name === 'affected_files')!.handler({ file_path }, ctx);
    expect(a).toEqual(b);
    const result = JSON.parse(a.content[0].text);
    if (file_path === 'missing.ts') { expect(result.error).toMatch(/not found/i); expect(result).not.toHaveProperty('affected_files'); }
    else { expect(result.error).toBeUndefined(); expect(result.affected_files).toEqual([]); expect(result.target).toBe('src/app/consumer.ts'); }
  }
});

import { isWithinRoot } from '../src/graph/paths.js';
it('uses segment containment for Windows subdirectories and rejects sibling prefixes', () => {
  expect(isWithinRoot('C:\\repo\\packages\\backend', 'C:\\repo')).toBe(true);
  expect(isWithinRoot('C:\\repository\\secret', 'C:\\repo')).toBe(false);
  expect(isWithinRoot('D:\\repo\\secret', 'C:\\repo')).toBe(false);
  expect(isWithinRoot('/repository/secret', '/repo')).toBe(false);
});

it('does not confuse a directory prefix or filename suffix with a path segment', async () => {
  const graph = importFromJSON(fixture());
  const state = { graph, projectRoot: 'C:\\repo', projectName: 'fixture', watcher: null };
  const list = JSON.parse((await handleToolCall('list_files', { directory: 'src/ap' }, state)).content[0].text);
  expect(list.totalFiles).toBe(0);
  const impact = JSON.parse((await handleToolCall('impact_analysis', { symbol: 'Model', file: 'odel.ts' }, state)).content[0].text);
  expect(impact.error).toContain('not found');
});
