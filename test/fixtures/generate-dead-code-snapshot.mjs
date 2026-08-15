// Regenerates test/fixtures/dead-code-snapshot.json + .manifest.json.
//
// Run this ONLY when a real detector/scoring change should move the fixed
// reference values in test/fixed-snapshot.test.ts. Regenerating without an
// intentional code change defeats the point of a fixed-snapshot gate.
//
// Usage: node test/fixtures/generate-dead-code-snapshot.mjs
//
// Safety: refuses to run unless the tree matches exactly what git tracks,
// plus a narrow, explicit allowlist. parseProject() walks the filesystem,
// not git's index -- any stray file becomes part of the frozen graph. This
// bit once: three untracked scratch debugging scripts (d-verify.mjs,
// lang-verify.mjs, m-verify.mjs) sitting in the repo root got silently
// parsed into the fixture, inflating nodeCount from a correct 5817 to a
// wrong 5840. Caught only because the number looked suspicious.
//
// IMPORTANT: `git status --short` does NOT show this class of file --
// this repo's .gitignore has a blanket `*.mjs` rule, so those three
// scripts were invisible to plain `git status` the whole time. A first
// draft of this guard used `git status --short` and would have missed
// them completely. Use `git clean -ndx` instead: -x includes gitignored
// paths, -d includes untracked directories, -n is dry-run (list only).
// That is the actual candidate set parseProject() is exposed to.
import { parseProject, buildGraph, analyzeDeadCode, calculateHealthScore } from '../../dist/sdk.js';
import { writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoDir = join(here, '..', '..');
const thisScriptRelPath = relative(repoDir, fileURLToPath(import.meta.url));

// Exact-match allowlist, not globs -- a new stray file must not silently
// pass. Each entry is a specific, verified-harmless, recurring artifact:
const KNOWN_BENIGN_CLEAN_ENTRIES = new Set([
  'docs',                                    // symlink to depwire-docs checkout; parseProject does not follow it (verified: 0 nodes with filePath startsWith 'docs/')
  'node_modules/',                           // dependency tree; parser excludes it by convention (empirically: graph sizes here are consistent with exclusion, not the tens of thousands of nodes node_modules would add)
  '.DS_Store', '.github/.DS_Store', 'website/.DS_Store', // macOS Finder metadata, not source
  '.depwire/',                               // this tool's own cache dir
  '.mcpregistry_github_token', '.mcpregistry_registry_token', // local auth tokens, not source
  'depwire-output.json', 'depwire.mcpb',     // self-scan / build byproducts, not source
  'dist/graph.d.ts', 'dist/graph.js', 'dist/tools.d.ts', 'dist/tools.js', // pre-existing untracked build-output gap, unrelated to this fixture (see git history)
  'test/fixtures/go-project/{config,models,services,utils}/',
  'test/fixtures/java-multimodule/.depwire/',
  'test/fixtures/kotlin-multimodule/.depwire/',
  'test/fixtures/sample-project/.depwire/',
]);

function assertCleanTree() {
  const raw = execSync('git clean -ndx', { cwd: repoDir }).toString();
  const lines = raw.split('\n').filter(Boolean);
  const entries = lines.map(l => l.replace(/^Would (remove|skip) /, '').trim());
  const unexpected = entries.filter(e => e !== thisScriptRelPath && !KNOWN_BENIGN_CLEAN_ENTRIES.has(e));
  if (unexpected.length > 0) {
    console.error('Refusing to generate fixture: working tree has untracked/ignored');
    console.error('files outside the known-benign allowlist. parseProject() reads the');
    console.error('filesystem, not git -- any of the following would silently become');
    console.error('part of the frozen graph:');
    for (const e of unexpected) console.error('  ' + e);
    console.error('Remove these, or if genuinely benign, add them to');
    console.error('KNOWN_BENIGN_CLEAN_ENTRIES in this script with a stated reason.');
    process.exit(1);
  }
  const statusRaw = execSync('git status --short', { cwd: repoDir }).toString().trim();
  return {
    gitStatusShort: statusRaw || '(clean)',
    gitCleanAllowlistedExtras: entries.length > 0 ? entries : '(none)',
  };
}

const { gitStatusShort, gitCleanAllowlistedExtras } = assertCleanTree();
const sourceCommit = execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim();
const packageVersion = JSON.parse(readFileSync(join(repoDir, 'package.json'), 'utf-8')).version;

const parsedFiles = await parseProject(repoDir, { useCache: false });
const graph = buildGraph(parsedFiles, repoDir);
const exported = graph.export();

const deadCode = analyzeDeadCode(graph, repoDir, { json: true });
const health = calculateHealthScore(graph, repoDir);
const orphans = health.dimensions.find(d => /orphan/i.test(d.name));

writeFileSync(join(here, 'dead-code-snapshot.json'), JSON.stringify(exported));

const manifest = {
  note: "Frozen graph snapshot for regression testing dead-code/health detector logic in isolation from live-tree drift (see fix/deadcode-relative-path-cwd-collision and fix/deadcode-relevantkinds-and-self-import). The graph is fixed; only the detector/scoring code under test should be able to move these numbers. Caveat 1: getPackageEntryPoints reads projectRoot's package.json from disk at test time (not frozen) -- if code-graph's own package.json 'exports' field changes, entry-point classification could shift independently of this snapshot. That's a narrow, deliberate-change-only risk, not the 'new files added elsewhere' drift this fixture is meant to guard against. Caveat 2: edge `key` strings in dead-code-snapshot.json (e.g. geid_<n>_<i>) embed a run-varying counter and are NOT byte-stable across regenerations from the same commit -- verified by regenerating twice and diffing: node keys and edge (source,target,attributes) tuples ignoring the key field were identical, as was this expected block. Detector/health logic reads edge attributes, not edge keys, so this does not affect test correctness -- do not byte-diff the raw snapshot JSON as a determinism check.",
  sourceCommit,
  sourceRepo: "code-graph (self-scan)",
  generatorVersion: `depwire-cli ${packageVersion} (package.json version at generation time)`,
  generatedWithNode: process.version,
  generatedAt: new Date().toISOString(),
  gitStatusAtGeneration: gitStatusShort,
  gitCleanAllowlistedExtras: gitCleanAllowlistedExtras,
  nodeCount: exported.nodes.length,
  edgeCount: exported.edges.length,
  expected: {
    totalSymbols: deadCode.totalSymbols,
    deadSymbols: deadCode.deadSymbols,
    deadPercentage: deadCode.deadPercentage,
    byConfidence: deadCode.byConfidence,
    healthOverall: health.overall,
    healthGrade: health.grade,
    orphansScore: orphans.score,
    orphansGrade: orphans.grade
  }
};
writeFileSync(join(here, 'dead-code-snapshot.manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Commit:', sourceCommit);
console.log('Nodes:', exported.nodes.length, 'Edges:', exported.edges.length);
console.log('Expected:', JSON.stringify(manifest.expected, null, 2));
