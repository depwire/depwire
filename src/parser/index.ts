/**
 * SECURITY: All parser operations are READ-ONLY.
 * Depwire never writes to, modifies, or deletes any file in the user's project.
 * The only file system writes are to os.tmpdir() for cloned repos.
 */

import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { scanDirectory } from '../utils/files.js';
import { getParserForFile } from './detect.js';
import { ParsedFile } from './types.js';
import { minimatch } from 'minimatch';

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

export function parseProject(
  projectRoot: string,
  options?: { exclude?: string[]; verbose?: boolean }
): ParsedFile[] {
  const files = scanDirectory(projectRoot);
  const parsedFiles: ParsedFile[] = [];
  let skippedFiles = 0;
  let errorFiles = 0;
  
  for (const file of files) {
    try {
      const fullPath = join(projectRoot, file);
      
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
      
      if (options?.verbose) {
        console.error(`[Parser] Parsing: ${file}`);
      }
      
      const parser = getParserForFile(file);
      if (!parser) {
        console.error(`No parser found for file: ${file}`);
        skippedFiles++;
        continue;
      }
      
      const sourceCode = readFileSync(fullPath, 'utf-8');
      const parsed = parser.parseFile(file, sourceCode, projectRoot);
      parsedFiles.push(parsed);
    } catch (err) {
      errorFiles++;
      console.error(`Error parsing file ${file}:`, err instanceof Error ? err.message : err);
    }
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
