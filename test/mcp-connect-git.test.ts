import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectToRepo } from '../src/mcp/connect.js';
import { createEmptyState } from '../src/mcp/state.js';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

describe('connect_repo GitHub clone and pull', () => {
  const tempDirs: string[] = [];
  const cloneDirs: string[] = [];
  const priorHome = process.env.HOME;
  const priorUserProfile = process.env.USERPROFILE;
  const priorTmpDir = process.env.TMPDIR;

  afterEach(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
    if (priorUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorUserProfile;
    if (priorTmpDir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = priorTmpDir;
    for (const dir of cloneDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function localGitHubUrl(bareRepo: string): { source: string; cloneDir: string } {
    // macOS defaults to /var/folders, which connect_repo rejects as a protected path.
    if (tmpdir().startsWith('/var/') && existsSync('/tmp')) process.env.TMPDIR = '/tmp';
    const name = `depwire-git-v4-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const source = `https://github.com/depwire-test/${name}.git`;
    const cloneDir = join(tmpdir(), 'depwire-repos', name);
    cloneDirs.push(cloneDir);
    const config = join(tempDirs[0], '.gitconfig');
    git(tempDirs[0], 'config', '--file', config, `url.${pathToFileURL(bareRepo).href}.insteadOf`, source);
    process.env.HOME = tempDirs[0];
    process.env.USERPROFILE = tempDirs[0];
    return { source, cloneDir };
  }

  it('clones and then pulls an existing clone from a local bare repository', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'depwire-git-v4-test-'));
    tempDirs.push(sandbox);
    const origin = join(sandbox, 'origin');
    const bare = join(sandbox, 'remote.git');
    git(sandbox, 'init', '-q', '-b', 'main', origin);
    git(origin, 'config', 'user.email', 'test@example.com');
    git(origin, 'config', 'user.name', 'Depwire test');
    writeFileSync(join(origin, 'index.ts'), 'export const first = 1;\n');
    git(origin, 'add', 'index.ts');
    git(origin, 'commit', '-q', '-m', 'first');
    git(sandbox, 'clone', '--bare', '-q', origin, bare);
    const { source, cloneDir } = localGitHubUrl(bare);

    const firstState = createEmptyState();
    try {
      const first = await connectToRepo(source, undefined, firstState);
      expect(first.error).toBeUndefined();
      expect(first.connected).toBe(true);
      expect(existsSync(join(cloneDir, 'index.ts'))).toBe(true);
      expect(firstState.graph?.order).toBeGreaterThan(0);
    } finally {
      await firstState.watcher?.close();
    }

    writeFileSync(join(origin, 'second.ts'), 'export const second = 2;\n');
    git(origin, 'add', 'second.ts');
    git(origin, 'commit', '-q', '-m', 'second');
    git(origin, 'push', '-q', bare, 'main');

    const secondState = createEmptyState();
    try {
      const second = await connectToRepo(source, undefined, secondState);
      expect(second.error).toBeUndefined();
      expect(second.connected).toBe(true);
      expect(existsSync(join(cloneDir, 'second.ts'))).toBe(true);
      expect(secondState.graph?.order).toBeGreaterThan(firstState.graph?.order ?? 0);
    } finally {
      await secondState.watcher?.close();
    }
  });

  it('returns an explicit error when the GitHub clone target is unavailable', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'depwire-git-v4-test-'));
    tempDirs.push(sandbox);
    const { source } = localGitHubUrl(join(sandbox, 'missing.git'));
    const state = createEmptyState();
    const result = await connectToRepo(source, undefined, state);
    expect(result.connected).not.toBe(true);
    expect(result.error).toBe('Failed to clone repository');
    expect(result.message).toContain('Git clone failed:');
    expect(state.graph).toBeNull();
    expect(state.watcher).toBeNull();
  });
});
