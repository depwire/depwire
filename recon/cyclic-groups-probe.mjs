// Local verification only. Build first, then: node recon/cyclic-groups-probe.mjs <corpus> <seed>
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
let seed = Number(process.argv[3] ?? 1);
const original = fs.readdirSync;
let directoryReads = 0;
fs.readdirSync = function (...args) {
  const entries = original.apply(this, args);
  directoryReads++;
  for (let i = entries.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
};
syncBuiltinESMExports();
const { parseProject, buildGraph, analyzeCyclicGroups } = await import('../dist/sdk.js');
const { serializeGraph } = await import('../dist/graph.js');
const parsed = await parseProject(process.argv[2], { useCache: false });
const graph = buildGraph(parsed, process.argv[2]);
const cyclicGroups = analyzeCyclicGroups(graph);
if (cyclicGroups.status !== 'analyzed') throw new Error(cyclicGroups.reason);
const data = serializeGraph(graph, process.argv[2]);
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const graphContents = {
  nodes: data.nodes.sort((a,b) => compare(a.id,b.id)),
  edges: data.edges.sort((a,b) => compare(JSON.stringify(a),JSON.stringify(b))),
};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
console.log(JSON.stringify({directoryReads, errorFiles:parsed.errorFiles,
  graphSHA256:hash(graphContents), metricSHA256:hash(cyclicGroups), cyclicGroups}));
