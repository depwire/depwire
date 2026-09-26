import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('fs')>(),
  readSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));
import { execSync } from 'child_process';
import { readSync, readFileSync, existsSync } from 'fs';
import { popStash } from '../src/temporal/git.js';
import { verifyChangeCommand } from '../src/commands/verify-change.js';
import { discoverJvmModuleRoots } from '../src/parser/jvm-modules.js';

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('IO failures must reach callers', () => {
  it('rejects a failed stash restoration', async () => {
    vi.mocked(execSync).mockReturnValueOnce('stash@{0}').mockImplementationOnce(() => { throw new Error('conflict'); });
    await expect(popStash('/project')).rejects.toThrow('Failed to restore stashed changes');
  });

  it('rejects stdin failure instead of verifying truncated content', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    vi.mocked(readSync).mockReturnValueOnce(4).mockImplementationOnce(() => { throw new Error('EIO'); });
    try {
      await expect(verifyChangeCommand('.', { file: 'index.ts' })).rejects.toThrow('Failed to read change content');
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor);
      else delete (process.stdin as any).isTTY;
    }
  });

  it('reports unreadable Maven and Gradle declarations in existing errors metadata', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    const result = discoverJvmModuleRoots('/project');
    expect(result.roots).toEqual([]);
    expect(result.errors.map(error => error.path)).toEqual(['pom.xml', 'settings.gradle.kts', 'settings.gradle']);
    expect(result.errors.every(error => error.reason.includes('EACCES'))).toBe(true);
  });
});
