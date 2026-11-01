import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { connectToRepo } from '../src/mcp/connect.js';
import { createEmptyState } from '../src/mcp/state.js';

describe('connect_repo protected-directory guard', () => {
  let sandbox: string;
  let home: string;
  let permitted: string;
  let protectedDir: string;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'depwire-guard-')));
    home = join(sandbox, 'home');
    permitted = join(sandbox, 'permitted');
    protectedDir = join(home, '.ssh');
    for (const dir of [protectedDir, permitted]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.ts'), 'export const synthetic = 1;\n');
    }
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(sandbox, { recursive: true, force: true });
  });

  async function connect(source: string, subdirectory?: string) {
    const state = createEmptyState();
    try { return await connectToRepo(source, subdirectory, state); }
    finally { await state.watcher?.close(); }
  }

  it('rejects a direct protected path', async () => {
    expect((await connect(protectedDir)).error).toBe('Access denied');
  });

  it('rejects a symlink in a permitted directory to a protected target', async () => {
    const link = join(permitted, 'secret');
    symlinkSync(protectedDir, link, 'dir');
    expect((await connect(link)).error).toBe('Access denied');
  });

  it('allows a symlink to a permitted target without changing the returned root', async () => {
    const link = join(sandbox, 'allowed-link');
    symlinkSync(permitted, link, 'dir');
    const result = await connect(link);
    expect(result.connected).toBe(true);
    expect(result.projectRoot).toBe(resolve(link));
  });

  it.skipIf(process.platform !== 'darwin')('allows the macOS managed /var/folders temp path', async () => {
    expect(sandbox).toMatch(/^\/private\/var\/folders\//);
    const source = permitted.replace(/^\/private/, '');
    const result = await connect(source);
    expect(result.connected).toBe(true);
    expect(result.projectRoot).toBe(source);
  });

  it('returns a clean error for a non-existent path', async () => {
    await expect(connect(join(sandbox, 'missing'))).resolves.toMatchObject({ error: 'Directory not found' });
  });

  it('rejects relative traversal into a protected directory', async () => {
    const source = relative(process.cwd(), permitted) + '/../home/.ssh';
    expect((await connect(source)).error).toBe('Access denied');
  });

  it('fully resolves and rejects a nested symlink chain', async () => {
    const inner = join(permitted, 'inner');
    const outer = join(permitted, 'outer');
    symlinkSync(protectedDir, inner, 'dir');
    symlinkSync(inner, outer, 'dir');
    expect((await connect(outer)).error).toBe('Access denied');
  });

  it('allows a name that merely prefixes a protected path', async () => {
    const source = join(home, '.ssh-extra');
    mkdirSync(source);
    writeFileSync(join(source, 'index.ts'), 'export const synthetic = 1;\n');
    expect((await connect(source)).connected).toBe(true);
  });

  it('rejects a protected target selected by a symlink subdirectory', async () => {
    symlinkSync(protectedDir, join(permitted, 'secret'), 'dir');
    expect((await connect(permitted, 'secret')).error).toBe('Access denied');
  });

  it('returns a clean error for a missing subdirectory', async () => {
    expect((await connect(permitted, 'missing')).error).toBe('Project root not found');
  });
});
