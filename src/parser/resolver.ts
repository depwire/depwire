import { join, dirname, resolve, relative } from 'path';
import { fileExists } from '../utils/files.js';
import { readFileSync } from 'fs';

interface TsConfigPaths {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

const tsconfigCache = new Map<string, TsConfigPaths>();

function loadTsConfig(projectRoot: string): TsConfigPaths {
  if (tsconfigCache.has(projectRoot)) {
    return tsconfigCache.get(projectRoot)!;
  }

  let config: TsConfigPaths = {};
  let currentDir = projectRoot;

  // Search up the directory tree for tsconfig.json
  while (currentDir !== dirname(currentDir)) {
    const tsconfigPath = join(currentDir, 'tsconfig.json');
    try {
      const raw = readFileSync(tsconfigPath, 'utf-8');
      // Strip JSONC comments (// and /* */) and trailing commas
      const stripped = raw
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([\]}])/g, '$1');
      
      const parsed = JSON.parse(stripped);
      if (parsed.compilerOptions) {
        config.baseUrl = parsed.compilerOptions.baseUrl;
        config.paths = parsed.compilerOptions.paths;
        
        // Resolve baseUrl relative to the tsconfig location
        if (config.baseUrl) {
          config.baseUrl = resolve(currentDir, config.baseUrl);
        }
      }
      break; // Found tsconfig.json, stop searching
    } catch (err) {
      // Try parent directory
      currentDir = dirname(currentDir);
    }
  }

  tsconfigCache.set(projectRoot, config);
  return config;
}

function expandPathAlias(
  importPath: string,
  tsconfig: TsConfigPaths
): string | null {
  if (!tsconfig.paths) return null;

  for (const [pattern, mappings] of Object.entries(tsconfig.paths)) {
    const patternRegex = new RegExp(
      '^' + pattern.replace(/\*/g, '(.*)') + '$'
    );
    const match = importPath.match(patternRegex);

    if (match) {
      const captured = match[1] || '';
      for (const mapping of mappings) {
        const expanded = mapping.replace(/\*/g, captured);
        // baseUrl is already resolved to absolute path in loadTsConfig
        const baseUrl = tsconfig.baseUrl || '.';
        return join(baseUrl, expanded);
      }
    }
  }

  return null;
}

function tryResolve(basePath: string, projectRoot: string): string | null {
  // Extension swapping candidates
  const candidates: string[] = [];

  // If path ends with .js/.jsx, try swapping to .ts/.tsx first
  if (basePath.endsWith('.js')) {
    candidates.push(basePath.replace(/\.js$/, '.ts'));
    candidates.push(basePath.replace(/\.js$/, '.tsx'));
    candidates.push(basePath); // literal .js file
  } else if (basePath.endsWith('.jsx')) {
    candidates.push(basePath.replace(/\.jsx$/, '.tsx'));
    candidates.push(basePath); // literal .jsx file
  } else if (basePath.endsWith('.ts') || basePath.endsWith('.tsx')) {
    // Already has TS extension
    candidates.push(basePath);
  } else {
    // No extension - try adding extensions and index files
    candidates.push(basePath + '.ts');
    candidates.push(basePath + '.tsx');
    candidates.push(join(basePath, 'index.ts'));
    candidates.push(join(basePath, 'index.tsx'));
    candidates.push(basePath); // In case it's a literal file
  }

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return relative(projectRoot, candidate);
    }
  }

  return null;
}

export function resolveImportPath(
  importPath: string,
  fromFile: string,
  projectRoot: string
): string | null {
  const tsconfig = loadTsConfig(projectRoot);

  // Check if it's a path alias (e.g., ~/utils/logger.js or @/components/Button)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    const expanded = expandPathAlias(importPath, tsconfig);
    if (expanded) {
      return tryResolve(expanded, projectRoot);
    }
    // Not a path alias, treat as external module
    return null;
  }

  // Get the directory of the importing file
  const fromDir = dirname(join(projectRoot, fromFile));

  // Resolve relative to the importing file
  let resolvedPath: string;

  if (importPath.startsWith('.')) {
    // Relative import
    resolvedPath = resolve(fromDir, importPath);
  } else {
    // Absolute import (rare in TS, but handle it)
    resolvedPath = resolve(projectRoot, importPath.substring(1));
  }

  return tryResolve(resolvedPath, projectRoot);
}
