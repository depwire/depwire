import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { importFromJSON } from '../src/graph/serializer.js';
import { getArchitectureSummary } from '../src/graph/queries.js';
import { generateArchitecture } from '../src/docs/architecture.js';
import { handleToolCall } from '../src/mcp/tools.js';
import { toolRegistry } from '../src/tools.js';

it('labels 58 parsed files separately from 55 graph files across CLI, architecture, and MCP', async () => {
  const root = mkdtempSync(join(tmpdir(), 'depwire-counts-'));
  try {
    for (let i = 0; i < 58; i++) writeFileSync(join(root, `${i}.ts`), i < 55 ? `export const value${i} = ${i};` : '// No graph nodes\n');
    const result = spawnSync(process.execPath, [resolve('dist/index.js'), 'parse', root, '--stats'], {
      encoding: 'utf8', env: { ...process.env },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Parsed files: 58');
    expect(result.stdout).toContain('Graph files: 55');
    const json = JSON.parse(readFileSync(join(root, 'depwire-output.json'), 'utf8'));
    expect(json.metadata.fileCount).toBe(55);
    expect(json.metadata.parsedFileCount).toBe(58);
    const graph = importFromJSON(json);
    expect(getArchitectureSummary(graph)).toMatchObject({ fileCount: 55, parsedFileCount: 58 });
    expect(generateArchitecture(graph, root, 'counts', 0)).toContain('**Total Files:** 55');
    const state = { graph, projectRoot: root, projectName: 'counts', watcher: null };
    const ctx = { graph, getRepoMeta: () => ({ root, name: 'counts' }), getPrecomputed: async () => ({ status: 'unavailable' as const, reason: 'unused' }) };
    const mcp = await handleToolCall('get_architecture_summary', {}, state);
    const sdk = await toolRegistry.find(t => t.name === 'get_architecture_summary')!.handler({}, ctx);
    expect(mcp).toEqual(sdk);
    expect(JSON.parse(mcp.content[0].text).overview).toMatchObject({ totalFiles: 55, parsedFiles: 58 });
    const list = JSON.parse((await handleToolCall('list_files', {}, state)).content[0].text);
    expect(list.totalFiles).toBe(55);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
