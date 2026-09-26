import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    expect(result.stderr).toContain('Warning: 1 files failed; graph is partial.');
    const graph = JSON.parse(readFileSync(join(projectRoot, 'depwire-output.json'), 'utf8'));
    expect(graph.files).toContain('index.ts');
    expect(graph.files).not.toContain('unreadable.ts');
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


describe('parse exit codes and monorepo paths', () => {
  it('accepts packages/backend relative to the monorepo root', () => {
    const repo = tempDir('depwire-relative-monorepo-');
    mkdirSync(join(repo, 'packages/backend'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{"workspaces":["packages/*"]}');
    writeFileSync(join(repo, 'packages/backend/index.ts'), 'export const backend = 1;');
    const before = readdirSync(repo);
    const result = runParse('packages/backend', repo);
    expect(result.status).toBe(0);
    expect(existsSync(join(repo, 'packages/backend/depwire-output.json'))).toBe(true);
    expect(readdirSync(repo)).toEqual(before);
  });

  it('writes a relative monorepo subdirectory only inside that directory', () => {
    const repo = tempDir('depwire-monorepo-');
    const backend = join(repo, 'packages/backend');
    const cwd = tempDir('depwire-unrelated-cwd-');
    mkdirSync(backend, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{"workspaces":["packages/*"]}');
    writeFileSync(join(backend, 'index.ts'), 'export const backend = 1;');
    const before = readdirSync(repo);
    const result = runParse('../' + repo.split('/').pop() + '/packages/backend', cwd);
    expect(result.status).toBe(0);
    expect(existsSync(join(backend, 'depwire-output.json'))).toBe(true);
    expect(readdirSync(repo)).toEqual(before);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('defaults to cwd even when an ancestor has a project marker', () => {
    const repo = tempDir('depwire-cwd-monorepo-');
    const cwd = join(repo, 'packages/backend');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}');
    writeFileSync(join(cwd, 'index.ts'), 'export const backend = 1;');
    const result = spawnSync(process.execPath, [cliPath, 'parse'], {
      cwd, encoding: 'utf8', env: { ...process.env, DEPWIRE_NO_TELEMETRY: '1' },
    });
    expect(result.status).toBe(0);
    expect(existsSync(join(cwd, 'depwire-output.json'))).toBe(true);
    expect(existsSync(join(repo, 'depwire-output.json'))).toBe(false);
    expect(existsSync(join(repo, '.depwire'))).toBe(false);
  });

  it.each(['empty', 'unsupported', 'excluded', 'all-failed'])(
    'exits 2 without exporting for %s input', (scenario) => {
      const root = tempDir('depwire-empty-');
      const cwd = tempDir('depwire-empty-cwd-');
      if (scenario === 'unsupported') writeFileSync(join(root, 'notes.txt'), 'hello');
      if (scenario === 'excluded' || scenario === 'all-failed') {
        writeFileSync(join(root, 'index.ts'), 'export const value = 1;');
      }
      if (scenario === 'all-failed') chmodSync(join(root, 'index.ts'), 0o000);
      const result = spawnSync(process.execPath, [cliPath, 'parse', root,
        ...(scenario === 'excluded' ? ['--exclude', '**/*.ts'] : [])], {
        cwd, encoding: 'utf8', env: { ...process.env, DEPWIRE_NO_TELEMETRY: '1' },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('No parseable files found');
      expect(result.stderr).not.toContain('graph is partial');
      expect(result.stdout).not.toContain('Graph exported');
      expect(existsSync(join(root, 'depwire-output.json'))).toBe(false);
      expect(readdirSync(cwd)).toEqual([]);
    });

  it('exits 1 for a missing input directory without creating it', () => {
    const root = join(tempDir('depwire-missing-'), 'missing');
    const result = runParse(root, tempDir('depwire-missing-cwd-'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error scanning directory');
    expect(existsSync(root)).toBe(false);
  });

  it('exits 1 when the output cannot be written', () => {
    const root = tempDir('depwire-write-failure-');
    writeFileSync(join(root, 'index.ts'), 'export const value = 1;');
    const output = join(root, 'not-a-directory');
    writeFileSync(output, 'occupied');
    const result = runParse(root, root, output);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error parsing project');
  });
});

it('exits 2 when installed grammar assets are missing', () => {
  const install = tempDir('depwire-broken-install-');
  cpSync(resolve(import.meta.dirname, '../dist'), join(install, 'dist'), {
    recursive: true, filter: (source) => !source.endsWith('.wasm'),
  });
  writeFileSync(join(install, 'package.json'), '{"type":"module","version":"test"}');
  symlinkSync(resolve(import.meta.dirname, '../node_modules'), join(install, 'node_modules'), 'dir');
  const root = tempDir('depwire-grammar-project-');
  writeFileSync(join(root, 'index.ts'), 'export const value = 1;');
  const result = spawnSync(process.execPath, [join(install, 'dist/index.js'), 'parse', root], {
    encoding: 'utf8', env: { ...process.env, DEPWIRE_NO_TELEMETRY: '1' },
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Grammar initialization failed');
  expect(result.stderr).toContain('No parseable files found');
  expect(existsSync(join(root, 'depwire-output.json'))).toBe(false);
});
