import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const parser = new Parser();
parser.setLanguage(Go);

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  packageName: string;
  imports: Map<string, string>; // Map<package alias, package path>
  moduleName: string | null; // From go.mod
}

export function parseGoFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Use explicit buffer size for large files (tree-sitter default is too small)
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  // Read module name from go.mod
  const moduleName = readGoModuleName(projectRoot);
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    packageName: '',
    imports: new Map(),
    moduleName,
  };
  
  // Extract package name first
  extractPackageName(tree.rootNode, context);
  
  // Walk the AST
  walkNode(tree.rootNode, context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

function extractPackageName(node: Parser.SyntaxNode, context: Context): void {
  // Find package_clause at the start of the file
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'package_clause') {
      const pkgIdentifier = findChildByType(child, 'package_identifier');
      if (pkgIdentifier) {
        context.packageName = nodeText(pkgIdentifier, context);
      }
      break;
    }
  }
}

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  // Process current node
  processNode(node, context);
  
  // Recursively process children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function processNode(node: Parser.SyntaxNode, context: Context): void {
  const type = node.type;
  
  switch (type) {
    case 'function_declaration':
      processFunctionDeclaration(node, context);
      break;
    case 'method_declaration':
      processMethodDeclaration(node, context);
      break;
    case 'type_declaration':
      processTypeDeclaration(node, context);
      break;
    case 'const_declaration':
      processConstDeclaration(node, context);
      break;
    case 'var_declaration':
      processVarDeclaration(node, context);
      break;
    case 'import_declaration':
      processImportDeclaration(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
  }
}

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = isExported(name);
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
  
  // Enter function scope
  context.currentScope.push(name);
  
  // Process function body
  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit function scope
  context.currentScope.pop();
}

function processMethodDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  const receiverNode = node.childForFieldName('receiver');
  
  if (!nameNode || !receiverNode) return;
  
  const name = nodeText(nameNode, context);
  const receiverType = extractReceiverType(receiverNode, context);
  
  if (!receiverType) return;
  
  const exported = isExported(name);
  const symbolId = `${context.filePath}::${receiverType}.${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope: receiverType,
  });
  
  // Enter method scope
  context.currentScope.push(`${receiverType}.${name}`);
  
  // Process method body
  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit method scope
  context.currentScope.pop();
}

function processTypeDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Handle: type Name struct {...}, type Name interface {...}, type Name OtherType
  
  const typeSpecs = findChildrenByType(node, 'type_spec');
  
  for (const typeSpec of typeSpecs) {
    const nameNode = typeSpec.childForFieldName('name');
    const typeNode = typeSpec.childForFieldName('type');
    
    if (!nameNode || !typeNode) continue;
    
    const name = nodeText(nameNode, context);
    const exported = isExported(name);
    
    let kind: 'class' | 'interface' | 'type_alias' = 'type_alias';
    
    if (typeNode.type === 'struct_type') {
      kind = 'class'; // Structs are Go's version of classes
      
      // Check for embedded structs (composition/inheritance)
      const fieldList = findChildByType(typeNode, 'field_declaration_list');
      if (fieldList) {
        for (let i = 0; i < fieldList.childCount; i++) {
          const field = fieldList.child(i);
          if (field && field.type === 'field_declaration') {
            // Check if this is an embedded field (no name, just type)
            const fieldName = field.childForFieldName('name');
            const fieldType = field.childForFieldName('type');
            
            if (!fieldName && fieldType) {
              // This is an embedded struct
              const embeddedTypeName = extractTypeName(fieldType, context);
              if (embeddedTypeName) {
                const embeddedId = resolveSymbol(embeddedTypeName, context);
                if (embeddedId) {
                  const symbolId = `${context.filePath}::${name}`;
                  context.edges.push({
                    source: symbolId,
                    target: embeddedId,
                    kind: 'inherits',
                    filePath: context.filePath,
                    line: field.startPosition.row + 1,
                  });
                }
              }
            }
          }
        }
      }
    } else if (typeNode.type === 'interface_type') {
      kind = 'interface';
    }
    
    const symbolId = `${context.filePath}::${name}`;
    
    context.symbols.push({
      id: symbolId,
      name,
      kind,
      filePath: context.filePath,
      startLine: typeSpec.startPosition.row + 1,
      endLine: typeSpec.endPosition.row + 1,
      exported,
    });
  }
}

function processConstDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Handle: const Name = value OR const ( Name = value; ... )
  
  const constSpecs = findChildrenByType(node, 'const_spec');
  
  for (const constSpec of constSpecs) {
    const nameNode = constSpec.childForFieldName('name');
    if (!nameNode) continue;
    
    // Handle both single identifier and identifier_list
    const names = extractIdentifierNames(nameNode, context);
    
    for (const name of names) {
      const exported = isExported(name);
      const symbolId = `${context.filePath}::${name}`;
      
      context.symbols.push({
        id: symbolId,
        name,
        kind: 'constant',
        filePath: context.filePath,
        startLine: constSpec.startPosition.row + 1,
        endLine: constSpec.endPosition.row + 1,
        exported,
      });
    }
  }
}

function processVarDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Only capture package-level variables (not inside functions)
  if (context.currentScope.length > 0) return;
  
  const varSpecs = findChildrenByType(node, 'var_spec');
  
  for (const varSpec of varSpecs) {
    const nameNode = varSpec.childForFieldName('name');
    if (!nameNode) continue;
    
    const names = extractIdentifierNames(nameNode, context);
    
    for (const name of names) {
      const exported = isExported(name);
      const symbolId = `${context.filePath}::${name}`;
      
      context.symbols.push({
        id: symbolId,
        name,
        kind: 'variable',
        filePath: context.filePath,
        startLine: varSpec.startPosition.row + 1,
        endLine: varSpec.endPosition.row + 1,
        exported,
      });
    }
  }
}

function processImportDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Handle: import "path" OR import ( "path1"; "path2"; ... )
  
  // Look for import_spec_list (grouped imports) or direct import_spec (single import)
  let importSpecs: Parser.SyntaxNode[] = [];
  
  const importSpecList = findChildByType(node, 'import_spec_list');
  if (importSpecList) {
    importSpecs = findChildrenByType(importSpecList, 'import_spec');
  } else {
    importSpecs = findChildrenByType(node, 'import_spec');
  }
  
  for (const importSpec of importSpecs) {
    const pathNode = importSpec.childForFieldName('path');
    if (!pathNode) continue;
    
    const importPath = nodeText(pathNode, context).slice(1, -1); // Remove quotes
    
    // Get alias if present
    const nameNode = importSpec.childForFieldName('name');
    let alias = '';
    
    if (nameNode) {
      alias = nodeText(nameNode, context);
    } else {
      // Default alias is the last segment of the path
      const segments = importPath.split('/');
      alias = segments[segments.length - 1];
    }
    
    // Store the import
    context.imports.set(alias, importPath);
    
    // Check if this is a local import
    const resolvedFiles = resolveGoImport(importPath, context.projectRoot, context.moduleName);
    
    if (resolvedFiles.length > 0) {
      // Create edges to all files in the imported package
      const sourceId = `${context.filePath}::__file__`;
      
      for (const targetFile of resolvedFiles) {
        const targetId = `${targetFile}::__file__`;
        
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: 'imports',
          filePath: context.filePath,
          line: importSpec.startPosition.row + 1,
        });
      }
    }
  }
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  // Handle function calls
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  let calleeName: string | null = null;
  
  if (functionNode.type === 'identifier') {
    calleeName = nodeText(functionNode, context);
  } else if (functionNode.type === 'selector_expression') {
    // package.Function() or obj.Method()
    const field = functionNode.childForFieldName('field');
    if (field) {
      calleeName = nodeText(field, context);
    }
  }
  
  if (!calleeName) return;
  
  // Skip common builtins
  const builtins = ['make', 'len', 'cap', 'append', 'copy', 'delete', 'panic', 'recover', 'print', 'println', 'new'];
  if (builtins.includes(calleeName)) return;
  
  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;
  
  const calleeId = resolveSymbol(calleeName, context);
  if (calleeId) {
    context.edges.push({
      source: callerId,
      target: calleeId,
      kind: 'calls',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

// Helper functions

function readGoModuleName(projectRoot: string): string | null {
  // Look for go.mod in the project root or up to 5 levels up
  let currentDir = projectRoot;
  
  for (let i = 0; i < 5; i++) {
    const goModPath = join(currentDir, 'go.mod');
    
    if (existsSync(goModPath)) {
      try {
        const content = readFileSync(goModPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('module ')) {
            return trimmed.substring(7).trim();
          }
        }
      } catch (error) {
        console.error(`Error reading go.mod: ${error}`);
      }
    }
    
    // Go up one directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }
  
  return null;
}

function resolveGoImport(importPath: string, projectRoot: string, moduleName: string | null): string[] {
  // Check if this is a local import
  
  // Skip standard library (no dots in path)
  if (!importPath.includes('.') && !importPath.includes('/')) {
    return []; // Standard library like "fmt", "os"
  }
  
  // If we have a module name, check if the import starts with it
  if (moduleName && importPath.startsWith(moduleName)) {
    // Strip module name to get the relative directory
    const relativePath = importPath.substring(moduleName.length + 1);
    const packageDir = join(projectRoot, relativePath);
    
    // Find all .go files in that directory
    return findGoFilesInDir(packageDir, projectRoot);
  }
  
  // Fallback: try directory-based resolution for simple projects without go.mod
  // import "services" → look for services/ directory
  const segments = importPath.split('/');
  const packageDir = join(projectRoot, ...segments);
  
  if (existsSync(packageDir)) {
    return findGoFilesInDir(packageDir, projectRoot);
  }
  
  // External import
  return [];
}

function findGoFilesInDir(dir: string, projectRoot: string): string[] {
  if (!existsSync(dir)) return [];
  
  try {
    const files = readdirSync(dir);
    
    const goFiles = files.filter((f: string) => f.endsWith('.go') && !f.endsWith('_test.go'));
    
    return goFiles.map((f: string) => {
      const fullPath = join(dir, f);
      return fullPath.substring(projectRoot.length + 1);
    });
  } catch (error) {
    console.error(`[findGoFilesInDir] Error:`, error);
    return [];
  }
}

function isExported(name: string): boolean {
  // In Go, capitalized first letter = exported
  return name.length > 0 && name[0] === name[0].toUpperCase();
}

function extractReceiverType(receiverNode: Parser.SyntaxNode, context: Context): string | null {
  // Receiver format: (s *UserService) or (s UserService)
  // receiverNode is already a parameter_list
  const paramDecl = findChildByType(receiverNode, 'parameter_declaration');
  if (!paramDecl) return null;
  
  const typeNode = paramDecl.childForFieldName('type');
  if (!typeNode) return null;
  
  return extractTypeName(typeNode, context);
}

function extractTypeName(typeNode: Parser.SyntaxNode, context: Context): string | null {
  if (typeNode.type === 'pointer_type') {
    // *UserService → UserService
    // pointer_type has 2 children: "*" and the type_identifier
    for (let i = 0; i < typeNode.childCount; i++) {
      const child = typeNode.child(i);
      if (child && child.type === 'type_identifier') {
        return nodeText(child, context);
      }
    }
    return null;
  } else if (typeNode.type === 'type_identifier') {
    return nodeText(typeNode, context);
  }
  
  return null;
}

function extractIdentifierNames(node: Parser.SyntaxNode, context: Context): string[] {
  if (node.type === 'identifier') {
    return [nodeText(node, context)];
  } else if (node.type === 'identifier_list') {
    const names: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'identifier') {
        names.push(nodeText(child, context));
      }
    }
    return names;
  }
  
  return [];
}

function resolveSymbol(name: string, context: Context): string | null {
  // Check current file symbols first
  const currentFileId = `${context.filePath}::${name}`;
  const symbol = context.symbols.find(s => s.id === currentFileId);
  if (symbol) {
    return currentFileId;
  }
  
  // Check current scope (methods, nested functions)
  if (context.currentScope.length > 0) {
    for (let i = context.currentScope.length - 1; i >= 0; i--) {
      const scopedId = `${context.filePath}::${context.currentScope[i]}.${name}`;
      const scopedSymbol = context.symbols.find(s => s.id === scopedId);
      if (scopedSymbol) {
        return scopedId;
      }
    }
  }
  
  // In Go, symbols in the same package can reference each other
  // For now, skip cross-file same-package resolution (would need to parse all files in package)
  
  return null;
}

function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return child;
    }
  }
  return null;
}

function findChildrenByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      results.push(child);
    }
  }
  
  return results;
}

function nodeText(node: Parser.SyntaxNode, context: Context): string {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}

// Export as LanguageParser interface
export const goParser: LanguageParser = {
  name: 'go',
  extensions: ['.go'],
  parseFile: parseGoFile
};
