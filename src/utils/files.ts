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
      
      // Skip node_modules, vendor, and common build directories
      if (entry === 'node_modules' || entry === 'vendor' || entry === 'dist' || entry === 'build') {
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
        // Include .ts, .tsx, .js, .jsx, .mjs, .cjs, .py, and .go files (skip .d.ts and _test.go)
        const isTypeScript = (entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts');
        const isJavaScript = entry.endsWith('.js') || entry.endsWith('.jsx') || entry.endsWith('.mjs') || entry.endsWith('.cjs');
        const isPython = entry.endsWith('.py');
        const isGo = entry.endsWith('.go') && !entry.endsWith('_test.go');
        
        if (isTypeScript || isJavaScript || isPython || isGo) {
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
