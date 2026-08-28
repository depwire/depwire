import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { findDeadSymbols } from '../src/dead-code/detector.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/type-imports');
const repoRoot = resolve(import.meta.dirname, '..');

describe('TypeScript parser correctness (type-only imports, duplicate symbols, export scope)', () => {
  it('retargets `import type` to references-type and removes its imports edge', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const edge = allEdges.find(
      (e) =>
        e.filePath === 'import-type.ts' &&
        e.kind === 'references-type' &&
        e.target === 'types.ts::A'
    );
    expect(edge).toBeDefined();
    expect(allEdges.some((e) => e.filePath === 'import-type.ts' && e.kind === 'imports')).toBe(false);
  });

  it('produces edges for both A and B in `import { type A, B } from "./x"`', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const edgeA = allEdges.find(
      (e) => e.filePath === 'import-both.ts' && e.kind === 'references-type' && e.target === 'x.ts::A'
    );
    const edgeB = allEdges.find(
      (e) => e.filePath === 'import-both.ts' && e.kind === 'imports' && e.target === 'x.ts::B'
    );
    expect(edgeA).toBeDefined();
    expect(edgeB).toBeDefined();
  });

  it('emits proven references-type edges for every approved TypeScript type position', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const edges = parsedFiles.flatMap((file) => file.edges)
      .filter((edge) => edge.filePath === 'type-edges.ts' && edge.kind === 'references-type');

    const relationships = new Set(edges.map((edge) => `${edge.source}->${edge.target}`));
    expect(relationships).toContain('type-edges.ts::Child->type-edges.ts::LocalParent');
    expect(relationships).toContain('type-edges.ts::Child->types.ts::A');
    expect(relationships).toContain('type-edges.ts::Child->types.ts::Outer.Inner');
    expect(relationships).toContain('type-edges.ts::Implementation->type-edges.ts::Child');
    expect(relationships).toContain('type-edges.ts::Implementation.method->type-edges.ts::LocalAlias');
    expect(relationships).toContain('type-edges.ts::Implementation.method->types.ts::A');
    expect(relationships).toContain('type-edges.ts::GenericAlias->type-edges.ts::LocalParent');
    expect(relationships).toContain('type-edges.ts::convert->types.ts::A');
    expect(relationships).toContain('type-edges.ts::convert->type-edges.ts::LocalAlias');
  });

  it('records unresolvable builtins without emitting guessed type edges', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const file = parsedFiles.find((entry) => entry.filePath === 'type-edges.ts')!;
    expect(file.unresolvedTypeRefs).toContainEqual({
      fromFile: 'type-edges.ts',
      typeName: 'Map',
      reason: 'no-project-symbol',
    });
    expect(file.edges.some((edge) => edge.target.endsWith('::Map'))).toBe(false);
  });

  it('reuses named re-export resolution and targets the declaring type symbol', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const edges = parsedFiles.flatMap((file) => file.edges)
      .filter((edge) => edge.filePath === 'named-consumer.ts' && edge.kind === 'references-type');
    expect(edges.some((edge) => edge.target === 'types.ts::A')).toBe(true);
    expect(edges.some((edge) => edge.target === 'named-barrel.ts::PublicA')).toBe(false);
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
