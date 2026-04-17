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
  currentPackage: string | null;
  imports: Map<string, string>;
  isBuildFile: boolean;
  isScriptFile: boolean;
}

export function parseKotlinFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle build.gradle.kts (Kotlin DSL)
  if (filePath.endsWith('build.gradle.kts')) {
    return parseGradleBuild(filePath, sourceCode, projectRoot);
  }

  // Handle build.gradle (Groovy DSL)
  if (filePath.endsWith('build.gradle')) {
    return parseGradleBuild(filePath, sourceCode, projectRoot);
  }

  // Handle settings.gradle.kts
  if (filePath.endsWith('settings.gradle.kts') || filePath.endsWith('settings.gradle')) {
    return parseSettingsGradle(filePath, sourceCode, projectRoot);
  }

  const parser = getParser('kotlin');
  const tree = parser.parse(sourceCode, null, { bufferSize: 1024 * 1024 });

  const context: Context = {
    filePath,
    projectRoot,
    sourceCode,
    symbols: [],
    edges: [],
    currentScope: [],
    currentClass: null,
    currentPackage: null,
    imports: new Map(),
    isBuildFile: false,
    isScriptFile: filePath.endsWith('.kts'),
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
  switch (node.type) {
    case 'package_header':
      processPackageHeader(node, context);
      break;
    case 'import_header':
      processImportHeader(node, context);
      break;
    case 'class_declaration':
      processClassDeclaration(node, context);
      break;
    case 'object_declaration':
      processObjectDeclaration(node, context);
      break;
    case 'companion_object':
      processCompanionObject(node, context);
      break;
    case 'function_declaration':
      processFunctionDeclaration(node, context);
      break;
    case 'property_declaration':
      processPropertyDeclaration(node, context);
      break;
    case 'secondary_constructor':
      processSecondaryConstructor(node, context);
      break;
    case 'type_alias':
      processTypeAlias(node, context);
      break;
    case 'call_expression':
      processCallExpression(node, context);
      break;
    case 'navigation_expression':
      processNavigationExpression(node, context);
      break;
  }
}

// ─── Package ──────────────────────────────────────────────────

function processPackageHeader(node: Parser.SyntaxNode, context: Context): void {
  const ident = findDescendantByTypes(node, ['identifier']);
  if (!ident) return;

  const name = nodeText(ident, context);
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

  context.currentPackage = name;
}

// ─── Imports ──────────────────────────────────────────────────

function processImportHeader(node: Parser.SyntaxNode, context: Context): void {
  const ident = findDescendantByTypes(node, ['identifier']);
  if (!ident) return;

  let importPath = nodeText(ident, context);

  // Handle wildcard imports (import kotlinx.coroutines.*)
  const text = nodeText(node, context).trim();
  const isWildcard = text.endsWith('.*');
  if (isWildcard && !importPath.endsWith('.*')) {
    importPath = importPath + '.*';
  }

  // Handle aliased imports (import com.example.User as DomainUser)
  const aliasMatch = text.match(/\bas\s+(\w+)/);
  const alias = aliasMatch ? aliasMatch[1] : null;

  // Try to resolve to a local file
  const resolvedPath = resolveKotlinImport(importPath, context.filePath, context.projectRoot);

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

    // Map simple name to resolved file for call resolution
    const parts = importPath.replace(/\.\*$/, '').split('.');
    if (!isWildcard) {
      const simpleName = alias || parts[parts.length - 1];
      context.imports.set(simpleName, `${resolvedPath}::${parts[parts.length - 1]}`);
    }
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
  const nameNode = findChildByType(node, 'type_identifier');
  if (!nameNode) return;

  // Strip generic type parameters: Repository<T> -> Repository
  let name = nodeText(nameNode, context);
  const angleBracketIdx = name.indexOf('<');
  if (angleBracketIdx > 0) {
    name = name.substring(0, angleBracketIdx);
  }

  // Determine class kind based on modifiers
  const text = nodeText(node, context);
  const modifiers = getModifiers(node, context);

  let kind: 'class' | 'interface' | 'enum' = 'class';
  if (text.match(/\binterface\b/) && !text.match(/\bfun\s+interface\b/)) {
    kind = 'interface';
  } else if (text.match(/\benum\s+class\b/)) {
    kind = 'enum';
  } else if (text.match(/\bannotation\s+class\b/)) {
    kind = 'interface'; // Annotation classes map to interface kind
  }

  const exported = modifiers.includes('public') || modifiers.includes('internal') ||
    (!modifiers.includes('private') && !modifiers.includes('protected'));
  const scope = context.currentClass || undefined;
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

  // Process supertypes (extends/implements)
  const delegationSpecifiers = findChildByType(node, 'delegation_specifiers');
  if (delegationSpecifiers) {
    processDelegationSpecifiers(delegationSpecifiers, symbolId, context);
  }

  // Process enum entries
  if (kind === 'enum') {
    processEnumEntries(node, name, context);
  }

  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = findChildByType(node, 'class_body') || findChildByType(node, 'enum_class_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

function processObjectDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'type_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private');
  const scope = context.currentClass || undefined;
  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class', // Objects are singletons, map to class
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });

  // Process supertypes
  const delegationSpecifiers = findChildByType(node, 'delegation_specifiers');
  if (delegationSpecifiers) {
    processDelegationSpecifiers(delegationSpecifiers, symbolId, context);
  }

  // Enter object scope
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

function processCompanionObject(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'type_identifier');
  const name = nameNode ? nodeText(nameNode, context) : 'Companion';
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true,
    scope,
  });

  // Enter companion scope
  const oldClass = context.currentClass;
  context.currentClass = scope ? `${scope}.${name}` : name;
  context.currentScope.push(context.currentClass);

  const body = findChildByType(node, 'class_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

function processDelegationSpecifiers(
  node: Parser.SyntaxNode,
  sourceId: string,
  context: Context
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    // delegation_specifier -> user_type or constructor_invocation or explicit_delegation
    const typeName = extractTypeName(child, context);
    if (typeName) {
      const baseId = resolveSymbol(typeName, context);
      if (baseId) {
        // Heuristic: interfaces usually start with I or are mixed in
        const edgeKind = typeName.startsWith('I') && typeName.length > 1 && typeName[1] === typeName[1].toUpperCase()
          ? 'implements' as const
          : 'inherits' as const;
        context.edges.push({
          source: sourceId,
          target: baseId,
          kind: edgeKind,
          filePath: context.filePath,
          line: child.startPosition.row + 1,
        });
      }
    }
  }
}

function processEnumEntries(
  node: Parser.SyntaxNode,
  enumName: string,
  context: Context
): void {
  const body = findChildByType(node, 'enum_class_body');
  if (!body) return;

  const entries = findChildrenByType(body, 'enum_entry');
  for (const entry of entries) {
    const nameNode = findChildByType(entry, 'simple_identifier');
    if (!nameNode) continue;

    const constName = nodeText(nameNode, context);
    const constId = `${context.filePath}::${enumName}.${constName}`;

    context.symbols.push({
      id: constId,
      name: constName,
      kind: 'constant',
      filePath: context.filePath,
      startLine: entry.startPosition.row + 1,
      endLine: entry.endPosition.row + 1,
      exported: true,
      scope: enumName,
    });
  }
}

// ─── Functions ────────────────────────────────────────────────

function processFunctionDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private');
  const scope = context.currentClass || undefined;

  // Check if this is an extension function (has a receiver type before the function name)
  const text = nodeText(node, context);
  const isExtension = text.match(/fun\s+[\w.<>, ]+\./) !== null;

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

  const body = findChildByType(node, 'function_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

// ─── Properties ───────────────────────────────────────────────

function processPropertyDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Find the variable declaration which contains the name
  const varDecl = findChildByType(node, 'variable_declaration');
  if (!varDecl) return;

  const nameNode = findChildByType(varDecl, 'simple_identifier');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const modifiers = getModifiers(node, context);
  const exported = !modifiers.includes('private');
  const scope = context.currentClass || undefined;
  const text = nodeText(node, context);
  const isConst = modifiers.includes('const') || (text.match(/\bval\b/) !== null && text.match(/\bconst\b/) !== null);

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

// ─── Constructors ─────────────────────────────────────────────

function processSecondaryConstructor(node: Parser.SyntaxNode, context: Context): void {
  const scope = context.currentClass || undefined;
  if (!scope) return;

  const name = 'constructor';
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

  // Enter constructor scope
  const scopeName = `${scope}.${name}`;
  context.currentScope.push(scopeName);

  const body = findChildByType(node, 'function_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

// ─── Type Aliases ─────────────────────────────────────────────

function processTypeAlias(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = findChildByType(node, 'type_identifier');
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

// ─── Calls ────────────────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  if (context.currentScope.length === 0) return;

  const firstChild = node.child(0);
  if (!firstChild) return;

  let calleeName: string | null = null;

  if (firstChild.type === 'simple_identifier') {
    calleeName = nodeText(firstChild, context);
  } else if (firstChild.type === 'navigation_expression') {
    // obj.method() — get last identifier
    const suffix = findChildByType(firstChild, 'navigation_suffix');
    if (suffix) {
      const ident = findChildByType(suffix, 'simple_identifier');
      if (ident) calleeName = nodeText(ident, context);
    }
    if (!calleeName) {
      // Fallback: last child identifier
      for (let i = firstChild.childCount - 1; i >= 0; i--) {
        const child = firstChild.child(i);
        if (child && child.type === 'simple_identifier') {
          calleeName = nodeText(child, context);
          break;
        }
      }
    }
  }

  if (!calleeName) return;

  // Skip common Kotlin stdlib methods
  const builtins = new Set([
    'println', 'print', 'toString', 'equals', 'hashCode', 'let', 'apply',
    'also', 'run', 'with', 'takeIf', 'takeUnless', 'repeat', 'require',
    'check', 'error', 'TODO', 'listOf', 'mapOf', 'setOf', 'arrayOf',
    'mutableListOf', 'mutableMapOf', 'mutableSetOf', 'emptyList', 'emptyMap',
    'emptySet', 'to', 'Pair', 'Triple', 'lazy', 'synchronized',
    'map', 'filter', 'forEach', 'flatMap', 'fold', 'reduce', 'any', 'all',
    'none', 'find', 'first', 'last', 'count', 'sum', 'average',
    'sortedBy', 'groupBy', 'associate', 'zip', 'joinToString',
    'getOrDefault', 'getOrElse', 'getOrPut', 'contains', 'containsKey',
    'add', 'remove', 'clear', 'size', 'isEmpty', 'isNotEmpty',
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

function processNavigationExpression(node: Parser.SyntaxNode, context: Context): void {
  // Skip — handled in call_expression when it wraps navigation
}

// ─── Gradle build file parsing ───────────────────────────────

function parseGradleBuild(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  const projectName = basename(dirname(join(projectRoot, filePath)));
  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: 'module',
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Kotlin DSL: implementation("group:artifact:version")
    // Groovy DSL: implementation 'group:artifact:version'
    const depMatch = line.match(
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|kapt|ksp|annotationProcessor)\s*[\(]?\s*['"]([^'"]+)['"]\s*[\)]?/
    );
    if (depMatch) {
      const depCoord = depMatch[1];
      if (!depCoord.startsWith(':')) {
        symbols.push({
          id: `${filePath}::dep:${depCoord}`,
          name: depCoord,
          kind: 'import',
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false,
        });
      }
    }

    // Project references: project(':my-module') or project(":my-module")
    const projectMatch = line.match(/project\s*\(\s*['":]+([^'")\s]+)['"]*\s*\)/);
    if (projectMatch) {
      const moduleName = projectMatch[1].replace(/^:/, '');
      const candidates = [
        join(moduleName, 'build.gradle.kts'),
        join(moduleName, 'build.gradle'),
      ];

      for (const candidate of candidates) {
        if (existsSync(join(projectRoot, candidate))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${candidate}::__file__`,
            kind: 'imports',
            filePath,
            line: lineNum,
          });
          break;
        }
      }
    }
  }

  return { filePath, symbols, edges };
}

// ─── settings.gradle.kts parsing ─────────────────────────────

function parseSettingsGradle(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  symbols.push({
    id: `${filePath}::settings`,
    name: 'settings',
    kind: 'module',
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // include(":app", ":core", ":data") or include ":app", ":core"
    const includeMatches = line.matchAll(/['"]:([^'"]+)['"]/g);
    for (const match of includeMatches) {
      const moduleName = match[1];
      const candidates = [
        join(moduleName, 'build.gradle.kts'),
        join(moduleName, 'build.gradle'),
      ];

      for (const candidate of candidates) {
        if (existsSync(join(projectRoot, candidate))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${candidate}::__file__`,
            kind: 'imports',
            filePath,
            line: lineNum,
          });
          break;
        }
      }
    }
  }

  return { filePath, symbols, edges };
}

// ─── Helpers ──────────────────────────────────────────────────

function resolveKotlinImport(
  importPath: string,
  currentFile: string,
  projectRoot: string
): string | null {
  // Convert Kotlin import to file path: com.example.MyClass -> com/example/MyClass.kt
  const cleanPath = importPath.replace(/\.\*$/, '');
  const parts = cleanPath.split('.');
  const className = parts[parts.length - 1];
  const packagePath = parts.slice(0, -1).join('/');

  // Common source roots
  const sourceRoots = [
    '',
    'src/main/kotlin',
    'src/main/java', // Kotlin can live in java source dirs
    'src',
    'app/src/main/kotlin',
    'app/src/main/java',
  ];

  for (const root of sourceRoots) {
    // Try .kt first, then .java (interop)
    for (const ext of ['.kt', '.java']) {
      const filePath = packagePath
        ? join(packagePath, className + ext)
        : className + ext;
      const candidate = root ? join(root, filePath) : filePath;
      const fullPath = join(projectRoot, candidate);
      if (existsSync(fullPath)) {
        return candidate;
      }
    }
  }

  // For wildcard imports, try to find the package directory
  if (importPath.endsWith('.*')) {
    const dirPath = cleanPath.replace(/\./g, '/');
    for (const root of sourceRoots) {
      const candidate = root ? join(root, dirPath) : dirPath;
      const fullPath = join(projectRoot, candidate);
      if (existsSync(fullPath)) {
        try {
          const stats = statSync(fullPath);
          if (stats.isDirectory()) {
            const ktFiles = readdirSync(fullPath).filter((f: string) => f.endsWith('.kt'));
            if (ktFiles.length > 0) {
              return join(candidate, ktFiles[0]);
            }
          }
        } catch {
          // ignore
        }
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
  const modList = findChildByType(node, 'modifiers');
  if (modList) {
    for (let i = 0; i < modList.childCount; i++) {
      const child = modList.child(i);
      if (child) {
        const text = nodeText(child, context).trim();
        if (text) modifiers.push(text);
      }
    }
  }
  return modifiers;
}

function extractTypeName(node: Parser.SyntaxNode, context: Context): string | null {
  const text = nodeText(node, context).trim();
  if (!text || text === ',' || text === ':') return null;

  // Strip generic parameters and parentheses (constructor invocations)
  let name = text;
  const angleBracketIdx = name.indexOf('<');
  if (angleBracketIdx > 0) name = name.substring(0, angleBracketIdx);
  const parenIdx = name.indexOf('(');
  if (parenIdx > 0) name = name.substring(0, parenIdx);

  // Strip qualified name prefix
  const dotIdx = name.lastIndexOf('.');
  name = dotIdx >= 0 ? name.substring(dotIdx + 1) : name;

  return name.trim() || null;
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
export const kotlinParser: LanguageParser = {
  name: 'kotlin',
  extensions: ['.kt', '.kts', 'build.gradle.kts', 'settings.gradle.kts', 'settings.gradle'],
  parseFile: parseKotlinFile,
};
