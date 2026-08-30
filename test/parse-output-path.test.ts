import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cliPath = resolve(import.meta.dirname, '../dist/index.js');
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runParse(projectRoot: string, cwd: string, output?: string) {
  const args = [cliPath, 'parse', projectRoot];
  if (output) args.push('--output', output);
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DEPWIRE_NO_TELEMETRY: '1' },
  });
}

describe('depwire parse output location', () => {
  it('writes to the project path, reports failures, and leaves a different cwd untouched', () => {
    const sandbox = tempDir('depwire-parse-output-');
    const projectRoot = join(sandbox, 'project');
    const cwd = tempDir('depwire-parse-cwd-');
    mkdirSync(projectRoot);
    writeFileSync(join(projectRoot, 'index.ts'), 'export const value = 1;\n');
    const unreadableFile = join(projectRoot, 'unreadable.ts');
    writeFileSync(unreadableFile, 'export const unreadable = true;\n');
    chmodSync(unreadableFile, 0o000);

    const result = runParse(projectRoot, cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 files failed');
    expect(existsSync(join(projectRoot, 'depwire-output.json'))).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('uses --output instead of the project path when explicitly provided', () => {
    const projectRoot = tempDir('depwire-parse-project-');
    const cwd = tempDir('depwire-parse-cwd-');
    const outputDir = tempDir('depwire-parse-explicit-');
    writeFileSync(join(projectRoot, 'index.ts'), 'export const value = 1;\n');

    const result = runParse(projectRoot, cwd, outputDir);

    expect(result.status).toBe(0);
    expect(existsSync(join(outputDir, 'depwire-output.json'))).toBe(true);
    expect(existsSync(join(projectRoot, 'depwire-output.json'))).toBe(false);
    expect(readdirSync(cwd)).toEqual([]);
  });
});
