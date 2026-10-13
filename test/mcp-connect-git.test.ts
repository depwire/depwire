import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectToRepo } from '../src/mcp/connect.js';
import { createEmptyState } from '../src/mcp/state.js';
import { handleToolCall } from '../src/mcp/tools.js';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

describe('connect_repo GitHub clone and pull', () => {
  const tempDirs: string[] = [];
  const cloneDirs: string[] = [];
  const priorHome = process.env.HOME;
  const priorUserProfile = process.env.USERPROFILE;
  const priorTmpDir = process.env.TMPDIR;
  const priorPath = process.env.PATH;

  afterEach(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
    if (priorUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorUserProfile;
    if (priorTmpDir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = priorTmpDir;
    process.env.PATH = priorPath;
    for (const dir of cloneDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function localGitHubUrl(bareRepo: string): { source: string; cloneDir: string } {
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
    expect(existsSync(join(tmpdir(), 'depwire-repos', source.split('/').at(-1)!.replace(/\.git$/, '')))).toBe(false);
    expect(state.graph).toBeNull();
    expect(state.watcher).toBeNull();
  });

  (process.platform === 'win32' ? it.skip : it)('removes a partially created clone after a transport interruption', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'depwire-git-v4-test-'));
    tempDirs.push(sandbox);
    const bin = join(sandbox, 'bin');
    mkdirSync(bin);
    const gitShim = join(bin, 'git');
    writeFileSync(gitShim, '#!/bin/sh\nfor arg in "$@"; do target="$arg"; done\nmkdir -p "$target"\nprintf partial > "$target/partial"\nprintf "transport closed\\n" >&2\nexit 128\n');
    chmodSync(gitShim, 0o755);
    const { source, cloneDir } = localGitHubUrl(join(sandbox, 'unused.git'));
    process.env.PATH = `${bin}${delimiter}${priorPath}`;
    const result = await connectToRepo(source, undefined, createEmptyState());
    expect(result.error).toBe('Failed to clone repository');
    expect(existsSync(cloneDir)).toBe(false);
  });

  it('reports a failed pull with the revision actually analysed', async () => {
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
    const initialState = createEmptyState();
    try {
      expect((await connectToRepo(source, undefined, initialState)).connected).toBe(true);
    } finally {
      await initialState.watcher?.close();
    }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cloneDir, encoding: 'utf8' }).trim();
    git(cloneDir, 'remote', 'set-url', 'origin', join(sandbox, 'unreachable.git'));
    const state = createEmptyState();
    try {
      const response = await handleToolCall('connect_repo', { source }, state);
      const result = JSON.parse(response.content[0].text);
      expect(result.connected).toBe(true);
      expect(result.remoteSync?.status).toBe('stale');
      expect(result.remoteSync?.analyzedRevision).toBe(head);
      expect(result.remoteSync?.pullError).toContain('Could not read from remote repository');
      expect(result.summary).toContain(`WARNING: Pull failed; analysed cached revision ${head}`);
      expect(state.graph?.order).toBeGreaterThan(0);
    } finally {
      await state.watcher?.close();
    }
  });

  it('rejects a protected local path', async () => {
    const protectedPaths = process.platform === 'win32'
      ? [join(homedir(), '.ssh')]
      : ['/etc', '/var', join(homedir(), '.ssh')];
    for (const path of protectedPaths) {
      const result = await connectToRepo(path, undefined, createEmptyState());
      expect(result.error).toBe('Access denied');
      expect(result.message).toContain(path);
    }
  });

  (process.platform === 'win32' ? it.skip : it)('does not exempt an arbitrary protected temp location', async () => {
    process.env.TMPDIR = '/etc';
    const result = await connectToRepo('https://github.com/depwire-test/unreachable.git', undefined, createEmptyState());
    expect(result.error).toBe('Access denied');
    expect(result.message).toContain('/etc');
  });

  it('removes a fresh clone when a subdirectory is rejected', async () => {
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
    const result = await connectToRepo(source, '..', createEmptyState());
    expect(result.error).toBe('Access denied');
    expect(existsSync(cloneDir)).toBe(false);
  });
});
