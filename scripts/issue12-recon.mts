// Diagnostic script for issue #12 recon (tsconfig-resolution-recon branch).
// Read-only: imports the real, UNMODIFIED resolveImportPath/loadTsConfig
// from src/parser/resolver.ts and the real tree-sitter TS grammar from
// src/parser/wasm-init.ts. Does not alter resolution logic in any way --
// only extracts raw import-path strings (read-only AST walk) and asks the
// real resolver what it does with each one.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { resolveImportPath } from '../src/parser/resolver.js';
import { getParser, initParser } from '../src/parser/wasm-init.js';

const REPO_DIR = process.argv[2];
if (!REPO_DIR) {
  console.error('Usage: tsx scripts/issue12-recon.mts <repoDir>');
  process.exit(1);
}

await initParser();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

const files = walk(REPO_DIR).map((f) => relative(REPO_DIR, f));

let totalImports = 0;
let resolved = 0;
const reasons: Record<string, number> = {
  'alias unresolved (~/)': 0,
  'relative-not-found': 0,
  'bare package name (unresolved)': 0,
  'other': 0,
};
const unresolvedSamples: Record<string, string[]> = {
  'alias unresolved (~/)': [],
  'relative-not-found': [],
  'bare package name (unresolved)': [],
  'other': [],
};

function extractImportSources(node: any, out: { path: string }[]) {
  if (node.type === 'import_statement' || node.type === 'export_statement') {
    const source = node.childForFieldName('source');
    if (source) {
      const text = source.text;
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        out.push({ path: text.slice(1, -1) });
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) extractImportSources(child, out);
  }
}

for (const relPath of files) {
  const absPath = join(REPO_DIR, relPath);
  let sourceCode: string;
  try {
    sourceCode = readFileSync(absPath, 'utf-8');
  } catch {
    continue;
  }
  const languageType = relPath.endsWith('.tsx') ? 'tsx' : 'typescript';
  let tree;
  try {
    const parser = getParser(languageType as any);
    tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  } catch {
    continue;
  }
  const found: { path: string }[] = [];
  extractImportSources(tree.rootNode, found);

  for (const { path: importPath } of found) {
    totalImports++;
    const resolvedPath = resolveImportPath(importPath, relPath, REPO_DIR);
    if (resolvedPath) {
      resolved++;
    } else {
      let bucket: string;
      if (importPath.startsWith('~/')) bucket = 'alias unresolved (~/)';
      else if (importPath.startsWith('.') || importPath.startsWith('/')) bucket = 'relative-not-found';
      else if (/^[a-zA-Z0-9_@][a-zA-Z0-9_\-./@]*$/.test(importPath)) bucket = 'bare package name (unresolved)';
      else bucket = 'other';
      reasons[bucket]++;
      if (unresolvedSamples[bucket].length < 5) unresolvedSamples[bucket].push(`${relPath} -> "${importPath}"`);
    }
  }
}

console.log('=== Issue #12 recon: import resolution on', REPO_DIR, '===');
console.log('Files scanned (.ts/.tsx):', files.length);
console.log('Total import/re-export statements with a source:', totalImports);
console.log('Resolved to a local edge:', resolved);
console.log('Unresolved:', totalImports - resolved);
console.log('');
console.log('Unresolved breakdown:');
for (const [k, v] of Object.entries(reasons)) {
  console.log(`  ${k}: ${v}`);
  for (const s of unresolvedSamples[k]) console.log(`    e.g. ${s}`);
}
