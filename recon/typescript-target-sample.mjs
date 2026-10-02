/** Re-draw PR #55's stratified new-call sample from frozen corpora.
 * Usage: node recon/typescript-target-sample.mjs <baseline-sdk.js> <roots.json> <output.json>
 * roots.json maps nest, drizzle, zod, codegraph, hono to local checkout paths.
 * Build baseline fc070df and this branch first; all parses disable the cache.
 */
import { Parser, Language } from 'web-tree-sitter';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [baselinePath, rootsPath, outputPath] = process.argv.slice(2);
if (!baselinePath || !rootsPath || !outputPath) throw new Error('Expected baseline SDK, corpus roots JSON, and output JSON');
const beforeSdk = await import(pathToFileURL(resolve(baselinePath)).href);
const afterSdk = await import(pathToFileURL(resolve('dist/sdk.js')).href);
const roots = JSON.parse(readFileSync(rootsPath, 'utf8'));
const seed = 'pr55-target-accuracy-2026-10-03-v2';
const plan = [['nest', 40], ['drizzle', 40], ['zod', 40], ['codegraph', 15], ['hono', 15]];
await Parser.init();
const parsers = new Map();
for (const [extension, grammar] of [['ts', 'tree-sitter-typescript.wasm'], ['tsx', 'tree-sitter-tsx.wasm']]) {
  const parser = new Parser();
  parser.setLanguage(await Language.load(resolve('src/parser/grammars', grammar)));
  parsers.set(extension, parser);
}
const key = e => `${e.source}\0${e.target}\0${e.filePath}\0${e.line}\0${e.kind}`;
const hash = (repo, e) => createHash('sha256').update(`${seed}\0${repo}\0${e.source}\0${e.target}\0${e.file}\0${e.line}`).digest('hex');
function callsByLine(root) {
  const result = new Map();
  const walk = node => {
    if (node.type === 'call_expression' || node.type === 'new_expression') {
      const line = node.startPosition.row + 1;
      const entries = result.get(line) ?? [];
      entries.push(node);
      result.set(line, entries);
    }
    for (let i = 0; i < node.namedChildCount; i++) walk(node.namedChild(i));
  };
  walk(root);
  return result;
}
function callName(node) {
  return node.childForFieldName(node.type === 'new_expression' ? 'constructor' : 'function')?.text ?? '';
}
function shapes(node) {
  const ancestors = [];
  for (let parent = node.parent; parent; parent = parent.parent) ancestors.push(parent);
  const types = ancestors.map(parent => parent.type);
  return {
    heritage: types.includes('class_heritage'),
    decorator: types.includes('decorator'),
    parameterDefault: ancestors.some(parent => parent.type === 'required_parameter'
      && parent.childForFieldName('value')
      && parent.childForFieldName('value').startIndex <= node.startIndex
      && parent.childForFieldName('value').endIndex >= node.endIndex),
    iife: ancestors.some(parent => (parent.type === 'arrow_function' || parent.type === 'function_expression')
      && parent.parent?.type === 'parenthesized_expression' && parent.parent.parent?.type === 'call_expression'),
    classPropertyArrow: ancestors.some(parent => parent.type === 'arrow_function' && parent.parent?.type === 'public_field_definition'),
    objectMethod: ancestors.some(parent => parent.type === 'method_definition' && parent.parent?.type === 'object'
      || (parent.type === 'arrow_function' || parent.type === 'function_expression')
      && parent.parent?.type === 'pair' && parent.parent.parent?.type === 'object'),
    callback: ancestors.some(parent => (parent.type === 'arrow_function' || parent.type === 'function_expression') && parent.parent?.type === 'arguments'),
  };
}
const sample = [];
for (const [repo, count] of plan) {
  const root = resolve(roots[repo]);
  const before = await beforeSdk.parseProject(root, { useCache: false });
  const after = await afterSdk.parseProject(root, { useCache: false });
  const old = new Set(before.flatMap(file => file.edges).filter(edge => edge.kind === 'calls').map(key));
  const symbols = after.flatMap(file => file.symbols);
  const byId = new Map(symbols.map(symbol => [symbol.id, symbol]));
  const nameCounts = new Map();
  for (const symbol of symbols) nameCounts.set(symbol.name, (nameCounts.get(symbol.name) ?? 0) + 1);
  const added = after.flatMap(file => file.edges).filter(edge => edge.kind === 'calls' && /\.tsx?$/.test(edge.filePath) && !old.has(key(edge)));
  let currentFile = '';
  let lineNodes = new Map();
  let sourceLines = [];
  const entries = added.map((edge, index) => {
    if (edge.filePath !== currentFile) {
      currentFile = edge.filePath;
      const source = readFileSync(join(root, currentFile), 'utf8');
      sourceLines = source.split(/\r?\n/);
      const parser = parsers.get(currentFile.endsWith('.tsx') ? 'tsx' : 'ts');
      lineNodes = callsByLine(parser.parse(source, null, { bufferSize: 1024 * 1024 }).rootNode);
    }
    const target = byId.get(edge.target);
    const targetName = target?.name?.split('.').at(-1) ?? '';
    const node = (lineNodes.get(edge.line) ?? []).find(node => callName(node).split('.').at(-1) === targetName);
    const targetLines = target ? readFileSync(join(root, target.filePath), 'utf8').split(/\r?\n/) : [];
    return { index, source: edge.source, target: edge.target, file: edge.filePath, line: edge.line,
      sourceLine: sourceLines[edge.line - 1]?.trim() ?? '', call: node?.text ?? null,
      targetFile: target?.filePath ?? null, targetLine: target?.startLine ?? null,
      targetKind: target?.kind ?? null, targetName: target?.name ?? null,
      targetDecl: target ? targetLines[target.startLine - 1]?.trim() : null,
      targetSameNameCount: target ? nameCounts.get(target.name) : null,
      shapes: node ? shapes(node) : {} };
  });
  const ordered = entries.map(entry => ({ ...entry, hash: hash(repo, entry) })).sort((a, b) => a.hash.localeCompare(b.hash));
  const selected = [];
  const seen = new Set();
  const choose = (stratum, predicate, quota) => {
    for (const entry of ordered) {
      if (selected.length >= count || quota <= 0) break;
      const identity = `${entry.source}\0${entry.target}\0${entry.file}\0${entry.line}`;
      if (seen.has(identity) || !predicate(entry)) continue;
      seen.add(identity);
      selected.push({ ...entry, stratum });
      quota--;
    }
  };
  for (const stratum of ['heritage', 'decorator', 'parameterDefault', 'iife', 'classPropertyArrow', 'objectMethod', 'callback']) {
    choose(stratum, entry => entry.shapes[stratum], repo === 'codegraph' || repo === 'hono' ? 1 : 2);
  }
  choose('constructor', entry => /\bnew\s+/.test(entry.sourceLine) && entry.targetKind === 'class', repo === 'codegraph' || repo === 'hono' ? 1 : 2);
  choose('staticMember', entry => entry.targetKind === 'method' && /\bstatic\b/.test(entry.targetDecl ?? ''), repo === 'codegraph' || repo === 'hono' ? 1 : 2);
  choose('namespace', entry => /\b\w+(?:\.\w+)+\s*\(/.test(entry.sourceLine) && entry.targetKind === 'function', repo === 'codegraph' || repo === 'hono' ? 1 : 2);
  choose('overload', entry => /\bconst\s+\w+\s*:\s*\{/.test(entry.targetDecl ?? ''), 1);
  choose('sharedMethod', entry => entry.targetKind === 'method' && entry.targetSameNameCount > 1, repo === 'codegraph' || repo === 'hono' ? 1 : 2);
  choose('sameName', entry => entry.targetSameNameCount > 1, repo === 'codegraph' || repo === 'hono' ? 1 : 2);
  choose('seededRemainder', () => true, count - selected.length);
  sample.push(...selected.map((entry, index) => ({ repo, sampleIndex: index + 1, ...entry })));
}
writeFileSync(outputPath, JSON.stringify({ seed, sample }, null, 2) + '\n');
