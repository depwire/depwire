import { canonicalPath, isWithinRoot } from '../graph/paths.js';
import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser, UnresolvedImport } from './types.js';
import { dirname, join, resolve } from 'path';
import { existsSync, statSync } from 'fs';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  currentClass: string | null;
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId or module path>
  unresolvedImports: UnresolvedImport[];
  typingAliases: Set<string>;
  typeCheckingNames: Set<string>;
}

export function parsePythonFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const parser = getParser('python');
  // Use explicit buffer size for large files (tree-sitter default is too small)
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    imports: new Map(),
    unresolvedImports: [],
    typingAliases: new Set(['typing']),
    typeCheckingNames: new Set(),
  };
  
  walkNode(tree.rootNode, context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
    ...(context.unresolvedImports.length ? { unresolvedImports: context.unresolvedImports } : {}),
  };
}

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  // Process current node
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

function processNode(node: Parser.SyntaxNode, context: Context): boolean {
  const type = node.type;
  
  switch (type) {
    case 'function_definition':
      processFunctionDefinition(node, context);
      return true;
    case 'class_definition':
      processClassDefinition(node, context);
      return true;
    case 'expression_statement':
      processExpressionStatement(node, context);
      return false;
    case 'import_statement':
      processImportStatement(node, context);
      return false;
    case 'import_from_statement':
      processImportFromStatement(node, context);
      return false;
    case 'decorated_definition':
      processDecoratedDefinition(node, context);
      return true;
    case 'call':
      processCallExpression(node, context);
      return false;
    default:
      return false;
  }
}

function processFunctionDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const isAsync = node.text.startsWith('async ');
  
  // Determine if this is a method (inside a class) or a function
  const kind = context.currentClass ? 'method' : 'function';
  const scope = context.currentClass || undefined;
  
  // Check if it's exported (module-level for Python)
  const exported = context.currentScope.length === 0 && !context.currentClass;
  
  const symbolId = `${context.filePath}::${scope ? scope + '.' : ''}${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
  
  // Enter function scope
  context.currentScope.push(name);
  
  // Process default parameter values (e.g. def f(x=foo()):) for call edges
  const parameters = findChildByType(node, 'parameters');
  if (parameters) {
    walkNode(parameters, context);
  }
  
  // Process function body for calls
  const body = findChildByType(node, 'block');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit function scope
  context.currentScope.pop();
}

function processClassDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;
  
  const name = nodeText(nameNode, context);
  const exported = context.currentScope.length === 0; // Module-level classes are exported
  const outerScope = context.currentClass || undefined;
  
  const symbolId = `${context.filePath}::${outerScope ? outerScope + '.' : ''}${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope: outerScope,
  });
  
  // Process base classes (inheritance)
  const argumentList = findChildByType(node, 'argument_list');
  if (argumentList) {
    for (let i = 0; i < argumentList.childCount; i++) {
      const arg = argumentList.child(i);
      if (arg && (arg.type === 'identifier' || arg.type === 'attribute')) {
        const baseName = nodeText(arg, context);
        
        // Try to resolve the base class
        const baseId = resolveSymbol(baseName, context);
        if (baseId) {
          context.edges.push({
            source: symbolId,
            target: baseId,
            kind: 'inherits',
            filePath: context.filePath,
            line: arg.startPosition.row + 1,
          });
        }
      }
    }
    // Walk the argument list itself so any call expressions inside base
    // class arguments (e.g. metaclass factories) still produce edges.
    walkNode(argumentList, context);
  }
  
  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);
  
  // Process class body
  const body = findChildByType(node, 'block');
  if (body) {
    walkNode(body, context);
  }
  
  // Exit class scope
  context.currentScope.pop();
  context.currentClass = oldClass;
}

function processExpressionStatement(node: Parser.SyntaxNode, context: Context): void {
  // Check if this is a module-level assignment (variable/constant)
  if (context.currentScope.length > 0) return; // Skip nested assignments
  
  const assignment = findChildByType(node, 'assignment');
  if (!assignment) return;
  
  const left = assignment.child(0);
  if (!left || left.type !== 'identifier') return;
  
  const name = nodeText(left, context);
  
  // Determine if it's a constant (UPPER_CASE convention)
  const isConstant = name === name.toUpperCase() && name.length > 1;
  const kind = isConstant ? 'constant' : 'variable';
  
  const symbolId = `${context.filePath}::${name}`;
  
  context.symbols.push({
    id: symbolId,
    name,
    kind,
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true, // Module-level variables are exported
  });
}

function processImportStatement(node: Parser.SyntaxNode, context: Context): void {
  // import os
  // import json as j
  
  const aliasedImport = findChildByType(node, 'aliased_import');
  const dottedName = findChildByType(node, 'dotted_name') ?? aliasedImport?.childForFieldName('name');
  const identifier = findChildByType(node, 'identifier');
  
  const moduleName = dottedName ? nodeText(dottedName, context) : (identifier ? nodeText(identifier, context) : null);
  if (!moduleName) return;
  
  // Check for alias: import json as j
  let importedName = moduleName;
  if (aliasedImport) {
    const asNode = aliasedImport.childForFieldName('alias');
    if (asNode) {
      importedName = nodeText(asNode, context);
    }
  }
  if (moduleName === 'typing' || moduleName === 'typing_extensions') {
    context.typingAliases.add(importedName);
    return;
  }
  
  // Check if this is a local module (in project) or external (stdlib/third-party)
  const resolvedPath = resolveImportPath(moduleName, context.filePath, context.projectRoot);
  
  if (resolvedPath) {
    // Local import - create symbol and edge
    const targetId = `${resolvedPath}::__module__`;
    const sourceId = `${context.filePath}::__file__`;
    
    context.imports.set(importedName, targetId);
    
    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
  // Else: external import, skip
}

function processImportFromStatement(node: Parser.SyntaxNode, context: Context): void {
  // from pathlib import Path
  // from typing import List, Dict
  // from .utils import helper
  // from ..models import User
  
  const moduleNode = node.childForFieldName('module_name');
  if (!moduleNode) return;
  
  const moduleName = nodeText(moduleNode, context);
  const typeOnly = isTypeCheckingImport(node, context);
  
  // Get all imported names
  const importedNames: Array<{ name: string; alias: string }> = [];
  const symbolNames = new Set<string>();
  
  // All named children after the module are import names. This also covers
  // parenthesized lists, where only examining the token after `import` loses
  // every name after the first.
  for (const child of node.namedChildren.slice(1)) {
    if (child.type === 'dotted_name' || child.type === 'identifier') {
      const name = nodeText(child, context);
      importedNames.push({ name, alias: name });
    }
    if (child.type === 'aliased_import') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) {
        importedNames.push({ name: nodeText(nameNode, context),
          alias: nodeText(child.childForFieldName('alias') ?? nameNode, context) });
      }
    }
  }
  // Keep the existing symbol-level capture boundary in this file-relationship
  // fix. Expanding named symbol capture needs a separate target-accuracy audit.
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === 'aliased_import') {
      const name = child.childForFieldName('name');
      if (name) symbolNames.add(nodeText(name, context));
    } else if ((child.type === 'dotted_name' || child.type === 'identifier')
      && node.child(i - 1)?.text === 'import') {
      symbolNames.add(nodeText(child, context));
    }
  }
  if (moduleName === 'typing' || moduleName === 'typing_extensions') {
    for (const imported of importedNames) {
      if (imported.name === 'TYPE_CHECKING') context.typeCheckingNames.add(imported.alias);
    }
    return;
  }
  
  // Resolve the module path
  const resolvedPath = resolveImportPath(moduleName, context.filePath, context.projectRoot);
  const submodulePaths = moduleName.endsWith('.')
    ? importedNames.map(imported => resolveImportPath(moduleName + imported.name, context.filePath, context.projectRoot))
    : [];
  if (!resolvedPath) for (let i = 0; i < submodulePaths.length; i++) {
    if (!submodulePaths[i]) context.unresolvedImports.push({ fromFile: context.filePath,
      specifier: moduleName + importedNames[i].name, reason: 'relative-not-found' });
  }
  if (moduleName.startsWith('.') && !resolvedPath && !submodulePaths.some(Boolean)) {
    if (submodulePaths.length) return;
    context.unresolvedImports.push({ fromFile: context.filePath, specifier: moduleName, reason: 'relative-not-found' });
    return;
  }
  
  if (resolvedPath || submodulePaths.some(Boolean)) {
    // Local import
    const sourceId = `${context.filePath}::__file__`;
    const edgeKind = typeOnly ? 'references-type' : 'imports';
    // The module relationship is proven by the local path, even when the
    // imported name is a re-export or an alias without a declaration here.
    const targetPaths = moduleName.endsWith('.')
      ? submodulePaths.map(path => path ?? resolvedPath).filter((path): path is string => !!path)
      : [resolvedPath!];
    if (moduleName.startsWith('.')) {
      for (const targetPath of new Set(targetPaths)) {
        context.edges.push({ source: sourceId, target: `${targetPath}::__file__`, kind: edgeKind,
          filePath: context.filePath, line: node.startPosition.row + 1,
          ...(typeOnly ? { typeOnlyImport: true } : {}), importSpecifier: moduleName });
      }
    }
    
    for (const imported of importedNames) {
      const importedName = imported.name;
      if (importedName === '*') continue; // Skip star imports for MVP
      if (!resolvedPath) continue;
      if (!symbolNames.has(importedName)) continue;
      
      const targetId = `${resolvedPath}::${importedName}`;
      
      context.imports.set(importedName, targetId);
      
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: edgeKind,
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        ...(typeOnly ? { typeOnlyImport: true } : {}),
      });
    }
  }
  // Else: external import, skip
}

function isTypeCheckingImport(node: Parser.SyntaxNode, context: Context): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== 'if_statement') continue;
    const condition = parent.childForFieldName('condition');
    if (!condition) continue;
    const expression = nodeText(condition, context);
    if (context.typeCheckingNames.has(expression)) return true;
    const match = /^([A-Za-z_]\w*)\.TYPE_CHECKING$/.exec(expression);
    if (match && context.typingAliases.has(match[1])) return true;
  }
  return false;
}

function processDecoratedDefinition(node: Parser.SyntaxNode, context: Context): void {
  // @decorator
  // def function(): ...
  
  // Get all decorators
  const decoratorNodes: Parser.SyntaxNode[] = [];
  const decorators: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'decorator') {
      decoratorNodes.push(child);
      const decoratorName = extractDecoratorName(child, context);
      if (decoratorName) {
        decorators.push(decoratorName);
      }
    }
  }
  
  // Walk each decorator node so call expressions inside decorator
  // arguments (e.g. @app.route('/x')) still produce 'calls' edges. The
  // generic recursion no longer reaches these once this node claims its
  // children, so we must do it explicitly.
  for (const decoratorNode of decoratorNodes) {
    walkNode(decoratorNode, context);
  }
  
  // Process the definition (function or class)
  const definition = findChildByType(node, 'function_definition') || findChildByType(node, 'class_definition');
  if (definition) {
    // First process the definition to create the symbol
    processNode(definition, context);
    
    // Then create decorator edges
    const nameNode = findChildByType(definition, 'identifier');
    if (nameNode) {
      const targetName = nodeText(nameNode, context);
      const targetScope = context.currentClass || undefined;
      const targetId = `${context.filePath}::${targetScope ? targetScope + '.' : ''}${targetName}`;
      
      for (const decoratorName of decorators) {
        const decoratorId = resolveSymbol(decoratorName, context);
        if (decoratorId) {
          context.edges.push({
            source: decoratorId,
            target: targetId,
            kind: 'decorates',
            filePath: context.filePath,
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  }
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  // function_name()
  // ClassName()
  // obj.method()
  
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  let calleeName: string;
  
  if (functionNode.type === 'identifier') {
    calleeName = nodeText(functionNode, context);
  } else if (functionNode.type === 'attribute') {
    // obj.method() → get "method"
    const attrNode = functionNode.childForFieldName('attribute');
    if (!attrNode) return;
    calleeName = nodeText(attrNode, context);
  } else {
    return;
  }
  
  // Skip Python builtins
  const builtins = ['print', 'len', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'range', 'enumerate', 'zip', 'map', 'filter', 'open', 'type', 'isinstance', 'hasattr', 'getattr', 'setattr'];
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

function resolveImportPath(moduleName: string, currentFile: string, projectRoot: string): string | null {
  // Handle relative imports
  if (moduleName.startsWith('.')) {
    const currentDir = dirname(join(projectRoot, currentFile));
    
    // Count leading dots
    let level = 0;
    while (moduleName[level] === '.') level++;
    
    // Go up 'level-1' directories
    let targetDir = currentDir;
    for (let i = 0; i < level - 1; i++) {
      targetDir = dirname(targetDir);
    }
    
    // Get the module name after the dots
    const relativeModule = moduleName.substring(level);
    
    if (relativeModule) {
      // from .utils import helper → utils.py or utils/__init__.py
      const modulePath = relativeModule.replace(/\./g, '/');
      const candidates = [
        join(targetDir, `${modulePath}.py`),
        join(targetDir, modulePath, '__init__.py'),
      ];
      
      for (const candidate of candidates) {
        if (isWithinRoot(resolve(candidate), resolve(projectRoot)) && existsSync(candidate) && statSync(candidate).isFile()) {
          // Return relative to project root
          return canonicalPath(candidate, projectRoot);
        }
      }
    } else {
      // from . import something → __init__.py in current directory
      const initPath = join(targetDir, '__init__.py');
      if (isWithinRoot(resolve(initPath), resolve(projectRoot)) && existsSync(initPath) && statSync(initPath).isFile()) {
        return canonicalPath(initPath, projectRoot);
      }
    }
    
    return null;
  }
  
  // Absolute import: check if it's in the project
  const modulePath = moduleName.replace(/\./g, '/');
  const candidates = [
    join(projectRoot, `${modulePath}.py`),
    join(projectRoot, modulePath, '__init__.py'),
  ];
  
  for (const candidate of candidates) {
    if (isWithinRoot(resolve(candidate), resolve(projectRoot)) && existsSync(candidate) && statSync(candidate).isFile()) {
      return canonicalPath(candidate, projectRoot);
    }
  }
  
  // Not found in project → external module
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
  
  // Check current class
  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    const classMethod = context.symbols.find(s => s.id === classMethodId);
    if (classMethod) {
      return classMethodId;
    }
  }
  
  return null;
}

function extractDecoratorName(node: Parser.SyntaxNode, context: Context): string | null {
  // @decorator_name or @module.decorator_name
  const identifier = findChildByType(node, 'identifier');
  const attribute = findChildByType(node, 'attribute');
  
  if (attribute) {
    return nodeText(attribute, context);
  } else if (identifier) {
    return nodeText(identifier, context);
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
export const pythonParser: LanguageParser = {
  name: 'python',
  extensions: ['.py'],
  parseFile: parsePythonFile
};
