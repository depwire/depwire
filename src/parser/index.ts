import { readFileSync } from 'fs';
import { join } from 'path';
import { scanDirectory } from '../utils/files.js';
import { parseTypeScriptFile } from './typescript.js';
import { ParsedFile } from './types.js';

export function parseProject(projectRoot: string): ParsedFile[] {
  const files = scanDirectory(projectRoot);
  const parsedFiles: ParsedFile[] = [];
  
  for (const file of files) {
    try {
      const fullPath = join(projectRoot, file);
      const sourceCode = readFileSync(fullPath, 'utf-8');
      const parsed = parseTypeScriptFile(file, sourceCode, projectRoot);
      parsedFiles.push(parsed);
    } catch (err) {
      console.error(`Error parsing file ${file}:`, err);
    }
  }
  
  return parsedFiles;
}
