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
  currentModule: string | null;
  imports: Map<string, string>;
  isPackageFile: boolean;
}

export function parseSwiftFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle Package.swift (Swift Package Manager manifest)
  if (filePath.endsWith('Package.swift')) {
    return parsePackageSwift(filePath, sourceCode, projectRoot);
  }

  const parser = getParser('swift');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });

  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentModule: null,
    imports: new Map(),
    isPackageFile: false,
  };

  walkNode(tree.rootNode, context);

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

function walkNode(node: Parser.SyntaxNode, context: Context): void {
  const handled = processNode(node, context);

  // If processNode handled the children (walked body itself), skip recursion
  if (handled) return;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, context);
    }
  }
}

function processNode(node: Parser.SyntaxNode, context: Context): boolean {
  switch (node.type) {
    case 'import_declaration':
      processImportDeclaration(node, context);
      return false;
    case 'class_declaration':
      processClassDeclaration(node, context);
      return true; // handles its own children
    case 'protocol_declaration':
      processProtocolDeclaration(node, context);
      return true; // handles its own children
    case 'function_declaration':
      processFunctionDeclaration(node, context);
      return true; // handles its own children
    case 'init_declaration':
      processInitDeclaration(node, context);
      return true;
    case 'deinit_declaration':
      processDeinitDeclaration(node, context);
      return true;
    case 'property_declaration':
    case 'variable_declaration':
      processPropertyDeclaration(node, context);
      return false;
    case 'typealias_declaration':
      processTypealiasDeclaration(node, context);
      return false;
    case 'associatedtype_declaration':
      processAssociatedTypeDeclaration(node, context);
      return false;
    case 'call_expression':
      processCallExpression(node, context);
      return false;
    default:
      return false;
  }
}

// ─── Imports ──────────────────────────────────────────────────

function processImportDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const text = nodeText(node, context).trim();
  const match = text.match(/^import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?(.+)$/);
  if (!match) return;

  const importPath = match[1].trim();

  // Try to resolve to a local file
  const resolvedPath = resolveSwiftImport(importPath, context.filePath, context.projectRoot);

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

    const parts = importPath.split('.');
    const simpleName = parts[parts.length - 1];
    context.imports.set(simpleName, `${resolvedPath}::${simpleName}`);
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

// ─── Types ────────────────────────────────────────────────────

function processClassDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Detect the keyword: class, struct, actor, enum, extension
  let keyword = 'class';
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && ['class', 'struct', 'actor', 'enum', 'extension'].includes(child.type)) {
      keyword = child.type;
      break;
    }
  }

  // Extension handling: name from user_type or type_identifier
  if (keyword === 'extension') {
    const typeNode = findChildByType(node, 'user_type') || findChildByType(node, 'type_identifier');
    const extName = typeNode ? nodeText(typeNode, context).trim() : 'Unknown';
    const name = `${extName}+ext`;
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

    const oldClass = context.currentClass;
    context.currentClass = extName;
    context.currentScope.push(extName);

    const body = findChildByType(node, 'class_body');
    if (body) {
      walkNode(body, context);
    }

    context.currentScope.pop();
    context.currentClass = oldClass;
    return;
  }

  const nameNode = findChildByType(node, 'type_identifier') || findChildByType(node, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
  const scope = context.currentClass || undefined;
  const symbolId = `${context.filePath}::${name}`;

  // Determine kind based on keyword
  let kind: string = 'class';
  if (keyword === 'enum') kind = 'enum';
  else if (keyword === 'struct' || keyword === 'actor') kind = 'class';

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

  // Process inheritance
  processInheritance(node, symbolId, context);

  // For enums, process cases
  if (keyword === 'enum') {
    processEnumCases(node, name, context);
  }

  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'class_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Protocol ─────────────────────────────────────────────────

function processProtocolDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'type_identifier') || findChildByType(node, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
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

  processInheritance(node, symbolId, context);

  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'protocol_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

// ─── Functions ────────────────────────────────────────────────

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
  const scope = context.currentClass || undefined;

  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? 'method' : 'function',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });

  // Enter function scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'function_body') || findChildByType(node, 'code_block');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processInitDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const scope = context.currentClass || undefined;
  if (!scope) return;

  const name = 'init';
  const symbolId = `${context.filePath}::${scope}.${name}:${node.startPosition.row + 1}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope,
  });

  const scopeName = `${scope}.${name}`;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'function_body') || findChildByType(node, 'code_block');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processDeinitDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const scope = context.currentClass || undefined;
  if (!scope) return;

  const name = 'deinit';
  const symbolId = `${context.filePath}::${scope}.${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'method',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope,
  });
}

// ─── Properties ───────────────────────────────────────────────

function processPropertyDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'simple_identifier') || findChildByType(node, 'pattern');
  if (!nameNode) return;

  const name = nodeText(nameNode, context).trim();
  if (!name || name.includes(' ')) return;

  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
  const scope = context.currentClass || undefined;
  const text = nodeText(node, context);
  const isConst = text.trimStart().startsWith('let');

  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: isConst ? 'constant' : 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
}

// ─── Type Aliases ─────────────────────────────────────────────

function processTypealiasDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'type_identifier') || findChildByType(node, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
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

function processAssociatedTypeDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'type_identifier') || findChildByType(node, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'type_alias',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope,
  });
}

// ─── Calls ────────────────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  if (context.currentScope.length === 0) return;

  const firstChild = node.child(0);
  if (!firstChild) return;

  let calleeName: string | null = null;

  if (firstChild.type === 'simple_identifier') {
    calleeName = nodeText(firstChild, context);
  } else if (firstChild.type === 'navigation_expression' || firstChild.type === 'member_access') {
    // obj.method() — get last identifier
    for (let i = firstChild.childCount - 1; i >= 0; i--) {
      const child = firstChild.child(i);
      if (child && (child.type === 'simple_identifier' || child.type === 'navigation_suffix')) {
        calleeName = nodeText(child, context).replace(/^\./, '');
        break;
      }
    }
  }

  if (!calleeName) return;

  // Skip common Swift stdlib methods
  const builtins = new Set([
    'print', 'debugPrint', 'dump', 'fatalError', 'precondition', 'assert',
    'preconditionFailure', 'assertionFailure',
    'map', 'filter', 'reduce', 'forEach', 'flatMap', 'compactMap',
    'sorted', 'contains', 'first', 'last', 'count', 'isEmpty',
    'append', 'remove', 'insert', 'removeAll',
    'String', 'Int', 'Double', 'Float', 'Bool', 'Array', 'Dictionary', 'Set',
    'DispatchQueue', 'Task', 'withCheckedContinuation', 'withCheckedThrowingContinuation',
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

// ─── Inheritance ──────────────────────────────────────────────

function processInheritance(
  node: Parser.SyntaxNode,
  sourceId: string,
  context: Context
): void {
  const inheritanceClause = findChildByType(node, 'inheritance_specifier') ||
    findChildByType(node, 'type_inheritance_clause');
  if (!inheritanceClause) return;

  // Parse from text: look for `: TypeA, TypeB`
  const text = nodeText(node, context);
  const colonMatch = text.match(/:\s*([^{]+)/);
  if (!colonMatch) return;

  const types = colonMatch[1].split(',').map(t => t.trim().split('<')[0].trim());
  for (const typeName of types) {
    if (!typeName || typeName.includes('{') || typeName.includes('where')) break;
    const baseId = resolveSymbol(typeName, context);
    if (baseId) {
      context.edges.push({
        source: sourceId,
        target: baseId,
        kind: 'implements',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
      });
    }
  }
}

function processEnumCases(
  node: Parser.SyntaxNode,
  enumName: string,
  context: Context
): void {
  const text = nodeText(node, context);
  const caseMatches = text.matchAll(/\bcase\s+(\w+)/g);
  for (const match of caseMatches) {
    const caseName = match[1];
    if (caseName === enumName) continue; // Skip if it's the enum name itself
    const constId = `${context.filePath}::${enumName}.${caseName}`;

    context.symbols.push({
      id: constId,
      name: caseName,
      kind: 'constant',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: true,
      scope: enumName,
    });
  }
}

// ─── Package.swift parsing ────────────────────────────────────

function parsePackageSwift(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  // Extract package name
  const nameMatch = sourceCode.match(/name\s*:\s*["']([^"']+)["']/);
  const packageName = nameMatch ? nameMatch[1] : basename(dirname(join(projectRoot, filePath)));

  symbols.push({
    id: `${filePath}::${packageName}`,
    name: packageName,
    kind: 'module',
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Dependencies: .package(url: "https://github.com/...", from: "1.0.0")
    const depMatch = line.match(/\.package\s*\(\s*(?:url\s*:\s*)?["']([^"']+)["']/);
    if (depMatch) {
      const depUrl = depMatch[1];
      const depName = depUrl.split('/').pop()?.replace(/\.git$/, '') || depUrl;
      symbols.push({
        id: `${filePath}::dep:${depName}`,
        name: depName,
        kind: 'import',
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false,
      });
    }

    // Targets: .target(name: "MyTarget", dependencies: [...])
    const targetMatch = line.match(/\.(?:target|executableTarget|testTarget)\s*\(\s*name\s*:\s*["']([^"']+)["']/);
    if (targetMatch) {
      symbols.push({
        id: `${filePath}::target:${targetMatch[1]}`,
        name: targetMatch[1],
        kind: 'module',
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
      });
    }
  }

  return { filePath, symbols, edges };
}

// ─── Helpers ──────────────────────────────────────────────────

function resolveSwiftImport(
  importPath: string,
  currentFile: string,
  projectRoot: string
): string | null {
  // Swift imports are module-level; try to find a local source directory matching the module name
  const parts = importPath.split('.');
  const moduleName = parts[0];

  const sourceRoots = [
    '',
    'Sources',
    `Sources/${moduleName}`,
    'src',
    `src/${moduleName}`,
  ];

  for (const root of sourceRoots) {
    const candidate = root ? join(root, moduleName + '.swift') : moduleName + '.swift';
    const fullPath = join(projectRoot, candidate);
    if (existsSync(fullPath)) {
      return candidate;
    }
  }

  // Try to find the module as a directory
  for (const root of sourceRoots) {
    const dirCandidate = root || moduleName;
    const fullDir = join(projectRoot, dirCandidate);
    if (existsSync(fullDir)) {
      try {
        const stats = statSync(fullDir);
        if (stats.isDirectory()) {
          const swiftFiles = readdirSync(fullDir).filter((f: string) => f.endsWith('.swift'));
          if (swiftFiles.length > 0) {
            return join(dirCandidate, swiftFiles[0]);
          }
        }
      } catch {
        // ignore
      }
    }
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
  const modList = findChildByType(node, 'modifiers') || findChildByType(node, 'modifier');
  if (modList) {
    for (let i = 0; i < modList.childCount; i++) {
      const child = modList.child(i);
      if (child) {
        const text = nodeText(child, context).trim();
        if (text) modifiers.push(text);
      }
    }
  }

  // Also check parent for modifiers at the beginning of the line
  const text = nodeText(node, context);
  if (text.match(/\bprivate\b/)) modifiers.push('private');
  if (text.match(/\bfileprivate\b/)) modifiers.push('fileprivate');
  if (text.match(/\binternal\b/)) modifiers.push('internal');
  if (text.match(/\bpublic\b/)) modifiers.push('public');
  if (text.match(/\bopen\b/)) modifiers.push('open');

  return modifiers;
}

function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
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
export const swiftParser: LanguageParser = {
  name: 'swift',
  extensions: ['.swift', 'Package.swift'],
  parseFile: parseSwiftFile,
};
