import { join, dirname, resolve, relative } from 'path';
import { existsSync, statSync } from 'fs';

function fileExists(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveImportPath(importPath, fromFile, projectRoot) {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }
  
  const fromDir = dirname(join(projectRoot, fromFile));
  let resolvedPath;
  
  if (importPath.startsWith('.')) {
    resolvedPath = resolve(fromDir, importPath);
  } else {
    resolvedPath = resolve(projectRoot, importPath.substring(1));
  }
  
  const candidates = [
    resolvedPath + '.ts',
    resolvedPath + '.tsx',
    resolvedPath + '/index.ts',
    resolvedPath + '/index.tsx',
    resolvedPath,
  ];
  
  console.log('Resolving:', importPath);
  console.log('From file:', fromFile);
  console.log('From dir:', fromDir);
  console.log('Resolved base:', resolvedPath);
  
  for (const candidate of candidates) {
    console.log('  Checking:', candidate, '→', fileExists(candidate));
    if (fileExists(candidate)) {
      const result = relative(projectRoot, candidate);
      console.log('  ✓ Found:', result);
      return result;
    }
  }
  
  return null;
}

const projectRoot = resolve('./test/fixtures/sample-project');
console.log('Project root:', projectRoot);
console.log('');

const result1 = resolveImportPath('../types', 'services/UserService.ts', projectRoot);
console.log('Result:', result1);
console.log('');

const result2 = resolveImportPath('../utils', 'services/UserService.ts', projectRoot);
console.log('Result:', result2);
