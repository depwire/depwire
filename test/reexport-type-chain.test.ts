import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { getImpact } from '../src/graph/queries.js';

const root = resolve(import.meta.dirname, 'fixtures/reexport-type-chain');

describe('named type and value re-exports through three barrels', () => {
  it('resolves the type to its declaration and reaches the consumer in affected_files', async () => {
    const files = await parseProject(root, { useCache: false });
    const graph = buildGraph(files, root);
    const typeId = 'origin.ts::Shape';
    const consumer = files.find(file => file.filePath === 'consumer.ts');
    expect(consumer?.edges).toContainEqual(expect.objectContaining({
      kind: 'references-type', target: typeId,
    }));
    expect(graph.hasNode(typeId)).toBe(true);
    expect(getImpact(graph, typeId).affectedFiles).toContain('consumer.ts');
    for (const barrel of ['third.ts', 'second.ts', 'first.ts']) {
      expect(files.find(file => file.filePath === barrel)?.edges).toContainEqual(expect.objectContaining({
        kind: 'references-type', target: typeId,
      }));
    }
  });

  it('keeps the value chain as runtime relationships', async () => {
    const files = await parseProject(root, { useCache: false });
    const graph = buildGraph(files, root);
    for (const [source, target] of [
      ['third.ts', 'origin.ts'], ['second.ts', 'third.ts'], ['first.ts', 'second.ts'],
    ]) {
      expect(graph.findEdge((_id, attrs, from, to) => attrs.kind === 'imports'
        && from === `${source}::__file__` && to === `${target}::__file__`)).toBeDefined();
    }
    expect(files.find(file => file.filePath === 'consumer.ts')?.edges).toContainEqual(
      expect.objectContaining({ kind: 'calls', target: 'origin.ts::area' }));
  });
});
