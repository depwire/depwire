import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectToRepo } from '../src/mcp/connect.js';
import { createEmptyState } from '../src/mcp/state.js';

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
});
