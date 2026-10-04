import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { exportToJSON, importFromJSON } from '../src/graph/serializer.js';

const root = resolve(import.meta.dirname, 'fixtures/reexport-emit');

describe('configuration-invariant re-export module loads', () => {
  it('records forms that load a target under every checked tsc emit', async () => {
    const files = await parseProject(root, { useCache: false });
    const graph = buildGraph(files, root);
    for (const form of ['star', 'namespace', 'named', 'mixed', 'default']) {
      expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
        && from === `${form}.ts::__file__` && to === 'x.ts::__file__'), form).toBeDefined();
    }
    expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
      && from === 'keyword_type_only.ts::__file__' && to === 'x.ts::__file__')).toBeUndefined();
    expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
      && from === 'inline_type_only.ts::__file__' && to === 'x.ts::__file__')).toBeUndefined();
    const sites = graph.getAttribute('reExportSites');
    expect(sites).toHaveLength(8);
    for (const form of ['star', 'namespace', 'named', 'mixed', 'default']) {
      expect(sites.find((site: { fromFile: string }) => site.fromFile === `${form}.ts`))
        .toMatchObject({ classification: 'runtime', resolvedPath: 'x.ts', reason: 'definite-load' });
    }
    expect(sites.find((site: { fromFile: string }) => site.fromFile === 'inline_type_only.ts'))
      .toMatchObject({ classification: 'emit-dependent', resolvedPath: 'x.ts', reason: 'emit-configuration-dependent' });
    expect(sites.find((site: { fromFile: string }) => site.fromFile === 'keyword_type_only.ts'))
      .toMatchObject({ classification: 'type-only', resolvedPath: 'x.ts', reason: 'erased' });
    expect(sites.find((site: { fromFile: string }) => site.fromFile === 'unresolved.ts'))
      .toMatchObject({ classification: 'unresolved', specifier: './missing', reason: 'target-unresolved' });
    expect(files.find(file => file.filePath === 'unresolved.ts')?.unresolvedImports)
      .toEqual(expect.arrayContaining([expect.objectContaining({ specifier: './missing', reason: 'relative-not-found' })]));
    expect(importFromJSON(exportToJSON(graph, root)).getAttribute('reExportSites')).toEqual(sites);
  });
});
