import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { readFileSync } from 'fs';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const code = readFileSync('./test/fixtures/sample-project/services/UserService.ts', 'utf-8');
const tree = parser.parse(code);

function printTree(node, indent = 0) {
  console.log('  '.repeat(indent) + node.type + (node.text.length < 30 ? ` "${node.text}"` : ''));
  for (let i = 0; i < node.childCount; i++) {
    printTree(node.child(i), indent + 1);
  }
}

console.log('Tree for UserService.ts:');
printTree(tree.rootNode);
