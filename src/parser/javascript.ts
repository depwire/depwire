import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { resolveImportPath } from './resolver.js';
import { existsSync } from 'fs';
import { join, dirname, extname } from 'path';

const jsParser = new Parser();
jsParser.setLanguage(JavaScript);

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId>
  isJSX: boolean;
}

export function parseJavaScriptFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Use explicit buffer size for large files (tree-sitter default is too small)
  const tree = jsParser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    imports: new Map(),
    isJSX: filePath.endsWith('.jsx'),
  };
  
  walkNode(tree.rootNode, context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
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
    case 'function':
      // Arrow functions and function expressions
      processFunctionExpression(node, context);
      break;
    case 'class_declaration':
      processClassDeclaration(node, context);
      break;
    case 'method_definition':
      processMethodDefinition(node, context);
      break;
    case 'lexical_declaration':
    case 'variable_declaration':
      processVariableDeclaration(node, context);
      break;
    case 'import_statement':
      processImportStatement(node, context);
      break;
    case 'export_statement':
      processExportStatement(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
    case 'new_expression':
      processNewExpression(node, context);
      break;
    case 'jsx_element':
    case 'jsx_self_closing_element':
      if (context.isJSX) {
        processJSXElement(node, context);
      }
      break;
  }
}

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = isExported(node.parent);
  
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
  const body = findChildByType(node, 'statement_block');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit function scope
  context.currentScope.pop();
}

function processFunctionExpression(node: Parser.SyntaxNode, context: Context): void {
  // Arrow functions: const handler = (req, res) => { ... }
  // Skip anonymous functions, only extract named ones from variable declarations
  if (node.parent && node.parent.type === 'variable_declarator') {
    const nameNode = node.parent.childForFieldName('name');
    if (nameNode && nameNode.type === 'identifier') {
      const name = nodeText(nameNode, context);
      const exported = isExported(node.parent.parent?.parent || null);
      
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
      const body = findChildByType(node, 'statement_block');
      if (body) {
        walkNode(body, context);
      }
      
      // Exit function scope
      context.currentScope.pop();
    }
  }
}

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = isExported(node.parent);
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
  
  // Check for inheritance (extends)
  const heritage = node.childForFieldName('heritage');
  if (heritage) {
    for (let i = 0; i < heritage.childCount; i++) {
      const child = heritage.child(i);
      if (child && child.type === 'extends_clause') {
        const baseClass = findChildByType(child, 'identifier');
        if (baseClass) {
          const baseName = nodeText(baseClass, context);
          const baseId = resolveSymbol(baseName, context);
          if (baseId) {
            context.edges.push({
              source: symbolId,
              target: baseId,
              kind: 'extends',
              filePath: context.filePath,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }
  }
  
  // Enter class scope
  context.currentScope.push(name);
  
  // Process class body
  const body = findChildByType(node, 'class_body');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit class scope
  context.currentScope.pop();
}

function processMethodDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const scope = context.currentScope.length > 0 ? context.currentScope[context.currentScope.length - 1] : undefined;
  
  const symbolId = scope ? `${context.filePath}::${scope}.${name}` : `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: false,
    scope,
  });
  
  // Enter method scope
  context.currentScope.push(name);
  
  // Process method body
  const body = findChildByType(node, 'statement_block');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit method scope
  context.currentScope.pop();
}

function processVariableDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Extract variable declarations
  // Also handle CommonJS require() imports here
  
  const declarators = node.children.filter(c => c.type === 'variable_declarator');
  
  for (const declarator of declarators) {
    const nameNode = declarator.childForFieldName('name');
    const valueNode = declarator.childForFieldName('value');
    
    if (!nameNode) continue;
    
    // Check if this is a require() call
    if (valueNode && valueNode.type === 'call_expression') {
      const functionNode = valueNode.childForFieldName('function');
      if (functionNode && nodeText(functionNode, context) === 'require') {
        // This is a CommonJS require
        processRequireCall(declarator, valueNode, context);
        continue;
      }
    }
    
    // Regular variable declaration
    if (context.currentScope.length === 0) {
      // Only capture module-level variables
      const name = extractIdentifierName(nameNode, context);
      if (name) {
        const exported = isExported(node.parent);
        
        const symbolId = `${context.filePath}::${name}`;
        
        context.symbols.push({
          id: symbolId,
          name,
          kind: 'variable',
          filePath: context.filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
      }
    }
  }
}

function processRequireCall(declarator: Parser.SyntaxNode, callNode: Parser.SyntaxNode, context: Context): void {
  // const UserService = require('./services/userService');
  // const { validate } = require('./utils');
  
  const nameNode = declarator.childForFieldName('name');
  const args = callNode.childForFieldName('arguments');
  
  if (!args) return;
  
  // Get the module path from require('...')
  const stringArg = findChildByType(args, 'string');
  if (!stringArg) return;
  
  const modulePath = nodeText(stringArg, context).slice(1, -1); // Remove quotes
  
  // Resolve the module path
  const resolvedPath = resolveJavaScriptImport(modulePath, context.filePath, context.projectRoot);
  
  if (!resolvedPath) return; // External module, skip
  
  // Handle different patterns
  if (nameNode) {
    if (nameNode.type === 'identifier') {
      // const UserService = require('./services/userService');
      const name = nodeText(nameNode, context);
      const targetId = `${resolvedPath}::${name}`;
      const sourceId = `${context.filePath}::__file__`;
      
      context.imports.set(name, targetId);
      
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: 'imports',
        filePath: context.filePath,
        line: callNode.startPosition.row + 1,
      });
    } else if (nameNode.type === 'object_pattern') {
      // const { validate, sanitize } = require('./utils');
      const properties = nameNode.children.filter(c => c.type === 'pair_pattern' || c.type === 'shorthand_property_identifier_pattern');
      
      for (const prop of properties) {
        let importedName: string;
        
        if (prop.type === 'shorthand_property_identifier_pattern') {
          importedName = nodeText(prop, context);
        } else {
          const keyNode = prop.childForFieldName('key');
          if (keyNode) {
            importedName = nodeText(keyNode, context);
          } else {
            continue;
          }
        }
        
        const targetId = `${resolvedPath}::${importedName}`;
        const sourceId = `${context.filePath}::__file__`;
        
        context.imports.set(importedName, targetId);
        
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: 'imports',
          filePath: context.filePath,
          line: callNode.startPosition.row + 1,
        });
      }
    }
  }
}

function processImportStatement(node: Parser.SyntaxNode, context: Context): void {
  // ES module imports (same as TypeScript)
  const source = node.childForFieldName('source');
  if (!source) return;
  
  const importPath = nodeText(source, context).slice(1, -1); // Remove quotes
  const resolvedPath = resolveJavaScriptImport(importPath, context.filePath, context.projectRoot);
  
  if (!resolvedPath) return; // External module, skip
  
  // Get import clause
  const importClause = findChildByType(node, 'import_clause');
  if (!importClause) {
    // import './styles.css' - side effect only
    return;
  }
  
  // Handle named imports, default imports, namespace imports
  const namedImports = findChildByType(importClause, 'named_imports');
  const defaultImport = findChildByType(importClause, 'identifier');
  const namespaceImport = findChildByType(importClause, 'namespace_import');
  
  const sourceId = `${context.filePath}::__file__`;
  
  if (defaultImport) {
    // import UserService from './services/userService';
    const name = nodeText(defaultImport, context);
    const targetId = `${resolvedPath}::default`;
    
    context.imports.set(name, targetId);
    
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
  
  if (namedImports) {
    // import { validate, sanitize } from './utils';
    const specifiers = namedImports.children.filter(c => c.type === 'import_specifier');
    
    for (const specifier of specifiers) {
      const nameNode = specifier.childForFieldName('name');
      const aliasNode = specifier.childForFieldName('alias');
      
      if (nameNode) {
        const importedName = nodeText(nameNode, context);
        const localName = aliasNode ? nodeText(aliasNode, context) : importedName;
        const targetId = `${resolvedPath}::${importedName}`;
        
        context.imports.set(localName, targetId);
        
        context.edges.push({
          source: sourceId,
          target: targetId,
          kind: 'imports',
          filePath: context.filePath,
          line: node.startPosition.row + 1,
        });
      }
    }
  }
  
  if (namespaceImport) {
    // import * as utils from './utils';
    const aliasNode = findChildByType(namespaceImport, 'identifier');
    if (aliasNode) {
      const localName = nodeText(aliasNode, context);
      const targetId = `${resolvedPath}::*`;
      
      context.imports.set(localName, targetId);
      
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: 'imports',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
    }
  }
}

function processExportStatement(node: Parser.SyntaxNode, context: Context): void {
  // Handle module.exports and exports.x patterns
  // Also handle ES module exports
  
  const declaration = findChildByType(node, 'lexical_declaration') || 
                     findChildByType(node, 'variable_declaration') ||
                     findChildByType(node, 'function_declaration') ||
                     findChildByType(node, 'class_declaration');
  
  if (declaration) {
    // export const x = ...
    // export function f() {}
    // export class C {}
    processNode(declaration, context);
  }
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  let calleeName: string | null = null;
  
  if (functionNode.type === 'identifier') {
    calleeName = nodeText(functionNode, context);
  } else if (functionNode.type === 'member_expression') {
    const property = functionNode.childForFieldName('property');
    if (property) {
      calleeName = nodeText(property, context);
    }
  }
  
  if (!calleeName) return;
  
  // Skip common builtins
  const builtins = ['console', 'require', 'setTimeout', 'setInterval', 'parseInt', 'parseFloat', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean'];
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

function processNewExpression(node: Parser.SyntaxNode, context: Context): void {
  // new UserService()
  const constructorNode = findChildByType(node, 'identifier');
  if (!constructorNode) return;
  
  const className = nodeText(constructorNode, context);
  
  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;
  
  const classId = resolveSymbol(className, context);
  if (classId) {
    context.edges.push({
      source: callerId,
      target: classId,
      kind: 'calls',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

function processJSXElement(node: Parser.SyntaxNode, context: Context): void {
  // <UserAvatar /> or <UserAvatar>...</UserAvatar>
  // Only create edges for PascalCase component names (not HTML elements)
  
  let tagName: string | null = null;
  
  if (node.type === 'jsx_self_closing_element') {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      tagName = nodeText(nameNode, context);
    }
  } else if (node.type === 'jsx_element') {
    const openingElement = findChildByType(node, 'jsx_opening_element');
    if (openingElement) {
      const nameNode = openingElement.childForFieldName('name');
      if (nameNode) {
        tagName = nodeText(nameNode, context);
      }
    }
  }
  
  if (!tagName) return;
  
  // Only track PascalCase components (not HTML elements like div, span)
  if (!/^[A-Z]/.test(tagName)) return;
  
  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;
  
  const componentId = resolveSymbol(tagName, context);
  if (componentId) {
    context.edges.push({
      source: callerId,
      target: componentId,
      kind: 'references',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

// Helper functions

function resolveJavaScriptImport(importPath: string, currentFile: string, projectRoot: string): string | null {
  // Handle relative imports
  if (importPath.startsWith('.')) {
    const currentDir = dirname(join(projectRoot, currentFile));
    const targetPath = join(currentDir, importPath);
    
    // Try multiple extensions in order
    const extensions = ['.js', '.jsx', '.mjs', '.cjs'];
    const indexFiles = ['index.js', 'index.jsx', 'index.mjs'];
    
    // If import has extension, use it directly
    if (extname(importPath)) {
      const fullPath = targetPath;
      if (existsSync(fullPath)) {
        return fullPath.substring(projectRoot.length + 1);
      }
      return null;
    }
    
    // Try with extensions
    for (const ext of extensions) {
      const candidate = `${targetPath}${ext}`;
      if (existsSync(candidate)) {
        return candidate.substring(projectRoot.length + 1);
      }
    }
    
    // Try index files
    for (const indexFile of indexFiles) {
      const candidate = join(targetPath, indexFile);
      if (existsSync(candidate)) {
        return candidate.substring(projectRoot.length + 1);
      }
    }
    
    return null;
  }
  
  // Absolute import: check if it's in the project
  // Otherwise it's an external package
  return null;
}

function resolveSymbol(name: string, context: Context): string | null {
  // Check imports first
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }
  
  // Check current file symbols
  const currentFileId = `${context.filePath}::${name}`;
  const symbol = context.symbols.find(s => s.id === currentFileId);
  if (symbol) {
    return currentFileId;
  }
  
  // Check current scope (class methods, etc.)
  if (context.currentScope.length > 0) {
    const scopedId = `${context.filePath}::${context.currentScope.join('.')}.${name}`;
    const scopedSymbol = context.symbols.find(s => s.id === scopedId);
    if (scopedSymbol) {
      return scopedId;
    }
  }
  
  return null;
}

function isExported(node: Parser.SyntaxNode | null): boolean {
  if (!node) return false;
  
  // Check if node or any parent is an export_statement
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement') {
      return true;
    }
    current = current.parent;
  }
  
  return false;
}

function extractIdentifierName(node: Parser.SyntaxNode, context: Context): string | null {
  if (node.type === 'identifier') {
    return nodeText(node, context);
  } else if (node.type === 'object_pattern') {
    // Destructuring: { a, b } = ...
    // Just return the first identifier for simplicity
    const properties = node.children.filter(c => c.type === 'shorthand_property_identifier_pattern');
    if (properties.length > 0) {
      return nodeText(properties[0], context);
    }
  }
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

function nodeText(node: Parser.SyntaxNode, context: Context): string {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join('.')}`;
}

// Export as LanguageParser interface
export const javascriptParser: LanguageParser = {
  name: 'javascript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  parseFile: parseJavaScriptFile
};
