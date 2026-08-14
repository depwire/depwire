import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { findDeadSymbols } from '../src/dead-code/detector.js';

/**
 * Regression test for the CWD/relative-path collision described in the
 * deadcode-diagnosis investigation.
 *
 * shouldExclude() received a project-relative `filePath` (by design — see
 * ParsedFile.filePath contract in src/utils/files.ts) but called
 * `path.relative(projectRoot, filePath)` directly. Node silently resolves a
 * relative second argument against `process.cwd()`, so the result depended
 * on the *calling process's* working directory rather than on the repo
 * being analyzed. On Railway, Nixpacks' default container WORKDIR is /app,
 * and `isFrameworkAutoLoadedFile()` excludes any path containing "/app/" —
 * so every symbol in every repo was silently excluded, producing
 * deadSymbols: 0 in production while the same code returned correct,
 * non-zero results on every local machine (whose cwd never collided with
 * "/app/"). This was invisible for months because no local run ever
 * happened to have that cwd.
 *
 * This test pins two things:
 *   1. findDeadSymbols must return identical results regardless of
 *      process.cwd() — that's the actual regression gate.
 *   2. A package's own entry point (package.json "main") must be excluded
 *      as "entry", not reported as dead — the isRealPackageEntryPoint
 *      comparison (relative filePath vs. absolute entry points) was always
 *      false, independent of cwd, and is fixed by the same normalization.
 */
describe('findDeadSymbols is independent of process.cwd()', () => {
  let fixtureDir: string;
  const realCwd = process.cwd();

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'depwire-deadcode-cwd-'));

    writeFileSync(
      join(fixtureDir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', main: 'index.ts' })
    );

    // Package entry point — has inDegree 0 (nothing internal imports it),
    // so it's only correctly excluded from dead-code reporting via the
    // "entry" path, not by having any real caller.
    writeFileSync(
      join(fixtureDir, 'index.ts'),
      `export function entryFn(): number {\n  return 1;\n}\n`
    );

    // A genuinely dead, exported symbol: not an entry point, not a test
    // file, not referenced anywhere. Must still be reported as dead
    // regardless of process.cwd().
    writeFileSync(
      join(fixtureDir, 'other.ts'),
      `export function orphanFn(): number {\n  return 2;\n}\n`
    );
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
    process.chdir(realCwd);
  });

  it('returns identical dead-symbol results under a benign cwd and under cwd=/app', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const graph = buildGraph(parsedFiles, fixtureDir);

    const baseline = findDeadSymbols(graph, fixtureDir);

    // Simulate Railway/Nixpacks' default container WORKDIR without needing
    // a real /app directory: path.relative()'s implicit cwd resolution
    // only needs process.cwd() to return the string, not for it to exist.
    const originalCwd = process.cwd;
    process.cwd = () => '/app';
    let underAppCwd;
    try {
      underAppCwd = findDeadSymbols(graph, fixtureDir);
    } finally {
      process.cwd = originalCwd;
    }

    const namesOf = (r: typeof baseline) => r.symbols.map(s => s.name).sort();

    expect(namesOf(underAppCwd)).toEqual(namesOf(baseline));
    expect(underAppCwd.stats).toEqual(baseline.stats);

    // Guard against the exact original failure mode: cwd=/app must not
    // silently collapse every symbol to "excluded".
    expect(baseline.symbols.length).toBeGreaterThan(0);
  });

  it('excludes the package entry point as "entry", not as dead code', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const graph = buildGraph(parsedFiles, fixtureDir);

    const result = findDeadSymbols(graph, fixtureDir);
    const names = result.symbols.map(s => s.name);

    expect(names).not.toContain('entryFn');
    expect(names).toContain('orphanFn');
  });
});
