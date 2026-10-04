import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';

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
  });
});
