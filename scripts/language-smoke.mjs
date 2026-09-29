import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// One fixture for every registered language, plus both JSX grammar variants.
export const languageFixtures = {
  typescript: ['sample.ts', 'export function leaf(): number { return 1; }\nexport function caller() { return leaf(); }'],
  tsx: ['sample.tsx', 'export function Widget() { return <div>Hello</div>; }'],
  javascript: ['sample.js', 'export function leaf() { return 1; }\nexport function caller() { return leaf(); }'],
  jsx: ['sample.jsx', 'export function Widget() { return <div>Hello</div>; }'],
  python: ['sample.py', 'def leaf():\n    return 1\ndef caller():\n    return leaf()'],
  go: ['sample.go', 'package sample\nfunc leaf() int { return 1 }\nfunc caller() int { return leaf() }'],
  rust: ['sample.rs', 'pub fn leaf() -> i32 { 1 }\npub fn caller() -> i32 { leaf() }'],
  c: ['sample.c', 'int leaf(void) { return 1; }\nint caller(void) { return leaf(); }'],
  csharp: ['Sample.cs', 'public class Sample { public int Leaf() { return 1; } public int Caller() { return Leaf(); } }'],
  java: ['Sample.java', 'public class Sample { public int leaf() { return 1; } public int caller() { return leaf(); } }'],
  cpp: ['sample.cpp', 'int leaf() { return 1; }\nint caller() { return leaf(); }'],
  kotlin: ['sample.kt', 'fun leaf(): Int { return 1 }\nfun caller(): Int { return leaf() }'],
  php: ['sample.php', '<?php\nfunction leaf() { return 1; }\nfunction caller() { return leaf(); }'],
  swift: ['sample.swift', 'func leaf() -> Int { return 1 }\nfunc caller() -> Int { return leaf() }'],
  mojo: ['sample.mojo', 'fn leaf() -> Int:\n    return 1\nfn caller() -> Int:\n    return leaf()'],
  ruby: ['sample.rb', 'def leaf\n  1\nend\ndef caller\n  leaf()\nend'],
  dart: ['sample.dart', 'int leaf() { return 1; }\nint caller() { return leaf(); }'],
  r: ['sample.R', 'leaf <- function() { 1 }\ncaller <- function() { leaf() }'],
  html: ['sample.html', '<app-child [value]="value"></app-child>'],
};

export async function smokeLanguages(sdkPath, fixtureRoot) {
  const sdk = await import(pathToFileURL(sdkPath));
  const results = {};
  for (const [language, [filename, content]] of Object.entries(languageFixtures)) {
    const root = join(fixtureRoot, language);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, filename), content + '\n');
    const files = await sdk.parseProject(root, { useCache: false });
    assert.deepEqual(files.errorFiles, [], `${language}: parse failure`);
    assert.equal(files.length, 1, `${language}: missing parsed file`);
    assert.ok(files[0].symbols.length > 0, `${language}: missing symbols`);
    const graph = sdk.buildGraph(files, root);
    const edges = [];
    graph.forEachEdge((key, attributes, source, target) => edges.push({ source, target, attributes }));
    results[language] = {
      files: Array.from(files),
      nodes: graph.nodes().map(key => ({ key, attributes: graph.getNodeAttributes(key) })),
      edges,
    };
  }
  // Baseline captured from main before moving dependencies. Compare the complete
  // JSON-visible parse records and graph, excluding only generated edge keys.
  const expected = JSON.parse(readFileSync(new URL('../test/fixtures/language-smoke.expected.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(results)), expected);
  return results;
}
