import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { findDeadSymbols } from '../src/dead-code/detector.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/type-imports');
const repoRoot = resolve(import.meta.dirname, '..');

describe('TypeScript parser correctness (type-only imports, duplicate symbols, export scope)', () => {
  it('produces an imports edge for `import type { A } from "./types"`', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const edge = allEdges.find(
      (e) =>
        e.filePath === 'import-type.ts' &&
        e.kind === 'imports' &&
        e.target === 'types.ts::A'
    );
    expect(edge).toBeDefined();
  });

  it('produces edges for both A and B in `import { type A, B } from "./x"`', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const edgeA = allEdges.find(
      (e) => e.filePath === 'import-both.ts' && e.kind === 'imports' && e.target === 'x.ts::A'
    );
    const edgeB = allEdges.find(
      (e) => e.filePath === 'import-both.ts' && e.kind === 'imports' && e.target === 'x.ts::B'
    );
    expect(edgeA).toBeDefined();
    expect(edgeB).toBeDefined();
  });

  it('produces an edge for `export type { A } from "./types"`', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const edge = allEdges.find(
      (e) => e.filePath === 'export-type.ts' && e.target === 'types.ts::A'
    );
    expect(edge).toBeDefined();
  });

  it('registers the local alias for `import { alpha as beta } from "./y"` and targets y.ts::alpha', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    // The import statement itself must target the imported (not aliased) name.
    const importEdge = allEdges.find(
      (e) => e.filePath === 'import-alias.ts' && e.kind === 'imports' && e.target === 'y.ts::alpha'
    );
    expect(importEdge).toBeDefined();

    // Calling `beta()` must resolve through the import map (keyed by the
    // local binding) to y.ts::alpha, not fail to resolve or point at a
    // phantom local `beta` symbol in import-alias.ts.
    const callEdge = allEdges.find(
      (e) => e.filePath === 'import-alias.ts' && e.kind === 'calls' && e.target === 'y.ts::alpha'
    );
    expect(callEdge).toBeDefined();
  });

  it('produces no duplicate symbol ids across the fixture project', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allSymbols = parsedFiles.flatMap((f) => f.symbols);

    const ids = allSymbols.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks a const declared inside an exported function as exported: false', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allSymbols = parsedFiles.flatMap((f) => f.symbols);

    const findings = allSymbols.find(
      (s) => s.filePath === 'scope-check.ts' && s.name === 'findings'
    );
    expect(findings).toBeDefined();
    expect(findings!.exported).toBe(false);
  });

  it('marks a nested function declared inside an exported function as exported: false', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allSymbols = parsedFiles.flatMap((f) => f.symbols);

    const nested = allSymbols.find(
      (s) => s.filePath === 'scope-check.ts' && s.name === 'nestedHelper'
    );
    expect(nested).toBeDefined();
    expect(nested!.exported).toBe(false);
  });

  it('still produces a calls edge for a non-arrow initializer (`const x = foo()`)', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const callEdge = allEdges.find(
      (e) =>
        e.filePath === 'scope-check.ts' &&
        e.kind === 'calls' &&
        e.source === 'scope-check.ts::checkSecrets' &&
        e.target === 'scope-check.ts::helper'
    );
    expect(callEdge).toBeDefined();
  });

  it('resolves a call to a sibling nested function declared later', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const callEdge = allEdges.find(
      (e) =>
        e.filePath === 'forward-reference.ts' &&
        e.kind === 'calls' &&
        e.source === 'forward-reference.ts::outer.first' &&
        e.line === 3
    );
    expect(callEdge).toBeDefined();
    expect(callEdge!.target).toBe('forward-reference.ts::outer.second');
    expect(callEdge!.target).not.toBe('forward-reference.ts::second');
  });
});

describe('Self-check: parsing this repo\'s own src/security/ directory', () => {
  it('has at least one dependent for src/security/types.ts', async () => {
    const securityDir = resolve(repoRoot, 'src/security');
    const parsedFiles = await parseProject(securityDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const dependents = allEdges.filter((e) => e.target.startsWith('types.ts::'));
    expect(dependents.length).toBeGreaterThanOrEqual(1);
  });

  it('reports zero dead symbols in src/security/types.ts', async () => {
    const securityDir = resolve(repoRoot, 'src/security');
    const parsedFiles = await parseProject(securityDir, { useCache: false });
    const graph = buildGraph(parsedFiles, securityDir);

    const { symbols: deadSymbols } = findDeadSymbols(graph, securityDir);
    const deadInTypes = deadSymbols.filter((s) => s.file.endsWith('types.ts'));
    expect(deadInTypes).toEqual([]);
  });
});
