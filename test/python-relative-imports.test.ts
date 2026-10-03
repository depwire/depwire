import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';

const root = resolve(import.meta.dirname, 'fixtures/python-relative-imports');

async function snapshot() {
  const files = await parseProject(root, { useCache: false });
  return { files, graph: buildGraph(files, root) };
}

function hasEdge(graph: Awaited<ReturnType<typeof snapshot>>['graph'], source: string, target: string, kind: string): boolean {
  return graph.someEdge((_, attrs, from, to) => from === `pkg/${source}.py::__file__`
    && to === `pkg/${target}.py::__file__` && attrs.kind === kind);
}

describe('Python relative imports', () => {
  it('builds runtime file relationships for imported names and re-exports', async () => {
    const { graph } = await snapshot();
    expect(hasEdge(graph, 'runtime', 'a', 'imports')).toBe(true);
    expect(hasEdge(graph, 'consumer', 'reexport', 'imports')).toBe(true);
  });

  it('resolves from-dot module imports to the submodule', async () => {
    const { graph } = await snapshot();
    expect(hasEdge(graph, 'submodule', 'a', 'imports')).toBe(true);
  });

  it('keeps both TYPE_CHECKING forms out of runtime coupling', async () => {
    const { files, graph } = await snapshot();
    expect(hasEdge(graph, 'type_only', 'a', 'references-type')).toBe(true);
    expect(hasEdge(graph, 'type_only_direct', 'a', 'references-type')).toBe(true);
    expect(hasEdge(graph, 'type_only_alias', 'a', 'references-type')).toBe(true);
    expect(hasEdge(graph, 'type_only', 'a', 'imports')).toBe(false);
    expect(hasEdge(graph, 'type_only_direct', 'a', 'imports')).toBe(false);
    expect(hasEdge(graph, 'type_only_alias', 'a', 'imports')).toBe(false);
    expect(hasEdge(graph, 'runtime_guard', 'a', 'imports')).toBe(true);
    const plainImport = files.find(file => file.filePath === 'pkg/type_only_plain.py')!;
    expect(plainImport.edges).toContainEqual(expect.objectContaining({
      target: 'pkg/a.py::__file__', kind: 'references-type', typeOnlyImport: true,
    }));
    expect(plainImport.edges.some(edge => edge.kind === 'imports')).toBe(false);
    expect(hasEdge(graph, 'type_only_plain', 'a', 'references-type')).toBe(true);
  });

  it('records missing relative modules without an edge', async () => {
    const { files, graph } = await snapshot();
    const missing = files.find(file => file.filePath === 'pkg/missing.py')!;
    expect(missing.unresolvedImports).toContainEqual({ fromFile: 'pkg/missing.py', specifier: '.not_here', reason: 'relative-not-found' });
    expect(graph.someEdge((_, attrs, from) => attrs.kind === 'imports' && from === 'pkg/missing.py::__file__')).toBe(false);
  });

  it('records a local code target excluded from the parsed project', async () => {
    const files = await parseProject(root, { useCache: false, exclude: ['pkg/ignored.py'] });
    const graph = buildGraph(files, root);
    const source = files.find(file => file.filePath === 'pkg/unparsed.py')!;
    expect(source.unresolvedImports).toContainEqual({
      fromFile: 'pkg/unparsed.py', specifier: '.ignored', reason: 'target-not-parsed',
    });
    expect(graph.someEdge((_, attrs, from, to) => attrs.kind === 'imports'
      && from === 'pkg/unparsed.py::__file__' && to === 'pkg/ignored.py::__file__')).toBe(false);
  });
});
