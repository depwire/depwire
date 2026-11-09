import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseProject } from '../src/parser/index.js';
import { initParser } from '../src/parser/wasm-init.js';
import { getParserForFile } from '../src/parser/detect.js';
import { canonicalParsedFile } from '../src/graph/path-boundary.js';
import { buildGraph } from '../src/graph/index.js';
import { getCachedFiles, openCache, updateCache, RESOLUTION_VERSION } from '../src/parser/cache.js';
import { verifyChange } from '../src/core/verify-change.js';
import { runVerifyChangeAction } from '../src/commands/verify-change-action.js';
import { handleToolCall } from '../src/mcp/tools.js';
import { createEmptyState } from '../src/mcp/state.js';
const roots: string[] = [];
const histories = new Map<string, { text: string; mtime: number; ctime: number }>();
beforeAll(initParser);
function fixture(files: Record<string, string>, history = false) {
  const root = mkdtempSync(join(tmpdir(), 'vc-syntax-cache-')); roots.push(root);
  for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
  if (history) {
    mkdirSync(join(root, '.depwire')); const path = join(root, '.depwire/health-history.json');
    writeFileSync(path, '[{"timestamp":"sentinel","score":17}]\n');
    histories.set(root, { text: readFileSync(path, 'utf8'), mtime: statSync(path).mtimeMs, ctime: statSync(path).ctimeMs });
  }
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  try {
    for (const root of roots) {
      const path = join(root, '.depwire/health-history.json'); const before = histories.get(root);
      if (before) expect({ text: readFileSync(path, 'utf8'), mtime: statSync(path).mtimeMs, ctime: statSync(path).ctimeMs }).toEqual(before);
      else expect(existsSync(path)).toBe(false);
    }
  } finally { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); histories.clear(); }
});
const good = 'export function value() { return 1; }\n';
const broken = good + 'export function broken( { !!!';
const caller = "import { value } from './dep';\nexport function caller() { return value(); }\n";
const input = { file_path: 'caller.ts', new_content: '' };
async function run(root: string, useCache = false) {
  const parsed = await parseProject(root, { useCache }); const graph = buildGraph(parsed, root);
  return { parsed, graph, result: await verifyChange(input, { projectRoot: root, graph, parsedFiles: parsed }) };
}
it('enumerable checked and not-applicable metadata survives canonicalization and SQLite round-trip', () => {
  const root = fixture({ 'broken.ts': broken, 'clean.ts': good, Gemfile: "gem 'rails'" });
  const files = ['broken.ts', 'clean.ts', 'Gemfile'].map(file => canonicalParsedFile(
    getParserForFile(file)!.parseFile(file, readFileSync(join(root, file), 'utf8'), root), root));
  const db = openCache(root); expect(db).toBeTruthy();
  try {
    updateCache(db, root, files);
    const cached = getCachedFiles(db, root, files.map(f => f.filePath));
    expect(JSON.stringify([...cached.values()])).toBe(JSON.stringify(files));
    expect(cached.get('broken.ts')!.syntaxErrors![0]).toMatchObject({ file: 'broken.ts', line: 2, text: 'export function broken( { !!!' });
    expect(cached.get('clean.ts')).toMatchObject({ syntaxCheck: 'checked', syntaxErrors: [] });
    expect(cached.get('Gemfile')).toMatchObject({ syntaxCheck: 'not_applicable', syntaxErrors: null });
    for (const file of files) {
      const row = JSON.parse(db.prepare('SELECT parsed_data FROM file_cache WHERE file_path = ?').get(file.filePath).parsed_data);
      expect(Object.keys(row)).toEqual(expect.arrayContaining(['syntaxCheck', 'syntaxErrors']));
    }
  } finally { db.close(); }
});
it('cache hit equals cache miss byte for byte for parsed records and verify-change payload', async () => {
  const root = fixture({ 'caller.ts': caller, 'dep.ts': broken, 'keep.ts': good }, true);
  const miss = await run(root, true);
  const log = vi.spyOn(console, 'error');
  const hit = await run(root, true);
  expect(log.mock.calls.flat().join(' ')).toContain('3 hits, 0 files re-parsed');
  expect(JSON.stringify(hit.parsed)).toBe(JSON.stringify(miss.parsed));
  expect(JSON.stringify(hit.result)).toBe(JSON.stringify(miss.result));
});
it('version-13 rows rebuild rather than treating missing diagnostics as clean', async () => {
  const root = fixture({ 'caller.ts': caller, 'dep.ts': broken, 'keep.ts': good });
  await run(root, true);
  const db = openCache(root);
  db.prepare("UPDATE cache_meta SET value = '13' WHERE key = 'resolution_version'").run();
  db.prepare("UPDATE file_cache SET parsed_data = ? WHERE file_path = 'dep.ts'").run(JSON.stringify({ filePath: 'dep.ts', symbols: [], edges: [] }));
  db.close();
  const log = vi.spyOn(console, 'error'); const result = await run(root, true);
  expect(RESOLUTION_VERSION).toBe(14);
  expect(log.mock.calls.flat().join(' ')).toContain('0 hits, 3 files re-parsed');
  expect(result.result).toMatchObject({ risk_level: 'medium', coverage_gaps: [{ file: 'dep.ts' }] });
  expect(result.parsed.find(f => f.filePath === 'dep.ts')!.syntaxErrors).toHaveLength(1);
});
it('current-version row missing syntax metadata is a cache miss, never clean', async () => {
  const root = fixture({ 'broken.ts': broken }); await parseProject(root, { useCache: true });
  const db = openCache(root);
  try {
    db.prepare('UPDATE file_cache SET parsed_data = ?').run(JSON.stringify({ filePath: 'broken.ts', symbols: [], edges: [] }));
    expect(getCachedFiles(db, root, ['broken.ts']).size).toBe(0);
  } finally { db.close(); }
  expect((await parseProject(root, { useCache: true }))[0].syntaxErrors).toHaveLength(1);
});
it('broken affected dependency raises a real low deletion to medium through core, CLI and MCP', async () => {
  const root = fixture({ 'caller.ts': caller, 'dep.ts': good, 'keep.ts': good }, true);
  expect((await run(root)).result.risk_level).toBe('low');
  writeFileSync(join(root, 'dep.ts'), broken);
  const { result, graph } = await run(root);
  const check = (r: any) => {
    expect(r).toMatchObject({ risk_level: 'medium', safe: false, error_reason: null, partial: false, syntax_check: 'checked', syntax_errors_outside_affected_set: 0 });
    expect(r.coverage_gaps).toEqual([{ file: 'dep.ts', reason: 'Syntax error at dep.ts:2: export function broken( { !!!' }]);
    expect(r.unrelated_context).not.toHaveProperty('coverage_gaps');
  };
  check(result);
  const response = await handleToolCall('verify_change', input, { ...createEmptyState(), projectRoot: root, graph });
  check(JSON.parse(response.content[0].text));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  await runVerifyChangeAction(root, { file: 'caller.ts', content: '', json: true, failOnWarnings: true });
  check(JSON.parse(log.mock.calls.flat().join(''))); expect(exit).toHaveBeenCalledWith(1);
});
it('affected syntax gap never lowers high or overrides changed-file error', async () => {
  const root = fixture({ 'caller.ts': caller, 'dep.ts': broken, 'keep.ts': good });
  const { graph, parsed } = await run(root);
  const high = await verifyChange({ file_path: 'dep.ts', new_content: '' }, { projectRoot: root, graph, parsedFiles: parsed });
  expect(high.risk_level).toBe('high');
  const error = await verifyChange({ file_path: 'caller.ts', new_content: 'export function bad( !!!' }, { projectRoot: root, graph, parsedFiles: parsed });
  expect(error).toMatchObject({ risk_level: 'error', coverage_gaps: null, syntax_errors_outside_affected_set: null, syntax_check: 'checked' });
});
it('outside-set syntax error preserves the clean-project verdict and reports one file', async () => {
  const root = fixture({ 'caller.ts': 'export function caller() {}', 'outside.ts': good, 'keep.ts': good });
  const clean = (await run(root)).result;
  writeFileSync(join(root, 'outside.ts'), broken);
  const result = (await run(root)).result;
  expect(result.risk_level).toBe(clean.risk_level); expect(result.safe).toBe(clean.safe);
  expect(result.error_reason).toBe(clean.error_reason); expect(result.cyclicGroupChanges).toEqual(clean.cyclicGroupChanges);
  expect(result).toMatchObject({ coverage_gaps: [], syntax_errors_outside_affected_set: 1, partial: false });
});
it.each([['a.mojo', 'fn alpha() -> Int:\n    return 1\n'], ['Gemfile', "gem 'rails'\n"]])('%s changes explicitly report syntax not_applicable', async (file, source) => {
  const root = fixture({ [file]: source, 'keep.ts': good }); const parsed = await parseProject(root, { useCache: false });
  const result = await verifyChange({ file_path: file, new_content: source }, { projectRoot: root, graph: buildGraph(parsed, root), parsedFiles: parsed });
  expect(result).toMatchObject({ syntax_check: 'not_applicable', coverage_gaps: [], syntax_errors_outside_affected_set: 0 });
  expect(parsed.find(f => f.filePath === file)).toMatchObject({ syntaxCheck: 'not_applicable', syntaxErrors: null });
});
it('oversized outside file makes census null and names the skipped file without inventing affected gaps', async () => {
  const root = fixture({ 'caller.ts': good, 'large.ts': ' '.repeat(1_000_001), 'keep.ts': good });
  const parsed = await parseProject(root, { useCache: false });
  const result = await verifyChange(input, { projectRoot: root, graph: buildGraph(parsed, root), parsedFiles: parsed });
  expect(result).toMatchObject({ syntax_check: 'checked', syntax_errors_outside_affected_set: null, coverage_gaps: null, risk_level: 'medium', partial: false });
  expect(result.skipped_files).toEqual([{ file: 'large.ts', reason: expect.stringContaining('File too large') }]);
  expect(result.warnings.join(' ')).toContain('skipped files: large.ts');
  expect(result.unrelated_context).not.toHaveProperty('skipped_files');
});
it('oversized changed file leaves all syntax checks null in the CLI envelope', async () => {
  const root = fixture({ 'large.ts': ' '.repeat(1_000_001), 'keep.ts': good });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  await runVerifyChangeAction(root, { file: 'large.ts', content: good, json: true });
  const result = JSON.parse(log.mock.calls.flat().join(''));
  expect(result).toMatchObject({ risk_level: 'error', syntax_check: null, coverage_gaps: null, syntax_errors_outside_affected_set: null });
  expect(result.warnings.join(' ')).toContain('large.ts'); expect(exit).toHaveBeenCalledWith(1);
});

it('oversized dependent nulls gaps and is listed in skipped_files through real core, fresh MCP load and the CLI action', async () => {
  // Addendum 7: no prepared graph. caller.ts is oversized on disk, so every
  // fresh parse skips it and no graph ever contains it.
  const root = fixture({ 'caller.ts': caller + ' '.repeat(1_000_001), 'dep.ts': good, 'keep.ts': good }, true);
  const args = { file_path: 'dep.ts', new_content: good };
  const check = (result: any) => {
    expect(result).toMatchObject({ risk_level: 'medium', error_reason: null, partial: false,
      syntax_check: 'checked', coverage_gaps: null, syntax_errors_outside_affected_set: null });
    expect(result.skipped_files).toEqual([{ file: 'caller.ts', reason: expect.stringContaining('File too large') }]);
    expect(result.warnings.join(' ')).toContain('skipped files: caller.ts');
    expect(result.unrelated_context).not.toHaveProperty('skipped_files');
  };
  const parsed = await parseProject(root, { useCache: false });
  check(await verifyChange(args, { projectRoot: root, graph: buildGraph(parsed, root), parsedFiles: parsed }));
  // Fresh MCP load: connect_repo builds the state; no graph is injected.
  const state = createEmptyState();
  await handleToolCall('connect_repo', { source: root }, state);
  try {
    check(JSON.parse((await handleToolCall('verify_change', args, state)).content[0].text));
  } finally {
    await state.watcher?.close(); state.watcher = null;
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  await runVerifyChangeAction(root, { file: 'dep.ts', content: good, json: true, failOnWarnings: true });
  check(JSON.parse(log.mock.calls.flat().join('')));
  expect(exit).toHaveBeenCalledWith(1);
});
