import { getParser } from './wasm-init.js';
import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, extname, resolve, basename } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  currentClass: string | null;
  currentNamespace: string | null;
  imports: Map<string, string>;
}

export function parsePhpFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const parser = getParser('php');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });

  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentNamespace: null,
    imports: new Map(),
  };

  walkNode(tree.rootNode, context);

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

// Types whose body is walked manually by their processor — skip in generic walkNode
const SCOPE_TYPES = new Set([
  'class_declaration', 'interface_declaration', 'trait_declaration', 'enum_declaration',
  'function_definition', 'method_declaration',
]);

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  processNode(node, context);

  // If this node's body is handled by its processor, don't recurse into children
  if (SCOPE_TYPES.has(node.type)) return;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function processNode(node: Parser.SyntaxNode, context: Context): void {
  switch (node.type) {
    case 'namespace_definition':
      processNamespaceDefinition(node, context);
      break;
    case 'namespace_use_declaration':
      processUseDeclaration(node, context);
      break;
    case 'class_declaration':
      processClassDeclaration(node, context);
      break;
    case 'interface_declaration':
      processInterfaceDeclaration(node, context);
      break;
    case 'trait_declaration':
      processTraitDeclaration(node, context);
      break;
    case 'enum_declaration':
      processEnumDeclaration(node, context);
      break;
    case 'function_definition':
      processFunctionDefinition(node, context);
      break;
    case 'method_declaration':
      processMethodDeclaration(node, context);
      break;
    case 'property_declaration':
      processPropertyDeclaration(node, context);
      break;
    case 'const_declaration':
      processConstDeclaration(node, context);
      break;
    case 'function_call_expression':
      processCallExpression(node, context);
      break;
    case 'member_call_expression':
      processMemberCallExpression(node, context);
      break;
    case 'scoped_call_expression':
      processScopedCallExpression(node, context);
      break;
    case 'include_expression':
    case 'include_once_expression':
    case 'require_expression':
    case 'require_once_expression':
      processIncludeRequire(node, context);
      break;
  }
}

// ─── Namespace ────────────────────────────────────────────────

function processNamespaceDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'namespace_name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'module',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
  });

  context.currentNamespace = name;
}

// ─── Use / Imports ────────────────────────────────────────────

function processUseDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const clauses = findChildrenByType(node, 'namespace_use_clause');
  for (const clause of clauses) {
    const nameNode = findChildByType(clause, 'namespace_name') || findChildByType(clause, 'qualified_name');
    if (!nameNode) continue;

    const importPath = nodeText(nameNode, context);
    const aliasNode = findChildByType(clause, 'namespace_aliasing_clause');
    const alias = aliasNode
      ? nodeText(findChildByType(aliasNode, 'name') || aliasNode, context).trim()
      : null;

    const parts = importPath.split('\\');
    const simpleName = alias || parts[parts.length - 1];

    // Try to resolve to a local file
    const resolvedPath = resolvePhpImport(importPath, context.filePath, context.projectRoot);

    if (resolvedPath) {
      const sourceId = `${context.filePath}::__file__`;
      const targetId = `${resolvedPath}::__file__`;

      context.edges.push({
        source: sourceId,
        target: targetId,
        kind: 'imports',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });

      context.imports.set(simpleName, `${resolvedPath}::${parts[parts.length - 1]}`);
    }

    // Create import symbol for tracking
    const symbolId = `${context.filePath}::import:${importPath}`;
    context.symbols.push({
      id: symbolId,
      name: importPath,
      kind: 'import',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
    });
  }
}

// ─── Classes ──────────────────────────────────────────────────

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  const text = nodeText(node, context);
  const isAbstract = text.trimStart().startsWith('abstract');

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope: context.currentClass || undefined,
  });

  // Process base class
  const baseClause = findChildByType(node, 'base_clause');
  if (baseClause) {
    const baseName = extractQualifiedName(baseClause, context);
    if (baseName) {
      const baseId = resolveSymbol(baseName, context);
      if (baseId) {
        context.edges.push({
          source: symbolId,
          target: baseId,
          kind: 'inherits',
          filePath: context.filePath,
          line: node.startPosition.row + 1,
        });
      }
    }
  }

  // Process interfaces
  const interfaceClause = findChildByType(node, 'class_interface_clause');
  if (interfaceClause) {
    const names = findChildrenByType(interfaceClause, 'name');
    const qualifiedNames = findChildrenByType(interfaceClause, 'qualified_name');
    for (const n of [...names, ...qualifiedNames]) {
      const ifaceName = nodeText(n, context).trim();
      if (ifaceName && ifaceName !== ',') {
        const ifaceId = resolveSymbol(ifaceName, context);
        if (ifaceId) {
          context.edges.push({
            source: symbolId,
            target: ifaceId,
            kind: 'implements',
            filePath: context.filePath,
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  }

  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Interfaces ───────────────────────────────────────────────

function processInterfaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'interface',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope: context.currentClass || undefined,
  });

  // Enter interface scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Traits ───────────────────────────────────────────────────

function processTraitDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class', // Traits map to class kind
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope: context.currentClass || undefined,
  });

  // Enter trait scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Enums ────────────────────────────────────────────────────

function processEnumDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
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

  // Enter enum scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Functions ────────────────────────────────────────────────

function processFunctionDefinition(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope,
  });

  // Enter function scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'compound_statement');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

// ─── Methods ──────────────────────────────────────────────────

function processMethodDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private');
  const scope = context.currentClass || undefined;

  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });

  // Enter method scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'compound_statement');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

// ─── Properties ───────────────────────────────────────────────

function processPropertyDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const varNode = findDescendantByTypes(node, ['variable_name']);
  if (!varNode) return;

  const name = nodeText(varNode, context).replace(/^\$/, '');
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private');
  const scope = context.currentClass || undefined;

  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
}

// ─── Constants ────────────────────────────────────────────────

function processConstDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const elements = findChildrenByType(node, 'const_element');
  for (const elem of elements) {
    const nameNode = findChildByType(elem, 'name');
    if (!nameNode) continue;

    const name = nodeText(nameNode, context);
    const scope = context.currentClass || undefined;

    const symbolId = scope
      ? `${context.filePath}::${scope}.${name}`
      : `${context.filePath}::${name}`;

    context.symbols.push({
      id: symbolId,
      name,
      kind: 'constant',
      filePath: context.filePath,
      startLine: elem.startPosition.row + 1,
      endLine: elem.endPosition.row + 1,
      exported: true,
      scope,
    });
  }
}

// ─── Calls ────────────────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  if (context.currentScope.length === 0) return;

  const firstChild = node.child(0);
  if (!firstChild) return;

  let calleeName: string | null = null;

  if (firstChild.type === 'name') {
    calleeName = nodeText(firstChild, context);
  } else if (firstChild.type === 'qualified_name') {
    const parts = nodeText(firstChild, context).split('\\');
    calleeName = parts[parts.length - 1];
  }

  if (!calleeName) return;

  // Skip common PHP builtins
  const builtins = new Set([
    'echo', 'print', 'var_dump', 'print_r', 'isset', 'unset', 'empty',
    'array', 'list', 'count', 'strlen', 'strpos', 'substr', 'explode',
    'implode', 'array_map', 'array_filter', 'array_merge', 'array_push',
    'array_pop', 'array_shift', 'array_unshift', 'array_keys', 'array_values',
    'in_array', 'json_encode', 'json_decode', 'sprintf', 'printf',
    'is_array', 'is_string', 'is_int', 'is_null', 'is_bool',
    'intval', 'floatval', 'strval', 'boolval',
    'trim', 'ltrim', 'rtrim', 'strtolower', 'strtoupper',
    'str_replace', 'preg_match', 'preg_replace',
    'file_exists', 'is_file', 'is_dir', 'dirname', 'basename',
    'date', 'time', 'strtotime', 'compact', 'extract',
    'defined', 'define', 'class_exists', 'function_exists',
    'throw', 'die', 'exit',
  ]);
  if (builtins.has(calleeName)) return;

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

function processMemberCallExpression(node: Parser.SyntaxNode, context: Context): void {
  // $obj->method() — handled implicitly via call resolution
}

function processScopedCallExpression(node: Parser.SyntaxNode, context: Context): void {
  // ClassName::method() — handled implicitly via call resolution
}

// ─── Include/Require ──────────────────────────────────────────

function processIncludeRequire(node: Parser.SyntaxNode, context: Context): void {
  const text = nodeText(node, context);

  // Extract the file path from include/require
  const pathMatch = text.match(/['"]([^'"]+)['"]/);
  if (!pathMatch) return;

  const includePath = pathMatch[1];
  const resolvedPath = resolvePhpInclude(includePath, context.filePath, context.projectRoot);

  if (resolvedPath) {
    const sourceId = `${context.filePath}::__file__`;
    const targetId = `${resolvedPath}::__file__`;

    context.edges.push({
      source: sourceId,
      target: targetId,
      kind: 'imports',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function resolvePhpImport(
  importPath: string,
  currentFile: string,
  projectRoot: string
): string | null {
  // Convert PHP namespace to file path: App\Http\Controllers\UserController -> App/Http/Controllers/UserController.php
  const parts = importPath.split('\\');
  const filePath = parts.join('/') + '.php';

  // Common source roots for PHP projects
  const sourceRoots = [
    '',
    'src',
    'app',
    'lib',
    'includes',
    'wp-content/plugins',
    'wp-content/themes',
  ];

  for (const root of sourceRoots) {
    const candidate = root ? join(root, filePath) : filePath;
    const fullPath = join(projectRoot, candidate);
    if (existsSync(fullPath)) {
      return candidate;
    }

    // Try lowercase first segment (PSR-4: App -> app)
    const loweredParts = [...parts];
    loweredParts[0] = loweredParts[0].toLowerCase();
    const loweredFilePath = loweredParts.join('/') + '.php';
    const loweredCandidate = root ? join(root, loweredFilePath) : loweredFilePath;
    const loweredFullPath = join(projectRoot, loweredCandidate);
    if (existsSync(loweredFullPath)) {
      return loweredCandidate;
    }
  }

  return null;
}

function resolvePhpInclude(
  includePath: string,
  currentFile: string,
  projectRoot: string
): string | null {
  // Resolve relative to current file
  const currentDir = dirname(join(projectRoot, currentFile));
  const relativePath = join(currentDir, includePath);
  const relativeToRoot = relativePath.replace(projectRoot + '/', '');

  if (existsSync(relativePath)) {
    return relativeToRoot;
  }

  // Resolve relative to project root
  const fromRoot = join(projectRoot, includePath);
  if (existsSync(fromRoot)) {
    return includePath;
  }

  return null;
}

function resolveSymbol(name: string, context: Context): string | null {
  if (context.imports.has(name)) {
    return context.imports.get(name) || null;
  }

  const currentFileId = `${context.filePath}::${name}`;
  if (context.symbols.find(s => s.id === currentFileId)) {
    return currentFileId;
  }

  if (context.currentClass) {
    const classMethodId = `${context.filePath}::${context.currentClass}.${name}`;
    if (context.symbols.find(s => s.id === classMethodId)) {
      return classMethodId;
    }
  }

  return null;
}

function getModifiers(node: Parser.SyntaxNode, context: Context): string[] {
  const modifiers: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const type = child.type;
    if (type === 'visibility_modifier' || type === 'static_modifier' || type === 'abstract_modifier' || type === 'final_modifier' || type === 'readonly_modifier') {
      modifiers.push(nodeText(child, context).trim());
    }
  }
  return modifiers;
}

function extractQualifiedName(node: Parser.SyntaxNode, context: Context): string | null {
  const nameNode = findDescendantByTypes(node, ['name', 'qualified_name', 'namespace_name']);
  if (!nameNode) return null;

  const text = nodeText(nameNode, context).trim();
  if (!text) return null;

  // Get the last part of a qualified name
  const parts = text.split('\\');
  return parts[parts.length - 1];
}

function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

function findChildrenByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}

function findDescendantByTypes(node: Parser.SyntaxNode, types: string[]): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (types.includes(child.type)) return child;
    const found = findDescendantByTypes(child, types);
    if (found) return found;
  }
  return null;
}

function nodeText(node: Parser.SyntaxNode, context: Context): string {
  return context.sourceCode.substring(node.startIndex, node.endIndex);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}

// Export as LanguageParser interface
export const phpParser: LanguageParser = {
  name: 'php',
  extensions: ['.php'],
  parseFile: parsePhpFile,
};
