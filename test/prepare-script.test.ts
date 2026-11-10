import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function install(withSources: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'depwire-prepare-'));
  roots.push(dir);
  mkdirSync(join(dir, 'scripts'));
  cpSync(resolve('scripts/prepare.mjs'), join(dir, 'scripts/prepare.mjs'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'prepare-fixture', version: '0.0.0', type: 'module',
    scripts: { build: "node -e \"require('fs').writeFileSync('built.marker','ok')\"" },
  }));
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir'); // build tooling (tsup) resolvable
  if (withSources) {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/index.ts'), 'export {};\n');
  }
  return dir;
}

function runPrepare(dir: string) {
  // Same invocation as the package.json "prepare" script.
  const script = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts.prepare as string;
  expect(script).toBe('node scripts/prepare.mjs');
  return spawnSync(process.execPath, ['scripts/prepare.mjs'], { cwd: dir, encoding: 'utf8' });
}

describe('npm prepare script', () => {
  it('is a no-op without src/', () => {
    const dir = install(false);
    const result = runPrepare(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('no sources in this install, skipping build');
    expect(existsSync(join(dir, 'built.marker'))).toBe(false);
  });

  it('runs the build with src/', () => {
    const dir = install(true);
    const result = runPrepare(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(existsSync(join(dir, 'built.marker'))).toBe(true);
  });
});
