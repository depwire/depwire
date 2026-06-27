/**
 * SECURITY: Parsing is READ-ONLY with respect to your source code.
 * Depwire never modifies or deletes any of your source files.
 * The only writes are: os.tmpdir() for cloned repos, and a local, git-ignored
 * parse cache at {projectRoot}/.depwire/cache.db used to skip re-parsing
 * unchanged files. The cache contains only derived data and is safe to delete;
 * disable it with parseProject(root, { useCache: false }).
 */

import { readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { scanDirectory } from '../utils/files.js';
import { getParserForFile } from './detect.js';
import { ParsedFile } from './types.js';
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
  let cacheDb: ReturnType<typeof openCache> | undefined;
  let cachedMap = new Map<string, ParsedFile>();
  const newlyParsed: ParsedFile[] = [];
  if (useCache) {
    try {
      cacheDb = openCache(projectRoot);
      cachedMap = getCachedFiles(cacheDb, projectRoot, files);
    } catch (err) {
      console.error(`[Parser] Cache disabled (open failed): ${err instanceof Error ? err.message : err}`);
      cacheDb = undefined;
      cachedMap = new Map();
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
