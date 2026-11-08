import { afterEach, expect, it, vi } from 'vitest';
vi.mock('fs', async original => ({ ...await original<typeof import('fs')>(), readSync: vi.fn() }));
import { readSync } from 'fs';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runVerifyChangeAction } from '../src/commands/verify-change-action.js';
import { verifyChangeCommand } from '../src/commands/verify-change.js';
import { handleToolCall } from '../src/mcp/tools.js';
import { createEmptyState } from '../src/mcp/state.js';
import { DirectedGraph } from 'graphology';
import { parseVerifyProject } from '../src/core/verify-change-project.js';
import * as parser from '../src/parser/index.js';
import * as jvm from '../src/parser/jvm-modules.js';
import * as files from '../src/utils/files.js';
import * as graphModule from '../src/graph/index.js';
const roots: string[] = [];
function root() { const r = mkdtempSync(join(tmpdir(), 'verify-boundary-')); roots.push(r); writeFileSync(join(r, 'index.ts'), 'export function main() {}'); writeFileSync(join(r, 'extra.ts'), 'export function extra() {}'); return r; }
afterEach(() => {
  vi.restoreAllMocks();
  try { for (const r of roots) expect(existsSync(join(r, '.depwire/health-history.json'))).toBe(false); }
  finally { roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })); }
});
function capture() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  return { log, exit, payload: () => JSON.parse(log.mock.calls.flat().join('')) };
}
it.each([true, false])('outer CLI stdin failure renders full envelope or human reason and exits 1 (json=%s)', async json => {
  const r = root(); const out = capture();
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  vi.mocked(readSync).mockReturnValueOnce(4).mockImplementationOnce(() => { throw new Error('EIO'); });
  try {
    await runVerifyChangeAction(r, { file: 'index.ts', json });
    expect(out.exit).toHaveBeenCalledWith(1);
    if (json) {
      const p = out.payload(); expect(p).toMatchObject({ risk_level: 'error', safe: false, partial: false, health_score_delta: null, security_findings: null });
      expect(p).toMatchObject({ syntax_check: null, coverage_gaps: null, syntax_errors_outside_affected_set: null });
      expect(p.error_reason).toContain('Failed to read change content'); expect(p.error_reason).toContain('EIO'); expect(p.unrelated_context).toHaveProperty('security_status');
    } else expect(out.log.mock.calls.flat().join(' ')).toContain('ERROR — CLI input/project analysis: Failed to read change content');
  } finally { if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor); else delete (process.stdin as any).isTTY; }
});
it.each(['missing-mode', 'diff-io', 'content-io', 'root-io', 'parse', 'graph', 'conflicting'])('outer CLI %s failure returns full JSON and exit 1', async kind => {
  const r = root(); const out = capture();
  let opts: any = { json: true, file: 'index.ts', content: '' };
  let directory = r;
  if (kind === 'missing-mode') opts = { json: true };
  if (kind === 'diff-io') opts = { json: true, diff: join(r, 'missing.patch') };
  if (kind === 'content-io') opts = { json: true, file: 'index.ts', contentFrom: join(r, 'missing.txt') };
  if (kind === 'root-io') directory = join(r, 'missing');
  if (kind === 'parse') vi.spyOn(parser, 'parseProject').mockResolvedValue(Object.assign([], { errorFiles: [{ path: 'index.ts', reason: 'parse exploded' }] }));
  if (kind === 'graph') vi.spyOn(graphModule, 'buildGraph').mockImplementation(() => { throw new Error('build failed'); });
  if (kind === 'conflicting') opts.diff = join(r, 'missing.patch');
  await runVerifyChangeAction(directory, opts);
  expect(out.exit).toHaveBeenCalledWith(1); expect(out.payload()).toMatchObject({ safe: false, risk_level: 'error', health_score_delta: null, security_findings: null });
  expect(out.payload().error_reason).toBeTruthy();
});
it('explicit empty CLI content is a deletion, not absent stdin', async () => {
  const r = root(); const out = capture();
  await verifyChangeCommand(r, { json: true, file: 'extra.ts', content: '' });
  expect(out.payload().risk_level).toBe('low'); expect(out.exit).not.toHaveBeenCalled();
});
it('MCP no-project returns the complete error envelope in text content', async () => {
  const r = await handleToolCall('verify_change', {}, createEmptyState());
  expect(Object.keys(r)).toEqual(['content']); const p = JSON.parse(r.content[0].text);
  expect(p).toMatchObject({ safe: false, risk_level: 'error', security_findings: null, health_score_delta: null }); expect(p.error_reason).toContain('No project loaded');
  expect(p).toMatchObject({ syntax_check: null, coverage_gaps: null, syntax_errors_outside_affected_set: null });
});
it('MCP invalid runtime input and project failures retain the same complete envelope', async () => {
  const r = root(); const state = { ...createEmptyState(), graph: new DirectedGraph(), projectRoot: r };
  for (const args of [{ file_path: 9, new_content: '' }, { unified_diff: 'invalid' }]) {
    const response = await handleToolCall('verify_change', args, state); expect(JSON.parse(response.content[0].text)).toMatchObject({ safe: false, risk_level: 'error', partial: false });
  }
  vi.spyOn(parser, 'parseProject').mockRejectedValue(new Error('MCP project parse failed'));
  const response = await handleToolCall('verify_change', { file_path: 'extra.ts', new_content: '' }, state);
  expect(JSON.parse(response.content[0].text).error_reason).toContain('MCP project parse failed');
});
it('project loader propagates JVM discovery and directory inspection failures', async () => {
  const r = root();
  vi.spyOn(jvm, 'discoverJvmModuleRoots').mockReturnValue({ roots: [], verifiedRootSet: new Set(), errors: [{ path: 'pom.xml', reason: 'unreadable' }] });
  await expect(parseVerifyProject(r)).rejects.toThrow('JVM discovery');
  vi.spyOn(files, 'scanDirectory').mockImplementation(() => { throw new Error('directory inspection failed'); });
  await expect(parseVerifyProject(r)).rejects.toThrow('directory inspection failed');
});
it('project loader declares skipped oversized sources as partial coverage', async () => {
  const r = root(); writeFileSync(join(r, 'large.ts'), ' '.repeat(1_000_001));
  const parsed = await parseVerifyProject(r); expect(parsed.sourceCoverage).toBe('partial'); expect(parsed.unparsedFiles).toContain('large.ts');
});
it('commander action uses the tested outer boundary and exact risk help', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'); expect(source).toContain('.action(runVerifyChangeAction)');
});
