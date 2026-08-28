import { join, dirname, resolve, relative } from 'path';
import { fileExists } from '../utils/files.js';
import { readFileSync } from 'fs';
import { discoverWorkspacePackages } from './workspace.js';
import type { UnresolvedImportReason } from './types.js';

interface TsConfigPaths {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

// Cache keyed by the directory the tsconfig was found FOR (i.e. the
// importing file's nearest ancestor lookup start), not by projectRoot. A
// monorepo has one tsconfig per package; every file must resolve against
// its own package's config, not a single config shared project-wide.
const tsconfigCache = new Map<string, TsConfigPaths>();

// Raw tsconfig.json contents (parsed, pre-baseUrl-resolution), keyed by the
// absolute path of the tsconfig file itself. Used so `extends` can look up
// an already-parsed ancestor config without re-reading/re-stripping it.
const rawTsconfigCache = new Map<string, { compilerOptions?: Record<string, unknown>; extends?: string } | null>();

function readTsconfigRaw(tsconfigPath: string): { compilerOptions?: Record<string, unknown>; extends?: string } | null {
  if (rawTsconfigCache.has(tsconfigPath)) {
    return rawTsconfigCache.get(tsconfigPath)!;
  }
  let result: { compilerOptions?: Record<string, unknown>; extends?: string } | null = null;
  try {
    const raw = readFileSync(tsconfigPath, 'utf-8');
    const stripped = raw
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*([\]}])/g, '$1');
    result = JSON.parse(stripped);
  } catch {
    result = null;
  }
  rawTsconfigCache.set(tsconfigPath, result);
  return result;
}

/**
 * Resolves a tsconfig's `extends` target to an absolute tsconfig.json path.
 * Supports:
 *   - relative paths (`"./tsconfig.base.json"`, `"../../tsconfig.json"`),
 *     with or without the `.json` extension.
 * Does NOT support:
 *   - node_modules package extends (`"@sindresorhus/tsconfig"`) -- resolving
 *     these requires walking into node_modules, which is frequently absent
 *     or incomplete in a fresh shallow clone (no install step runs before
 *     parsing). Unsupported extends targets are silently skipped: the
 *     nearest config's own fields are used as-is, same as if `extends` were
 *     absent. This is a known, reported limitation, not a silent bug.
 */
function resolveExtendsPath(extendsValue: string, fromDir: string): string | null {
  if (!extendsValue.startsWith('.')) return null; // package-name extends: unsupported
  const withoutExt = resolve(fromDir, extendsValue);
  const candidates = withoutExt.endsWith('.json')
    ? [withoutExt]
    : [withoutExt + '.json', join(withoutExt, 'tsconfig.json')];
  for (const c of candidates) {
    if (fileExists(c)) return c;
  }
  return null;
}

/**
 * Loads the effective compilerOptions.paths/baseUrl for a given tsconfig
 * file, following `extends` chains to fill fields the config itself does
 * not define. Per TypeScript's documented behavior, `paths` is NOT merged
 * across the chain -- the nearest (most-derived) config's own `paths` fully
 * replaces anything inherited. `extends` is only consulted when the nearest
 * config has no `paths`/`baseUrl` of its own.
 */
function loadEffectiveConfig(
  tsconfigPath: string,
  visited: Set<string> = new Set()
): TsConfigPaths {
  if (visited.has(tsconfigPath)) return {}; // extends cycle guard
  visited.add(tsconfigPath);

  const parsed = readTsconfigRaw(tsconfigPath);
  if (!parsed) return {};

  const dir = dirname(tsconfigPath);
  let baseUrl = parsed.compilerOptions?.baseUrl as string | undefined;
  let paths = parsed.compilerOptions?.paths as Record<string, string[]> | undefined;

  if ((!baseUrl || !paths) && parsed.extends) {
    const extendsPath = resolveExtendsPath(parsed.extends, dir);
    if (extendsPath) {
      const inherited = loadEffectiveConfig(extendsPath, visited);
      if (!baseUrl && inherited.baseUrl) baseUrl = relative(dir, inherited.baseUrl) || '.';
      if (!paths && inherited.paths) paths = inherited.paths;
    }
  }

  const config: TsConfigPaths = {};
  if (paths) config.paths = paths;
  if (baseUrl) config.baseUrl = resolve(dir, baseUrl);
  return config;
}

/**
 * Finds the nearest ancestor directory (starting at `startDir`, walking up
 * to and including `projectRoot`, never past it) that contains a
 * tsconfig.json, and returns its effective paths/baseUrl.
 *
 * The projectRoot bound matters: repos are parsed from a temp clone, and a
 * tsconfig.json living above projectRoot on the host machine (e.g. in a
 * parent directory of the clone's temp location) must never leak into
 * resolution -- that would make parsing non-reproducible across machines.
 */
function loadTsConfigForDir(startDir: string, projectRoot: string): TsConfigPaths {
  const resolvedRoot = resolve(projectRoot);
  let currentDir = resolve(startDir);

  // If startDir somehow isn't under projectRoot, don't search at all.
  if (!currentDir.startsWith(resolvedRoot)) {
    currentDir = resolvedRoot;
  }

  if (tsconfigCache.has(currentDir)) {
    return tsconfigCache.get(currentDir)!;
  }

  let config: TsConfigPaths = {};
  let searchDir = currentDir;
  while (true) {
    const tsconfigPath = join(searchDir, 'tsconfig.json');
    if (fileExists(tsconfigPath)) {
      config = loadEffectiveConfig(tsconfigPath);
      break;
    }
    if (searchDir === resolvedRoot) break; // stop AT projectRoot, never search above it
    const parent = dirname(searchDir);
    if (parent === searchDir) break; // filesystem root, safety stop
    searchDir = parent;
  }

  tsconfigCache.set(currentDir, config);
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
        // baseUrl is already resolved to absolute path in loadTsConfigForDir
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

// Workspace package name -> absolute source directory. Cached per
// projectRoot (one discovery pass per parse, same lifecycle as the parse
// itself -- unlike the tsconfig cache this genuinely is project-wide, since
// package identity doesn't vary by importing file).
const workspacePackagesCache = new Map<string, Map<string, string>>();

function getWorkspacePackages(projectRoot: string): Map<string, string> {
  const resolvedRoot = resolve(projectRoot);
  let packages = workspacePackagesCache.get(resolvedRoot);
  if (!packages) {
    packages = discoverWorkspacePackages(resolvedRoot);
    workspacePackagesCache.set(resolvedRoot, packages);
  }
  return packages;
}

/**
 * Tries to resolve a bare specifier (`"pkg"` or `"pkg/subpath"`) against a
 * known internal workspace package. Deliberately does NOT read `exports`,
 * `main`, or `module` -- those point at build output that doesn't exist in
 * an unbuilt clone (verified: every checked workspace package's `exports`/
 * `main`/`module` targets `dist/`-style build artifacts, never `src/`).
 * Uses a fixed directory convention instead: `<pkgDir>/src/<subpath or
 * index>`.
 *
 * Returns null (external) if the specifier's package name doesn't match a
 * known internal package -- no guessing. A wrong edge is worse than a
 * missing one.
 */
function resolveWorkspacePackageImport(
  importPath: string,
  projectRoot: string,
  allowPackageRootSource = false,
): string | null {
  const packages = getWorkspacePackages(projectRoot);
  if (packages.size === 0) return null;

  const parts = importPath.split('/');
  // Handle scoped packages (@scope/name) as a two-segment package name.
  const pkgName = importPath.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const pkgDir = packages.get(pkgName);
  if (!pkgDir) return null; // not a known internal package -- external, no guessing

  const subpath = importPath.startsWith('@')
    ? parts.slice(2).join('/')
    : parts.slice(1).join('/');

  const candidates = subpath
    ? [
        join(pkgDir, 'src', subpath, 'index.ts'),
        join(pkgDir, 'src', subpath, 'index.tsx'),
        join(pkgDir, 'src', subpath + '.ts'),
        join(pkgDir, 'src', subpath + '.tsx'),
        ...(allowPackageRootSource ? [
          join(pkgDir, subpath, 'index.ts'),
          join(pkgDir, subpath, 'index.tsx'),
          join(pkgDir, subpath + '.ts'),
          join(pkgDir, subpath + '.tsx'),
        ] : []),
      ]
    : [
        join(pkgDir, 'src', 'index.ts'),
        join(pkgDir, 'src', 'index.tsx'),
        join(pkgDir, 'index.ts'),
      ];

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
  projectRoot: string,
  options: { allowPackageRootSource?: boolean } = {},
): string | null {
  // Get the directory of the importing file -- used both for relative
  // resolution and as the starting point for the nearest-tsconfig search.
  const fromDir = dirname(join(projectRoot, fromFile));

  // Check if it's a path alias (e.g., ~/utils/logger.js or @/components/Button)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    const tsconfig = loadTsConfigForDir(fromDir, projectRoot);
    const expanded = expandPathAlias(importPath, tsconfig);
    if (expanded) {
      return tryResolve(expanded, projectRoot);
    }
    // Not a tsconfig alias -- try workspace package resolution next.
    return resolveWorkspacePackageImport(importPath, projectRoot, options.allowPackageRootSource);
  }

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

/**
 * Classifies why `importPath` did not resolve from `fromFile`, for the
 * Phase 1 unresolved-import instrument. Called by the caller (typescript.ts)
 * only when `resolveImportPath` returned null -- this function does not
 * re-attempt resolution, only explains the miss.
 */
export function classifyUnresolvedImport(
  importPath: string,
  fromFile: string,
  projectRoot: string
): UnresolvedImportReason {
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return 'relative-not-found';
  }

  const fromDir = dirname(join(projectRoot, fromFile));
  const tsconfig = loadTsConfigForDir(fromDir, projectRoot);
  if (tsconfig.paths) {
    for (const pattern of Object.keys(tsconfig.paths)) {
      const patternRegex = new RegExp('^' + pattern.replace(/\*/g, '(.*)') + '$');
      if (patternRegex.test(importPath)) {
        return 'alias-unresolved'; // matched a paths pattern, but target file missing
      }
    }
  }

  const packages = getWorkspacePackages(projectRoot);
  const parts = importPath.split('/');
  const pkgName = importPath.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (packages.has(pkgName)) {
    return 'workspace-package'; // known internal package, but no src entry found
  }

  return 'external'; // bare specifier not matching any known internal package
}
