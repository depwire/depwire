import { parseProject } from './src/parser/index.js';
import { readFileSync } from 'fs';

const sourceCode = readFileSync('./test/fixtures/sample-project/services/UserService.ts', 'utf-8');
import { parseTypeScriptFile } from './src/parser/typescript.js';

const parsed = parseTypeScriptFile('services/UserService.ts', sourceCode, './test/fixtures/sample-project');

console.log('Edges from parser:');
parsed.edges.forEach(e => console.log(`  ${e.kind}: ${e.source} -> ${e.target}`));
