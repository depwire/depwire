import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DirectedGraph } from 'graphology';
import { verifyChange, verifyChangeError, structuralVerdict, type VerifyChangeInput, type VerifyChangeOutput } from '../src/core/verify-change.js';
import { SimulationEngine } from '../src/simulation/engine.js';
import * as health from '../src/health/index.js';
import * as security from '../src/security/scanner.js';
import * as parsers from '../src/parser/detect.js';
import * as wasm from '../src/parser/wasm-init.js';
import * as topology from '../src/graph/cyclic-groups.js';
import * as queries from '../src/graph/queries.js';
import { simulationActions, simulationFixture } from './verify-change-simulation-fixture.js';
import { renderVerifyChange, verifyChangeExitCode } from '../src/commands/verify-change.js';

const roots: string[] = [];
const historySnapshots = new Map<string, { contents: string; mtimeMs: number; ctimeMs: number; ino: number } | null>();
function fixture(history = false) {
  const root = mkdtempSync(join(tmpdir(), 'verify-contract-')); roots.push(root);
  const graph = new DirectedGraph();
  for (const name of ['index', 'orphan', 'helper.test']) {
    const symbol = name === 'helper.test' ? 'helper' : name;
    writeFileSync(join(root, `${name}.ts`), `export function ${symbol}() { return 1; }\n`);
    graph.addNode(`${name}.ts::${symbol}`, { filePath: `${name}.ts`, name: symbol, kind: 'function', exported: true, startLine: 1, endLine: 1 });
  }
  if (history) { mkdirSync(join(root, '.depwire')); writeFileSync(join(root, '.depwire/health-history.json'), '[{"timestamp":"sentinel","score":17}]\n'); }
  const historyFile = join(root, '.depwire/health-history.json');
  const stat = history ? statSync(historyFile) : null;
  historySnapshots.set(root, stat ? { contents: readFileSync(historyFile, 'utf8'), mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino } : null);
  return { root, graph, ctx: { projectRoot: root, graph } };
}
const deletion = { file_path: 'orphan.ts', new_content: '' };
const patch = '--- a/orphan.ts\n+++ b/orphan.ts\n@@ -1 +1 @@\n-export function orphan() { return 1; }\n+export function orphan() { return 2; }\n';
function parity(r: VerifyChangeOutput) {
  for (const key of Object.keys(r.unrelated_context).filter(k => k !== 'note')) expect(r.unrelated_context[key as keyof typeof r.unrelated_context]).toEqual(r[key as keyof typeof r]);
  expect(r.safe).toBe(r.risk_level === 'low');
  expect(r.partial).toBe(r.health_status === 'error' || r.security_status === 'error');
  expect(r.security_findings === null).toBe(r.security_status !== 'computed');
  expect(r.health_reason === null).toBe(r.health_status === 'computed');
  expect(r.security_reason === null).toBe(r.security_status === 'computed');
  for (const key of ['health_score_before', 'health_score_after', 'health_score_delta'] as const) expect(r[key] === null || (typeof r[key] === 'number' && Number.isFinite(r[key]))).toBe(true);
  expect(r.relevant_warnings).toEqual(r.warnings);
  expect(JSON.parse(JSON.stringify(r))).toEqual(r);
}
afterEach(() => {
  vi.restoreAllMocks();
  try {
    for (const [root, contents] of historySnapshots) {
      const file = join(root, '.depwire/health-history.json');
      const stat = existsSync(file) ? statSync(file) : null;
      expect(stat ? { contents: readFileSync(file, 'utf8'), mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino } : null).toEqual(contents);
    }
  } finally { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); historySnapshots.clear(); }
});

describe('verify-change verdict contract §6', () => {
  it('injected simulation failure is error, never a clean deletion', async () => {
    const { ctx } = fixture(true);
    vi.spyOn(SimulationEngine.prototype, 'simulate').mockImplementationOnce(() => { throw new Error('injected simulation failure'); });
    const r = await verifyChange(deletion, ctx); parity(r);
    expect(r).toMatchObject({ safe: false, risk_level: 'error', health_score_after: null, health_score_delta: null });
    expect(r.error_reason).toContain('simulation');
    expect(r.cyclicGroupChanges.status).toBe('not_comparable');
  });
  it('structural-only simulation never invokes the internal scorer', () => {
    const scorer = vi.spyOn(SimulationEngine.prototype as any, 'computeHealthScore').mockImplementation(() => { throw new Error('must never run'); });
    const r = new SimulationEngine(simulationFixture()).simulate(simulationActions[0], { structuralOnly: true });
    expect(Object.keys(r)).toEqual(['action', 'diff', 'simulatedGraphInstance']); expect(scorer).not.toHaveBeenCalled();
  });
  it.each(['health', 'security', 'both'])('%s crash preserves structural safe verdict and sets partial', async which => {
    const { ctx } = fixture(true);
    if (which !== 'security') vi.spyOn(health, 'calculateHealthScore').mockImplementation(() => { throw new Error('health crash'); });
    if (which !== 'health') vi.spyOn(security, 'scanSecurity').mockRejectedValue(new Error('security crash'));
    const r = await verifyChange(deletion, ctx); parity(r);
    expect(r).toMatchObject({ safe: true, risk_level: 'low', error_reason: null, partial: true });
    if (which !== 'security') expect(r).toMatchObject({ health_status: 'error', health_score_before: null, health_score_after: null, health_score_delta: null });
    if (which !== 'health') expect(r).toMatchObject({ security_status: 'error', security_findings: null });
    expect(verifyChangeExitCode(r, true)).toBe(0);
  });
  it('after scorer crash clears even the independently computed before score', async () => {
    const { ctx } = fixture(); const real = health.calculateHealthScore;
    vi.spyOn(health, 'calculateHealthScore').mockImplementationOnce(real).mockImplementationOnce(() => { throw 'after crash'; });
    const r = await verifyChange(deletion, ctx); parity(r);
    expect(r).toMatchObject({ safe: true, health_status: 'error', health_score_before: null, health_score_after: null, health_score_delta: null, partial: true });
  });
  it.each([NaN, Infinity, '93'])('nonfinite or numeric-string health %s is unavailable, not zero', async value => {
    const { ctx } = fixture();
    vi.spyOn(health, 'calculateHealthScore').mockReturnValue({ overall: value } as any);
    const r = await verifyChange(deletion, ctx); parity(r);
    expect(r).toMatchObject({ health_status: 'unavailable', health_score_before: null, health_score_after: null, health_score_delta: null, partial: false });
  });
  it('single workspace method once per state, genuine zero and no history creation', async () => {
    const { ctx, root, graph } = fixture(); const calls = vi.spyOn(health, 'calculateHealthScore');
    const internal = vi.spyOn(SimulationEngine.prototype as any, 'computeHealthScore');
    const r = await verifyChange({ file_path: 'helper.test.ts', new_content: '' }, ctx); parity(r);
    expect(r.health_status).toBe('computed'); expect(r.health_score_delta).toBe(0);
    expect(calls).toHaveBeenCalledTimes(2); expect(internal).not.toHaveBeenCalled();
    expect(calls.mock.calls.every(c => c[2]?.persistHistory === false)).toBe(true);
    expect(calls.mock.calls[0][0]).toBe(graph); expect(calls.mock.calls[0][1]).toBe(root);
    expect(calls.mock.calls[1][0].order).toBe(graph.order - 1);
    expect(calls.mock.calls[1][1]).not.toBe(root); expect(existsSync(calls.mock.calls[1][1])).toBe(false);
    expect(r.health_score_delta).toBe(r.health_score_after! - r.health_score_before!);
  });
  it('health history is neither created nor modified on success or failure', async () => {
    for (const existing of [false, true]) {
      const { ctx } = fixture(existing);
      for (const input of [deletion, {}, { unified_diff: patch }]) { const r = await verifyChange(input, ctx); parity(r); }
      vi.spyOn(SimulationEngine.prototype, 'simulate').mockImplementationOnce(() => { throw 'failure'; });
      await verifyChange(deletion, ctx);
    }
  });
  it('other health callers retain default history persistence', () => {
    const { root, graph } = fixture(); historySnapshots.delete(root);
    const file = join(root, '.depwire/health-history.json');
    health.calculateHealthScore(graph, root); expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
    health.calculateHealthScore(graph, root); expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2);
    const before = readFileSync(file, 'utf8'); health.calculateHealthScore(graph, root, { persistHistory: false }); expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it.each([
    ['export-only', { file_path: 'orphan.ts', new_content: 'export function orphan() { return 42; }' }],
    ['unmatched', { file_path: 'new.ts', new_content: 'export const x = 1;' }],
    ['valid-diff', { unified_diff: patch }],
  ] as const)('%s has unavailable after/delta and exact context parity', async (_name, input) => {
    const { ctx } = fixture(); const r = await verifyChange(input, ctx); parity(r);
    expect(r).toMatchObject({ safe: false, risk_level: 'medium', health_status: 'unavailable', health_score_after: null, health_score_delta: null });
  });
  it('last-file deletion and empty baseline have null unavailable health', async () => {
    const { ctx, graph } = fixture(); graph.dropNode('index.ts::index'); graph.dropNode('helper.test.ts::helper');
    const r = await verifyChange(deletion, ctx); parity(r);
    expect(r).toMatchObject({ safe: false, risk_level: 'medium', health_score_after: null, health_score_delta: null, health_status: 'unavailable' });
    graph.clear(); const empty = await verifyChange(deletion, ctx); parity(empty); expect(empty.health_score_before).toBeNull();
  });
  it.each([{}, null, { file_path: 12, new_content: '' }, { file_path: 'x.ts', new_content: 0 }, { file_path: 'x.ts', new_content: '', unified_diff: patch }, { unified_diff: 3 }, { unified_diff: 'garbage' }, { unified_diff: '--- a/a.ts\n+++ b/a.ts\n' }, { unified_diff: '--- a/a.ts\n+++ b/a.ts\n@@ -2 +2 @@\n-a\n' }])('invalid/malformed input %j returns full error envelope before scoring', async input => {
    const { ctx } = fixture(); const score = vi.spyOn(health, 'calculateHealthScore');
    const r = await verifyChange(input as VerifyChangeInput, ctx); parity(r);
    expect(r).toMatchObject({ safe: false, risk_level: 'error', health_status: 'not_applicable', security_findings: null, partial: false }); expect(score).not.toHaveBeenCalled();
  });
  it.each(['missing', 'throw', 'reported', 'grammar'])('required parser %s failure is structural error', async failure => {
    const { ctx } = fixture();
    if (failure === 'grammar') vi.spyOn(wasm, 'initParser').mockRejectedValue(new Error('grammar failed'));
    else vi.spyOn(parsers, 'getParserForFile').mockReturnValue(failure === 'missing' ? null : { parseFile: () => { if (failure === 'throw') throw new Error('parse failed'); return { symbols: [], errors: ['reported parse error'] }; } } as any);
    const r = await verifyChange({ file_path: 'orphan.ts', new_content: 'export const x = 1;' }, ctx); parity(r); expect(r.risk_level).toBe('error'); expect(r.error_reason).toContain('parser');
  });
  it.each(['unknown-kind', 'missing-path', 'compare-throw', 'query-throw', 'copy-throw'])('%s topology/traversal failure cannot certify safety', async failure => {
    const { ctx, graph } = fixture();
    if (failure === 'unknown-kind') graph.addEdge('index.ts::index', 'orphan.ts::orphan', { kind: 'unknown' });
    if (failure === 'missing-path') graph.removeNodeAttribute('index.ts::index', 'filePath');
    if (failure === 'compare-throw') vi.spyOn(topology, 'compareCyclicGroups').mockImplementation(() => { throw 'comparison failed'; });
    if (failure === 'query-throw') vi.spyOn(queries, 'getImpact').mockImplementation(() => { throw 'impact failed'; });
    if (failure === 'copy-throw') vi.spyOn(graph, 'copy').mockImplementation(() => { throw 'copy failed'; });
    const r = await verifyChange(deletion, ctx); parity(r); expect(r.risk_level).toBe('error'); expect(r.error_reason).toBeTruthy();
  });
  it('partial structural coverage is medium and does not set partial', async () => {
    const { ctx } = fixture(); const r = await verifyChange(deletion, { ...ctx, sourceCoverage: 'partial' }); parity(r);
    expect(r).toMatchObject({ risk_level: 'medium', partial: false });
  });
  it('unavailable nested topology and simulation extraction failures are errors', async () => {
    const { ctx } = fixture();
    const comparison = topology.compareCyclicGroups(ctx.graph, ctx.graph.copy());
    vi.spyOn(topology, 'compareCyclicGroups').mockReturnValueOnce({ ...comparison, status: 'not_comparable', reason: 'failed', after: { ...comparison.after, status: 'unavailable', reason: 'bad topology', score: null } } as any);
    expect((await verifyChange(deletion, ctx)).risk_level).toBe('error');
    vi.spyOn(SimulationEngine.prototype, 'simulate').mockReturnValueOnce({ get diff() { throw new Error('extraction failure'); } } as any);
    expect((await verifyChange(deletion, ctx)).error_reason).toContain('extraction failure');
  });
  it('dependent query failures remain structural errors', async () => {
    const { ctx } = fixture(); vi.spyOn(queries, 'getDependents').mockImplementation(() => { throw new Error('dependent query failed'); });
    const r = await verifyChange({ file_path: 'orphan.ts', new_content: 'export const replacement = 1;' }, ctx);
    parity(r); expect(r.error_reason).toContain('dependent query failed');
  });
  it('suffix-matched extra deletion is never certified as the exact proposed change', async () => {
    const { ctx, graph } = fixture(); graph.addNode('nested/orphan.ts::other', { filePath: 'nested/orphan.ts', name: 'other', kind: 'function' });
    const r = await verifyChange(deletion, ctx); parity(r); expect(r.risk_level).toBe('error'); expect(r.health_score_after).toBeNull();
  });
  it('unavailable security targets are null and do not set partial', async () => {
    const { ctx } = fixture(); const scan = vi.spyOn(security, 'scanSecurity');
    const r = await verifyChange({ file_path: 'absent.ts', new_content: 'export const x = 1;' }, ctx); parity(r);
    expect(r).toMatchObject({ security_findings: null, security_status: 'unavailable', partial: false }); expect(scan).not.toHaveBeenCalled();
  });
  it('informational crashes preserve high structural risk too', async () => {
    const { ctx, graph } = fixture(); graph.addEdge('index.ts::index', 'orphan.ts::orphan', { kind: 'imports' });
    vi.spyOn(health, 'calculateHealthScore').mockImplementation(() => { throw 'health failed'; });
    vi.spyOn(security, 'scanSecurity').mockRejectedValue(new Error('security failed'));
    const r = await verifyChange(deletion, ctx); parity(r); expect(r).toMatchObject({ risk_level: 'high', safe: false, partial: true }); expect(verifyChangeExitCode(r, true)).toBe(2);
  });
  it('quiet and human render unavailable and error section reasons', async () => {
    const { ctx } = fixture(); vi.spyOn(health, 'calculateHealthScore').mockImplementation(() => { throw 'specific health failure'; });
    const r = await verifyChange({ file_path: 'absent.ts', new_content: 'export const x = 1;' }, ctx);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const quiet of [true, false]) renderVerifyChange(r, { quiet, noColor: true });
    const output = log.mock.calls.flat().join(' '); expect(output).toContain('health: error'); expect(output).toContain('specific health failure'); expect(output).toContain('security: unavailable'); expect(output).not.toContain('unchanged');
  });
  it('required changed-file coverage failure is error', async () => {
    const { ctx } = fixture(); const r = await verifyChange(deletion, { ...ctx, unparsedFiles: ['orphan.ts'] }); parity(r); expect(r.risk_level).toBe('error');
  });
  it('health regression and severe security values do not gate structural safety', async () => {
    const { ctx } = fixture();
    vi.spyOn(health, 'calculateHealthScore').mockReturnValueOnce({ overall: 100 } as any).mockReturnValueOnce({ overall: 0 } as any);
    vi.spyOn(security, 'scanSecurity').mockResolvedValue({ filesScanned: 1, findings: [{ severity: 'critical', description: 'severe', file: 'orphan.ts', line: 1 }] } as any);
    const r = await verifyChange(deletion, ctx); parity(r); expect(r).toMatchObject({ safe: true, risk_level: 'low', health_score_delta: -100 });
    expect(verifyChangeExitCode(r, true)).toBe(0);
  });
  it('broken imports and each new topology trigger are high; existing cycles alone are low', () => {
    const graph = simulationFixture(); const comparison = topology.compareCyclicGroups(graph, graph.copy());
    expect(structuralVerdict([], comparison)).toBe('low'); expect(structuralVerdict([{ file: 'x', missing_symbol: 'y' }], comparison)).toBe('high');
    for (const field of ['newlyCyclicFiles', 'addedCyclicFiles', 'groupsMerged']) expect(structuralVerdict([], { ...comparison, [field]: ['evidence'] } as any)).toBe('high');
  });
  it.each(['low', 'medium', 'high', 'error'] as const)('%s exit matrix ignores warnings and partial', risk => {
    expect(verifyChangeExitCode({ risk_level: risk }, false)).toBe(risk === 'error' ? 1 : 0);
    expect(verifyChangeExitCode({ risk_level: risk }, true)).toBe({ low: 0, medium: 1, high: 2, error: 1 }[risk]);
  });
  it('human and quiet output show informational reasons and structural error', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = verifyChangeError('input', 'bad content');
    for (const quiet of [false, true]) { renderVerifyChange(r, { quiet, noColor: true }); }
    const output = log.mock.calls.flat().join('\n'); expect(output).toContain('ERROR'); expect(output).toContain('bad content'); expect(output).toContain('not_applicable'); expect(output).not.toContain('unchanged');
  });
  it('help uses exact risk wording and threshold is removed from parsing/types', () => {
    const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    expect(index).toContain('Exit 1 on medium risk and 2 on high risk; warning count is ignored. Analysis errors always exit 1.');
    expect(index).not.toContain('--health-threshold');
    expect(readFileSync(new URL('../src/commands/verify-change.ts', import.meta.url), 'utf8')).not.toContain('healthThreshold');
  });
});
