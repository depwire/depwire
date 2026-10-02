import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';

const root = resolve(import.meta.dirname, 'fixtures/typescript-capture');
async function fixture() {
  const files = await parseProject(root, { useCache: false });
  return (name: string) => files.find(file => file.filePath === name)!;
}

describe('TypeScript export and call evidence', () => {
  it('captures export equals and import equals require', async () => {
    const file = (await fixture())('export-equals.ts');
    expect(file.symbols.find(s => s.name === 'equalTarget')?.exported).toBe(true);
    const importer = (await fixture())('import-require.ts');
    expect(importer.edges).toContainEqual(expect.objectContaining({ kind: 'imports', target: 'target.ts::__file__' }));
  });
  it('captures direct, object, property and Object.assign CommonJS exports beside ESM', async () => {
    const file = (await fixture())('commonjs.ts');
    for (const name of ['direct', 'alpha', 'beta', 'property', 'assigned', 'mixed', 'esm']) {
      expect(file.symbols.find(s => s.name === name)?.exported, name).toBe(true);
    }
    expect(file.unresolvedExports?.map(x => x.reason)).toEqual(expect.arrayContaining(['computed-property', 'conditional-assignment']));
  });
  it('captures inline functions and a local re-export', async () => {
    const get = await fixture();
    const file = get('inline.ts');
    for (const name of ['inline', 'extra']) expect(file.symbols.find(s => s.name === name)?.exported).toBe(true);
    expect(get('reexport.ts').edges).toContainEqual(expect.objectContaining({ kind: 'imports', target: 'target.ts::__file__' }));
  });
  it('captures calls in object methods, class fields, callbacks, IIFEs and file scope', async () => {
    const file = (await fixture())('calls.ts');
    const incoming = file.edges.filter(e => e.kind === 'calls' && e.target === 'calls.ts::target');
    expect(incoming.map(e => e.source)).toEqual(expect.arrayContaining(['calls.ts::object', 'calls.ts::Box.field', 'calls.ts::Box.method', 'calls.ts::callback', 'calls.ts::__file__']));
    expect(incoming.length).toBeGreaterThanOrEqual(7);
    expect(file.edges).toContainEqual(expect.objectContaining({ source: 'calls.ts::__file__', target: 'calls.ts::TargetClass', kind: 'calls' }));
  });
  it('records genuinely unresolved calls and constructors with reasons', async () => {
    const file = (await fixture())('calls.ts');
    expect(file.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'unknown', reason: 'no-local-target' }));
    expect(file.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'unknownReceiver.run', reason: 'unresolvable-receiver' }));
    expect(file.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'dynamic.ctor', reason: 'unresolvable-receiver' }));
  });
  it('retains an import when a file-level call shares its endpoints', async () => {
    const files = await parseProject(root, { useCache: false });
    const file = files.find(f => f.filePath === 'import-collision.ts')!;
    expect(file.edges).toContainEqual(expect.objectContaining({ kind: 'imports', source: 'import-collision.ts::__file__', target: 'target.ts::target' }));
    expect(file.edges).toContainEqual(expect.objectContaining({ kind: 'calls', source: 'import-collision.ts::__file__', target: 'target.ts::target' }));
    const graph = buildGraph(files, root);
    const edge = graph.edge('import-collision.ts::__file__', 'target.ts::target')!;
    expect(graph.getEdgeAttribute(edge, 'kind')).toBe('imports');
    const typeEdge = graph.edge('calls.ts::typed', 'calls.ts::TargetClass')!;
    expect(graph.getEdgeAttribute(typeEdge, 'kind')).toBe('references-type');
  });
});
