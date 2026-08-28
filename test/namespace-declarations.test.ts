import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { findDeadSymbols } from '../src/dead-code/detector.js';
import { exportToJSON, importFromJSON } from '../src/graph/serializer.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/namespace-declarations');

describe('TypeScript namespace, module, and ambient declarations', () => {
  it('emits flattened namespace symbols and exported members', async () => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const declarations = parsed.find((file) => file.filePath === 'namespaces.ts')!;

    expect(declarations.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'namespaces.ts::Outer', name: 'Outer', kind: 'module', exported: true }),
      expect.objectContaining({ id: 'namespaces.ts::Outer.Inner', name: 'Outer.Inner', kind: 'module', exported: true }),
      expect.objectContaining({ id: 'namespaces.ts::Outer.Inner.Shape', name: 'Shape', exported: true }),
      expect.objectContaining({ id: 'namespaces.ts::Outer.Inner.fn', name: 'fn', exported: true }),
    ]));
  });

  it('flags declare-only symbols as ambient and preserves export evidence', async () => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const declarations = parsed.find((file) => file.filePath === 'namespaces.ts')!;

    expect(declarations.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'namespaces.ts::Contracts', exported: true, metadata: { ambient: true } }),
      expect.objectContaining({ id: 'namespaces.ts::Contracts.validate', exported: true, metadata: { ambient: true } }),
      expect.objectContaining({ id: 'namespaces.ts::ambient-package', exported: false, metadata: { ambient: true } }),
      expect.objectContaining({ id: 'namespaces.ts::ambient-package.Options', metadata: { ambient: true } }),
    ]));
  });

  it('resolves local/imported qualified calls and typeof namespace references', async () => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const edges = parsed.flatMap((file) => file.edges);

    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'namespaces.ts::localUse', target: 'namespaces.ts::Outer.Inner.fn', kind: 'calls' }),
      expect.objectContaining({ source: 'consumer.ts::importedUse', target: 'namespaces.ts::Outer.Inner.fn', kind: 'calls' }),
      expect.objectContaining({ source: 'namespaces.ts::namespaceType', target: 'namespaces.ts::Outer.Inner', kind: 'references-type' }),
      expect.objectContaining({ source: 'consumer.ts::importedNamespaceType', target: 'namespaces.ts::Outer.Inner', kind: 'references-type' }),
    ]));
  });

  it('treats an exported unreferenced ambient namespace as dead-code evidence', async () => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const graph = buildGraph(parsed);
    const result = findDeadSymbols(graph, fixtureDir);

    expect(result.symbols).toContainEqual(expect.objectContaining({ name: 'Contracts', kind: 'module', exported: true }));
    expect(graph.getNodeAttribute('namespaces.ts::Contracts', 'metadata')).toEqual({ ambient: true });

    const restored = importFromJSON(exportToJSON(graph, fixtureDir));
    expect(restored.getNodeAttribute('namespaces.ts::Contracts', 'metadata')).toEqual({ ambient: true });
  });
});
