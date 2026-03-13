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
        // Include .ts, .tsx, .js, .jsx, .mjs, .cjs, .py, .go, .rs, .c, and .h files (skip .d.ts and _test.go)
        const isTypeScript = (entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts');
        const isJavaScript = entry.endsWith('.js') || entry.endsWith('.jsx') || entry.endsWith('.mjs') || entry.endsWith('.cjs');
        const isPython = entry.endsWith('.py');
        const isGo = entry.endsWith('.go') && !entry.endsWith('_test.go');
        const isRust = entry.endsWith('.rs');
        const isC = entry.endsWith('.c') || entry.endsWith('.h');
        
        if (isTypeScript || isJavaScript || isPython || isGo || isRust || isC) {
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

/**
 * Find the project root by walking up directories looking for project markers
 * @param startDir Directory to start searching from (defaults to process.cwd())
 * @returns Project root path if found, otherwise the start directory
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  const projectMarkers = [
    'package.json',      // Node.js
    'tsconfig.json',     // TypeScript
    'go.mod',            // Go
    'Cargo.toml',        // Rust
    'pyproject.toml',    // Python (modern)
    'setup.py',          // Python (legacy)
    'Makefile',          // C/C++ (make-based)
    'CMakeLists.txt',    // C/C++ (cmake-based)
    'configure.ac',      // C/C++ (autotools)
    '.git'               // Any git repo
  ];
  
  let currentDir = startDir;
  const rootDir = '/'; // Unix root (will work on Windows too via path normalization)
  
  while (currentDir !== rootDir) {
    // Check if any project marker exists in current directory
    for (const marker of projectMarkers) {
      const markerPath = join(currentDir, marker);
      if (existsSync(markerPath)) {
        return currentDir;
      }
    }
    
    // Move up one directory
    const parentDir = join(currentDir, '..');
    
    // Prevent infinite loop if we can't go up anymore
    if (parentDir === currentDir) {
      break;
    }
    
    currentDir = parentDir;
  }
  
  // No project root found, return the starting directory
  return startDir;
}
// test action
// test action v3
