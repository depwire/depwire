/**
 * SECURITY: Parsing is READ-ONLY with respect to your source code.
 * Depwire never modifies or deletes any of your source files.
 * The only writes are: os.tmpdir() for cloned repos, and a local, git-ignored
 * parse cache at {projectRoot}/.depwire/cache.db used to skip re-parsing
 * unchanged files. The cache contains only derived data and is safe to delete;
 * disable it with parseProject(root, { useCache: false }).
 */

import { readFileSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { scanDirectory } from '../utils/files.js';
import { getParserForFile } from './detect.js';
import { ParsedFile, SymbolNode, SymbolEdge } from './types.js';
import { openCache, getCachedFiles, updateCache } from './cache.js';
import { minimatch } from 'minimatch';
import { initParser } from './wasm-init.js';
import { discoverJvmModuleRoots } from './jvm-modules.js';
import {
  setModuleSourceRoots as setJavaModuleRoots,
  resetModuleSourceRoots as resetJavaModuleRoots,
} from './java.js';
import {
  setModuleSourceRoots as setKotlinModuleRoots,
  resetModuleSourceRoots as resetKotlinModuleRoots,
} from './kotlin.js';

const MAX_FILE_SIZE = 1_000_000; // 1MB — files larger than this are likely generated

function shouldParseFile(fullPath: string): boolean {
  try {
    const stats = statSync(fullPath);
    if (stats.size > MAX_FILE_SIZE) {
      console.error(`[Parser] Skipping ${fullPath} — file too large (${(stats.size / 1024).toFixed(0)}KB)`);
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

export async function parseProject(
  projectRoot: string,
  options?: { exclude?: string[]; verbose?: boolean; useCache?: boolean }
): Promise<ParsedFile[]> {
  // Initialize WASM parsers (no-op if already initialized)
  await initParser();

  // ─── JVM multi-module pre-pass ─────────────────────────────
  // Reset module roots from any previous parseProject() call in this process
  // (ensures isolation when MCP server switches repos, or in test suites).
  resetJavaModuleRoots();
  resetKotlinModuleRoots();

  // Discover Maven/Gradle module source roots before parsing files.
  // This allows cross-module Java/Kotlin imports to resolve correctly.
  const jvmModules = discoverJvmModuleRoots(projectRoot);
  if (jvmModules.roots.length > 0) {
    setJavaModuleRoots(jvmModules.roots, jvmModules.verifiedRootSet);
    setKotlinModuleRoots(jvmModules.roots, jvmModules.verifiedRootSet);
    if (options?.verbose) {
      console.error(`[Parser] Discovered ${jvmModules.roots.length} JVM module source roots`);
    }
  }
  // ───────────────────────────────────────────────────────────
  
  const files = scanDirectory(projectRoot);
  const parsedFiles: ParsedFile[] = [];
  let skippedFiles = 0;
  let errorFiles = 0;

  // ─── Parse cache (opt-in, on by default) ───────────────────
  // Restore unchanged files from {projectRoot}/.depwire/cache.db so only
  // new/modified files are re-parsed. Any cache failure falls back to a
  // full cold parse, so this can never break parsing.
  const useCache = options?.useCache !== false;
  let cacheDb: ReturnType<typeof openCache> | null = null;
  let cachedMap = new Map<string, ParsedFile>();
  const newlyParsed: ParsedFile[] = [];
  if (useCache) {
    try {
      cacheDb = openCache(projectRoot);
    } catch (err) {
      console.error(`[Parser] Cache disabled (open failed): ${err instanceof Error ? err.message : err}`);
      cacheDb = null;
    }
    if (cacheDb) {
      cachedMap = getCachedFiles(cacheDb, projectRoot, files);
    } else {
      // better-sqlite3 unavailable (e.g. Windows without build tools) — the
      // full parse below still produces correct results.
      console.error('[Parser] Cache unavailable — full parse mode');
    }
  }
  // ───────────────────────────────────────────────────────────

  for (const file of files) {
    try {
      const fullPath = join(projectRoot, file);
      
      // Path containment check
      if (!resolve(fullPath).startsWith(resolve(projectRoot))) {
        skippedFiles++;
        continue;
      }
      
      // Check if file should be excluded
      if (options?.exclude) {
        const shouldExclude = options.exclude.some((pattern: string) => 
          minimatch(file, pattern, { matchBase: true })
        );
        if (shouldExclude) {
          if (options.verbose) {
            console.error(`[Parser] Excluded: ${file}`);
          }
          skippedFiles++;
          continue;
        }
      }
      
      // Skip large files
      if (!shouldParseFile(fullPath)) {
        skippedFiles++;
        continue;
      }

      // Reuse the cached result for unchanged files.
      const cached = cachedMap.get(file);
      if (cached) {
        parsedFiles.push(cached);
        continue;
      }
      
      if (options?.verbose) {
        console.error(`[Parser] Parsing: ${file}`);
      }
      
      // fullPath validated via resolve().startsWith() containment check above
      const sourceCode = readFileSync(fullPath, 'utf-8');

      const parser = getParserForFile(file, sourceCode);
      if (!parser) {
        console.error(`No parser found for file: ${file}`);
        skippedFiles++;
        continue;
      }
      
      const parsed = parser.parseFile(file, sourceCode, projectRoot);
      parsedFiles.push(parsed);
      newlyParsed.push(parsed);
    } catch (err) {
      errorFiles++;
      console.error(`Error parsing file ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  // Persist newly parsed files and report cache effectiveness.
  if (cacheDb) {
    try {
      updateCache(cacheDb, projectRoot, newlyParsed);
    } catch (err) {
      console.error(`[Parser] Cache update failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      try { cacheDb.close(); } catch { /* ignore */ }
    }
    console.error(`[Parser] Cache: ${parsedFiles.length - newlyParsed.length} hits, ${newlyParsed.length} files re-parsed`);
  }
  
  // ─── Angular component/template pairing ────────────────────
  // Runs on the full set (cached + freshly parsed) every call, so it never
  // depends on cache state. Adds `uses` edges from *.component.html templates
  // to their sibling component class and to referenced selectors/pipes.
  pairTemplatesWithComponents(parsedFiles);
  // ───────────────────────────────────────────────────────────

  if (options?.verbose || errorFiles > 0) {
    console.error(`\n[Parser] Summary:`);
    console.error(`  Parsed: ${parsedFiles.length} files`);
    if (skippedFiles > 0) {
      console.error(`  Skipped: ${skippedFiles} files`);
    }
    if (errorFiles > 0) {
      console.error(`  Errors: ${errorFiles} files`);
    }
  }
  
  return parsedFiles;
}

/**
 * Angular component/template pairing pass.
 *
 * For each `*.component.html` template, finds the sibling `*.component.ts` in
 * the same directory and emits `uses` edges:
 *   1. template -> component class
 *   2. template -> each referenced symbol (component selector / directive /
 *      pipe). References whose selector matches a project @Component decorator
 *      resolve to that component class node; everything else points at an
 *      `external::<name>` marker that buildGraph drops (both-endpoints rule).
 *
 * Edges are appended to the template's ParsedFile so they flow through the
 * normal buildGraph pipeline. Recomputed every parse — independent of cache.
 */
function pairTemplatesWithComponents(parsedFiles: ParsedFile[]): void {
  // selector string -> component class node id (built from @Component metadata)
  const selectorIndex = new Map<string, string>();
  for (const file of parsedFiles) {
    for (const symbol of file.symbols) {
      const selector = symbol.metadata?.angularSelector;
      if (typeof selector === 'string' && selector.length > 0) {
        for (const part of selector.split(',')) {
          const key = part.trim();
          if (key && !selectorIndex.has(key)) {
            selectorIndex.set(key, symbol.id);
          }
        }
      }
    }
  }

  // Fast lookup of a file's parsed result by relative path.
  const byPath = new Map<string, ParsedFile>();
  for (const file of parsedFiles) byPath.set(file.filePath, file);

  for (const file of parsedFiles) {
    if (!/\.component\.html$/.test(file.filePath)) continue;

    const templateSymbol = file.symbols.find(s => s.id.endsWith('::__template__'));
    if (!templateSymbol) continue;
    const templateId = templateSymbol.id;

    // Locate the sibling component class.
    const tsPath = file.filePath.replace(/\.component\.html$/, '.component.ts');
    const tsFile = byPath.get(tsPath);
    if (tsFile) {
      const classSymbol =
        tsFile.symbols.find(s => s.kind === 'class' && s.metadata?.angularSelector) ||
        tsFile.symbols.find(s => s.kind === 'class' && s.exported) ||
        tsFile.symbols.find(s => s.kind === 'class');
      if (classSymbol) {
        file.edges.push({
          source: templateId,
          target: classSymbol.id,
          kind: 'uses',
          filePath: file.filePath,
          line: 1,
        });
      }
    }

    // Emit uses edges for each extracted template reference.
    const references = (templateSymbol.metadata?.references ?? []) as Array<{
      type: string;
      name: string;
      line: number;
    }>;
    for (const ref of references) {
      const target = selectorIndex.get(ref.name) ?? `external::${ref.name}`;
      file.edges.push({
        source: templateId,
        target,
        kind: 'uses',
        filePath: file.filePath,
        line: ref.line,
      });
    }
  }
}

/**
 * Candidate paths for a previously written `depwire parse` output file, in
 * priority order. `depwire mcp` probes these to load a pre-parsed graph on
 * startup instead of re-parsing from scratch.
 */
export function findOutputJson(projectRoot: string): string[] {
  return [
    join(projectRoot, '.depwire', 'depwire-output.json'),
    join(projectRoot, 'depwire-output.json'),
  ];
}

/**
 * Load a previously exported graph from a `depwire parse` JSON file and
 * reconstruct it as `ParsedFile[]` so it can flow through the normal
 * `buildGraph()` pipeline.
 *
 * `depwire parse` writes a serialized ProjectGraph — the on-disk shape is
 *   { projectRoot, files: string[], nodes: SymbolNode[], edges: SymbolEdge[], metadata }
 * (NOT a ParsedFile[]). This loader primarily handles that ProjectGraph shape
 * by grouping nodes/edges back into per-file ParsedFile records. As a
 * convenience it also accepts a raw ParsedFile[] or a { files: ParsedFile[] }
 * wrapper, in case the format changes.
 *
 * Returns null on any failure (missing file, invalid JSON, empty/unknown
 * shape) so callers can fall back to a full re-parse.
 */
export async function loadParsedFilesFromJson(
  jsonPath: string
): Promise<ParsedFile[] | null> {
  try {
    const content = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content);

    // Shape 1: serialized ProjectGraph (what `depwire parse` actually writes).
    // Detected by node/edge arrays at the top level. Reconstruct ParsedFile[]
    // by grouping nodes and edges by their filePath.
    if (Array.isArray(data?.nodes) && Array.isArray(data?.edges)) {
      const files = reconstructParsedFiles(
        data.nodes as SymbolNode[],
        data.edges as SymbolEdge[]
      );
      return files.length > 0 ? files : null;
    }

    // Shape 2: raw ParsedFile[] written directly.
    if (Array.isArray(data)) {
      const files = data as ParsedFile[];
      if (files.length > 0 && Array.isArray(files[0]?.symbols)) {
        return files;
      }
      return null;
    }

    // Shape 3: { files: ParsedFile[] } wrapper.
    if (Array.isArray(data?.files) && Array.isArray(data.files[0]?.symbols)) {
      const files = data.files as ParsedFile[];
      return files.length > 0 ? files : null;
    }

    return null;
  } catch {
    // File not found or invalid JSON — return null to trigger fallback.
    return null;
  }
}

/**
 * Group a flat list of graph nodes/edges (as exported by exportToJSON) back
 * into per-file ParsedFile records keyed by filePath. Every filePath seen on
 * either a node or an edge gets a ParsedFile entry so no edge is dropped when
 * the graph is later rebuilt.
 */
function reconstructParsedFiles(
  nodes: SymbolNode[],
  edges: SymbolEdge[]
): ParsedFile[] {
  const byPath = new Map<string, ParsedFile>();

  const ensure = (filePath: string): ParsedFile => {
    let file = byPath.get(filePath);
    if (!file) {
      file = { filePath, symbols: [], edges: [] };
      byPath.set(filePath, file);
    }
    return file;
  };

  for (const node of nodes) {
    if (!node || typeof node.filePath !== 'string') continue;
    // `::__file__` pseudo-nodes are never emitted as ParsedFile symbols by the
    // parsers; buildGraph synthesizes them from edges in a dedicated pass. If
    // we re-added them here they would collide with that pass, so skip them and
    // let buildGraph recreate them exactly as it does for a fresh parse.
    if (typeof node.id === 'string' && node.id.endsWith('::__file__')) continue;
    ensure(node.filePath).symbols.push(node);
  }

  for (const edge of edges) {
    if (!edge || typeof edge.filePath !== 'string') continue;
    ensure(edge.filePath).edges.push(edge);
  }

  return Array.from(byPath.values());
}
