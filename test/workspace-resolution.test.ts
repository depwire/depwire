import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';

/**
 * Regression test for #12/#14: a bare cross-package import in a workspace
 * monorepo, resolved through a barrel (`export * from`) to the real
 * declaring file rather than left dangling on the barrel itself.
 *
 * Fixture: test/fixtures/ts-workspace-monorepo -- pkg-a imports `helperFn`
 * from the bare specifier `pkg-b`; pkg-b's package entry (src/index.ts) is
 * a pure wildcard-re-export barrel with zero symbols of its own; the real
 * declaration lives in packages/pkg-b/src/helper.ts.
 *
 * Before the fix: workspace packages were not discovered at all, so the
 * bare specifier `pkg-b` was classified `external` and no edge was created.
 * Verify this is a real gate, not a tautology, by reverting
 * `git stash` on src/parser/workspace.ts + src/parser/reexport-chains.ts
 * and confirming this test fails -- see the verification note in the PR.
 */
describe('workspace package + barrel re-export resolution (#12/#14)', () => {
  const fixtureDir = resolve(import.meta.dirname, 'fixtures/ts-workspace-monorepo');

  it('resolves a bare cross-package import through a barrel to the real declaring file', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false } as any);
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const importEdge = allEdges.find(
      (e) =>
        e.source.startsWith('packages/pkg-a/src/index.ts::') &&
        e.kind === 'imports' &&
        e.target.includes('helperFn')
    );

    expect(importEdge).toBeDefined();
    // Must land on the real declaring file, not the barrel (pkg-b/src/index.ts).
    expect(importEdge!.target).toBe('packages/pkg-b/src/helper.ts::helperFn');
  });

  it('also resolves the call-site edge to the real declaring file, not just the import edge', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false } as any);
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const callEdge = allEdges.find(
      (e) => e.source === 'packages/pkg-a/src/index.ts::useHelper' && e.kind === 'calls'
    );

    expect(callEdge).toBeDefined();
    expect(callEdge!.target).toBe('packages/pkg-b/src/helper.ts::helperFn');
  });

  it('the barrel file itself declares no symbols (pure re-export)', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false } as any);
    const barrel = parsedFiles.find((f) => f.filePath === 'packages/pkg-b/src/index.ts');

    expect(barrel).toBeDefined();
    expect(barrel!.symbols.length).toBe(0);
  });
});
