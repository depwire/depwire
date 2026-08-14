// Simulates the Cloud (Railway) pipeline as documented in src/sdk.ts:
//   parseProject -> buildGraph -> serializeGraph -> (persist to R2 as JSON)
//   ... later, at query time ...
//   (load JSON from R2) -> deserializeGraph -> analyzeDeadCode(graph, projectRoot)
//
// We don't have credentials to fetch the actual R2 payload for drizzle-orm,
// so this reproduces the exact same public SDK calls Cloud is documented to
// use, round-tripping through real JSON.stringify/JSON.parse (not just an
// in-memory object passed by reference) to catch any information lost in
// that boundary. We test two projectRoot conditions at query time:
//   (a) same projectRoot string used at parse time (directory still exists)
//   (b) a projectRoot string pointing at a directory that does NOT exist
//       (simulating a Railway container's temp clone dir being gone by the
//        time a later query/read runs against the persisted graph)
import { parseProject, buildGraph, analyzeDeadCode } from '../../dist/sdk.js';
import { serializeGraph, deserializeGraph } from '../../dist/graph.js';

const projectRoot = process.argv[2];
if (!projectRoot) {
  console.error('usage: node simulate-cloud.mjs <projectRoot>');
  process.exit(1);
}

process.env.DEPWIRE_DEBUG_FUNNEL = '1';

console.error('\n=== STEP 1: parseProject + buildGraph (fresh, in-memory) ===');
const parsedFiles = await parseProject(projectRoot);
const graph = buildGraph(parsedFiles, projectRoot);
console.error(`graph.order = ${graph.order}`);

console.error('\n=== STEP 2: serializeGraph -> JSON.stringify -> JSON.parse -> deserializeGraph ===');
const serialized = serializeGraph(graph, projectRoot);
const wireBytes = JSON.stringify(serialized);
console.error(`serialized payload size: ${(wireBytes.length / 1024 / 1024).toFixed(2)} MB`);
const roundTripped = JSON.parse(wireBytes);
const rebuiltGraph = deserializeGraph(roundTripped);
console.error(`rebuiltGraph.order = ${rebuiltGraph.order} (vs original ${graph.order})`);

console.error('\n=== R3a: analyzeDeadCode on rebuiltGraph, projectRoot STILL EXISTS ===');
const reportSameRoot = analyzeDeadCode(rebuiltGraph, projectRoot, { confidence: 'medium', debug: true, json: true });
console.error(`R3a result: totalSymbols=${reportSameRoot.totalSymbols} deadSymbols=${reportSameRoot.deadSymbols} deadPercentage=${reportSameRoot.deadPercentage.toFixed(2)}`);

console.error('\n=== R3b: analyzeDeadCode on rebuiltGraph, projectRoot DOES NOT EXIST (deleted temp clone dir) ===');
const missingRoot = '/tmp/deadcode-repos/__deleted_clone_dir_does_not_exist__';
const reportMissingRoot = analyzeDeadCode(rebuiltGraph, missingRoot, { confidence: 'medium', debug: true, json: true });
console.error(`R3b result: totalSymbols=${reportMissingRoot.totalSymbols} deadSymbols=${reportMissingRoot.deadSymbols} deadPercentage=${reportMissingRoot.deadPercentage.toFixed(2)}`);

console.log(JSON.stringify({
  originalOrder: graph.order,
  rebuiltOrder: rebuiltGraph.order,
  R3a: { totalSymbols: reportSameRoot.totalSymbols, deadSymbols: reportSameRoot.deadSymbols },
  R3b: { totalSymbols: reportMissingRoot.totalSymbols, deadSymbols: reportMissingRoot.deadSymbols },
}, null, 2));
