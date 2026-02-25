import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, extname } from 'path';
import { existsSync } from 'fs';

const pyParser = new Parser();
pyParser.setLanguage(Python);

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  currentClass: string | null;
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId or module path>
}

export function parsePythonFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Use explicit buffer size for large files (tree-sitter default is too small)
  const tree = pyParser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });
  
  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    imports: new Map(),
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
    case 'function_definition':
      processFunctionDefinition(node, context);
      break;
    case 'class_definition':
      processClassDefinition(node, context);
      break;
    case 'expression_statement':
      processExpressionStatement(node, context);
      break;
    case 'import_statement':
      processImportStatement(node, context);
      break;
    case 'import_from_statement':
      processImportFromStatement(node, context);
      break;
    case 'decorated_definition':
      processDecoratedDefinition(node, context);
      break;
    case 'call':
      processCallExpression(node, context);
      break;
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
  
  const symbolId = `${context.filePath}::${name}`;
  
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
  
  const dottedName = findChildByType(node, 'dotted_name');
  const identifier = findChildByType(node, 'identifier');
  
  const moduleName = dottedName ? nodeText(dottedName, context) : (identifier ? nodeText(identifier, context) : null);
  if (!moduleName) return;
  
  // Check for alias: import json as j
  const aliasedImport = findChildByType(node, 'aliased_import');
  let importedName = moduleName;
  if (aliasedImport) {
    const asNode = aliasedImport.childForFieldName('alias');
    if (asNode) {
      importedName = nodeText(asNode, context);
    }
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
  
  // Get all imported names
  const importedNames: string[] = [];
  
  // Find all identifier nodes in the statement (after "import")
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    
    // Look for dotted_name or identifier after "import" keyword
    if (child.type === 'dotted_name' || child.type === 'identifier') {
      const prevSibling = node.child(i - 1);
      if (prevSibling && prevSibling.text === 'import') {
        importedNames.push(nodeText(child, context));
      }
    }
    
    // Handle aliased imports: from x import y as z
    if (child.type === 'aliased_import') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) {
        importedNames.push(nodeText(nameNode, context));
      }
    }
  }
  
  // Resolve the module path
  const resolvedPath = resolveImportPath(moduleName, context.filePath, context.projectRoot);
  
  if (resolvedPath) {
    // Local import
    const sourceId = `${context.filePath}::__file__`;
    
    for (const importedName of importedNames) {
      if (importedName === '*') continue; // Skip star imports for MVP
      
      const targetId = `${resolvedPath}::${importedName}`;
      
      context.imports.set(importedName, targetId);
      
      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: 'imports',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
    }
  }
  // Else: external import, skip
}

function processDecoratedDefinition(node: Parser.SyntaxNode, context: Context): void {
  // @decorator
  // def function(): ...
  
  // Get all decorators
  const decorators: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'decorator') {
      const decoratorName = extractDecoratorName(child, context);
      if (decoratorName) {
        decorators.push(decoratorName);
      }
    }
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
      const targetId = `${context.filePath}::${targetName}`;
      
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
        if (existsSync(candidate)) {
          // Return relative to project root
          return candidate.substring(projectRoot.length + 1);
        }
      }
    } else {
      // from . import something → __init__.py in current directory
      const initPath = join(targetDir, '__init__.py');
      if (existsSync(initPath)) {
        return initPath.substring(projectRoot.length + 1);
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
    if (existsSync(candidate)) {
      return candidate.substring(projectRoot.length + 1);
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
