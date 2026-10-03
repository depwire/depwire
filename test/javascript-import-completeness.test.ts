import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';

const root = resolve(import.meta.dirname, 'fixtures/javascript-import-completeness');

describe('JavaScript local module-load completeness', () => {
  it.each([
    ['direct.js', 'target.js'],
    ['extensioned.js', 'target.js'],
    ['parent/child.js', 'target.js'],
    ['directory.js', 'folder/index.js'],
    ['destructured.js', 'target.js'],
    ['nested.js', 'target.js'],
    ['conditional.js', 'target.js'],
    ['trycatch.js', 'target.js'],
    ['dynamic.js', 'target.js'],
    ['dynamic.js', 'target.ts'],
    ['esm-named.js', 'target.js'],
    ['esm-side-effect.js', 'target.js'],
    ['esm-reexport.js', 'target.js'],
    ['cjs.js', 'target.cjs'],
    ['mjs.js', 'target.mjs'],
  ])('%s has a built import dependency on %s', async (source, target) => {
    const files = await parseProject(root, { useCache: false });
    const graph = buildGraph(files, root);
    const built = graph.findEdge((_, attrs, from, to) => attrs.kind === 'imports'
      && from === `${source}::__file__`
      && to === `${target}::__file__`);
    expect(built).toBeDefined();
  });

  it('records missing and computed imports without guessed edges', async () => {
    const files = await parseProject(root, { useCache: false });
    const missing = files.find(file => file.filePath === 'missing.js')!;
    const computed = files.find(file => file.filePath === 'computed.js')!;
    expect(missing.unresolvedImports).toContainEqual({ fromFile: 'missing.js', specifier: './not-here', reason: 'relative-not-found' });
    expect(computed.unresolvedImports).toContainEqual({ fromFile: 'computed.js', specifier: 'moduleName', reason: 'computed-specifier' });
    expect(missing.edges.filter(edge => edge.kind === 'imports')).toHaveLength(0);
    expect(computed.edges.filter(edge => edge.kind === 'imports')).toHaveLength(0);
  });

  it('records non-code dependencies separately from unresolved imports', async () => {
    const files = await parseProject(root, { useCache: false });
    const file = files.find(entry => entry.filePath === 'noncode.js')!;
    expect(file.nonCodeDependencies?.map(entry => [entry.specifier, entry.kind])).toEqual([
      ['./data.json', 'json'], ['./query.sql', 'asset'], ['./addon.node', 'native'],
    ]);
    expect(file.unresolvedImports).toBeUndefined();
    expect(file.edges.filter(edge => edge.kind === 'imports')).toHaveLength(0);
  });
});
