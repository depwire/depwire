/**
 * SECURITY: All parser operations are READ-ONLY.
 * CodeGraph never writes to, modifies, or deletes any file in the user's project.
 * The only file system writes are to os.tmpdir() for cloned repos.
 */

import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { scanDirectory } from '../utils/files.js';
import { getParserForFile } from './detect.js';
import { ParsedFile } from './types.js';

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

export function parseProject(projectRoot: string): ParsedFile[] {
  const files = scanDirectory(projectRoot);
  const parsedFiles: ParsedFile[] = [];
  
  for (const file of files) {
    try {
      const fullPath = join(projectRoot, file);
      
      // Skip large files
      if (!shouldParseFile(fullPath)) {
        continue;
      }
      
      const parser = getParserForFile(file);
      if (!parser) {
        console.error(`No parser found for file: ${file}`);
        continue;
      }
      
      const sourceCode = readFileSync(fullPath, 'utf-8');
      const parsed = parser.parseFile(file, sourceCode, projectRoot);
      parsedFiles.push(parsed);
    } catch (err) {
      console.error(`Error parsing file ${file}:`, err instanceof Error ? err.message : err);
    }
  }
  
  return parsedFiles;
}
