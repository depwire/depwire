// Usage: node recon/reexport-determinism.mjs <absolute pinned root> <seed>
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
const [root, seedText] = process.argv.slice(2);
if (!root || !seedText) throw new Error('Expected root and seed');
let state = Number(seedText) >>> 0;
const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
const original = fs.readdirSync;
fs.readdirSync = function (...args) {
  const entries = original.apply(this, args);
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
};
syncBuiltinESMExports();
const { parseProject, buildGraph } = await import('../dist/sdk.js');
const { serializeGraph } = await import('../dist/graph.js');
const files = await parseProject(root, { useCache: false });
const graph = buildGraph(files, root);
const serialized = serializeGraph(graph, root);
serialized.metadata.parsedAt = 'fixed';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
console.log(JSON.stringify({ seed: Number(seedText), parsed: digest(files), graph: digest(serialized),
  parsedFiles: files.length, builtEdges: graph.size }));
