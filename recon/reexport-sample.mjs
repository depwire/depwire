// Redraw the PR #64 sample from pinned source roots and the independent census.
// Usage: node recon/reexport-sample.mjs '<JSON object of repo names to absolute roots>'
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, normalize } from 'node:path';
import { parseProject, buildGraph } from '../dist/sdk.js';
import ts from 'typescript';

const seed = 'pr64-reexport-2026-10-04-v1';
const roots = JSON.parse(process.argv[2] ?? '{}');
const negativeMode = process.argv.includes('--negative');
const quotas = { nest: 40, zod: 40, drizzle: 20, 'tanstack-query': 20, 'code-graph': 10 };
const preferred = {
  nest: { star: 23, 'named-value': 16, mixed: 1 },
  zod: { star: 15, 'named-value': 12, namespace: 7, default: 4, mixed: 2 },
  drizzle: { star: 12, 'named-value': 5, default: 3 },
  'tanstack-query': { star: 10, 'named-value': 7, mixed: 3 },
  'code-graph': { star: 3, 'named-value': 4, namespace: 1, mixed: 2 },
};
const census = readFileSync(new URL('./TYPESCRIPT-REEXPORT-CENSUS.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(line => JSON.parse(line));
const rank = row => createHash('sha256').update(`${seed}|${row.repo}|${row.source}|${row.line}|${row.target}`).digest('hex');
const output = [];
const negativeOutput = [];
const valueKinds = statement => ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)
  || ts.isEnumDeclaration(statement) || ts.isVariableStatement(statement);
const exported = statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
const defaulted = statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);

for (const [repo, quota] of Object.entries(quotas)) {
  const root = roots[repo];
  if (!root) throw new Error(`Missing root for ${repo}`);
  const files = await parseProject(root, { useCache: false });
  const graph = buildGraph(files, root);
  const sites = new Map((graph.getAttribute('reExportSites') ?? [])
    .map(site => [`${site.fromFile}:${site.line}:${site.resolvedPath}`, site]));
  const sitesByLocation = new Map((graph.getAttribute('reExportSites') ?? [])
    .map(site => [`${site.fromFile}:${site.line}`, site]));
  const negativeRows = census.filter(row => row.repo === repo
    && (row.form === 'keyword-type' || row.form === 'inline-only'))
    .sort((a, b) => rank(a).localeCompare(rank(b)));
  const selectedNegative = [...negativeRows.filter(row => row.form === 'inline-only'),
    ...negativeRows.filter(row => row.form === 'keyword-type').slice(0, 5)];
  for (const row of selectedNegative) {
    const site = sitesByLocation.get(`${row.source}:${row.line}`);
    const expected = row.form === 'inline-only' ? 'emit-dependent' : 'type-only';
    if (site?.classification !== expected) throw new Error(`Negative classification mismatch ${repo}:${row.source}:${row.line}`);
    const source = readFileSync(join(root, row.source), 'utf8').split('\n').slice(row.line - 1).join('\n');
    if (!source.startsWith(row.statement)) throw new Error(`Negative source mismatch ${repo}:${row.source}:${row.line}`);
    const parsed = files.find(file => file.filePath === row.source);
    if (parsed?.edges.some(edge => edge.kind === 'imports' && edge.line === row.line))
      throw new Error(`Negative runtime edge ${repo}:${row.source}:${row.line}`);
    negativeOutput.push({ repo, source: row.source, line: row.line, statement: row.statement,
      target: site.resolvedPath, form: row.form, classification: site.classification,
      reason: site.reason, runtimeEdgeAtSite: false, verdict: 'CORRECT', rank: rank(row) });
  }
  const censusTargets = new Map(census.filter(row => row.repo === repo && row.target)
    .map(row => [`${row.source}:${row.line}`, row.target]));
  const astCache = new Map();
  const ast = path => {
    if (!astCache.has(path)) astCache.set(path, ts.createSourceFile(path,
      readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true,
      /\.tsx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
    return astCache.get(path);
  };
  // Independent TypeScript AST walk: inspect the target's declarations and
  // re-export chain rather than trusting Depwire's symbol-kind proof.
  const valueExport = (path, name, seen = new Set()) => {
    const key = `${path}::${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    for (const statement of ast(path).statements) {
      if (valueKinds(statement) && exported(statement)) {
        if (name === 'default' && defaulted(statement)) return { file: path, line: ast(path).getLineAndCharacterOfPosition(statement.getStart()).line + 1 };
        if (ts.isVariableStatement(statement)) {
          if (statement.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === name))
            return { file: path, line: ast(path).getLineAndCharacterOfPosition(statement.getStart()).line + 1 };
        } else if (statement.name?.text === name) {
          return { file: path, line: ast(path).getLineAndCharacterOfPosition(statement.getStart()).line + 1 };
        }
      }
      if (name === 'default' && ts.isExportAssignment(statement))
        return { file: path, line: ast(path).getLineAndCharacterOfPosition(statement.getStart()).line + 1 };
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
      const line = ast(path).getLineAndCharacterOfPosition(statement.getStart()).line + 1;
      const clause = statement.exportClause;
      if (!statement.moduleSpecifier && clause && ts.isNamedExports(clause)) {
        const binding = clause.elements.find(element => element.name.text === name && !element.isTypeOnly);
        if (binding) {
          const localName = binding.propertyName?.text ?? binding.name.text;
          const declaration = ast(path).statements.find(candidate => valueKinds(candidate)
            && (ts.isVariableStatement(candidate)
              ? candidate.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === localName)
              : candidate.name?.text === localName));
          if (declaration) return { file: path, line: ast(path).getLineAndCharacterOfPosition(declaration.getStart()).line + 1 };
        }
      }
      if (!statement.moduleSpecifier) continue;
      const target = censusTargets.get(`${path}:${line}`);
      if (!target) continue;
      if (clause && ts.isNamespaceExport(clause) && clause.name.text === name)
        return { file: path, line };
      if (clause && ts.isNamedExports(clause)) {
        const binding = clause.elements.find(element => element.name.text === name && !element.isTypeOnly);
        if (binding) {
          const proof = valueExport(target, binding.propertyName?.text ?? binding.name.text, seen);
          if (proof) return proof;
        }
      } else if (!clause && name !== 'default') {
        const proof = valueExport(target, name, seen);
        if (proof) return proof;
      }
    }
    return null;
  };
  const candidates = census.filter(row => row.repo === repo && row.added && row.built)
    .map(row => ({ ...row, site: sites.get(`${row.source}:${row.line}:${row.target}`) }))
    .filter(row => row.site?.classification === 'runtime'
      && graph.hasEdge(`${row.source}::__file__`, `${row.target}::__file__`)
      && graph.getEdgeAttribute(`${row.source}::__file__`, `${row.target}::__file__`, 'kind') === 'imports')
    .sort((a, b) => rank(a).localeCompare(rank(b)));
  const chosen = [];
  const seen = new Set();
  const take = row => { const key = `${row.source}:${row.line}:${row.target}`;
    if (seen.has(key)) return; seen.add(key); chosen.push(row); };
  // Force barrel/chain evidence into the draw before filling form strata.
  const isBarrel = row => /^index\.[cm]?[jt]sx?$/.test(basename(row.target));
  const targetExports = row => /\bexport\s+(?:\*|\{)[\s\S]*?\bfrom\b/.test(readFileSync(join(root, row.target), 'utf8'));
  const barrel = candidates.find(isBarrel);
  if (barrel) take(barrel);
  const chain = candidates.find(row => targetExports(row) && !isBarrel(row));
  if (chain) take(chain);
  for (const form of ['mixed', 'namespace', 'default', 'named-value', 'star']) {
    const desired = preferred[repo][form] ?? 0;
    let have = chosen.filter(row => row.form === form).length;
    for (const row of candidates) {
      if (have >= desired || chosen.length >= quota) break;
      if (row.form !== form || seen.has(`${row.source}:${row.line}:${row.target}`)) continue;
      take(row); have++;
    }
  }
  for (const row of candidates) { if (chosen.length >= quota) break; take(row); }
  if (chosen.length !== quota) throw new Error(`${repo}: only ${chosen.length}/${quota} candidates`);
  for (const row of chosen) {
    const source = readFileSync(join(root, row.source), 'utf8');
    const atLine = source.split('\n').slice(row.line - 1).join('\n');
    if (!atLine.startsWith(row.statement)) throw new Error(`Source mismatch ${repo}:${row.source}:${row.line}`);
    if (!existsSync(join(root, row.target))) throw new Error(`Target missing ${repo}:${row.target}`);
    const spec = row.site.specifier;
    const base = normalize(join(dirname(row.source), spec));
    const stem = base.replace(/\.[cm]?[jt]sx?$/, '');
    const targetStem = row.target.replace(/\.[cm]?[jt]sx?$/, '');
    const independentPath = spec.startsWith('.')
      ? (targetStem === stem || targetStem === join(stem, 'index'))
      : null;
    if (independentPath === false) throw new Error(`Relative target mismatch ${repo}:${row.source}:${row.line} → ${row.target}`);
    let aliasEvidence;
    if (independentPath === null) {
      if (repo === 'drizzle' && spec.startsWith('~/')) {
        const config = JSON.parse(readFileSync(join(root, 'drizzle-orm/tsconfig.json'), 'utf8'));
        if (config.compilerOptions.paths['~/*'][0] !== 'src/*'
          || row.target !== `drizzle-orm/src/${spec.slice(2)}`) throw new Error(`Alias mismatch: ${spec}`);
        aliasEvidence = 'drizzle-orm/tsconfig.json:6 paths ~/* → src/*';
      } else if (repo === 'zod' && spec === 'zod/mini') {
        const pkg = JSON.parse(readFileSync(join(root, 'packages/zod/package.json'), 'utf8'));
        if (pkg.name !== 'zod' || pkg.zshy?.exports?.['./mini'] !== './src/mini/index.ts'
          || pkg.exports?.['./mini']?.['@zod/source'] !== './src/mini/index.ts') throw new Error('Zod self-reference mismatch');
        aliasEvidence = 'packages/zod/package.json:42 package self-reference ./mini';
      } else if (repo === 'tanstack-query' && spec.startsWith('@tanstack/')) {
        const pkg = JSON.parse(readFileSync(join(root, dirname(dirname(row.target)), 'package.json'), 'utf8'));
        if (pkg.name !== spec) throw new Error(`Workspace package mismatch: ${spec}`);
        aliasEvidence = `${dirname(dirname(row.target))}/package.json:2 package name`;
      } else throw new Error(`Unverified alias ${repo}:${spec}`);
    }
    const proof = row.site.bindings?.filter(binding => !binding.typeOnly)
      .map(binding => valueExport(row.target, binding.name)).find(Boolean);
    if (row.site.bindings?.some(binding => !binding.typeOnly) && !proof)
      throw new Error(`No independent value declaration ${repo}:${row.source}:${row.line} → ${row.target}`);
    const downstream = (sitesByLocation.size ? graph.getAttribute('reExportSites') : [])
      .filter(site => site.fromFile === row.target && site.resolvedPath);
    let runtimeHopCount = 0;
    let excludedHopCount = 0;
    for (const hop of downstream) {
      if (hop.classification === 'runtime') {
        if (!graph.hasEdge(`${row.target}::__file__`, `${hop.resolvedPath}::__file__`))
          throw new Error(`Missing runtime chain hop ${repo}:${row.target}:${hop.line}`);
        runtimeHopCount++;
      } else if (hop.classification === 'type-only' || hop.classification === 'emit-dependent') {
        const parsed = files.find(file => file.filePath === row.target);
        if (parsed?.edges.some(edge => edge.kind === 'imports' && edge.line === hop.line))
          throw new Error(`Fabricated non-runtime chain hop ${repo}:${row.target}:${hop.line}`);
        excludedHopCount++;
      }
    }
    output.push({ repo, source: row.source, line: row.line, statement: row.statement,
      target: row.target, targetModuleLine: 1, form: row.form,
      classification: row.site.classification, independentRelativePath: independentPath,
      ...(aliasEvidence ? { aliasEvidence } : {}),
      ...(proof ? { valueDeclaration: `${proof.file}:${proof.line}` } : {}),
      chain: targetExports(row), barrel: isBarrel(row), runtimeHopCount, excludedHopCount,
      rank: rank(row), verdict: 'CORRECT' });
  }
}
if (output.length !== 130) throw new Error(`Expected 130, got ${output.length}`);
if (negativeMode && negativeOutput.length !== 21) throw new Error(`Expected 21 negative sites, got ${negativeOutput.length}`);
for (const row of negativeMode ? negativeOutput : output) console.log(JSON.stringify(row));
