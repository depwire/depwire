import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { readFileSync } from 'fs';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const code = readFileSync('./test/fixtures/sample-project/utils/math.ts', 'utf-8');
const tree = parser.parse(code);

function printTree(node, indent = 0) {
  console.log('  '.repeat(indent) + node.type + (node.text.length < 50 ? ` "${node.text}"` : ''));
  if (indent < 5) {
    for (let i = 0; i < node.childCount; i++) {
      printTree(node.child(i), indent + 1);
    }
  }
}

// Find the PI declaration
function findNodesByType(node, type) {
  const results = [];
  if (node.type === type) {
    results.push(node);
  }
  for (let i = 0; i < node.childCount; i++) {
    results.push(...findNodesByType(node.child(i), type));
  }
  return results;
}

const lexDecls = findNodesByType(tree.rootNode, 'lexical_declaration');
console.log('Lexical declarations:', lexDecls.length);
if (lexDecls.length > 0) {
  console.log('\nPI declaration structure:');
  printTree(lexDecls[0]);
}
