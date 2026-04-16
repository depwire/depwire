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
}

export function parseJavaFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle Maven pom.xml
  if (filePath.endsWith('pom.xml')) {
    return parsePomXml(filePath, sourceCode, projectRoot);
  }

  // Handle Gradle build files
  if (filePath.endsWith('build.gradle') || filePath.endsWith('build.gradle.kts')) {
    return parseGradleBuild(filePath, sourceCode, projectRoot);
  }

  const parser = getParser('java');
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
    case 'package_declaration':
      processPackageDeclaration(node, context);
      break;
    case 'import_declaration':
      processImportDeclaration(node, context);
      break;
    case 'class_declaration':
      processClassDeclaration(node, context);
      break;
    case 'interface_declaration':
      processInterfaceDeclaration(node, context);
      break;
    case 'enum_declaration':
      processEnumDeclaration(node, context);
      break;
    case 'annotation_type_declaration':
      processAnnotationTypeDeclaration(node, context);
      break;
    case 'record_declaration':
      processRecordDeclaration(node, context);
      break;
    case 'method_declaration':
      processMethodDeclaration(node, context);
      break;
    case 'constructor_declaration':
      processConstructorDeclaration(node, context);
      break;
    case 'field_declaration':
      processFieldDeclaration(node, context);
      break;
    case 'constant_declaration':
      processConstantDeclaration(node, context);
      break;
    case 'annotation_type_element_declaration':
      processAnnotationElement(node, context);
      break;
    case 'method_invocation':
      processCallExpression(node, context);
      break;
    case 'object_creation_expression':
      processObjectCreation(node, context);
      break;
    case 'lambda_expression':
      processLambdaExpression(node, context);
      break;
  }
}

// ─── Package ──────────────────────────────────────────────────

function processPackageDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // package com.example.service;
  const scopedIdent = findDescendantByTypes(node, ['scoped_identifier', 'identifier']);
  if (!scopedIdent) return;

  const name = nodeText(scopedIdent, context);
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

function processImportDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // import java.util.List;
  // import static java.lang.Math.PI;
  // import java.util.*;

  const text = nodeText(node, context).trim();

  // Check for static import
  const isStatic = text.includes('import static');

  // Check for wildcard
  const isWildcard = text.includes('.*');

  // Extract the import path
  const scopedIdent = findDescendantByTypes(node, ['scoped_identifier', 'identifier']);
  if (!scopedIdent) return;

  let importPath = nodeText(scopedIdent, context);

  // Handle asterisk for wildcard imports
  const asterisk = findChildByType(node, 'asterisk');
  if (asterisk) {
    importPath = importPath + '.*';
  }

  // Try to resolve to a local file
  const resolvedPath = resolveJavaImport(importPath, context.filePath, context.projectRoot);

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

    // Map the simple name to the resolved file for call resolution
    const parts = importPath.split('.');
    if (!isWildcard) {
      const simpleName = parts[parts.length - 1];
      context.imports.set(simpleName, `${resolvedPath}::${simpleName}`);
    }
  }

  // Create an import symbol for tracking
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
  processTypeDeclaration(node, context, 'class');
}

function processInterfaceDeclaration(node: Parser.SyntaxNode, context: Context): void {
  processTypeDeclaration(node, context, 'interface');
}

function processRecordDeclaration(node: Parser.SyntaxNode, context: Context): void {
  processTypeDeclaration(node, context, 'class');
}

function processAnnotationTypeDeclaration(node: Parser.SyntaxNode, context: Context): void {
  processTypeDeclaration(node, context, 'interface');
}

function processTypeDeclaration(
  node: Parser.SyntaxNode,
  context: Context,
  kind: 'class' | 'interface'
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  // Strip generic type parameters: Repository<T> → Repository
  let name = nodeText(nameNode, context);
  const angleBracketIdx = name.indexOf('<');
  if (angleBracketIdx > 0) {
    name = name.substring(0, angleBracketIdx);
  }

  const exported = hasModifier(node, context, 'public');
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

  // Process superclass (extends)
  const superclass = node.childForFieldName('superclass');
  if (superclass) {
    let baseName = extractTypeName(superclass, context);
    if (baseName) {
      const baseId = resolveSymbol(baseName, context);
      if (baseId) {
        context.edges.push({
          source: symbolId,
          target: baseId,
          kind: 'inherits',
          filePath: context.filePath,
          line: superclass.startPosition.row + 1,
        });
      }
    }
  }

  // Process interfaces (implements)
  const interfaces = node.childForFieldName('interfaces');
  if (interfaces) {
    processInterfaceList(interfaces, symbolId, context);
  }

  // Process extends for interfaces (extends_interfaces)
  const extendsInterfaces = node.childForFieldName('extends_interfaces') ||
    findChildByType(node, 'extends_interfaces');
  if (extendsInterfaces) {
    processInterfaceList(extendsInterfaces, symbolId, context);
  }

  // Enter class scope
  const oldClass = context.currentClass;
  context.currentClass = name;
  context.currentScope.push(name);

  const body = node.childForFieldName('body') || findChildByType(node, 'class_body') ||
    findChildByType(node, 'interface_body') || findChildByType(node, 'enum_body') ||
    findChildByType(node, 'annotation_type_body') || findChildByType(node, 'record_declaration_body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
  context.currentClass = oldClass;
}

function processInterfaceList(node: Parser.SyntaxNode, sourceId: string, context: Context): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === 'type_identifier' || child.type === 'generic_type' || child.type === 'scoped_type_identifier') {
      const baseName = extractTypeName(child, context);
      if (baseName) {
        const baseId = resolveSymbol(baseName, context);
        if (baseId) {
          context.edges.push({
            source: sourceId,
            target: baseId,
            kind: 'implements',
            filePath: context.filePath,
            line: child.startPosition.row + 1,
          });
        }
      }
    }
  }
}

function processEnumDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
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

  // Extract enum constants
  const body = node.childForFieldName('body') || findChildByType(node, 'enum_body');
  if (body) {
    const constants = findChildrenByType(body, 'enum_constant');
    for (const constant of constants) {
      const constNameNode = constant.childForFieldName('name');
      if (!constNameNode) continue;
      const constName = nodeText(constNameNode, context);
      const constId = `${context.filePath}::${name}.${constName}`;

      context.symbols.push({
        id: constId,
        name: constName,
        kind: 'constant',
        filePath: context.filePath,
        startLine: constant.startPosition.row + 1,
        endLine: constant.endPosition.row + 1,
        exported,
        scope: name,
      });
    }

    // Enter class scope for methods/fields inside enum body
    const oldClass = context.currentClass;
    context.currentClass = name;
    context.currentScope.push(name);

    // Walk the body for methods and fields defined inside the enum
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child && child.type !== 'enum_constant') {
        walkNode(child, context);
      }
    }

    context.currentScope.pop();
    context.currentClass = oldClass;
  }
}

// ─── Members ──────────────────────────────────────────────────

function processMethodDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
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

  // Enter method scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processConstructorDeclaration(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
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

  // Enter constructor scope
  const scopeName = scope ? `${scope}.${name}` : name;
  context.currentScope.push(scopeName);

  const body = node.childForFieldName('body');
  if (body) {
    walkNode(body, context);
  }

  context.currentScope.pop();
}

function processFieldDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Extract variable name from the declarator
  const declarator = findDescendantByTypes(node, ['variable_declarator']);
  if (!declarator) return;

  const nameNode = declarator.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
  const exported = hasModifier(node, context, 'public');
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  // Check if it's a static final (constant)
  const isConstant = hasModifier(node, context, 'static') && hasModifier(node, context, 'final');

  context.symbols.push({
    id: symbolId,
    name,
    kind: isConstant ? 'constant' : 'property',
    filePath: context.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported,
    scope,
  });
}

function processConstantDeclaration(node: Parser.SyntaxNode, context: Context): void {
  // Interface constants
  const declarator = findDescendantByTypes(node, ['variable_declarator']);
  if (!declarator) return;

  const nameNode = declarator.childForFieldName('name');
  if (!nameNode) return;

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
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    exported: true, // Interface constants are always public
    scope,
  });
}

function processAnnotationElement(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name = nodeText(nameNode, context);
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
    exported: true,
    scope,
  });
}

// ─── Calls ────────────────────────────────────────────────────

function processCallExpression(node: Parser.SyntaxNode, context: Context): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const calleeName = nodeText(nameNode, context);

  // Skip common JDK methods
  const builtins = ['toString', 'equals', 'hashCode', 'getClass', 'println', 'printf',
    'format', 'parseInt', 'valueOf', 'length', 'size', 'get', 'set', 'add', 'remove',
    'contains', 'isEmpty', 'stream', 'collect', 'map', 'filter', 'forEach', 'of',
    'orElse', 'orElseThrow', 'isPresent', 'ifPresent', 'close', 'flush', 'write', 'read'];
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

function processObjectCreation(node: Parser.SyntaxNode, context: Context): void {
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return;

  const typeName = extractTypeName(typeNode, context);
  if (!typeName) return;

  const callerId = getCurrentSymbolId(context);
  if (!callerId) return;

  const targetId = resolveSymbol(typeName, context);
  if (targetId) {
    context.edges.push({
      source: callerId,
      target: targetId,
      kind: 'references',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
    });
  }

  // Check for anonymous class body — mark as anonymous symbol
  const classBody = findChildByType(node, 'class_body');
  if (classBody) {
    const anonName = `<anonymous:${typeName}>`;
    const anonId = `${context.filePath}::${anonName}:${node.startPosition.row + 1}`;

    context.symbols.push({
      id: anonId,
      name: anonName,
      kind: 'class',
      filePath: context.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: false,
      scope: context.currentClass || undefined,
    });

    // Walk anonymous class body
    const oldClass = context.currentClass;
    context.currentClass = anonName;
    context.currentScope.push(anonName);

    walkNode(classBody, context);

    context.currentScope.pop();
    context.currentClass = oldClass;
  }
}

function processLambdaExpression(node: Parser.SyntaxNode, context: Context): void {
  // Only create a symbol if assigned to a named variable
  const parent = node.parent;
  if (!parent) return;

  if (parent.type === 'variable_declarator') {
    const nameNode = parent.childForFieldName('name');
    if (nameNode) {
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
        exported: false,
        scope,
      });
    }
  }
}

// ─── Maven pom.xml parsing ───────────────────────────────────

function parsePomXml(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  // Create a file-level symbol for the project
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

  let inDependency = false;
  let groupId = '';
  let artifactId = '';
  let version = '';
  let depStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track dependency blocks
    if (/<dependency>/.test(line)) {
      inDependency = true;
      groupId = '';
      artifactId = '';
      version = '';
      depStartLine = lineNum;
    }

    if (inDependency) {
      const gMatch = line.match(/<groupId>([^<]+)<\/groupId>/);
      if (gMatch) groupId = gMatch[1];

      const aMatch = line.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (aMatch) artifactId = aMatch[1];

      const vMatch = line.match(/<version>([^<]+)<\/version>/);
      if (vMatch) version = vMatch[1];
    }

    if (/<\/dependency>/.test(line) && inDependency) {
      inDependency = false;
      if (groupId && artifactId) {
        const depName = `${groupId}:${artifactId}`;
        const displayVersion = version || 'managed';
        symbols.push({
          id: `${filePath}::dep:${depName}`,
          name: `${depName}@${displayVersion}`,
          kind: 'import',
          filePath,
          startLine: depStartLine,
          endLine: lineNum,
          exported: false,
        });
      }
    }

    // Module references: <module>../my-module</module>
    const moduleMatch = line.match(/<module>([^<]+)<\/module>/);
    if (moduleMatch) {
      const modulePath = moduleMatch[1];
      const pomDir = dirname(join(projectRoot, filePath));
      const resolvedModule = resolve(pomDir, modulePath);
      const relativeModule = resolvedModule.startsWith(projectRoot + '/')
        ? resolvedModule.substring(projectRoot.length + 1)
        : null;

      // Check for pom.xml in the module directory
      if (relativeModule) {
        const modulePom = join(relativeModule, 'pom.xml');
        if (existsSync(join(projectRoot, modulePom))) {
          edges.push({
            source: `${filePath}::__file__`,
            target: `${modulePom}::__file__`,
            kind: 'imports',
            filePath,
            line: lineNum,
          });
        }
      }
    }
  }

  return { filePath, symbols, edges };
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

    // Groovy DSL: implementation 'group:artifact:version'
    // Kotlin DSL: implementation("group:artifact:version")
    const depMatch = line.match(
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|annotationProcessor)\s*[\(]?\s*['"]([^'"]+)['"]\s*[\)]?/
    );
    if (depMatch) {
      const depCoord = depMatch[1];
      // Skip project references (handled below)
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
      // Try to find the module's build file
      const candidates = [
        join(moduleName, 'build.gradle'),
        join(moduleName, 'build.gradle.kts'),
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

function resolveJavaImport(
  importPath: string,
  currentFile: string,
  projectRoot: string
): string | null {
  // Convert Java import to file path: com.example.MyClass → com/example/MyClass.java
  // Remove wildcard
  const cleanPath = importPath.replace(/\.\*$/, '');
  const javaPath = cleanPath.replace(/\./g, '/') + '.java';

  // Common source roots to check
  const sourceRoots = [
    '',
    'src/main/java',
    'src',
    'app/src/main/java',
  ];

  for (const root of sourceRoots) {
    const candidate = root ? join(root, javaPath) : javaPath;
    const fullPath = join(projectRoot, candidate);
    if (existsSync(fullPath)) {
      return candidate;
    }
  }

  // For wildcard imports, try to find the package directory
  if (importPath.endsWith('.*')) {
    const packagePath = cleanPath.replace(/\./g, '/');
    for (const root of sourceRoots) {
      const candidate = root ? join(root, packagePath) : packagePath;
      const fullPath = join(projectRoot, candidate);
      if (existsSync(fullPath)) {
        try {
          const stats = statSync(fullPath);
          if (stats.isDirectory()) {
            const javaFiles = readdirSync(fullPath).filter((f: string) => f.endsWith('.java'));
            if (javaFiles.length > 0) {
              return join(candidate, javaFiles[0]);
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

function hasModifier(node: Parser.SyntaxNode, context: Context, modifier: string): boolean {
  const modifiers = node.childForFieldName('modifiers') || findChildByType(node, 'modifiers');
  if (modifiers) {
    for (let i = 0; i < modifiers.childCount; i++) {
      const child = modifiers.child(i);
      if (child && nodeText(child, context) === modifier) {
        return true;
      }
    }
  }

  // Also check direct children (some nodes have modifiers as direct children)
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === modifier) {
      return true;
    }
  }

  // In Java, package-private is the default (no modifier). We treat 'public' strictly.
  return false;
}

function extractTypeName(node: Parser.SyntaxNode, context: Context): string | null {
  const text = nodeText(node, context).trim();
  if (!text) return null;

  // Strip generic parameters: List<String> → List
  const angleBracketIdx = text.indexOf('<');
  const name = angleBracketIdx > 0 ? text.substring(0, angleBracketIdx) : text;

  // Strip qualified name prefix: java.util.List → List
  const dotIdx = name.lastIndexOf('.');
  return dotIdx >= 0 ? name.substring(dotIdx + 1) : name;
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
export const javaParser: LanguageParser = {
  name: 'java',
  extensions: ['.java', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
  parseFile: parseJavaFile,
};
