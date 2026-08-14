// In-degree spot check across R1/R2/R3, per deadcode-diagnosis task instructions.
import { parseProject, buildGraph } from '../../dist/sdk.js';
import { serializeGraph, deserializeGraph } from '../../dist/graph.js';

async function check(label, projectRoot, referencedNames, unreferencedNames) {
  console.log(`\n=== ${label}: ${projectRoot} ===`);
  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.log(`graph.order = ${graph.order}`);

  const roundTripped = JSON.parse(JSON.stringify(serializeGraph(graph, projectRoot)));
  const rebuilt = deserializeGraph(roundTripped);
  console.log(`rebuiltGraph.order = ${rebuilt.order}`);

  function report(names, tag, g) {
    for (const name of names) {
      let found = 0;
      g.forEachNode((node, attrs) => {
        if (attrs.name === name) {
          found++;
          console.log(`  [${tag}] ${name} (${attrs.kind}) inDegree=${g.inDegree(node)} file=${attrs.filePath}`);
        }
      });
      if (found === 0) console.log(`  [${tag}] ${name}: NOT FOUND in graph`);
    }
  }

  console.log(' -- fresh in-memory graph --');
  report(referencedNames, 'referenced', graph);
  report(unreferencedNames, 'unreferenced', graph);

  console.log(' -- serialized/deserialized graph (simulated Cloud) --');
  report(referencedNames, 'referenced', rebuilt);
  report(unreferencedNames, 'unreferenced', rebuilt);
}

await check(
  'R1 (code-graph)',
  process.cwd(),
  ['findDeadSymbols', 'analyzeDeadCode', 'buildGraph'],
  ['DiffOptions', 'DiffSymbol', 'DiffEdge']
);

await check(
  'R2/R3 (drizzle-orm monorepo)',
  '/tmp/deadcode-repos/drizzle-orm',
  ['eq', 'and', 'sql'],
  ['unsignedBigintNarrow', 'bigintNarrow', 'HandleSelectColumn']
);
