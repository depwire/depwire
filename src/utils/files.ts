import { readdirSync, statSync, existsSync, lstatSync, realpathSync } from 'fs';
import { join, relative } from 'path';
import os from 'os';

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
        // Include supported source files
        const isTypeScript = (entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts');
        const isJavaScript = entry.endsWith('.js') || entry.endsWith('.jsx') || entry.endsWith('.mjs') || entry.endsWith('.cjs');
        const isPython = entry.endsWith('.py');
        const isGo = entry.endsWith('.go') && !entry.endsWith('_test.go');
        const isRust = entry.endsWith('.rs');
        const isC = entry.endsWith('.c');
        const isCpp = entry.endsWith('.cpp') || entry.endsWith('.cc') || entry.endsWith('.cxx') || entry.endsWith('.c++') ||
          entry.endsWith('.hpp') || entry.endsWith('.hh') || entry.endsWith('.hxx') || entry.endsWith('.h++') ||
          entry.endsWith('.h') || entry.endsWith('.inl') || entry.endsWith('.ipp');
        const isCSharp = entry.endsWith('.cs') || entry.endsWith('.csx') || entry.endsWith('.csproj');
        const isJava = entry.endsWith('.java') || entry === 'pom.xml' || entry === 'build.gradle' || entry === 'build.gradle.kts';
        const isKotlin = entry.endsWith('.kt') || entry.endsWith('.kts') || entry === 'settings.gradle.kts' || entry === 'settings.gradle';
        const isCppBuild = entry === 'CMakeLists.txt' || entry === 'conanfile.txt' || entry === 'vcpkg.json';
        
        if (isTypeScript || isJavaScript || isPython || isGo || isRust || isC || isCpp || isCSharp || isJava || isKotlin || isCppBuild) {
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
  startDir = realpathSync(startDir);
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
    'pom.xml',           // Java (Maven)
    'build.gradle',      // Java (Gradle)
    'build.gradle.kts',  // Kotlin (Gradle KTS)
    '.git'               // Any git repo
  ];
  
  // Blocklist of directories to never scan (macOS system dirs)
  const blocklist = ['Library', 'System', 'Applications', 'usr', 'bin', 'etc', 'var', 'private'];
  
  let currentDir = startDir;
  const rootDir = '/'; // Unix root (will work on Windows too via path normalization)
  const maxDepth = 10; // Maximum 10 levels up from starting directory
  let depth = 0;
  
  // Get home directory to prevent walking above it
  const home = os.homedir();
  
  while (currentDir !== rootDir && depth < maxDepth) {
    // Check if current directory name is in blocklist
    const dirName = currentDir.split('/').pop();
    if (dirName && blocklist.includes(dirName)) {
      console.warn(`⚠️  Skipping blocked directory: ${dirName}`);
      break;
    }
    
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
    depth++;
  }
  
  // No project root found, return the starting directory with warning
  console.warn(`⚠️  No project root found within ${maxDepth} levels. Using current directory: ${startDir}`);
  return startDir;
}
// test action
// test action v3
