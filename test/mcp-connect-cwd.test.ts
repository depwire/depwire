import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectToRepo } from '../src/mcp/connect.js';
import { createEmptyState } from '../src/mcp/state.js';
import { handleToolCall } from '../src/mcp/tools.js';
import { getArchitectureSummary, getCrossFileEdges } from '../src/graph/queries.js';

describe('connect_repo local path normalization', () => {
  const realCwd = process.cwd();
  const tempDirs: string[] = [];

  afterEach(async () => {
    process.chdir(realCwd);
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('stores an absolute project root when invoked with a relative path from another cwd', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'depwire-mcp-cwd-'));
    tempDirs.push(sandbox);
    const projectRoot = join(sandbox, 'project');
    mkdirSync(projectRoot);
    writeFileSync(join(projectRoot, 'index.ts'), 'export const value = 1;\n');
    process.chdir(sandbox);

    const state = createEmptyState();
    const result = await connectToRepo('project', undefined, state);
    await state.watcher?.close();
    const canonicalProjectRoot = realpathSync(projectRoot);

    expect(result.connected).toBe(true);
    expect(result.projectRoot).toBe(canonicalProjectRoot);
    expect(state.projectRoot).toBe(canonicalProjectRoot);
  });

  it('reports actual graph counts and finite file connections in the MCP response', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'depwire-mcp-counts-'));
    tempDirs.push(projectRoot);
    writeFileSync(join(projectRoot, 'helper.ts'), 'export function helper() { return 1; }\n');
    writeFileSync(join(projectRoot, 'index.ts'), "import { helper } from './helper';\nexport const value = helper();\n");

    const state = createEmptyState();
    try {
      const response = await handleToolCall('connect_repo', { source: realpathSync(projectRoot) }, state);
      const result = JSON.parse(response.content[0].text);
      expect(result.connected).toBe(true);
      const graph = state.graph!;
      const summary = getArchitectureSummary(graph);
      expect(result.stats).toMatchObject({
        files: summary.fileCount,
        symbols: summary.symbolCount,
        edges: summary.edgeCount,
        crossFileEdges: getCrossFileEdges(graph).length,
      });
      expect(result.stats.crossFileEdges).toBeGreaterThan(0);
      expect(result.mostConnectedFiles[0].connections).toBe(summary.mostConnectedFiles[0].connections);
      expect(result.summary).toContain(`Found ${summary.fileCount} files with ${summary.symbolCount} symbols and ${result.stats.crossFileEdges} cross-file edges.`);
      expect(result.summary).not.toContain('undefined');
    } finally {
      await state.watcher?.close();
    }
  });
});
