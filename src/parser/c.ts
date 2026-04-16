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
}

export function parseCFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const parser = getParser('c');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
  };
  
  walkNode(tree.rootNode, context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  processNode(node, context);
  
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
    case 'function_definition':
      processFunctionDefinition(node, context);
      break;
    case 'struct_specifier':
      processStructSpecifier(node, context);
      break;
    case 'enum_specifier':
      processEnumSpecifier(node, context);
      break;
    case 'type_definition':
      processTypeDefinition(node, context);
      break;
    case 'declaration':
      processDeclaration(node, context);
      break;
    case 'preproc_def':
    case 'preproc_function_def':
      processMacroDefinition(node, context);
      break;
    case 'preproc_include':
      processIncludeDirective(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
  }
}

function processFunctionDefinition(node: Parser.SyntaxNode, context: Context): void {
  const declarator = node.childForFieldName('declarator');
  if (!declarator) return;
  
  const nameNode = extractFunctionName(declarator);
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = !hasStorageClass(node, 'static', context);
  
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
  
  context.currentScope.push(name);
  
  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }
  
  context.currentScope.pop();
}

function processStructSpecifier(node: Parser.SyntaxNode, context: Context): void {
  const parent = node.parent;
  let name: string | null = null;
  
  if (parent && parent.type === 'type_definition') {
    const typedefName = parent.childForFieldName('declarator');
    if (typedefName) {
      name = extractIdentifierFromDeclarator(typedefName, context);
    }
  }
  
  if (!name) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      name = nodeText(nameNode, context);
    }
  }
  
  if (!name) return;
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

function processEnumSpecifier(node: Parser.SyntaxNode, context: Context): void {
  const parent = node.parent;
  let name: string | null = null;
  
  if (parent && parent.type === 'type_definition') {
    const typedefName = parent.childForFieldName('declarator');
    if (typedefName) {
      name = extractIdentifierFromDeclarator(typedefName, context);
    }
  }
  
  if (!name) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      name = nodeText(nameNode, context);
    }
  }
  
  if (!name) return;
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

function processTypeDefinition(node: Parser.SyntaxNode, context: Context): void {
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return;
  
  if (typeNode.type === 'struct_specifier' || typeNode.type === 'enum_specifier') {
    return;
  }
  
  const declarator = node.childForFieldName('declarator');
  if (!declarator) return;
  
  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

function processDeclaration(node: Parser.SyntaxNode, context: Context): void {
  if (context.currentScope.length > 0) {
    return;
  }
  
  const parent = node.parent;
  if (!parent || parent.type !== 'translation_unit') {
    return;
  }
  
  const hasStatic = hasStorageClass(node, 'static', context);
  const declarator = node.childForFieldName('declarator');
  
  if (!declarator) return;
  
  const name = extractIdentifierFromDeclarator(declarator, context);
  if (!name) return;
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'variable',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: !hasStatic,
  });
}

function processMacroDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const kind = node.type === 'preproc_function_def' ? 'function' : 'constant';
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });
}

function processIncludeDirective(node: Parser.SyntaxNode, context: Context): void {
  const pathNode = node.childForFieldName('path');
  if (!pathNode) return;
  
  const pathText = nodeText(pathNode, context);
  const isLocalInclude = pathText.startsWith('"') && pathText.endsWith('"');
  
  if (!isLocalInclude) {
    return;
  }
  
  const includePath = pathText.slice(1, -1);
  const resolvedFiles = resolveIncludePath(includePath, context.filePath, context.projectRoot);
  
  if (resolvedFiles.length === 0) return;
  
  const sourceId = `${context.filePath}::__file__`;
  
  for (const targetPath of resolvedFiles) {
    const targetId = `${targetPath}::__file__`;
    
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  if (context.currentScope.length === 0) return;
  
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  const calleeName = nodeText(functionNode, context);
  
  const builtins = new Set(['printf', 'scanf', 'malloc', 'free', 'memcpy', 'strlen', 'strcmp', 'strcpy', 'strcat']);
  if (builtins.has(calleeName)) return;
  
  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;
  
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

function resolveIncludePath(includePath: string, currentFile: string, projectRoot: string): string[] {
  const currentFileAbs = join(projectRoot, currentFile);
  const currentDir = dirname(currentFileAbs);
  
  const possibleFiles = [
    join(currentDir, includePath),
    join(projectRoot, includePath),
  ];
  
  const resolvedFiles: string[] = [];
  
  for (const absPath of possibleFiles) {
    if (existsSync(absPath)) {
      const relPath = relative(projectRoot, absPath);
      resolvedFiles.push(relPath);
    }
  }
  
  return resolvedFiles;
}

function hasStorageClass(node: Parser.SyntaxNode, className: string, context: Context): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'storage_class_specifier') {
      const text = nodeText(child, context);
      if (text === className) {
        return true;
      }
    }
  }
  
  // Also check parent nodes since static might be outside function_definition
  let parent = node.parent;
  while (parent) {
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child && child.type === 'storage_class_specifier') {
        const text = nodeText(child, context);
        if (text === className) {
          return true;
        }
      }
    }
    parent = parent.parent;
  }
  
  return false;
}

function extractFunctionName(declarator: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (declarator.type === 'identifier') {
    return declarator;
  }
  
  if (declarator.type === 'function_declarator') {
    const innerDeclarator = declarator.childForFieldName('declarator');
    if (innerDeclarator) {
      return extractFunctionName(innerDeclarator);
    }
  }
  
  if (declarator.type === 'pointer_declarator') {
    const innerDeclarator = declarator.childForFieldName('declarator');
    if (innerDeclarator) {
      return extractFunctionName(innerDeclarator);
    }
  }
  
  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child && child.type === 'identifier') {
      return child;
    }
  }
  
  return null;
}

function extractIdentifierFromDeclarator(declarator: Parser.SyntaxNode, context: Context): string | null {
  if (declarator.type === 'identifier') {
    return nodeText(declarator, context);
  }
  
  if (declarator.type === 'type_identifier') {
    return nodeText(declarator, context);
  }
  
  const identifierNode = findChildByType(declarator, 'identifier');
  if (identifierNode) {
    return nodeText(identifierNode, context);
  }
  
  const typeIdNode = findChildByType(declarator, 'type_identifier');
  if (typeIdNode) {
    return nodeText(typeIdNode, context);
  }
  
  for (let i = 0; i < declarator.childCount; i++) {
    const child = declarator.child(i);
    if (child) {
      const name = extractIdentifierFromDeclarator(child, context);
      if (name) return name;
    }
  }
  
  return null;
}

function resolveSymbol(name: string, context: Context): string | null {
  const currentFileId = `${context.filePath}::__file__`;
  const symbol = context.symbols.find(
    s => s.name === name && (s.filePath === context.filePath || s.exported)
  );
  
  if (symbol) {
    return symbol.id;
  }
  
  for (let i = context.currentScope.length - 1; i >= 0; i--) {
    const scopedId = `${context.filePath}::${context.currentScope.slice(0, i + 1).join('::')}::${name}`;
    const scopedSymbol = context.symbols.find(s => s.id === scopedId);
    if (scopedSymbol) {
      return scopedSymbol.id;
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
  return `${context.filePath}::${context.currentScope.join('::')}`;
}

export const cParser: LanguageParser = {
  name: 'c',
  extensions: ['.c'],
  parseFile: parseCFile,
};
