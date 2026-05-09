import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, extname, resolve, basename } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Dart Language Parser — Pattern-based (no tree-sitter-dart WASM available)
 * 
 * Dart is Google's language for Flutter mobile/web/desktop, server-side apps,
 * and the broader Google ecosystem. Uses .dart file extension.
 * Supports: class, mixin, extension, enum, sealed class, abstract class,
 * functions, constructors, imports/exports/part/library directives,
 * generic types, records, async/await, Flutter widgets, and call edges.
 */

interface Context {
  filePath: string;
  projectRoot: string;
  sourceCode: string;
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  currentScope: string[];
  currentClass: string | null;
  imports: Map<string, string>;
}

export function parseDartFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle pubspec.yaml (dependency manifest)
  if (basename(filePath) === 'pubspec.yaml') {
    return parsePubspec(filePath, sourceCode, projectRoot);
  }

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

  const lines = sourceCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('///')) {
      continue;
    }

    // Import/export/part/library directives
    processDirectives(trimmed, lineNum, context);

    // Class declarations (abstract, sealed, base, final, interface, mixin class)
    processClassDeclaration(trimmed, lineNum, context, lines, i);

    // Mixin declarations
    processMixinDeclaration(trimmed, lineNum, context, lines, i);

    // Extension declarations
    processExtensionDeclaration(trimmed, lineNum, context, lines, i);

    // Enum declarations (including enhanced enums)
    processEnumDeclaration(trimmed, lineNum, context, lines, i);

    // Top-level functions and methods
    processFunctionDeclaration(trimmed, lineNum, context);

    // Top-level variables and constants
    processTopLevelVariable(trimmed, lineNum, context);

    // Function call edges
    processCallEdges(trimmed, lineNum, context);

    // Typedef declarations
    processTypedef(trimmed, lineNum, context);
  }

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

// ─── Directives ───────────────────────────────────────────────

function processDirectives(line: string, lineNum: number, context: Context): void {
  // import 'package:...'; or import '...' as ...; or import '...' show/hide ...;
  const importMatch = line.match(/^import\s+['"]([^'"]+)['"]\s*(?:as\s+(\w+))?\s*(?:show|hide)?/);
  if (importMatch) {
    const importPath = importMatch[1];
    const alias = importMatch[2];
    const symbolId = `${context.filePath}::import:${importPath}`;

    context.symbols.push({
      id: symbolId,
      name: importPath,
      kind: 'import',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false,
    });

    // Resolve relative imports
    if (!importPath.startsWith('package:') && !importPath.startsWith('dart:')) {
      const resolvedPath = resolveDartImport(importPath, context.filePath, context.projectRoot);
      if (resolvedPath) {
        context.edges.push({
          source: `${context.filePath}::__file__`,
          target: `${resolvedPath}::__file__`,
          kind: 'imports',
          filePath: context.filePath,
          line: lineNum,
        });
      }
    }

    if (alias) {
      context.imports.set(alias, importPath);
    }
    return;
  }

  // export 'path';
  const exportMatch = line.match(/^export\s+['"]([^'"]+)['"]/);
  if (exportMatch) {
    const exportPath = exportMatch[1];
    context.symbols.push({
      id: `${context.filePath}::export:${exportPath}`,
      name: exportPath,
      kind: 'import',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true,
    });

    if (!exportPath.startsWith('package:') && !exportPath.startsWith('dart:')) {
      const resolvedPath = resolveDartImport(exportPath, context.filePath, context.projectRoot);
      if (resolvedPath) {
        context.edges.push({
          source: `${context.filePath}::__file__`,
          target: `${resolvedPath}::__file__`,
          kind: 'imports',
          filePath: context.filePath,
          line: lineNum,
        });
      }
    }
    return;
  }

  // part 'file.dart';
  const partMatch = line.match(/^part\s+['"]([^'"]+)['"]/);
  if (partMatch) {
    const partPath = partMatch[1];
    context.symbols.push({
      id: `${context.filePath}::part:${partPath}`,
      name: partPath,
      kind: 'import',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false,
    });

    const resolvedPath = resolveDartImport(partPath, context.filePath, context.projectRoot);
    if (resolvedPath) {
      context.edges.push({
        source: `${context.filePath}::__file__`,
        target: `${resolvedPath}::__file__`,
        kind: 'imports',
        filePath: context.filePath,
        line: lineNum,
      });
    }
    return;
  }

  // part of 'file.dart'; or part of library_name;
  const partOfMatch = line.match(/^part\s+of\s+(?:['"]([^'"]+)['"]|(\w+))/);
  if (partOfMatch) {
    const partOfTarget = partOfMatch[1] || partOfMatch[2];
    context.symbols.push({
      id: `${context.filePath}::partOf:${partOfTarget}`,
      name: partOfTarget,
      kind: 'import',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false,
    });
    return;
  }

  // library name;
  const libraryMatch = line.match(/^library\s+(\w[\w.]*)\s*;/);
  if (libraryMatch) {
    context.symbols.push({
      id: `${context.filePath}::library:${libraryMatch[1]}`,
      name: libraryMatch[1],
      kind: 'module',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true,
    });
    return;
  }
}

// ─── Classes ──────────────────────────────────────────────────

function processClassDeclaration(
  line: string, lineNum: number, context: Context, lines: string[], idx: number
): void {
  // Match: [abstract|sealed|base|final|interface] class Name [<T>] [extends X] [with Y, Z] [implements A, B]
  const classMatch = line.match(
    /^(?:abstract\s+|sealed\s+|base\s+|final\s+|interface\s+)*class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+(\w+))?(?:\s+with\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/
  );
  if (!classMatch) return;

  const name = classMatch[1];
  const superclass = classMatch[2];
  const mixins = classMatch[3];
  const interfaces = classMatch[4];
  const symbolId = `${context.filePath}::${name}`;

  const endLine = findBlockEnd(lines, idx);

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith('_'),
  });

  // Inheritance edge
  if (superclass) {
    const targetId = resolveSymbol(superclass, context);
    if (targetId) {
      context.edges.push({
        source: symbolId,
        target: targetId,
        kind: 'implements',
        filePath: context.filePath,
        line: lineNum,
      });
    }
  }

  // Mixin usage edges
  if (mixins) {
    const mixinNames = mixins.split(',').map(m => m.trim()).filter(Boolean);
    for (const m of mixinNames) {
      const cleanName = m.replace(/<[^>]*>/, '').trim();
      if (cleanName) {
        const targetId = resolveSymbol(cleanName, context);
        if (targetId) {
          context.edges.push({
            source: symbolId,
            target: targetId,
            kind: 'implements',
            filePath: context.filePath,
            line: lineNum,
          });
        }
      }
    }
  }

  // Interface implementation edges
  if (interfaces) {
    const ifaceNames = interfaces.split(',').map(m => m.trim()).filter(Boolean);
    for (const iface of ifaceNames) {
      const cleanName = iface.replace(/<[^>]*>/, '').trim();
      if (cleanName) {
        const targetId = resolveSymbol(cleanName, context);
        if (targetId) {
          context.edges.push({
            source: symbolId,
            target: targetId,
            kind: 'implements',
            filePath: context.filePath,
            line: lineNum,
          });
        }
      }
    }
  }

  // Process class body for methods and constructors
  const oldClass = context.currentClass;
  context.currentClass = name;
  processClassBody(lines, idx, endLine, context);
  context.currentClass = oldClass;
}

// ─── Mixins ───────────────────────────────────────────────────

function processMixinDeclaration(
  line: string, lineNum: number, context: Context, lines: string[], idx: number
): void {
  const mixinMatch = line.match(/^mixin\s+(\w+)(?:<[^>]*>)?(?:\s+on\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/);
  if (!mixinMatch) return;
  // Avoid matching "mixin class" (already handled by class)
  if (/^mixin\s+class\s/.test(line)) return;

  const name = mixinMatch[1];
  const onConstraints = mixinMatch[2];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd(lines, idx);

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith('_'),
  });

  if (onConstraints) {
    const constraints = onConstraints.split(',').map(c => c.trim()).filter(Boolean);
    for (const c of constraints) {
      const cleanName = c.replace(/<[^>]*>/, '').trim();
      if (cleanName) {
        const targetId = resolveSymbol(cleanName, context);
        if (targetId) {
          context.edges.push({
            source: symbolId,
            target: targetId,
            kind: 'implements',
            filePath: context.filePath,
            line: lineNum,
          });
        }
      }
    }
  }

  const oldClass = context.currentClass;
  context.currentClass = name;
  processClassBody(lines, idx, endLine, context);
  context.currentClass = oldClass;
}

// ─── Extensions ───────────────────────────────────────────────

function processExtensionDeclaration(
  line: string, lineNum: number, context: Context, lines: string[], idx: number
): void {
  const extMatch = line.match(/^extension\s+(\w+)(?:<[^>]*>)?\s+on\s+(\w+)/);
  if (!extMatch) return;

  const name = extMatch[1];
  const onType = extMatch[2];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd(lines, idx);

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'class',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith('_'),
  });

  // Extension target as dependency edge
  const targetId = resolveSymbol(onType, context);
  if (targetId) {
    context.edges.push({
      source: symbolId,
      target: targetId,
      kind: 'implements',
      filePath: context.filePath,
      line: lineNum,
    });
  }

  const oldClass = context.currentClass;
  context.currentClass = name;
  processClassBody(lines, idx, endLine, context);
  context.currentClass = oldClass;
}

// ─── Enums ────────────────────────────────────────────────────

function processEnumDeclaration(
  line: string, lineNum: number, context: Context, lines: string[], idx: number
): void {
  const enumMatch = line.match(/^enum\s+(\w+)(?:<[^>]*>)?(?:\s+with\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/);
  if (!enumMatch) return;

  const name = enumMatch[1];
  const symbolId = `${context.filePath}::${name}`;
  const endLine = findBlockEnd(lines, idx);

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'enum',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: endLine + 1,
    exported: !name.startsWith('_'),
  });
}

// ─── Functions ────────────────────────────────────────────────

function processFunctionDeclaration(line: string, lineNum: number, context: Context): void {
  // Top-level or nested function: ReturnType functionName(...) { or =>
  // Also matches: void main() {, Future<void> fetchData() async {
  const funcMatch = line.match(
    /^(?:(?:static|external|abstract)\s+)*(?:[\w<>,?\s]+\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:async\s*\*?|sync\s*\*?)?\s*(?:\{|=>|;)/
  );
  if (!funcMatch) return;

  const name = funcMatch[1];

  // Skip keywords that look like functions
  if (['if', 'for', 'while', 'switch', 'catch', 'return', 'class', 'enum', 'mixin', 'extension', 'import', 'export', 'part', 'library', 'typedef'].includes(name)) {
    return;
  }

  // Skip if it's inside a class (handled by processClassBody)
  if (context.currentClass) return;

  const symbolId = `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: 'function',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: !name.startsWith('_'),
  });
}

// ─── Top-level variables ──────────────────────────────────────

function processTopLevelVariable(line: string, lineNum: number, context: Context): void {
  if (context.currentClass) return;

  // const/final/var/late declarations at top level
  const varMatch = line.match(/^(?:const|final|late\s+final|late)\s+(?:[\w<>,?\s]+\s+)?(\w+)\s*=/);
  if (varMatch) {
    const name = varMatch[1];
    if (['if', 'for', 'while', 'return'].includes(name)) return;
    context.symbols.push({
      id: `${context.filePath}::${name}`,
      name,
      kind: 'constant',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: !name.startsWith('_'),
    });
  }
}

// ─── Typedef ──────────────────────────────────────────────────

function processTypedef(line: string, lineNum: number, context: Context): void {
  const typedefMatch = line.match(/^typedef\s+(\w+)(?:<[^>]*>)?\s*=/);
  if (typedefMatch) {
    const name = typedefMatch[1];
    context.symbols.push({
      id: `${context.filePath}::${name}`,
      name,
      kind: 'type',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: !name.startsWith('_'),
    });
    return;
  }

  // Old-style typedef: typedef ReturnType Name(params);
  const oldTypedefMatch = line.match(/^typedef\s+\w[\w<>,?\s]*\s+(\w+)\s*\(/);
  if (oldTypedefMatch) {
    const name = oldTypedefMatch[1];
    context.symbols.push({
      id: `${context.filePath}::${name}`,
      name,
      kind: 'type',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: !name.startsWith('_'),
    });
  }
}

// ─── Call edges ───────────────────────────────────────────────

function processCallEdges(line: string, lineNum: number, context: Context): void {
  if (context.currentScope.length === 0) return;

  // Match function calls: name(...) or Name.method(...)
  const callPattern = /\b([A-Z]\w+)\s*\(/g;
  let match;
  while ((match = callPattern.exec(line)) !== null) {
    const callee = match[1];
    if (isBuiltin(callee)) continue;

    const callerId = getCurrentSymbolId(context);
    if (!callerId) continue;

    const calleeId = resolveSymbol(callee, context);
    if (calleeId) {
      context.edges.push({
        source: callerId,
        target: calleeId,
        kind: 'calls',
        filePath: context.filePath,
        line: lineNum,
      });
    }
  }
}

// ─── Class body processing ────────────────────────────────────

function processClassBody(lines: string[], startIdx: number, endIdx: number, context: Context): void {
  for (let i = startIdx + 1; i <= endIdx && i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    if (!line || line.startsWith('//') || line.startsWith('///') || line.startsWith('*')) continue;

    // Constructor: ClassName(...) or ClassName.named(...)
    const ctorMatch = line.match(
      new RegExp(`^(?:const\\s+)?${context.currentClass}(?:\\.([\\w]+))?\\s*\\(`)
    );
    if (ctorMatch) {
      const namedCtor = ctorMatch[1];
      const name = namedCtor ? `${context.currentClass}.${namedCtor}` : context.currentClass!;
      const symbolId = `${context.filePath}::${context.currentClass}.${namedCtor || 'constructor'}`;

      context.symbols.push({
        id: symbolId,
        name,
        kind: 'method',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
        scope: context.currentClass || undefined,
      });
      continue;
    }

    // Factory constructor: factory ClassName(...) or factory ClassName.named(...)
    const factoryMatch = line.match(
      new RegExp(`^factory\\s+${context.currentClass}(?:\\.(\\w+))?\\s*\\(`)
    );
    if (factoryMatch) {
      const namedFactory = factoryMatch[1];
      const name = namedFactory ? `${context.currentClass}.${namedFactory}` : `${context.currentClass}.factory`;
      const symbolId = `${context.filePath}::${context.currentClass}.${namedFactory || 'factory'}`;

      context.symbols.push({
        id: symbolId,
        name,
        kind: 'method',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
        scope: context.currentClass || undefined,
      });
      continue;
    }

    // Method declarations
    const methodMatch = line.match(
      /^(?:(?:static|@override|@protected|@visibleForTesting)\s+)*(?:[\w<>,?\s]+\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:async\s*\*?|sync\s*\*?)?\s*(?:\{|=>|;)/
    );
    if (methodMatch) {
      const name = methodMatch[1];
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'class', 'super'].includes(name)) continue;

      const symbolId = `${context.filePath}::${context.currentClass}.${name}`;

      context.symbols.push({
        id: symbolId,
        name,
        kind: 'method',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
        scope: context.currentClass || undefined,
      });
      continue;
    }

    // Getter/setter
    const getSetMatch = line.match(/^(?:static\s+)?(?:[\w<>,?\s]+\s+)?(?:get|set)\s+(\w+)/);
    if (getSetMatch) {
      const name = getSetMatch[1];
      const symbolId = `${context.filePath}::${context.currentClass}.${name}`;

      context.symbols.push({
        id: symbolId,
        name,
        kind: 'property',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
        scope: context.currentClass || undefined,
      });
      continue;
    }

    // Fields: final/const/late type name; or type name;
    const fieldMatch = line.match(/^(?:(?:static|final|const|late)\s+)+(?:[\w<>,?\s]+\s+)?(\w+)\s*[;=]/);
    if (fieldMatch) {
      const name = fieldMatch[1];
      if (['if', 'for', 'while', 'return'].includes(name)) continue;
      const symbolId = `${context.filePath}::${context.currentClass}.${name}`;

      context.symbols.push({
        id: symbolId,
        name,
        kind: 'property',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
        scope: context.currentClass || undefined,
      });
    }
  }
}

// ─── Pubspec.yaml parsing ─────────────────────────────────────

function parsePubspec(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  // Extract project name
  const nameMatch = sourceCode.match(/^name:\s*(\w+)/m);
  const projectName = nameMatch ? nameMatch[1] : 'pubspec';

  symbols.push({
    id: `${filePath}::${projectName}`,
    name: projectName,
    kind: 'module',
    filePath,
    startLine: 1,
    endLine: lines.length,
    exported: true,
  });

  // Extract dependencies
  let inDependencies = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/^(?:dependencies|dev_dependencies|dependency_overrides)\s*:/.test(line)) {
      inDependencies = true;
      continue;
    }

    if (inDependencies && /^\S/.test(line)) {
      inDependencies = false;
    }

    if (inDependencies) {
      const depMatch = line.match(/^\s{2}(\w[\w_-]*):/);
      if (depMatch) {
        symbols.push({
          id: `${filePath}::dep:${depMatch[1]}`,
          name: depMatch[1],
          kind: 'import',
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          exported: false,
        });
      }
    }
  }

  return { filePath, symbols, edges };
}

// ─── Helpers ──────────────────────────────────────────────────

function resolveDartImport(importPath: string, currentFile: string, projectRoot: string): string | null {
  const dir = dirname(join(projectRoot, currentFile));
  const candidate = join(dir, importPath);
  if (existsSync(candidate)) {
    return candidate.replace(projectRoot + '/', '');
  }

  // Try lib/ directory
  const libCandidate = join(projectRoot, 'lib', importPath);
  if (existsSync(libCandidate)) {
    return libCandidate.replace(projectRoot + '/', '');
  }

  return null;
}

function resolveSymbol(name: string, context: Context): string | null {
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

function findBlockEnd(lines: string[], startIdx: number): number {
  let braceCount = 0;
  let foundOpen = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') { braceCount++; foundOpen = true; }
      if (ch === '}') { braceCount--; }
      if (foundOpen && braceCount === 0) return i;
    }
  }

  return Math.min(startIdx + 50, lines.length - 1);
}

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}

function isBuiltin(name: string): boolean {
  const builtins = new Set([
    'String', 'int', 'double', 'bool', 'List', 'Map', 'Set', 'Future', 'Stream',
    'Object', 'dynamic', 'void', 'Null', 'Type', 'Symbol', 'Function',
    'Iterable', 'Iterator', 'Duration', 'DateTime', 'RegExp', 'Error',
    'Exception', 'Override', 'Deprecated',
  ]);
  return builtins.has(name);
}

// Export as LanguageParser interface
export const dartParser: LanguageParser = {
  name: 'dart',
  extensions: ['.dart', 'pubspec.yaml'],
  parseFile: parseDartFile,
};
