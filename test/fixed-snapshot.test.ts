import { describe, it, expect } from 'vitest';
import { DirectedGraph } from 'graphology';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { analyzeDeadCode } from '../src/dead-code/index.js';
import { calculateHealthScore } from '../src/health/index.js';

/**
 * Fixed-snapshot regression gate for the dead-code/health detector.
 *
 * The live code-graph tree drifts (the health gate moved 72 -> 71 between
 * documentation and this investigation, purely from ordinary repo growth,
 * unrelated to any detector change). A gate that re-parses the live tree on
 * every run can't distinguish "the detector changed" from "the repo grew" --
 * that ambiguity is what let the CWD bug and the relevantKinds gap ship
 * undetected for months.
 *
 * This test loads a *frozen* graph (serialized at a known commit, see
 * test/fixtures/dead-code-snapshot.manifest.json) and asserts the detector
 * and health scorer produce exactly the values recorded when the fixture
 * was generated. The graph never changes; only a real detector/scoring
 * change should be able to move these numbers. If this test starts failing
 * without an intentional detector change, that's the same class of false
 * signal the live-tree gate produced -- investigate before regenerating the
 * fixture.
 *
 * Caveat recorded in the manifest: `getPackageEntryPoints` reads
 * `projectRoot`'s package.json from disk at test time, not from the frozen
 * graph. That's an intentional, narrow exception (this repo's package.json
 * exports rarely change) -- not the "new files added elsewhere" drift this
 * fixture exists to guard against.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');
const manifest = JSON.parse(
  readFileSync(join(fixturesDir, 'dead-code-snapshot.manifest.json'), 'utf-8')
);
const snapshot = JSON.parse(
  readFileSync(join(fixturesDir, 'dead-code-snapshot.json'), 'utf-8')
);

// The frozen graph's node filePaths are relative to the repo it was
// generated from. getPackageEntryPoints needs a real, on-disk projectRoot
// with a package.json to check main/module/exports against (see caveat
// above) -- this repo's own root satisfies that.
const projectRoot = join(here, '..');

describe('dead-code detector against a fixed graph snapshot', () => {
  const graph = new DirectedGraph();
  graph.import(snapshot);

  it('matches the frozen node/edge counts (sanity: the fixture itself did not change)', () => {
    expect(graph.order).toBe(manifest.nodeCount);
    expect(graph.size).toBe(manifest.edgeCount);
  });

  it('reproduces the recorded dead-code result exactly', () => {
    const result = analyzeDeadCode(graph, projectRoot, { json: true });
    expect(result.totalSymbols).toBe(manifest.expected.totalSymbols);
    expect(result.deadSymbols).toBe(manifest.expected.deadSymbols);
    expect(result.byConfidence).toEqual(manifest.expected.byConfidence);
  });

  it('reproduces the recorded health score exactly', () => {
    const health = calculateHealthScore(graph, projectRoot);
    const orphans = health.dimensions.find(d => /orphan/i.test(d.name));

    expect(health.overall).toBe(manifest.expected.healthOverall);
    expect(health.grade).toBe(manifest.expected.healthGrade);
    expect(orphans?.score).toBe(manifest.expected.orphansScore);
    expect(orphans?.grade).toBe(manifest.expected.orphansGrade);
  });

  it('is independent of process.cwd() (regression: the /app collision)', () => {
    const originalCwd = process.cwd;
    process.cwd = () => '/app';
    let underAppCwd;
    try {
      underAppCwd = analyzeDeadCode(graph, projectRoot, { json: true });
    } finally {
      process.cwd = originalCwd;
    }
    expect(underAppCwd.deadSymbols).toBe(manifest.expected.deadSymbols);
  });
});
