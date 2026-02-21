import { readdirSync, statSync, existsSync, lstatSync } from 'fs';
import { join, relative } from 'path';

export function scanDirectory(
  rootDir: string,
  baseDir: string = rootDir
): string[] {
  const files: string[] = [];
  
  try {
    const entries = readdirSync(baseDir);
    
    for (const entry of entries) {
      const fullPath = join(baseDir, entry);
      
      // Skip hidden directories/files (starting with .)
      if (entry.startsWith('.')) {
        continue;
      }
      
      // Skip node_modules and common build directories
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build') {
        continue;
      }
      
      // Skip symlinks
      try {
        const stats = lstatSync(fullPath);
        if (stats.isSymbolicLink()) {
          continue;
        }
      } catch (err) {
        continue;
      }
      
      const stats = statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...scanDirectory(rootDir, fullPath));
      } else if (stats.isFile()) {
        // Only include .ts and .tsx files, skip .d.ts
        if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
          // Return path relative to root
          files.push(relative(rootDir, fullPath));
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${baseDir}:`, err);
  }
  
  return files;
}

export function fileExists(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}
