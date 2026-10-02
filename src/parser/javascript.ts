import { canonicalPath } from '../graph/paths.js';
import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser, UnresolvedCall } from './types.js';
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
  pendingReferences: Array<{ source: string; name: string; kind: 'calls' | 'references'; line: number; scopeChain: string[]; receiverClass?: string }>;
  imports: Map<string, string>; // Map<importedName, resolvedSymbolId>
  isJSX: boolean;
  unresolvedCalls: UnresolvedCall[];
  unresolvedExports: Array<{ fromFile: string; line: number; expression: string; reason: string }>;
  exportTargets: Array<{ name: string; line: number }>;
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
    unresolvedCalls: [],
    unresolvedExports: [],
    exportTargets: [],
  };
  
  walkNode(tree.rootNode, context);
  for (const target of context.exportTargets) {
    const symbol = context.symbols.find(s => s.id === `${context.filePath}::${target.name}`);
    if (symbol) symbol.exported = true;
    else context.unresolvedExports.push({ fromFile: context.filePath, line: target.line, expression: target.name, reason: 'no-local-target' });
  }
  resolvePendingReferences(context);
  
  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
    ...(context.unresolvedCalls.length ? { unresolvedCalls: context.unresolvedCalls } : {}),
    ...(context.unresolvedExports.length ? { unresolvedExports: context.unresolvedExports } : {}),
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
    case 'assignment_expression':
      processCommonJSAssignment(node, context);
      if (processAssignedFunction(node, context)) return true;
      break;
    case 'call_expression':
      processCallExpression(node, context);
      processCommonJSObjectAssign(node, context);
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
    const assignedToExports = valueNode?.type === 'assignment_expression'
      && !hasConditionalAncestor(valueNode)
      && containsModuleExportsWrite(valueNode, context);

    context.symbols.push({
      id: symbolId,
      name,
      kind: callable ? 'function' : 'variable',
      filePath: context.filePath,
      startLine: declarator.startPosition.row + 1,
      endLine: declarator.endPosition.row + 1,
      exported: exported || !!assignedToExports,
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
  // Declarations are visited by the walker; a local export list needs a
  // separate flag because its declaration may precede the export statement.
  if (node.childForFieldName('source')) return;
  const clause = findChildByType(node, 'export_clause');
  if (!clause) return;
  for (const specifier of clause.namedChildren) {
    if (specifier.type !== 'export_specifier') continue;
    const name = specifier.childForFieldName('name');
    if (name) context.exportTargets.push({ name: nodeText(name, context), line: specifier.startPosition.row + 1 });
  }
}

function isModuleExports(node: Parser.SyntaxNode, context: Context): boolean {
  if (node.type !== 'member_expression') return false;
  const object = node.childForFieldName('object');
  const property = node.childForFieldName('property');
  return !!object && !!property && nodeText(object, context) === 'module' && nodeText(property, context) === 'exports';
}

function commonJSExportTarget(node: Parser.SyntaxNode, context: Context): { kind: 'direct' | 'property' | 'computed'; name?: string } | null {
  if (isModuleExports(node, context)) return { kind: 'direct' };
  if (node.type === 'member_expression') {
    const object = node.childForFieldName('object');
    const property = node.childForFieldName('property');
    if (object && property && (isModuleExports(object, context) || nodeText(object, context) === 'exports')) {
      return { kind: 'property', name: nodeText(property, context) };
    }
  }
  if (node.type === 'subscript_expression') {
    const object = node.childForFieldName('object');
    if (object && (isModuleExports(object, context) || nodeText(object, context) === 'exports')) return { kind: 'computed' };
  }
  return null;
}

function containsModuleExportsWrite(node: Parser.SyntaxNode, context: Context): boolean {
  if (node.type !== 'assignment_expression') return false;
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  return !!left && (isModuleExports(left, context) || (!!right && containsModuleExportsWrite(right, context)));
}

function hasConditionalAncestor(node: Parser.SyntaxNode): boolean {
  let ancestor: Parser.SyntaxNode | null = node.parent;
  while (ancestor && ancestor.type !== 'program' && ancestor.type !== 'function_declaration' && ancestor.type !== 'function_expression') {
    if (ancestor.type === 'if_statement' || ancestor.type === 'ternary_expression') return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function exportValue(node: Parser.SyntaxNode, context: Context, line: number): void {
  if (node.type === 'identifier') {
    context.exportTargets.push({ name: nodeText(node, context), line });
  } else if (node.type === 'object') {
    for (const property of node.namedChildren) {
      if (property.type === 'shorthand_property_identifier') {
        context.exportTargets.push({ name: nodeText(property, context), line: property.startPosition.row + 1 });
      } else if (property.type === 'pair') {
        const key = property.childForFieldName('key');
        const value = property.childForFieldName('value');
        if (value && key && ['function_expression', 'arrow_function'].includes(value.type)) {
          const name = nodeText(key, context).replace(/^['"]|['"]$/g, '');
          if (/^[A-Za-z_$][\w$]*$/.test(name)) {
            const id = `${context.filePath}::${name}`;
            if (!context.declaredSymbolIds.has(id)) {
              context.symbols.push({ id, name, kind: 'function', filePath: context.filePath,
                startLine: value.startPosition.row + 1, endLine: value.endPosition.row + 1, exported: true });
              context.declaredSymbolIds.add(id);
            }
          }
        } else if (value) exportValue(value, context, property.startPosition.row + 1);
      } else {
        context.unresolvedExports.push({ fromFile: context.filePath, line: property.startPosition.row + 1, expression: nodeText(property, context), reason: 'unsupported-property' });
      }
    }
  } else if (node.type === 'call_expression' && nodeText(node.childForFieldName('function')!, context) === 'require') {
    const arg = node.childForFieldName('arguments')?.namedChildren[0];
    if (arg?.type === 'string') {
      const path = resolveJavaScriptImport(nodeText(arg, context).slice(1, -1), context.filePath, context.projectRoot);
      if (path) context.edges.push({ source: `${context.filePath}::__file__`, target: `${path}::__file__`, kind: 'imports', filePath: context.filePath, line });
      else context.unresolvedExports.push({ fromFile: context.filePath, line, expression: nodeText(node, context), reason: 'require-not-local' });
    } else context.unresolvedExports.push({ fromFile: context.filePath, line, expression: nodeText(node, context), reason: 'computed-require' });
  } else {
    context.unresolvedExports.push({ fromFile: context.filePath, line, expression: nodeText(node, context), reason: 'no-provable-symbol' });
  }
}

function processCommonJSAssignment(node: Parser.SyntaxNode, context: Context): void {
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  if (!left || !right) return;
  const line = node.startPosition.row + 1;
  const target = commonJSExportTarget(left, context);
  if (!target) return;
  const conditional = right.type === 'ternary_expression' || hasConditionalAncestor(node);
  if (target.kind === 'computed' || conditional) {
    context.unresolvedExports.push({ fromFile: context.filePath, line, expression: nodeText(node, context), reason: target.kind === 'computed' ? 'computed-property' : 'conditional-assignment' });
    return;
  }
  if (right.type !== 'function_expression' && right.type !== 'arrow_function') exportValue(right, context, line);
}

function processAssignedFunction(node: Parser.SyntaxNode, context: Context): boolean {
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  if (!left || !right || !['function_expression', 'arrow_function'].includes(right.type)) return false;
  const lhs = nodeText(left, context).replace('.prototype.', '.');
  const named = right.childForFieldName('name');
  const exportTarget = commonJSExportTarget(left, context);
  const exported = exportTarget?.kind === 'direct' || exportTarget?.kind === 'property';
  if (!exported || hasConditionalAncestor(node)) return false;
  const name = exportTarget?.kind === 'direct' ? (named ? nodeText(named, context) : 'default')
    : exportTarget?.name ?? lhs;
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name)) return false;
  const id = `${context.filePath}::${name}`;
  if (!context.declaredSymbolIds.has(id)) {
    context.symbols.push({ id, name: name.split('.').at(-1)!, kind: 'function', filePath: context.filePath,
      startLine: right.startPosition.row + 1, endLine: right.endPosition.row + 1,
      exported, ...(name.includes('.') ? { scope: name.slice(0, name.lastIndexOf('.')) } : {}) });
    context.declaredSymbolIds.add(id);
  }
  context.currentScope.push(name);
  withNamedScopeBody(context, () => {
    const body = right.childForFieldName('body') ?? right.lastNamedChild;
    if (body) walkNode(body, context, body.type === 'statement_block');
  });
  context.currentScope.pop();
  return true;
}

function processCommonJSObjectAssign(node: Parser.SyntaxNode, context: Context): void {
  const fn = node.childForFieldName('function');
  const object = fn?.childForFieldName('object');
  const property = fn?.childForFieldName('property');
  if (fn?.type !== 'member_expression' || !object || !property || nodeText(object, context) !== 'Object' || nodeText(property, context) !== 'assign') return;
  const args = node.childForFieldName('arguments')?.namedChildren;
  if (!args || args.length < 2 || !isModuleExports(args[0], context)) return;
  for (const arg of args.slice(1)) exportValue(arg, context, node.startPosition.row + 1);
}

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const functionNode = node.childForFieldName('function');
  if (!functionNode) return;
  
  let calleeName: string | null = null;
  let receiverClass: string | undefined;
  
  if (functionNode.type === 'identifier') {
    calleeName = nodeText(functionNode, context);
    if (hasUnmodeledParameter(node, calleeName, context)) {
      context.unresolvedCalls.push({ fromFile: context.filePath, callee: calleeName, reason: 'local-binding-not-modeled' });
      return;
    }
  } else if (functionNode.type === 'member_expression') {
    const property = functionNode.childForFieldName('property');
    const receiver = functionNode.childForFieldName('object');
    const currentClass = context.currentScope.find(scope =>
      context.symbols.some(s => s.id === `${context.filePath}::${scope}` && s.kind === 'class'));
    if (!property || !receiver || nodeText(receiver, context) !== 'this' || !currentClass) {
      context.unresolvedCalls.push({ fromFile: context.filePath, callee: nodeText(functionNode, context), reason: 'unresolvable-receiver' });
      return;
    }
    calleeName = nodeText(property, context);
    receiverClass = currentClass;
  }
  
  if (!calleeName) {
    context.unresolvedCalls.push({ fromFile: context.filePath, callee: nodeText(functionNode, context), reason: 'no-local-target' });
    return;
  }
  
  // Skip common builtins
  const builtins = ['console', 'require', 'setTimeout', 'setInterval', 'parseInt', 'parseFloat', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean'];
  if (builtins.includes(calleeName)) return;
  
  const callerId = getCurrentSymbolId(context) ?? `${context.filePath}::__file__`;
  
  context.pendingReferences.push({
    source: callerId,
    name: calleeName,
    kind: 'calls',
    line: node.startPosition.row + 1,
    scopeChain: [...context.currentScope],
    ...(receiverClass ? { receiverClass } : {}),
  });
}

function hasUnmodeledParameter(node: Parser.SyntaxNode, name: string, context: Context): boolean {
  let parent = node.parent;
  while (parent && parent.type !== 'program') {
    if (['function_declaration', 'function_expression', 'arrow_function', 'method_definition'].includes(parent.type)) {
      const params = parent.childForFieldName('parameters');
      if (params && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(nodeText(params, context))) return true;
    }
    parent = parent.parent;
  }
  return false;
}

function processNewExpression(node: Parser.SyntaxNode, context: Context): void {
  // new UserService()
  const constructorNode = findChildByType(node, 'identifier');
  if (!constructorNode) return;
  
  const className = nodeText(constructorNode, context);
  
  const callerId = getCurrentSymbolId(context) ?? `${context.filePath}::__file__`;
  
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
        return canonicalPath(fullPath, projectRoot);
      }
      return null;
    }
    
    // Try with extensions
    for (const ext of extensions) {
      const candidate = `${targetPath}${ext}`;
      if (existsSync(candidate)) {
        return canonicalPath(candidate, projectRoot);
      }
    }
    
    // Try index files
    for (const indexFile of indexFiles) {
      const candidate = join(targetPath, indexFile);
      if (existsSync(candidate)) {
        return canonicalPath(candidate, projectRoot);
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
    const target = pending.receiverClass
      ? `${context.filePath}::${pending.receiverClass}.${pending.name}`
      : resolveSymbolAt(pending.name, pending.scopeChain, context);
    if (!target || (pending.receiverClass && !context.declaredSymbolIds.has(target))) {
      context.unresolvedCalls.push({ fromFile: context.filePath, callee: pending.name, reason: pending.receiverClass ? 'receiver-not-local' : 'no-local-target' });
      continue;
    }
    // The graph stores one relationship per source/target pair. An import from
    // the file node already proves this dependency; a later call from that
    // same file node must not relabel the graph relationship as a call.
    if (context.edges.some(edge => edge.source === pending.source && edge.target === target && edge.kind === 'imports')) continue;
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
