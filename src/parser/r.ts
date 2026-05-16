import { SymbolNode, SymbolEdge, ParsedFile, LanguageParser } from './types.js';
import { dirname, join, resolve, basename } from 'path';
import { existsSync } from 'fs';

/**
 * R Language Parser — Pattern-based (tree-sitter-r is unavailable on npm)
 *
 * Supports: function definitions via <-, =, and -> assignment operators,
 * anonymous functions and v4.1+ shorthand (\(x) ...), S3 methods,
 * S4 class/generic/method definitions, R6 class definitions,
 * library()/require() imports, source() file dependencies,
 * :: and ::: namespace access, function call edges,
 * operator overloading definitions, and R Markdown (.Rmd) code chunks.
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

export function parseRFile(
  filePath: string,
  sourceCode: string,
  projectRoot: string
): ParsedFile {
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

  // For R Markdown files, extract R code chunks first
  const isRmd = filePath.endsWith('.Rmd') || filePath.endsWith('.rmd');
  const codeToparse = isRmd ? extractRmdChunks(sourceCode) : sourceCode;

  const lines = codeToparse.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // library() / require() — import edges
    processLibraryStatements(trimmed, lineNum, context);

    // source() — file dependency edges
    processSourceStatements(trimmed, lineNum, context);

    // S4 class definitions: setClass, setGeneric, setMethod
    processS4Definitions(trimmed, lineNum, context);

    // R6 class definitions: R6::R6Class() or R6Class()
    processR6Definitions(trimmed, lineNum, context);

    // Function definitions via <- or = (left-assignment)
    processLeftAssignFunction(trimmed, lineNum, context);

    // Function definitions via -> (right-assignment)
    processRightAssignFunction(trimmed, lineNum, context);

    // Anonymous / shorthand functions (not assigned to a name)
    processAnonymousFunction(trimmed, lineNum, context);

    // :: and ::: namespace access edges
    processNamespaceAccess(trimmed, lineNum, context);

    // Function call edges
    processCallEdges(trimmed, lineNum, context);
  }

  return {
    filePath,
    symbols: context.symbols,
    edges: context.edges,
  };
}

// ─── R Markdown chunk extraction ─────────────────────────────

/**
 * Extracts R code from fenced ```{r ...} ... ``` blocks in .Rmd files.
 * Non-R lines are replaced with blank lines to preserve line numbers.
 */
function extractRmdChunks(source: string): string {
  const lines = source.split('\n');
  const result: string[] = [];
  let inChunk = false;

  for (const line of lines) {
    if (!inChunk && /^```\{r/.test(line.trim())) {
      inChunk = true;
      result.push(''); // Replace fence marker with blank line
    } else if (inChunk && /^```\s*$/.test(line.trim())) {
      inChunk = false;
      result.push(''); // Replace closing fence with blank line
    } else if (inChunk) {
      result.push(line); // Keep R code as-is
    } else {
      result.push(''); // Replace non-R prose with blank to preserve line numbers
    }
  }

  return result.join('\n');
}

// ─── library() / require() ───────────────────────────────────

function processLibraryStatements(line: string, lineNum: number, context: Context): void {
  // library(pkg), library("pkg"), library('pkg')
  // require(pkg), require("pkg"), require('pkg')
  const libMatch = line.match(/^(?:library|require)\s*\(\s*["']?([\w.]+)["']?/);
  if (!libMatch) return;

  const pkgName = libMatch[1];
  const symbolId = `${context.filePath}::import:${pkgName}`;

  context.symbols.push({
    id: symbolId,
    name: pkgName,
    kind: 'import',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: false,
  });

  context.imports.set(pkgName, pkgName);
}

// ─── source() ────────────────────────────────────────────────

function processSourceStatements(line: string, lineNum: number, context: Context): void {
  // source("file.R") or source('file.R')
  const sourceMatch = line.match(/^source\s*\(\s*["']([^'"]+)["']/);
  if (!sourceMatch) return;

  const sourcePath = sourceMatch[1];
  const symbolId = `${context.filePath}::source:${sourcePath}`;

  context.symbols.push({
    id: symbolId,
    name: sourcePath,
    kind: 'import',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: false,
  });

  // Resolve relative path and add file dependency edge
  const resolvedPath = resolveRSource(sourcePath, context.filePath, context.projectRoot);
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

// ─── S4 class definitions ────────────────────────────────────

function processS4Definitions(line: string, lineNum: number, context: Context): void {
  // setClass("ClassName", ...)
  const setClassMatch = line.match(/^(?:\w+\s*(?:<-|=)\s*)?setClass\s*\(\s*["'](\w[\w.]*)["']/);
  if (setClassMatch) {
    const name = setClassMatch[1];
    const symbolId = `${context.filePath}::${name}`;

    context.symbols.push({
      id: symbolId,
      name,
      kind: 'class',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true,
    });
    return;
  }

  // setGeneric("genericName", ...)
  const setGenericMatch = line.match(/^(?:\w+\s*(?:<-|=)\s*)?setGeneric\s*\(\s*["'](\w[\w.]*)["']/);
  if (setGenericMatch) {
    const name = setGenericMatch[1];
    const symbolId = `${context.filePath}::${name}`;

    context.symbols.push({
      id: symbolId,
      name,
      kind: 'function',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true,
    });
    return;
  }

  // setMethod("genericName", "ClassName", ...)
  const setMethodMatch = line.match(/^(?:\w+\s*(?:<-|=)\s*)?setMethod\s*\(\s*["'](\w[\w.]*)["']\s*,\s*["'](\w[\w.]*)["']/);
  if (setMethodMatch) {
    const genericName = setMethodMatch[1];
    const className = setMethodMatch[2];
    const name = `${genericName}.${className}`;
    const symbolId = `${context.filePath}::${name}`;

    context.symbols.push({
      id: symbolId,
      name,
      kind: 'method',
      filePath: context.filePath,
      startLine: lineNum,
      endLine: lineNum,
      exported: true,
      scope: className,
    });

    // Edge from method to its class
    const classId = `${context.filePath}::${className}`;
    if (context.symbols.find(s => s.id === classId)) {
      context.edges.push({
        source: symbolId,
        target: classId,
        kind: 'references',
        filePath: context.filePath,
        line: lineNum,
      });
    }
    return;
  }
}

// ─── R6 class definitions ─────────────────────────────────────

function processR6Definitions(line: string, lineNum: number, context: Context): void {
  // MyClass <- R6::R6Class("MyClass", ...) or MyClass <- R6Class("MyClass", ...)
  // Also handles: MyClass = R6::R6Class(...) and assignment-less calls
  const r6Match = line.match(/^(\w[\w.]*)\s*(?:<-|=)\s*(?:R6::)?R6Class\s*\(\s*(?:["'](\w[\w.]*)["'])?/);
  if (!r6Match) return;

  const assignedName = r6Match[1];
  const className = r6Match[2] || assignedName;
  const symbolId = `${context.filePath}::${className}`;

  context.symbols.push({
    id: symbolId,
    name: className,
    kind: 'class',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: !assignedName.startsWith('.'),
  });
}

// ─── Left-assignment function definitions ────────────────────

function processLeftAssignFunction(line: string, lineNum: number, context: Context): void {
  // Matches:
  //   myfunc <- function(...)
  //   myfunc = function(...)
  //   myfunc <- \(...)   (v4.1+ shorthand)
  //   myfunc = \(...)
  // Also S3 methods: print.myclass <- function(...)
  // Also operator overloads: `+.myclass` <- function(...)
  const funcMatch = line.match(
    /^`?([A-Za-z._][A-Za-z0-9._]*(?:\.[A-Za-z][A-Za-z0-9._]*)*|[+\-*\/^!<>=&|]+\.[A-Za-z][A-Za-z0-9._]*)`?\s*(?:<-|=)\s*(?:function|\\\()/
  );
  if (!funcMatch) return;

  const rawName = funcMatch[1];
  registerFunction(rawName, lineNum, context);
}

// ─── Right-assignment function definitions ───────────────────

function processRightAssignFunction(line: string, lineNum: number, context: Context): void {
  // function(...) { ... } -> myfunc
  // \(...) ... -> myfunc
  const rightMatch = line.match(
    /(?:function|\\\()\s*\([^)]*\).*->\s*`?([A-Za-z._][A-Za-z0-9._]*)`?\s*$/
  );
  if (!rightMatch) return;

  const rawName = rightMatch[1];
  registerFunction(rawName, lineNum, context);
}

// ─── Anonymous function detection ────────────────────────────

function processAnonymousFunction(line: string, lineNum: number, context: Context): void {
  // Detect anonymous functions that are NOT part of an assignment:
  // e.g. lapply(x, function(y) y * 2) or sapply(x, \(y) y + 1)
  // We only emit a symbol if they appear standalone as arguments (heuristic).
  // Skip lines already captured by left/right assign processors.
  if (/(?:<-|=)\s*(?:function|\\\()/.test(line)) return;
  if (/(?:function|\\\().*->/.test(line)) return;

  const anonMatch = line.match(/(?:function|\\\()\s*\([^)]*\)/);
  if (!anonMatch) return;

  const symbolId = `${context.filePath}::__anon__:${lineNum}`;
  context.symbols.push({
    id: symbolId,
    name: `<anonymous:${lineNum}>`,
    kind: 'function',
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: false,
  });
}

// ─── Namespace access (:: and :::) ────────────────────────────

function processNamespaceAccess(line: string, lineNum: number, context: Context): void {
  // pkg::fn or pkg:::fn
  const nsPattern = /\b([\w.]+):::([\w.]+)\b|\b([\w.]+)::([\w.]+)\b/g;
  let match;
  while ((match = nsPattern.exec(line)) !== null) {
    const pkg = match[1] || match[3];
    const fn = match[2] || match[4];

    // Skip if it looks like a definition (already handled)
    if (/(?:R6Class|setClass|setGeneric|setMethod)/.test(fn)) continue;

    const targetId = `${pkg}::${fn}`;
    const callerId = getCurrentSymbolId(context);

    // Record import reference to the package if not already recorded
    if (!context.imports.has(pkg)) {
      context.imports.set(pkg, pkg);
      context.symbols.push({
        id: `${context.filePath}::import:${pkg}`,
        name: pkg,
        kind: 'import',
        filePath: context.filePath,
        startLine: lineNum,
        endLine: lineNum,
        exported: false,
      });
    }

    if (callerId) {
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

// ─── Function call edges ──────────────────────────────────────

function processCallEdges(line: string, lineNum: number, context: Context): void {
  if (context.currentScope.length === 0) return;

  // Match calls: someFn(...) — skip namespace calls (already handled)
  const callPattern = /\b([A-Za-z._][A-Za-z0-9._]*)\s*\(/g;
  let match;
  while ((match = callPattern.exec(line)) !== null) {
    const callee = match[1];
    if (isRBuiltin(callee)) continue;
    // Skip calls that are part of namespace access (pkg::fn already covered)
    if (new RegExp(`[\\w.]+:::?${callee}\\s*\\(`).test(line)) continue;

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

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Shared logic to register a function symbol, handling S3 methods and
 * operator overloads. Updates currentScope for call-edge tracking.
 */
function registerFunction(rawName: string, lineNum: number, context: Context): void {
  const symbolId = `${context.filePath}::${rawName}`;

  // Determine if this is an S3 method: name contains a dot and the part
  // before the first dot looks like a generic (e.g. print.myclass)
  // OR an operator overload (+.myclass, -.myclass, etc.)
  const operatorOverloadMatch = rawName.match(/^([+\-*\/^!<>=&|]+)\.(.+)$/);
  const s3DotIdx = !operatorOverloadMatch ? rawName.indexOf('.') : -1;
  const isS3Method = s3DotIdx > 0;
  const isOperatorOverload = operatorOverloadMatch !== null;

  let kind: SymbolNode['kind'] = 'function';
  let scope: string | undefined;

  if (isOperatorOverload) {
    // e.g. +.myclass — treat as a method of the class
    scope = operatorOverloadMatch![2];
    kind = 'method';
  } else if (isS3Method) {
    // e.g. print.myclass — treat as a method
    scope = rawName.slice(s3DotIdx + 1);
    kind = 'method';
  }

  context.symbols.push({
    id: symbolId,
    name: rawName,
    kind,
    filePath: context.filePath,
    startLine: lineNum,
    endLine: lineNum,
    exported: !rawName.startsWith('.'),
    ...(scope !== undefined ? { scope } : {}),
  });

  // Track scope for call-edge resolution
  context.currentScope.push(rawName);
}

function resolveRSource(sourcePath: string, currentFile: string, projectRoot: string): string | null {
  const dir = dirname(join(projectRoot, currentFile));
  const candidate = join(dir, sourcePath);
  if (existsSync(candidate)) {
    return candidate.replace(projectRoot + '/', '');
  }
  // Try from project root directly
  const rootCandidate = join(projectRoot, sourcePath);
  if (existsSync(rootCandidate)) {
    return rootCandidate.replace(projectRoot + '/', '');
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

function getCurrentSymbolId(context: Context): string | null {
  if (context.currentScope.length === 0) return null;
  return `${context.filePath}::${context.currentScope[context.currentScope.length - 1]}`;
}

function isRBuiltin(name: string): boolean {
  const builtins = new Set([
    // Core language
    'c', 'list', 'vector', 'matrix', 'array', 'data.frame', 'tibble',
    'function', 'return', 'if', 'else', 'for', 'while', 'repeat', 'break', 'next',
    'TRUE', 'FALSE', 'NULL', 'NA', 'Inf', 'NaN',
    // Common base functions
    'print', 'cat', 'message', 'warning', 'stop', 'tryCatch', 'try',
    'paste', 'paste0', 'sprintf', 'format', 'formatC',
    'length', 'nrow', 'ncol', 'dim', 'names', 'colnames', 'rownames',
    'str', 'summary', 'head', 'tail', 'class', 'inherits', 'is', 'as',
    'lapply', 'sapply', 'vapply', 'tapply', 'mapply', 'Map', 'Reduce', 'Filter',
    'apply', 'rapply',
    'which', 'any', 'all', 'sum', 'prod', 'min', 'max', 'range', 'mean', 'median',
    'var', 'sd', 'cor', 'cov',
    'seq', 'seq_len', 'seq_along', 'rep', 'rev', 'sort', 'order', 'rank',
    'match', 'pmatch', 'charmatch', '%in%',
    'unique', 'duplicated', 'table', 'tabulate',
    'merge', 'rbind', 'cbind',
    'subset', 'which', 'grep', 'grepl', 'sub', 'gsub', 'regexpr', 'regmatches',
    'strsplit', 'toupper', 'tolower', 'trimws', 'nchar', 'substr', 'substring',
    'is.na', 'is.null', 'is.numeric', 'is.character', 'is.logical', 'is.list',
    'is.data.frame', 'is.vector', 'is.matrix', 'is.array', 'is.factor',
    'as.numeric', 'as.character', 'as.logical', 'as.integer', 'as.factor',
    'as.data.frame', 'as.list', 'as.vector', 'as.matrix',
    'numeric', 'character', 'logical', 'integer', 'complex',
    'Sys.time', 'Sys.Date', 'Sys.getenv', 'Sys.setenv',
    'file.exists', 'readLines', 'writeLines', 'readRDS', 'saveRDS',
    'read.csv', 'write.csv', 'read.table', 'write.table',
    'setwd', 'getwd', 'list.files', 'dir',
    'library', 'require', 'source', 'install.packages',
    'setClass', 'setGeneric', 'setMethod', 'new',
    'R6Class',
    'environment', 'new.env', 'parent.env', 'local', 'eval', 'parse',
    'quote', 'bquote', 'substitute', 'deparse',
    'trunc', 'round', 'floor', 'ceiling', 'abs', 'sqrt', 'exp', 'log', 'log2', 'log10',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  ]);
  return builtins.has(name);
}

// Export as LanguageParser interface
export const rParser: LanguageParser = {
  name: 'r',
  extensions: ['.R', '.r', '.Rmd', '.rmd'],
  parseFile: parseRFile,
};
