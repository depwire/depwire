import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root = mkdtempSync(join(tmpdir(), 'vc-syntax-cli-'));
const entry = join(root, 'dist/cli.mjs');
beforeAll(async () => {
  mkdirSync(join(root, 'dist'));
  symlinkSync(resolve('package.json'), join(root, 'package.json'));
  // Bundle the current CLI into a disposable directory, never use a stale dist.
  await build({ entryPoints: [resolve('src/index.ts')], outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  mkdirSync(join(root, 'dist/parser')); symlinkSync(resolve('src/parser/grammars'), join(root, 'dist/parser/grammars'), 'dir');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const samples = [
  ['rewrite', 'orphan.ts', 'export function unused() {}', "export\n type { A + B } from './x';", 'orphan.ts:2: + B'],
  ['unrelated', 'orphan.ts', 'export function unused() {}', "export\n type { A } from './x';\nexport function broken( { !!!", 'orphan.ts:3: export function broken( { !!!'],
  ['typescript', 'orphan.ts', 'export function unused() {}', 'export function unused( { !!!', 'orphan.ts:1: export function unused( { !!!'],
  ['python', 'broken.py', 'def unused():\n    return 1\n', 'def broken( !!!', 'broken.py:1: def broken( !!!'],
  ['java', 'Broken.java', 'public class Broken {}', 'public class Broken { void broken( !!!', 'Broken.java:1: public class Broken { void broken( !!!'],
];
for (const [name, file, baseline, source, reason] of samples) {
  it(`CLI subprocess ${name} exits 1 with and without risk flag`, () => {
    const fixture = join(root, name); mkdirSync(fixture);
    writeFileSync(join(fixture, file), baseline); writeFileSync(join(fixture, 'x.ts'), 'export interface A {}');
    for (const flag of [false, true]) {
      const run = spawnSync(process.execPath, [entry, 'verify-change', fixture, '--file', file, '--content', source, '--json', ...(flag ? ['--fail-on-warnings'] : [])], { encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(1);
      expect(run.stdout, run.stderr).not.toBe('');
      const result = JSON.parse(run.stdout);
      expect(result).toMatchObject({ safe: false, risk_level: 'error' }); expect(result.error_reason).toContain(reason);
      expect(existsSync(join(fixture, '.depwire/health-history.json'))).toBe(false);
    }
  });
}
