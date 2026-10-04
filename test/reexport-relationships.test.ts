import { beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { exportToJSON, importFromJSON } from '../src/graph/serializer.js';

const root = resolve(import.meta.dirname, 'fixtures/reexport-emit');

describe('configuration-invariant re-export module loads', () => {
  let files: Awaited<ReturnType<typeof parseProject>>;
  let graph: ReturnType<typeof buildGraph>;
  beforeAll(async () => {
    files = await parseProject(root, { useCache: false });
    graph = buildGraph(files, root);
  });

  it.each([
    ['star', 'x.ts', 'runtime', true],
    ['namespace', 'x.ts', 'runtime', true],
    ['named', 'x.ts', 'runtime', true],
    ['inline_type_only', 'x.ts', 'emit-dependent', false],
    ['mixed', 'x.ts', 'runtime', true],
    ['keyword_type_only', 'x.ts', 'type-only', false],
    ['keyword_type_spaced', 'x.ts', 'type-only', false],
    ['keyword_type_star', 'x.ts', 'type-only', false],
    ['keyword_type_namespace', 'x.ts', 'type-only', false],
    ['default', 'x.ts', 'runtime', true],
    ['unresolved', undefined, 'unresolved', false],
    ['named_implicit_type', 'types_only.ts', 'emit-dependent', false],
    ['default_implicit_type', 'default_type_target.ts', 'emit-dependent', false],
    ['mixed_implicit_type', 'x.ts', 'runtime', true],
    ['private_reexport', 'private_target.ts', 'emit-dependent', false],
    ['chain', 'x.ts', 'runtime', true],
    ['chain_consumer', 'chain.ts', 'runtime', true],
    ['local_export_consumer', 'local_export.ts', 'runtime', true],
    ['wildcard_barrel', 'x.ts', 'runtime', true],
    ['wildcard_consumer', 'wildcard_barrel.ts', 'runtime', true],
    ['wildcard_type_barrel', 'wildcard_type_target.ts', 'runtime', true],
    ['wildcard_type_consumer', 'wildcard_type_barrel.ts', 'emit-dependent', false],
  ] as const)('%s is %s → %s', (form, target, classification, runtime) => {
    const site = graph.getAttribute('reExportSites')?.find((row: { fromFile: string }) => row.fromFile === `${form}.ts`);
    expect(site).toMatchObject({ classification, ...(target ? { resolvedPath: target } : {}) });
    const fileEdge = graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
      && from === `${form}.ts::__file__` && to === `${target}::__file__` && attrs.line === site.line);
    expect(!!fileEdge).toBe(runtime);
  });

  it('retains diagnostics and serializes site evidence', () => {
    for (const form of ['star', 'namespace', 'named', 'mixed', 'default']) {
      expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
        && from === `${form}.ts::__file__` && to === 'x.ts::__file__'), form).toBeDefined();
    }
    expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
      && from === 'keyword_type_only.ts::__file__' && to === 'x.ts::__file__')).toBeUndefined();
    expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
      && from === 'inline_type_only.ts::__file__' && to === 'x.ts::__file__')).toBeUndefined();
    for (const form of ['inline_type_only', 'keyword_type_only', 'keyword_type_spaced', 'keyword_type_star',
      'keyword_type_namespace', 'named_implicit_type',
      'default_implicit_type', 'private_reexport', 'wildcard_type_consumer']) {
      expect(graph.findEdge((_id, attrs) => attrs.kind === 'imports'
        && attrs.filePath === `${form}.ts`), form).toBeUndefined();
    }
    for (const form of ['inline_type_only', 'keyword_type_only', 'keyword_type_spaced', 'named_implicit_type']) {
      expect(graph.findEdge((_id, attrs) => attrs.kind === 'references-type'
        && attrs.filePath === `${form}.ts`), form).toBeDefined();
    }
    const sites = graph.getAttribute('reExportSites');
    expect(sites).toHaveLength(22);
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
    for (const form of ['named_implicit_type', 'default_implicit_type']) {
      expect(sites.find((site: { fromFile: string }) => site.fromFile === `${form}.ts`))
        .toMatchObject({ classification: 'emit-dependent', reason: 'value-unproven' });
      expect(graph.findEdge((_id, attrs, from) => attrs.kind === 'imports'
        && from === `${form}.ts::__file__`)).toBeUndefined();
    }
    expect(sites.find((site: { fromFile: string }) => site.fromFile === 'mixed_implicit_type.ts'))
      .toMatchObject({ classification: 'runtime', reason: 'definite-load' });
    expect(sites.find((site: { fromFile: string }) => site.fromFile === 'private_reexport.ts'))
      .toMatchObject({ classification: 'emit-dependent', reason: 'value-unproven' });
    expect(graph.hasEdge('private_reexport.ts::__file__', 'private_target.ts::__file__')).toBe(false);
    for (const [source, target] of [['chain.ts', 'x.ts'], ['chain_consumer.ts', 'chain.ts']]) {
      expect(graph.hasEdge(`${source}::__file__`, `${target}::__file__`)).toBe(true);
    }
    expect(graph.hasEdge('local_export_consumer.ts::__file__', 'local_export.ts::__file__')).toBe(true);
    expect(graph.hasEdge('wildcard_barrel.ts::__file__', 'x.ts::__file__')).toBe(true);
    expect(graph.hasEdge('wildcard_consumer.ts::__file__', 'wildcard_barrel.ts::__file__')).toBe(true);
    expect(graph.hasEdge('wildcard_type_barrel.ts::__file__', 'wildcard_type_target.ts::__file__')).toBe(true);
    expect(graph.hasEdge('wildcard_type_consumer.ts::__file__', 'wildcard_type_barrel.ts::__file__')).toBe(false);
    expect(files.find(file => file.filePath === 'unresolved.ts')?.unresolvedImports)
      .toEqual(expect.arrayContaining([expect.objectContaining({ specifier: './missing', reason: 'relative-not-found' })]));
    expect(importFromJSON(exportToJSON(graph, root)).getAttribute('reExportSites')).toEqual(sites);
  });
});
