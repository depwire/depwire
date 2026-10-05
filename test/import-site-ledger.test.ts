import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { parseProject } from '../src/parser/index.js';
import type { ParsedFile } from '../src/parser/types.js';

type Site = { file: string; line: number; kind: string; specifier: string };
const fixtures = resolve(import.meta.dirname, 'fixtures');

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:[cm]?js|jsx|tsx?|py)$/.test(entry.name)) files.push(path);
    }
  }
  visit(root);
  return files.sort();
}

// This is a compiler AST pass, independent of Depwire's tree-sitter walker.
function javascriptSites(root: string, path: string): Site[] {
  const file = relative(root, path).replaceAll('\\', '/');
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(path) ? ts.ScriptKind.TSX : /\.jsx$/.test(path) ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const sites: Site[] = [];
  function add(node: ts.Node, kind: string, specifier: string): void {
    sites.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      kind, specifier });
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
      add(node, 'import', node.moduleSpecifier.text);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
      add(node, 're-export', node.moduleSpecifier.text);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression))
      add(node, 'import-equals', node.moduleReference.expression.text);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const argument = node.arguments[0];
      add(node, node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic-import' : 'require',
        argument && ts.isStringLiteral(argument) ? argument.text : argument?.getText(source) ?? '<missing>');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return sites;
}

function pythonSites(root: string, paths: string[]): Site[] {
  if (!paths.length) return [];
  const result = spawnSync(process.env.PYTHON ?? 'python',
    [resolve(import.meta.dirname, '../scripts/import-site-ast.py')],
    { input: JSON.stringify(paths), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Python AST census failed: ${result.stderr}`);
  const sites = JSON.parse(result.stdout) as Record<string, Array<Omit<Site, 'file'>>>;
  return paths.flatMap(path => sites[path].map(site => ({ ...site,
    file: relative(root, path).replaceAll('\\', '/') })));
}

export function assertImportSiteCoverage(sites: Site[], parsed: ParsedFile[]): void {
  const files = new Map(parsed.map(file => [file.filePath, file]));
  const seen = new Set<string>();
  const diagnosticUse = new Map<string, number>();
  for (const site of sites) {
    const location = `${site.file}:${site.line}`;
    // Current parser diagnostics identify unresolved imports by specifier,
    // without a line. Keep the pinned corpus at one site per source line so
    // an edge from a sibling expression cannot conceal a capture miss.
    if (seen.has(location)) throw new Error(`Ledger corpus has multiple sites on ${location}`);
    seen.add(location);
    const file = files.get(site.file);
    if (!file) throw new Error(`Parser never visited ${location} (${site.kind} ${site.specifier})`);
    if (site.kind === 're-export' && file.reExportSites?.some(record => record.line === site.line
      && record.specifier === site.specifier)) continue;
    if (file.edges.some(edge => edge.filePath === site.file && edge.line === site.line
      && (edge.kind === 'imports' || edge.kind === 'references-type'))) continue;
    if (file.nonCodeDependencies?.some(record => record.line === site.line
      && record.specifier === site.specifier)) continue;
    if (file.unresolvedEdges?.some(record => record.filePath === site.file && record.line === site.line
      && (record.kind === 'imports' || record.kind === 'references-type'))) continue;
    const key = `${site.file}\0${site.specifier}`;
    const used = diagnosticUse.get(key) ?? 0;
    const available = file.unresolvedImports?.filter(record => record.specifier === site.specifier).length ?? 0;
    if (used < available) { diagnosticUse.set(key, used + 1); continue; }
    // A CommonJS re-export may be diagnosed as an unresolved export.
    if (site.kind === 'require' && file.unresolvedExports?.some(record => record.line === site.line
      && record.expression.includes('require'))) continue;
    throw new Error(`Never-attempted import site: ${location} ${site.kind} ${site.specifier}`);
  }
}

describe('independent source-AST import-site ledger', () => {
  it.each([
    ['TypeScript emit and barrel forms', 'reexport-emit'],
    ['TypeScript side-effect forms', 'typescript-side-effect'],
    ['TypeScript binding and import-equals forms', 'typescript-capture'],
    ['TypeScript three-hop barrels', 'reexport-type-chain'],
    ['JavaScript module forms', 'javascript-import-completeness'],
    ['Python src-layout absolute and relative forms', 'import-site-ledger/python'],
  ])('reconciles every %s site with a parser attempt', async (_label, fixture) => {
    const root = resolve(fixtures, fixture);
    const paths = sourceFiles(root);
    const sites = [
      ...paths.filter(path => extname(path) !== '.py').flatMap(path => javascriptSites(root, path)),
      ...pythonSites(root, paths.filter(path => extname(path) === '.py'))];
    const parsed = await parseProject(root, { useCache: false });
    assertImportSiteCoverage(sites, parsed);
    expect(sites.length).toBeGreaterThan(0);
  });

  it('fails on a deliberately omitted parser attempt', async () => {
    const root = resolve(fixtures, 'typescript-side-effect');
    const parsed = await parseProject(root, { useCache: false });
    const local = parsed.find(file => file.filePath === 'local.ts')!;
    local.edges = local.edges.filter(edge => edge.line !== 1);
    expect(() => assertImportSiteCoverage(javascriptSites(root, join(root, 'local.ts')), parsed))
      .toThrow(/Never-attempted import site: local\.ts:1/);
  });
});
