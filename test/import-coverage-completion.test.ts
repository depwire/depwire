import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';

const tsRoot = resolve(import.meta.dirname, 'fixtures/typescript-side-effect');
const pyRoot = resolve(import.meta.dirname, 'fixtures/python-absolute-imports');

async function snapshot(root: string) {
  const files = await parseProject(root, { useCache: false });
  return { files, graph: buildGraph(files, root) };
}

function edge(graph: Awaited<ReturnType<typeof snapshot>>['graph'], source: string, target: string, kind: string) {
  return graph.findEdge((_key, attrs, from, to) => from === `${source}::__file__`
    && to === `${target}::__file__` && attrs.kind === kind);
}

describe('TypeScript module loads without bindings', () => {
  it('builds local side-effect and aliased module relationships with an explicit marker', async () => {
    const { graph } = await snapshot(tsRoot);
    for (const source of ['local.ts', 'alias.ts']) {
      const id = edge(graph, source, 'polyfill.ts', 'imports');
      expect(id, source).toBeDefined();
      expect(graph.getEdgeAttribute(id!, 'sideEffectImport')).toBe(true);
    }
  });

  it('records external and missing specifiers, and separates local CSS', async () => {
    const { files, graph } = await snapshot(tsRoot);
    const get = (name: string) => files.find(file => file.filePath === name)!;
    expect(get('external.ts').unresolvedImports).toContainEqual(expect.objectContaining({
      specifier: 'external-package', reason: 'external',
    }));
    expect(get('missing.ts').unresolvedImports).toContainEqual(expect.objectContaining({
      specifier: './not-here', reason: 'relative-not-found',
    }));
    expect(get('asset.ts').nonCodeDependencies).toContainEqual(expect.objectContaining({
      specifier: './styles.css', kind: 'asset',
    }));
    for (const source of ['external.ts', 'missing.ts', 'asset.ts']) {
      expect(graph.findEdge((_id, attrs, from) => attrs.kind === 'imports'
        && from === `${source}::__file__`)).toBeUndefined();
    }
  });

  it('retains re-export relationships and marks JavaScript side-effect imports', async () => {
    const { graph } = await snapshot(tsRoot);
    expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
      && from.startsWith('reexport.ts::') && to.startsWith('target.ts::'))).toBeDefined();
    expect(edge(graph, 'type-reexport.ts', 'target.ts', 'imports')).toBeUndefined();
    const id = edge(graph, 'js-side-effect.js', 'js-target.js', 'imports');
    expect(id).toBeDefined();
    expect(graph.getEdgeAttribute(id!, 'sideEffectImport')).toBe(true);
  });
});

describe('Python first-party absolute module relationships', () => {
  it('builds plain, named, package-submodule and package-symbol file edges', async () => {
    const { graph } = await snapshot(pyRoot);
    for (const target of ['src/pkg/mod.py', 'src/pkg/submodule.py', 'src/pkg/__init__.py']) {
      expect(edge(graph, 'consumer.py', target, 'imports'), target).toBeDefined();
    }
  });

  it('keeps TYPE_CHECKING absolute imports out of runtime relationships', async () => {
    const { graph } = await snapshot(pyRoot);
    expect(edge(graph, 'type_only.py', 'src/pkg/mod.py', 'references-type')).toBeDefined();
    expect(edge(graph, 'type_only.py', 'src/pkg/mod.py', 'imports')).toBeUndefined();
  });

  it('distinguishes a missing first-party module from external modules', async () => {
    const { files, graph } = await snapshot(pyRoot);
    const file = files.find(entry => entry.filePath === 'unresolved.py')!;
    expect(file.unresolvedImports).toContainEqual({ fromFile: 'unresolved.py',
      specifier: 'pkg.missing', reason: 'first-party-not-found' });
    expect(graph.findEdge((_id, attrs, from) => attrs.kind === 'imports'
      && from === 'unresolved.py::__file__')).toBeUndefined();
  });
});
