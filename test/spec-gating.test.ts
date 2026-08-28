import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { findDeadSymbols } from '../src/dead-code/detector.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/spec-gating');

describe('spec/ dead-code exclusion gating', () => {
  it('includes source declarations under spec/ but excludes explicit spec test files', async () => {
    const parsed = await parseProject(fixtureDir, { useCache: false });
    const graph = buildGraph(parsed);
    const result = findDeadSymbols(graph, fixtureDir);

    expect(result.symbols).toContainEqual(expect.objectContaining({
      name: 'protocolSource', file: 'spec/protocol.ts',
    }));
    expect(result.symbols).not.toContainEqual(expect.objectContaining({
      name: 'protocolTestHelper', file: 'spec/protocol_spec.ts',
    }));
    expect(result.stats.excludedByTestFile).toBeGreaterThan(0);
  });
});
