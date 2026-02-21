import { parseProject } from './dist/index.js';

const files = parseProject('./test/fixtures/sample-project');
console.log('Parsed files:', files.length);

for (const file of files) {
  console.log(`\nFile: ${file.filePath}`);
  console.log(`  Symbols: ${file.symbols.length}`);
  console.log(`  Edges: ${file.edges.length}`);
  if (file.edges.length > 0) {
    for (const edge of file.edges) {
      console.log(`    ${edge.kind}: ${edge.source} -> ${edge.target}`);
    }
  }
}
