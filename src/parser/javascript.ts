import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { resolveImportPath } from './resolver.js';
import { existsSync } from 'fs';
import { join, dirname, extname } from 'path';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  blockCounters: number[];
  declaredSymbolIds: Set<string>;
  pendingReferences: Array<{ source: string; name: string; kind: 'calls' | 'references'; line: number; scopeChain: string[] }>;
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId>
  isJSX: boolean;
}

export function parseJavaScriptFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const parser = getParser('javascript');
  // Use explicit buffer size for large files (tree-sitter default is too small)
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    blockCounters: [0],
    declaredSymbolIds: new Set(),
    pendingReferences: [],
    imports: new Map(),
    isJSX: filePath.endsWith('.jsx'),
  };
  
  walkNode(tree.rootNode, context);
  resolvePendingReferences(context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

const LEXICAL_SCOPE_TYPES = new Set([
  'statement_block', 'for_statement', 'for_in_statement',
  'switch_statement', 'class_static_block',
]);

function walkNode(node: Parser.SyntaxNode, context: Context, namedScopeBody = false): void {
  if (!namedScopeBody && LEXICAL_SCOPE_TYPES.has(node.type)) {
    const counterIndex = context.blockCounters.length - 1;
    const blockIndex = context.blockCounters[counterIndex]++;
    context.currentScope.push(`$b${blockIndex}`);
    context.blockCounters.push(0);
    walkNodeContents(node, context);
    context.blockCounters.pop();
    context.currentScope.pop();
    return;
  }
  walkNodeContents(node, context);
}

function walkNodeContents(node: Parser.SyntaxNode, context: Context): void {
  const handledChildren = processNode(node, context);
  if (handledChildren) return;
  
  // Recursively process children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function withNamedScopeBody(context: Context, visit: () => void): void {
  context.blockCounters.push(0);
  try { visit(); } finally { context.blockCounters.pop(); }
}

function processNode(node: Parser.SyntaxNode, context: Context): boolean {
  const type = node.type;
  
  switch (type) {
    case 'function_declaration':
      processFunctionDeclaration(node, context);
      return true;
    case 'class_declaration':
      processClassDeclaration(node, context);
      return true;
    case 'method_definition':
      processMethodDefinition(node, context);
      return true;
    case 'lexical_declaration':
    case 'variable_declaration':
      processVariableDeclaration(node, context);
      return true;
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
  return false;
}

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = isExported(node.parent);
  
  const scope = context.currentScope.join('.');
  const symbolId = `${context.filePath}::${scope ? `${scope}.` : ''}${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    ...(scope ? { scope } : {}),
  });
  context.declaredSymbolIds.add(symbolId);
  
  // Enter function scope
  context.currentScope.push(name);
  withNamedScopeBody(context, () => {
    const body = findChildByType(node, 'statement_block');
    if (body) walkNode(body, context, true);
  });
  
  // Exit function scope
  context.currentScope.pop();
}

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = isExported(node.parent);
  
  const parentScope = context.currentScope.join('.');
  const symbolId = `${context.filePath}::${parentScope ? `${parentScope}.` : ''}${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    ...(parentScope ? { scope: parentScope } : {}),
  });
  context.declaredSymbolIds.add(symbolId);
  
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
              kind: 'inherits',
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
  context.blockCounters.push(0);
  
  // Process class body
  const body = findChildByType(node, 'class_body');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit class scope
  context.blockCounters.pop();
  context.currentScope.pop();
}

function processMethodDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const scope = context.currentScope.length > 0 ? context.currentScope.join('.') : undefined;
  
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
  context.declaredSymbolIds.add(symbolId);
  
  // Enter method scope
  context.currentScope.push(name);
  withNamedScopeBody(context, () => {
    const body = findChildByType(node, 'statement_block');
    if (body) walkNode(body, context, true);
  });
  
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
    
    const name = extractIdentifierName(nameNode, context);
    if (!name) continue;
    const exported = isExported(node.parent);
    const scope = context.currentScope.join('.');
    const callable = valueNode?.type === 'arrow_function'
      || valueNode?.type === 'function_expression'
      || valueNode?.type === 'generator_function';
    const symbolId = `${context.filePath}::${scope ? `${scope}.` : ''}${name}`;

    context.symbols.push({
      id: symbolId,
      name,
      kind: callable ? 'function' : 'variable',
      filePath: context.filePath,
      startLine: declarator.startPosition.row + 1,
      endLine: declarator.endPosition.row + 1,
      exported,
      ...(scope ? { scope } : {}),
    });
    context.declaredSymbolIds.add(symbolId);

    if (valueNode) {
      if (callable) {
        context.currentScope.push(name);
        withNamedScopeBody(context, () => {
          const body = valueNode.childForFieldName('body') ?? valueNode.lastNamedChild;
          if (body) walkNode(body, context, body.type === 'statement_block');
        });
        context.currentScope.pop();
      } else {
        walkNode(valueNode, context);
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
  
  // The generic walker visits this declaration exactly once. Earlier this
  // handler processed it eagerly and then recursion processed it again.
  void declaration;
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
  
  context.pendingReferences.push({
    source: callerId,
    name: calleeName,
    kind: 'calls',
    line: node.startPosition.row + 1,
    scopeChain: [...context.currentScope],
  });
}

function processNewExpression(node: Parser.SyntaxNode, context: Context): void {
  // new UserService()
  const constructorNode = findChildByType(node, 'identifier');
  if (!constructorNode) return;
  
  const className = nodeText(constructorNode, context);
  
  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;
  
  context.pendingReferences.push({
    source: callerId,
    name: className,
    kind: 'calls',
    line: node.startPosition.row + 1,
    scopeChain: [...context.currentScope],
  });
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
  
  context.pendingReferences.push({
    source: callerId,
    name: tagName,
    kind: 'references',
    line: node.startPosition.row + 1,
    scopeChain: [...context.currentScope],
  });
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
  return resolveSymbolAt(name, context.currentScope, context);
}

function resolveSymbolAt(name: string, scopeChain: string[], context: Context): string | null {
  for (let i = scopeChain.length; i >= 0; i--) {
    const prefix = scopeChain.slice(0, i).join('.');
    const candidate = `${context.filePath}::${prefix ? `${prefix}.` : ''}${name}`;
    if (context.declaredSymbolIds.has(candidate)) return candidate;
  }
  return context.imports.get(name) ?? null;
}

function resolvePendingReferences(context: Context): void {
  for (const pending of context.pendingReferences) {
    const target = resolveSymbolAt(pending.name, pending.scopeChain, context);
    if (!target) continue;
    context.edges.push({
      source: pending.source,
      target,
      kind: pending.kind,
      filePath: context.filePath,
      line: pending.line,
    });
  }
  context.pendingReferences = [];
}

function isExported(node: Parser.SyntaxNode | null): boolean {
  if (!node) return false;
  
  // Check if node or any parent is an export_statement
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement') {
      return true;
    }
    if (
      current.type === 'statement_block'
      || current.type === 'class_body'
      || current.type === 'function_declaration'
      || current.type === 'arrow_function'
      || current.type === 'function_expression'
    ) return false;
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
  for (let i = context.currentScope.length; i >= 1; i--) {
    const candidate = `${context.filePath}::${context.currentScope.slice(0, i).join('.')}`;
    if (context.declaredSymbolIds.has(candidate)) return candidate;
  }
  return null;
}

// Export as LanguageParser interface
export const javascriptParser: LanguageParser = {
  name: 'javascript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  parseFile: parseJavaScriptFile
};
