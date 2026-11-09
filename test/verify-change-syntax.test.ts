import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initParser } from '../src/parser/wasm-init.js';
import { getParserForFile } from '../src/parser/detect.js';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { verifyChange } from '../src/core/verify-change.js';
import { runVerifyChangeAction } from '../src/commands/verify-change-action.js';
import { handleToolCall } from '../src/mcp/tools.js';
import { createEmptyState } from '../src/mcp/state.js';
const roots: string[] = [];
beforeAll(initParser);
afterEach(() => {
  vi.restoreAllMocks();
  try { for (const root of roots) expect(existsSync(join(root, '.depwire/health-history.json'))).toBe(false); }
  finally { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); }
});
async function fixture(file = 'orphan.ts', baseline = 'export function unused() {}') {
  const root = mkdtempSync(join(tmpdir(), 'vc-syntax-')); roots.push(root);
  writeFileSync(join(root, file), baseline);
  writeFileSync(join(root, 'x.ts'), 'export interface A {}\nexport interface B {}\n');
  const graph = buildGraph(await parseProject(root, { useCache: false }), root);
  return { root, graph, file };
}
for (const source of ["export\n type { A } from './x';", "export\n type { A, } from './x';"]) {
  it(`valid recovered construct preserves medium: ${JSON.stringify(source)}`, async () => {
    const f = await fixture();
    expect(getParserForFile(f.file)!.parseFile(f.file, source, f.root).syntaxErrors).toEqual([]);
    const result = await verifyChange({ file_path: f.file, new_content: source }, { graph: f.graph, projectRoot: f.root });
    expect(result).toMatchObject({ risk_level: 'medium', safe: false, error_reason: null });
  });
}
const broken = [
  { name: 'rewritten broken export plus', file: 'orphan.ts', baseline: 'export function unused() {}', source: "export\n type { A + B } from './x';", line: 2, text: '+ B' },
  { name: 'rewritten broken export colon', file: 'orphan.ts', baseline: 'export function unused() {}', source: "export\n type { A: B } from './x';", line: 2, text: 'A:' },
  { name: 'rewritten broken export missing alias', file: 'orphan.ts', baseline: 'export function unused() {}', source: "export\n type { A as } from './x';", line: 2, text: 'as' },
  { name: 'valid recovery plus unrelated error', file: 'orphan.ts', baseline: 'export function unused() {}', source: "export\n type { A } from './x';\nexport function broken( { !!!", line: 3, text: 'export function broken( { !!!' },
  { name: 'natural TypeScript syntax error', file: 'orphan.ts', baseline: 'export function unused() {}', source: 'export function unused( { !!!', line: 1, text: 'export function unused( { !!!' },
  { name: 'natural Python syntax error', file: 'broken.py', baseline: 'def unused():\n    return 1\n', source: 'def broken( !!!', line: 1, text: 'def broken( !!!' },
  { name: 'natural Java source syntax error', file: 'Broken.java', baseline: 'public class Broken { public void unused() {} }', source: 'public class Broken { void broken( !!!', line: 1, text: 'public class Broken { void broken( !!!' },
];
for (const sample of broken) {
  it(`${sample.name}: real core, CLI and MCP error with location and node text`, async () => {
    const f = await fixture(sample.file, sample.baseline);
    const parsed = getParserForFile(f.file)!.parseFile(f.file, sample.source, f.root);
    expect(parsed.syntaxErrors?.[0]).toEqual({ hasError: true, file: f.file, line: sample.line, text: sample.text });
    expect(parsed.syntaxCheck).toBe('checked');
    expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['syntaxCheck', 'syntaxErrors']));
    const args = { file_path: f.file, new_content: sample.source };
    const core = await verifyChange(args, { graph: f.graph, projectRoot: f.root });
    const check = (payload: any) => {
      expect(payload).toMatchObject({ risk_level: 'error', safe: false });
      expect(payload.error_reason).toContain(`${f.file}:${sample.line}`);
      expect(payload.error_reason).toContain(sample.text);
    };
    check(core);
    const response = await handleToolCall('verify_change', args, { ...createEmptyState(), graph: f.graph, projectRoot: f.root });
    check(JSON.parse(response.content[0].text));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    for (const failOnWarnings of [false, true]) {
      log.mockClear(); exit.mockClear();
      await runVerifyChangeAction(f.root, { file: f.file, content: sample.source, json: true, failOnWarnings });
      check(JSON.parse(log.mock.calls.flat().join(''))); expect(exit).toHaveBeenCalledWith(1);
    }
  });
}
it('multiple recovered fragments preserve the earliest unrelated diagnostic', async () => {
  const f = await fixture();
  const source = "export\n type { A } from './x';\nexport\n type { B, } from './x';\nexport function broken( { !!!";
  const result = await verifyChange({ file_path: f.file, new_content: source }, { graph: f.graph, projectRoot: f.root });
  expect(result.risk_level).toBe('error'); expect(result.error_reason).toContain('orphan.ts:5');
});
it('source branches of every touched parser expose real tree errors', async () => {
  const samples = [
    ['a.tsx', 'export function broken( { !!!'], ['a.js', 'export function broken( { !!!'],
    ['a.go', 'package main\nfunc broken( !!!'], ['a.rs', 'pub fn broken( !!!'], ['a.c', 'int broken( !!!'],
    ['a.php', '<?php function broken( !!!'], ['a.cpp', 'int broken( !!!'], ['a.cs', 'public class Broken { void broken( !!!'],
    ['a.kt', 'fun broken( !!!'], ['a.rb', 'def broken( !!!'], ['a.swift', 'func broken( !!!'],
  ];
  const f = await fixture();
  for (const [file, source] of samples) {
    const result = getParserForFile(file)!.parseFile(file, source, f.root);
    expect(result.syntaxErrors?.[0], file).toMatchObject({ hasError: true, file });
  }
});
