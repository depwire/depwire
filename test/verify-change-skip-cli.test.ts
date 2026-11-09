import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { handleToolCall } from '../src/mcp/tools.js';
import { createEmptyState } from '../src/mcp/state.js';
// Addendum 7/D2: skip-record scenarios through the real built CLI (subprocess,
// no mocks) and a fresh MCP load (real connect_repo, no injected graph).
const root = mkdtempSync(join(tmpdir(), 'vc-skip-cli-'));
const entry = join(root, 'dist/cli.mjs');
beforeAll(async () => {
  mkdirSync(join(root, 'dist'));
  symlinkSync(resolve('package.json'), join(root, 'package.json'));
  // Bundle the current CLI into a disposable directory, never use a stale dist.
  await build({ entryPoints: [resolve('src/index.ts')], outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  mkdirSync(join(root, 'dist/parser')); symlinkSync(resolve('src/parser/grammars'), join(root, 'dist/parser/grammars'), 'dir');
  mkdirSync(join(root, 'dist/security'));
  symlinkSync(resolve('src/security/native-binding-allowlist.json'), join(root, 'dist/security/native-binding-allowlist.json'));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const good = 'export function value() { return 1; }\n';
const caller = "import { value } from './dep';\nexport function caller() { return value(); }\n";
function project(files: Record<string, string>) {
  const dir = join(root, Object.keys(files).join('-').replace(/[^a-z0-9-]/gi, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2));
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  return dir;
}
function cli(dir: string, file: string, content: string, ...extra: string[]) {
  const run = spawnSync(process.execPath, [entry, 'verify-change', dir, '--file', file, '--content', content, '--json', ...extra], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}

it('verifier scenario: small changed file plus oversized dependent nulls gaps and lists the dependent', () => {
  const dir = project({ 'dep.ts': good, 'caller.ts': caller + ' '.repeat(1_000_001), 'keep.ts': good });
  const result = cli(dir, 'dep.ts', good);
  expect(result).toMatchObject({ risk_level: 'medium', error_reason: null, syntax_check: 'checked',
    coverage_gaps: null, syntax_errors_outside_affected_set: null, partial: false });
  expect(result.skipped_files).toEqual([{ file: 'caller.ts', reason: expect.stringContaining('File too large') }]);
  expect(result.warnings.join(' ')).toContain('skipped files: caller.ts');
});

it('oversized unrelated file nulls gaps and is listed in skipped_files', () => {
  const dir = project({ 'dep.ts': good, 'caller.ts': caller, 'unrelated.ts': ' '.repeat(1_000_001) });
  const result = cli(dir, 'dep.ts', good);
  expect(result.coverage_gaps).toBeNull();
  expect(result.skipped_files.map((s: any) => s.file)).toEqual(['unrelated.ts']);
});

it('configured exclusion keeps gaps [] with the file listed in skipped_files', () => {
  const dir = project({ 'dep.ts': good, 'caller.ts': caller, 'gen.ts': good });
  const result = cli(dir, 'dep.ts', good, '--exclude', 'gen.ts');
  expect(result.coverage_gaps).toEqual([]);
  expect(result.skipped_files).toEqual([{ file: 'gen.ts', reason: expect.stringContaining('Excluded by configured pattern: gen.ts') }]);
});

it('clean project reports empty gaps and empty skipped_files', () => {
  const dir = project({ 'keep.ts': good, 'dep.ts': good });
  const result = cli(dir, 'keep.ts', '');
  expect(result).toMatchObject({ safe: true, risk_level: 'low', coverage_gaps: [], skipped_files: [], syntax_errors_outside_affected_set: 0 });
});

it('fresh MCP load: oversized dependent and configured exclusion follow the D2 rule', async () => {
  const dir = project({ 'dep.ts': good, 'caller.ts': caller + ' '.repeat(1_000_001), 'keep.ts': good });
  const state = createEmptyState();
  await handleToolCall('connect_repo', { source: dir }, state);
  try {
    const oversized = JSON.parse((await handleToolCall('verify_change', { file_path: 'dep.ts', new_content: good }, state)).content[0].text);
    expect(oversized.coverage_gaps).toBeNull();
    expect(oversized.skipped_files).toEqual([{ file: 'caller.ts', reason: expect.stringContaining('File too large') }]);
    const excluded = JSON.parse((await handleToolCall('verify_change', { file_path: 'dep.ts', new_content: good, exclude: ['caller.ts'] }, state)).content[0].text);
    expect(excluded.coverage_gaps).toEqual([]);
    expect(excluded.skipped_files).toEqual([{ file: 'caller.ts', reason: expect.stringContaining('Excluded by configured pattern: caller.ts') }]);
  } finally {
    await state.watcher?.close(); state.watcher = null;
  }
});
