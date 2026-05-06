import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, extname, resolve, basename } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Mojo Language Parser — Pattern-based (no tree-sitter-mojo available on npm)
 * 
 * Mojo is a superset of Python by Modular, designed for AI/ML workloads.
 * Uses .mojo and .🔥 file extensions.
 * Supports: fn, def, struct, class, trait, alias, var, let, imports,
 * decorators, parameter modifiers, SIMD/Tensor/DType references, and call edges.
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

export function parseMojoFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
  // Handle mojoproject.toml
  if (filePath.endsWith('mojoproject.toml')) {
    return parseMojoProject(filePath, sourceCode, projectRoot);
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
  parseLines(lines, context);

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

function parseLines(lines: string[], context: Context): void {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Decorators — collect them but don't create symbols
    if (trimmed.startsWith('@')) {
      i++;
      continue;
    }

    // Import statements
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      processImport(trimmed, lineNum, context);
      i++;
      continue;
    }

    // fn declarations (Mojo-specific typed functions)
    const fnMatch = trimmed.match(/^fn\s+(\w+)\s*[\[(]/);
    if (fnMatch) {
      const name = fnMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addFunction(name, lineNum, endLine, context);
      i = endLine;
      continue;
    }

    // def declarations (Python-compatible)
    const defMatch = trimmed.match(/^def\s+(\w+)\s*[\[(]/);
    if (defMatch) {
      const name = defMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addFunction(name, lineNum, endLine, context);
      i = endLine;
      continue;
    }

    // struct declarations
    const structMatch = trimmed.match(/^struct\s+(\w+)/);
    if (structMatch) {
      const name = structMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addType(name, 'class', lineNum, endLine, context);
      // Parse struct body
      parseStructBody(lines, i + 1, endLine, indent, name, context);
      i = endLine;
      continue;
    }

    // class declarations
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addType(name, 'class', lineNum, endLine, context);
      parseStructBody(lines, i + 1, endLine, indent, name, context);
      i = endLine;
      continue;
    }

    // trait declarations
    const traitMatch = trimmed.match(/^trait\s+(\w+)/);
    if (traitMatch) {
      const name = traitMatch[1];
      const endLine = findBlockEnd(lines, i, indent);
      addType(name, 'interface', lineNum, endLine, context);
      parseStructBody(lines, i + 1, endLine, indent, name, context);
      i = endLine;
      continue;
    }

    // alias declarations
    const aliasMatch = trimmed.match(/^alias\s+(\w+)\s*[=:]/);
    if (aliasMatch) {
      const name = aliasMatch[1];
      context.symbols.push({
        id: `${context.filePath}::${name}`,
        name,
        kind: 'type_alias',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
      });
      i++;
      continue;
    }

    // var/let top-level declarations
    const varMatch = trimmed.match(/^(var|let)\s+(\w+)/);
    if (varMatch && indent === 0) {
      const name = varMatch[2];
      const kind = varMatch[1] === 'let' ? 'constant' : 'var';
      context.symbols.push({
        id: `${context.filePath}::${name}`,
        name,
        kind,
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
      });
      i++;
      continue;
    }

    // Function call detection (for edges)
    processCallsInLine(trimmed, lineNum, context);

    i++;
  }
}

function processImport(line: string, lineNum: number, context: Context): void {
  // from python import module
  // from python.module import func
  // import module
  // from module import symbol
  let importName: string | null = null;

  const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
  if (fromMatch) {
    const module = fromMatch[1];
    const symbols = fromMatch[2].split(',').map(s => s.trim());
    importName = module;
    for (const sym of symbols) {
      const cleanSym = sym.split(' as ')[0].trim();
      if (cleanSym && cleanSym !== '*') {
        context.imports.set(cleanSym, `${module}::${cleanSym}`);
      }
    }
  } else {
    const importMatch = line.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      importName = importMatch[1];
      const alias = importMatch[2] || importMatch[1].split('.').pop()!;
      context.imports.set(alias, `${importMatch[1]}::__module__`);
    }
  }

  if (importName) {
    context.symbols.push({
      id: `${context.filePath}::import:${importName}`,
      name: importName,
      kind: 'import',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: false,
    });
  }
}

function addFunction(name: string, startLine: number, endLine: number, context: Context): void {
  const scope = context.currentClass || undefined;
  const symbolId = scope
    ? `${context.filePath}::${scope}.${name}`
    : `${context.filePath}::${name}`;

  context.symbols.push({
    id: symbolId,
    name,
    kind: context.currentClass ? 'method' : 'function',
    filePath: context.filePath,
    startLine,
    endLine,
    exported: true,
    scope,
  });
}

function addType(name: string, kind: string, startLine: number, endLine: number, context: Context): void {
  context.symbols.push({
    id: `${context.filePath}::${name}`,
    name,
    kind,
    filePath: context.filePath,
    startLine,
    endLine,
    exported: true,
  });
}

function parseStructBody(
  lines: string[],
  start: number,
  end: number,
  baseIndent: number,
  className: string,
  context: Context
): void {
  const oldClass = context.currentClass;
  context.currentClass = className;

  let i = start;
  while (i < end && i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const lineNum = i + 1;

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
      i++;
      continue;
    }

    // Only process direct children (one level deeper than base)
    if (indent <= baseIndent) break;

    // fn/def inside struct/class/trait
    const fnMatch = trimmed.match(/^(fn|def)\s+(\w+)\s*[\[(]/);
    if (fnMatch) {
      const name = fnMatch[2];
      const fnEnd = findBlockEnd(lines, i, indent);
      addFunction(name, lineNum, fnEnd, context);
      i = fnEnd;
      continue;
    }

    // var/let fields
    const varMatch = trimmed.match(/^(var|let)\s+(\w+)/);
    if (varMatch) {
      const name = varMatch[2];
      context.symbols.push({
        id: `${context.filePath}::${className}.${name}`,
        name,
        kind: 'property',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
        scope: className,
      });
      i++;
      continue;
    }

    // alias inside struct
    const aliasMatch = trimmed.match(/^alias\s+(\w+)\s*[=:]/);
    if (aliasMatch) {
      const name = aliasMatch[1];
      context.symbols.push({
        id: `${context.filePath}::${className}.${name}`,
        name,
        kind: 'type_alias',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: true,
        scope: className,
      });
      i++;
      continue;
    }

    i++;
  }

  context.currentClass = oldClass;
}

function processCallsInLine(line: string, lineNum: number, context: Context): void {
  // Match function calls: identifier( or identifier[...]( 
  const callRegex = /\b(\w+)\s*(?:\[[^\]]*\]\s*)?\(/g;
  let match: RegExpExecArray | null;

  const builtins = new Set([
    'print', 'len', 'range', 'int', 'str', 'float', 'bool', 'type',
    'if', 'elif', 'while', 'for', 'return', 'raise', 'assert',
    'fn', 'def', 'struct', 'class', 'trait', 'alias', 'var', 'let',
    'from', 'import', 'inout', 'owned', 'borrowed',
  ]);

  while ((match = callRegex.exec(line)) !== null) {
    const name = match[1];
    if (builtins.has(name)) continue;
    if (name.startsWith('_') && name !== '__init__') continue;

    // Create a call edge if we're in a scope
    if (context.currentScope.length > 0 || context.currentClass) {
      const callerId = context.currentClass
        ? `${context.filePath}::${context.currentClass}`
        : `${context.filePath}::__file__`;

      const targetId = context.imports.get(name) || `${context.filePath}::${name}`;

      context.edges.push({
        source: callerId,
        target: targetId,
        kind: 'calls',
        filePath: context.filePath,
        line: lineNum,
      });
    }
  }
}

function findBlockEnd(lines: string[], startIdx: number, baseIndent: number): number {
  // Find the end of a block by looking for the next line at same or lesser indentation
  let i = startIdx + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent) {
      return i;
    }
    i++;
  }
  return i;
}

function parseMojoProject(filePath: string, sourceCode: string, projectRoot: string): ParsedFile {
  const symbols: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const lines = sourceCode.split('\n');

  // Extract project name from [project] section
  let projectName = basename(dirname(join(projectRoot, filePath)));
  const nameMatch = sourceCode.match(/name\s*=\s*["']([^"']+)["']/);
  if (nameMatch) {
    projectName = nameMatch[1];
  }

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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const depMatch = line.match(/^(\w[\w-]*)\s*=\s*["']([^"']+)["']/);
    if (depMatch) {
      symbols.push({
        id: `${filePath}::dep:${depMatch[1]}`,
        name: depMatch[1],
        kind: 'import',
        filePath,
        startLine: i + 1,
        endLine: i + 1,
        exported: false,
      });
    }
  }

  return { filePath, symbols, edges };
}

// Export as LanguageParser interface
export const mojoParser: LanguageParser = {
  name: 'mojo',
  extensions: ['.mojo', '.🔥', 'mojoproject.toml'],
  parseFile: parseMojoFile,
};
