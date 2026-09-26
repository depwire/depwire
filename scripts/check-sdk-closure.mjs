import { build } from 'esbuild';
import ts from 'typescript';
import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const allowedBuiltins = new Set(['path', 'node:path', 'events', 'node:events']);

/** Follow every local and npm runtime import; only Node built-ins stay external. */
export async function inspectSdkClosure(entry, cwd = process.cwd()) {
  const result = await build({
    absWorkingDir: cwd,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'neutral',
    format: 'esm',
    conditions: ['worker', 'import', 'default'],
    mainFields: ['module', 'main'],
    external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)],
    logLevel: 'silent',
  });
  if (result.warnings.length) {
    throw new Error(`Incomplete static closure: ${result.warnings.map(w => w.text).join('; ')}`);
  }
  const files = Object.keys(result.metafile.inputs);
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    if (/\/(?:parser|security|dead-code|workspace-metrics)(?:\/|\.)/.test(`/${normalized}`)) {
      throw new Error(`Workspace/parser implementation in SDK closure: ${file}`);
    }
    const packageName = normalized.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
    if (packageName && packageName !== 'graphology') {
      throw new Error(`Unexpected runtime package in SDK closure: ${packageName}`);
    }
    // Reject indeterminate loading even if tree-shaking would remove the call.
    const source = ts.createSourceFile(file, readFileSync(resolve(cwd, file), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node)
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(node.expression) && ['require', '__require'].includes(node.expression.text)))) {
        if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) {
          throw new Error(`Non-static module load in SDK closure: ${file}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  // Output imports exclude erased TypeScript type imports in input metadata.
  const externals = [...new Set(Object.values(result.metafile.outputs)
    .flatMap(output => output.imports).filter(item => item.external).map(item => item.path))].sort();
  const forbidden = externals.filter(name => !allowedBuiltins.has(name));
  if (forbidden.length) throw new Error(`Unsupported SDK runtime dependencies: ${forbidden.join(', ')}`);
  return {
    entry,
    files,
    inputBytes: Object.values(result.metafile.inputs).reduce((sum, input) => sum + input.bytes, 0),
    bundleBytes: result.outputFiles[0].contents.length,
    externals,
    inputs: result.metafile.inputs,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = [];
  for (const entry of ['src/graph.ts', 'src/tools.ts', 'dist/graph.js', 'dist/tools.js']) {
    results.push(await inspectSdkClosure(entry));
  }
  console.log(JSON.stringify(results, null, 2));
}
