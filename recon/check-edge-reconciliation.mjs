/** Run after `npm run build`: node recon/check-edge-reconciliation.mjs roots.json
 * roots.json maps code-graph, nest, drizzle, hono, express, zod, flask, fastapi
 * to local checkout paths. Every parse bypasses the cache.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject, buildGraph } from '../dist/sdk.js';

const manifest = process.argv[2];
if (!manifest) throw new Error('Expected a roots.json manifest');
const roots = JSON.parse(readFileSync(manifest, 'utf8'));
const names = ['code-graph', 'nest', 'drizzle', 'hono', 'express', 'zod', 'flask', 'fastapi'];

for (const name of names) {
  assert.equal(typeof roots[name], 'string', `Missing corpus root: ${name}`);
  const root = resolve(roots[name]);
  const files = await parseProject(root, { useCache: false });
  const graph = buildGraph(files, root);
  const parsed = files.reduce((total, file) => total + file.edges.length, 0);
  const parserBuilt = graph.getAttribute('parserBuiltEdgeCount');
  const builderDrops = graph.getAttribute('edgeDrops');
  const crossLanguageAttempted = graph.getAttribute('crossLanguageAttemptedEdgeCount');
  const crossLanguageDrops = graph.getAttribute('crossLanguageDrops');

  assert.equal(parsed, graph.getAttribute('parserEdgeCount'), `${name}: parser count attribute`);
  assert.equal(parsed, parserBuilt + builderDrops.length, `${name}: parser/builder reconciliation`);
  assert.equal(crossLanguageAttempted, graph.size - parserBuilt + crossLanguageDrops.length,
    `${name}: cross-language reconciliation`);
  const reasons = rows => Object.fromEntries([...new Set(rows.map(row => row.reason))].sort()
    .map(reason => [reason, rows.filter(row => row.reason === reason).length]));
  console.log(JSON.stringify({ name, parsed, parserBuilt, builderDrops: reasons(builderDrops),
    crossLanguageAttempted, crossLanguageBuilt: graph.size - parserBuilt,
    crossLanguageDrops: reasons(crossLanguageDrops), finalBuilt: graph.size }));
}
