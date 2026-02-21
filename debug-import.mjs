import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { readFileSync } from 'fs';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const code = readFileSync('./test/fixtures/sample-project/services/UserService.ts', 'utf-8');
const tree = parser.parse(code);

// Find import statements
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

const imports = findNodesByType(tree.rootNode, 'import_statement');
console.log('Found', imports.length, 'import statements');

for (const imp of imports) {
  console.log('\nImport statement:');
  const source = imp.childForFieldName('source');
  if (source) {
    console.log('  Source:', source.text);
    const importPath = source.text.slice(1, -1);
    console.log('  Import path:', importPath);
  }
  
  const importClause = imp.child(1);
  console.log('  Import clause type:', importClause?.type);
  
  // Try to find named_imports
  function findChildByType(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === type) {
        return child;
      }
    }
    return null;
  }
  
  const namedImports = findChildByType(importClause, 'named_imports');
  if (namedImports) {
    console.log('  Found named imports');
    for (let i = 0; i < namedImports.childCount; i++) {
      const child = namedImports.child(i);
      if (child && child.type === 'import_specifier') {
        const identifier = findChildByType(child, 'identifier');
        console.log('    Import:', identifier?.text);
      }
    }
  }
}
