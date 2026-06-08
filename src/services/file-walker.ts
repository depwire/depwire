/**
 * Lightweight Java/Kotlin source walker used by the service-graph detectors.
 *
 * We don't reuse depwire's tree-sitter parser here because:
 *   - We only need raw text for regex pattern matching of annotations and method calls.
 *   - The detectors operate on patterns that are stable across formatters.
 *   - Avoids the WASM init cost when scanning 40+ services.
 */

import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const SKIP_DIRS = new Set([
  'node_modules', 'build', 'dist', 'out', 'target', '.git', '.gradle',
  '.idea', '.vscode', 'bin', '.depwire', '.verdent', 'logs',
  'src/test', 'test', 'tests',
]);

const SOURCE_EXTS = ['.java', '.kt', '.kts'];

export interface SourceFile {
  /** Path relative to the service root. */
  relativePath: string;
  /** Absolute path. */
  absolutePath: string;
  content: string;
}

export function walkServiceSources(
  serviceRoot: string,
  options: { includeTests?: boolean } = {},
): SourceFile[] {
  const out: SourceFile[] = [];
  walk(serviceRoot, serviceRoot, out, options.includeTests ?? false);
  return out;
}

function walk(
  root: string,
  dir: string,
  out: SourceFile[],
  includeTests: boolean,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    const rel = relative(root, path);

    // Skip well-known build / IDE / generated dirs.
    const segments = rel.split(/[\\/]/);
    if (segments.some(s => SKIP_DIRS.has(s))) continue;
    if (!includeTests && segments.includes('test')) continue;

    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      walk(root, path, out, includeTests);
    } else if (stats.isFile()) {
      const lower = entry.toLowerCase();
      if (!SOURCE_EXTS.some(ext => lower.endsWith(ext))) continue;
      if (stats.size > 1_000_000) continue; // skip giant generated files
      try {
        const content = readFileSync(path, 'utf-8');
        out.push({
          relativePath: rel,
          absolutePath: path,
          content,
        });
      } catch {
        continue;
      }
    }
  }
}


/**
 * Find the enclosing Java/Kotlin method and class for a 0-based character
 * offset in the source. Deterministic, brace-counting based.
 *
 * Returns the nearest method declaration whose body contains the offset, plus
 * the class that contains that method. Best-effort: complex nested generics or
 * lambdas may produce an approximate method name, which is acceptable for
 * impact-flow labeling.
 */
export function findEnclosingMethod(
  source: string,
  offset: number,
): { method?: string; cls?: string } {
  const cls = findEnclosing(source, offset, CLASS_DECL_RE);
  const method = findEnclosingMethodName(source, offset);
  return { method, cls };
}

// Functional-interface callback method names. When a channel site sits inside
// an anonymous `new Runnable(){ public void run(){...} }` or a lambda body, the
// nearest enclosing method is one of these framework callbacks, which is not
// useful for impact labeling. We attribute the site to the nearest *named
// business method* that encloses the callback instead.
const CALLBACK_METHOD_NAMES = new Set([
  'run', 'call', 'accept', 'apply', 'get', 'test', 'compare', 'doInBackground',
  'onMessage', 'lambda', 'invoke', 'execute',
]);

/**
 * Return the most meaningful enclosing method name for an offset.
 *
 * Strategy: gather every method declaration whose body encloses the offset
 * (the full nesting chain from outermost to innermost). Prefer the innermost
 * method whose name is NOT a framework callback. If every enclosing method is
 * a callback (rare), fall back to the innermost callback name.
 */
function findEnclosingMethodName(source: string, offset: number): string | undefined {
  const chain = collectEnclosing(source, offset, METHOD_DECL_RE); // outermost → innermost
  if (chain.length === 0) return undefined;

  // Walk innermost → outermost, return the first non-callback (business) method.
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!CALLBACK_METHOD_NAMES.has(chain[i].name)) {
      return chain[i].name;
    }
  }
  // Everything was a callback — return innermost as last resort.
  return chain[chain.length - 1].name;
}

// Matches a method declaration: `... returnType methodName(` with a following body.
// Excludes control-flow keywords (if/for/while/switch/catch) that look similar.
const METHOD_DECL_RE =
  /(?:public|private|protected|static|final|synchronized|abstract|default|\s)+[\w<>\[\],.?&\s]+\s+(\w+)\s*\([^;{]*\)\s*(?:throws[\w\s,.]+)?\{/g;

const CLASS_DECL_RE =
  /(?:public|private|protected|abstract|final|static|\s)*\b(?:class|interface|enum|record)\s+(\w+)/g;

const CONTROL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'synchronized', 'return', 'new',
]);

/**
 * Collect every declaration matched by `re` whose `{...}` block encloses
 * `offset`, ordered outermost → innermost (by declaration start position).
 */
function collectEnclosing(
  source: string,
  offset: number,
  re: RegExp,
): Array<{ name: string; start: number }> {
  re.lastIndex = 0;
  const enclosing: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  const isClassRe = re === CLASS_DECL_RE;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    if (CONTROL_KEYWORDS.has(name)) continue;
    const declStart = m.index;
    if (declStart > offset) break; // declarations appear in source order

    // For method declarations, reject anonymous-class constructions like
    // `new Runnable() {` and `new Callable<T>() {`: the captured token is a
    // TYPE name (Capitalized) immediately preceded by `new`. Real Java method
    // names are conventionally lowerCamelCase. We skip captures that (a) are
    // preceded by `new`, or (b) start with an uppercase letter (a type/ctor,
    // not a business method).
    if (!isClassRe) {
      const preceding = source.slice(Math.max(0, declStart - 4), declStart);
      if (/\bnew\s*$/.test(preceding)) continue;
      if (/^[A-Z]/.test(name)) continue;
    }

    const braceIdx = source.indexOf('{', m.index + m[0].length - 1);
    if (braceIdx === -1) continue;
    const blockEnd = matchBrace(source, braceIdx);
    if (blockEnd === -1) continue;
    if (offset >= braceIdx && offset <= blockEnd) {
      enclosing.push({ name, start: declStart });
    }
  }
  enclosing.sort((a, b) => a.start - b.start);
  return enclosing;
}

/**
 * Find the name captured by `re` for the declaration whose `{...}` block
 * encloses `offset`. Picks the innermost (latest-starting) enclosing block.
 */
function findEnclosing(source: string, offset: number, re: RegExp): string | undefined {
  const chain = collectEnclosing(source, offset, re);
  return chain.length > 0 ? chain[chain.length - 1].name : undefined;
}

/** Given the index of an opening `{`, return the index of its matching `}`. */
function matchBrace(source: string, openIdx: number): number {
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inQuote) {
      if (ch === '\\') { i++; continue; }
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
