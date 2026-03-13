import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  currentModule: string[];
}

export function parseRustFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const parser = getParser('rust');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentModule: [],
  };
  
  // Walk the AST
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
    case 'function_item':
      processFunctionItem(node, context);
      break;
    case 'struct_item':
      processStructItem(node, context);
      break;
    case 'enum_item':
      processEnumItem(node, context);
      break;
    case 'trait_item':
      processTraitItem(node, context);
      break;
    case 'impl_item':
      processImplItem(node, context);
      break;
    case 'const_item':
      processConstItem(node, context);
      break;
    case 'type_item':
      processTypeItem(node, context);
      break;
    case 'use_declaration':
      processUseDeclaration(node, context);
      break;
    case 'mod_item':
      processModItem(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
  }
}

function processFunctionItem(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = hasVisibility(node, 'pub');
  
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

function processStructItem(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = hasVisibility(node, 'pub');
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class', // Consistent with other parsers
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

function processEnumItem(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = hasVisibility(node, 'pub');
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

function processTraitItem(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = hasVisibility(node, 'pub');
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'interface',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

function processImplItem(node: Parser.SyntaxNode, context: Context): void {
  // Extract the type being implemented
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return;
  
  const typeName = extractTypeName(typeNode, context);
  if (!typeName) return;
  
  // Process all methods in the impl block
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'function_item') {
      const nameNode = child.childForFieldName('name');
      if (!nameNode) continue;
      
      const name = nodeText(nameNode, context);
      const exported = hasVisibility(child, 'pub');
      
      const symbolId = `${context.filePath}::${typeName}.${name}`;
      
      context.symbols.push({
        id: symbolId,
        name,
        kind: 'method',
        filePath: context.filePath,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
        exported,
        scope: typeName,
      });
      
      // Enter method scope
      context.currentScope.push(`${typeName}.${name}`);
      
      // Process method body
      const body = child.childForFieldName('body');
      if (body) {
        walkNode(body, context);
      }
      
      // Exit method scope
      context.currentScope.pop();
    }
  }
}

function processConstItem(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = hasVisibility(node, 'pub');
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'constant',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

function processTypeItem(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = hasVisibility(node, 'pub');
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

function processUseDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // The use declaration in Rust tree-sitter has a direct scoped_identifier or identifier child
  // Find the actual path - could be scoped_identifier, identifier, or scoped_use_list
  let pathNode = findChildByType(node, 'scoped_identifier');
  if (!pathNode) {
    pathNode = findChildByType(node, 'identifier');
  }
  if (!pathNode) {
    pathNode = findChildByType(node, 'use_as_clause');
    if (pathNode) {
      // use xxx as yyy - get the xxx part
      pathNode = pathNode.childForFieldName('path');
    }
  }
  
  if (!pathNode) {
    return;
  }
  
  // Get the full path from the use declaration
  let pathText = nodeText(pathNode, context);
  
  // Only process local imports (crate::, super::, self::)
  if (!pathText.startsWith('crate::') && !pathText.startsWith('super::') && !pathText.startsWith('self::')) {
    // Skip external crates and std library
    return;
  }
  
  // Extract the module path (remove the last segment which is usually the symbol name)
  // e.g., crate::services::UserService -> crate::services
  const segments = pathText.split('::');
  if (segments.length > 1) {
    // Remove the last segment (symbol name) to get the module path
    segments.pop();
    pathText = segments.join('::');
  }
  
  // Resolve the import path to a file
  const resolvedFiles = resolveRustImport(pathText, context);
  
  if (resolvedFiles.length === 0) return;
  
  // Create edges for each resolved file
  const sourceId = `${context.filePath}::__file__`;
  
  for (const targetFile of resolvedFiles) {
    const targetId = `${targetFile}::__file__`;
    
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

function processModItem(node: Parser.SyntaxNode, context: Context): void {
  // Handle: mod name; or mod name { ... }
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  
  // Check if this is a module declaration (no body)
  const body = node.childForFieldName('body');
  if (!body) {
    // This is a module declaration: mod name;
    // Create an edge to the module file
    const resolvedFiles = resolveModuleFile(name, context);
    
    if (resolvedFiles.length > 0) {
      const sourceId = `${context.filePath}::__file__`;
      
      for (const targetFile of resolvedFiles) {
        const targetId = `${targetFile}::__file__`;
        
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
  
  const exported = hasVisibility(node, 'pub');
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'module',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
  });
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  // Extract function being called
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  const calleeName = extractCalleeNameFromNode(functionNode, context);
  if (!calleeName) return;
  
  // Skip built-in functions and macros
  const builtins = ['println!', 'print!', 'eprintln!', 'eprint!', 'format!', 'panic!', 'assert!', 'assert_eq!', 'assert_ne!', 'vec!'];
  if (builtins.includes(calleeName)) return;
  
  // Get the caller (current function/method)
  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;
  
  // Resolve the callee
  const calleeId = resolveSymbol(calleeName, context);
  if (!calleeId) return;
  
  context.edges.push({
    source: callerId,
    target: calleeId,
    kind: 'calls',
    filePath: context.filePath,
    line: node.startPosition.row + 1,
  });
}

function resolveRustImport(importPath: string, context: Context): string[] {
  // Handle crate::, super::, self::
  
  if (importPath.startsWith('crate::')) {
    // Absolute path from crate root
    const relativePath = importPath.replace('crate::', '').replace(/::/g, '/');
    const possibleFiles = [
      join(context.projectRoot, 'src', `${relativePath}.rs`),
      join(context.projectRoot, 'src', relativePath, 'mod.rs'),
    ];
    
    // Convert absolute paths to relative from project root
    return possibleFiles
      .filter(f => existsSync(f))
      .map(f => relative(context.projectRoot, f));
  }
  
  if (importPath.startsWith('super::')) {
    // Relative path (parent directory)
    const currentFileAbs = join(context.projectRoot, context.filePath);
    const currentDir = dirname(currentFileAbs);
    const parentDir = dirname(currentDir);
    const relativePath = importPath.replace('super::', '').replace(/::/g, '/');
    
    const possibleFiles = [
      join(parentDir, `${relativePath}.rs`),
      join(parentDir, relativePath, 'mod.rs'),
    ];
    
    return possibleFiles
      .filter(f => existsSync(f))
      .map(f => relative(context.projectRoot, f));
  }
  
  if (importPath.startsWith('self::')) {
    // Relative path (current directory)
    const currentFileAbs = join(context.projectRoot, context.filePath);
    const currentDir = dirname(currentFileAbs);
    const relativePath = importPath.replace('self::', '').replace(/::/g, '/');
    
    const possibleFiles = [
      join(currentDir, `${relativePath}.rs`),
      join(currentDir, relativePath, 'mod.rs'),
    ];
    
    return possibleFiles
      .filter(f => existsSync(f))
      .map(f => relative(context.projectRoot, f));
  }
  
  return [];
}

function resolveModuleFile(moduleName: string, context: Context): string[] {
  // A module declaration can resolve to:
  // 1. module_name.rs in the same directory
  // 2. module_name/mod.rs in the same directory
  
  const currentFileAbs = join(context.projectRoot, context.filePath);
  const currentDir = dirname(currentFileAbs);
  
  const possibleFiles = [
    join(currentDir, `${moduleName}.rs`),
    join(currentDir, moduleName, 'mod.rs'),
  ];
  
  return possibleFiles
    .filter(f => existsSync(f))
    .map(f => relative(context.projectRoot, f));
}

function hasVisibility(node: Parser.SyntaxNode, visibility: string): boolean {
  // Check if node has a visibility_modifier child with the given visibility
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'visibility_modifier') {
      const text = nodeText(child, { sourceCode: node.text } as Context);
      return text === visibility;
    }
  }
  return false;
}

function extractTypeName(typeNode: Parser.SyntaxNode, context: Context): string | null {
  // Extract the type name from various type nodes
  if (typeNode.type === 'type_identifier') {
    return nodeText(typeNode, context);
  }
  
  if (typeNode.type === 'generic_type') {
    const typeId = findChildByType(typeNode, 'type_identifier');
    if (typeId) {
      return nodeText(typeId, context);
    }
  }
  
  // For other complex types, try to find a type_identifier
  for (let i = 0; i < typeNode.childCount; i++) {
    const child = typeNode.child(i);
    if (child && child.type === 'type_identifier') {
      return nodeText(child, context);
    }
  }
  
  return null;
}

function extractCalleeNameFromNode(functionNode: Parser.SyntaxNode, context: Context): string | null {
  if (functionNode.type === 'identifier') {
    return nodeText(functionNode, context);
  }
  
  if (functionNode.type === 'field_expression') {
    // Method call: obj.method()
    const field = functionNode.childForFieldName('field');
    if (field) {
      return nodeText(field, context);
    }
  }
  
  if (functionNode.type === 'scoped_identifier') {
    // Module path: module::function
    const name = functionNode.childForFieldName('name');
    if (name) {
      return nodeText(name, context);
    }
  }
  
  return null;
}

function resolveSymbol(name: string, context: Context): string | null {
  // Try to find the symbol in the current file
  const currentFileId = context.filePath;
  const symbol = context.symbols.find(s => s.name === name && s.filePath === currentFileId);
  
  if (symbol) {
    return symbol.id;
  }
  
  // Try with current scope
  if (context.currentScope.length > 0) {
    for (let i = context.currentScope.length - 1; i >= 0; i--) {
      const scopedId = `${currentFileId}::${context.currentScope[i]}.${name}`;
      const scopedSymbol = context.symbols.find(s => s.id === scopedId);
      if (scopedSymbol) {
        return scopedId;
      }
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
  return context.sourceCode.slice(node.startIndex, node.endIndex);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope.join('.')}`;
}

export const rustParser: LanguageParser = {
  language: 'rust',
  extensions: ['.rs'],
  parseFile: parseRustFile,
};
