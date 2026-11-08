import { expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseProject } from '../src/parser/index.js';
import { getParserForFile } from '../src/parser/detect.js';
import { initParser } from '../src/parser/wasm-init.js';
import { buildGraph } from '../src/graph/index.js';
import { calculateHealthScore } from '../src/health/index.js';
import { SimulationEngine } from '../src/simulation/engine.js';
const cases = [
 ['typescript','a.ts','export function alpha() { return 1; }'],
 ['tsx','a.tsx','export function Alpha() { return <div />; }'],
 ['javascript','a.js','export function alpha() { return 1; }'],
 ['python','a.py','def alpha():\n    return 1\n'],
 ['go','a.go','package main\nfunc Alpha() int { return 1 }'],
 ['rust','a.rs','pub fn alpha() -> i32 { 1 }'],
 ['c','a.c','int alpha(void) { return 1; }'],
 ['php','a.php','<?php function alpha() { return 1; }'],
 ['cpp','a.cpp','int alpha() { return 1; }'],
 ['csharp','a.cs','public class Alpha { public int Value() { return 1; } }'],
 ['java','Alpha.java','public class Alpha { public int value() { return 1; } }'],
 ['kotlin','a.kt','fun alpha(): Int { return 1 }'],
 ['ruby','a.rb','def alpha\n  1\nend\n'],
 ['swift','a.swift','func alpha() -> Int { return 1 }'],
 ['manifest','Gemfile',"source 'https://rubygems.org'\ngem 'rails'\n"],
 ['pattern','a.mojo','fn alpha() -> Int:\n    return 1\n'],
];
it('all source-language consumers plus manifest and pattern consumers match pre-edit byte goldens', async () => {
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-11-09T00:00:00.000Z');
  const path = new URL('./fixtures/verify-change-syntax-consumers.json', import.meta.url);
  const golden = JSON.parse(readFileSync(path, 'utf8'));
  const root = golden.root;
  expect(existsSync(root)).toBe(false); mkdirSync(root);
  try {
    await initParser();
    const outputs = [];
    for (const [language, file, source] of cases) {
      const dir = join(root, language); mkdirSync(dir); writeFileSync(join(dir, file), source);
      const direct = getParserForFile(file, source)!.parseFile(file, source, dir);
      const parsed = await parseProject(dir, { useCache: false });
      const graph = buildGraph(parsed, dir);
      const health = calculateHealthScore(graph, dir, { persistHistory: false });
      const simulate = new SimulationEngine(graph).simulate({ type: 'delete', target: file });
      outputs.push({ language, bytes: JSON.stringify({ direct, parsed, graph, health, simulate }) });
      expect(existsSync(join(dir, '.depwire/health-history.json'))).toBe(false);
    }
    expect(outputs).toEqual(golden.outputs);
  } finally { rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); }
}, 30000);
