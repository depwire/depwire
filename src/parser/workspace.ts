import { join, dirname } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileExists } from '../utils/files.js';

/**
 * Discovers internal workspace packages for a project, in priority order:
 *   1. root package.json `workspaces` (array form, or `{ packages: [...] }`)
 *   2. pnpm-workspace.yaml `packages:` list
 *   3. fallback: scan the tree for package.json files with a `name` field
 *
 * Returns a map of package name -> absolute directory. Supports a single
 * trailing `*` glob segment (e.g. `packages/*`), which covers the common
 * monorepo layout (npm/yarn/pnpm workspaces). Deeper glob patterns
 * (`**`, multiple wildcards) are not expanded -- if the project needs those,
 * the fallback filesystem scan below still finds every named package
 * regardless of how it's declared.
 */
export function discoverWorkspacePackages(projectRoot: string): Map<string, string> {
  const packages = new Map<string, string>();

  const patterns = readDeclaredWorkspacePatterns(projectRoot);
  if (patterns.length > 0) {
    for (const pattern of patterns) {
      for (const dir of expandGlobPattern(projectRoot, pattern)) {
        addPackageIfNamed(packages, dir);
      }
    }
  }

  // Fallback: if declared config found nothing (missing/empty/unreadable),
  // scan the tree for package.json files with a `name` field. This also
  // catches monorepos with no declared workspace config at all.
  if (packages.size === 0) {
    scanForPackages(projectRoot, projectRoot, packages, 0);
  }

  return packages;
}

function readDeclaredWorkspacePatterns(projectRoot: string): string[] {
  // 1. package.json `workspaces`
  try {
    const raw = readFileSync(join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    if (Array.isArray(pkg.workspaces)) {
      return pkg.workspaces;
    }
    if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
      return pkg.workspaces.packages;
    }
  } catch {
    // no package.json, unreadable, or no workspaces field -- fall through
  }

  // 2. pnpm-workspace.yaml `packages:`
  try {
    const raw = readFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'utf-8');
    const patterns = parseYamlPackagesList(raw);
    if (patterns.length > 0) return patterns;
  } catch {
    // no pnpm-workspace.yaml
  }

  return [];
}

/**
 * Minimal YAML list-under-key extractor, scoped to exactly the shape
 * pnpm-workspace.yaml uses (`packages:` followed by `- './pattern'` lines).
 * Not a general YAML parser -- avoids a new dependency for one field.
 */
function parseYamlPackagesList(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const itemMatch = line.match(/^\s*-\s*['"]?([^'"#]+)['"]?/);
      if (itemMatch) {
        patterns.push(itemMatch[1].trim().replace(/^\.\//, ''));
        continue;
      }
      // A non-indented, non-list line ends the `packages:` block.
      if (line.trim() !== '' && !/^\s/.test(line)) {
        inPackages = false;
      }
    }
  }
  return patterns;
}

/**
 * Expands a workspace pattern to real directories. Supports a literal
 * directory (`integration-tests`) and a single trailing `*` segment
 * (`packages/*`). Anything more exotic falls through to the caller's
 * filesystem-scan fallback.
 */
function expandGlobPattern(projectRoot: string, pattern: string): string[] {
  const normalized = pattern.replace(/^\.\//, '');
  if (!normalized.includes('*')) {
    const dir = join(projectRoot, normalized);
    return fileExists(join(dir, 'package.json')) ? [dir] : [];
  }
  // Only support a trailing `*` as the final path segment.
  const parts = normalized.split('/');
  if (parts[parts.length - 1] !== '*') return [];
  const parentDir = join(projectRoot, ...parts.slice(0, -1));
  let entries: string[];
  try {
    entries = readdirSync(parentDir);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const entry of entries) {
    const full = join(parentDir, entry);
    try {
      if (statSync(full).isDirectory() && fileExists(join(full, 'package.json'))) {
        dirs.push(full);
      }
    } catch {
      // skip unreadable entries
    }
  }
  return dirs;
}

function addPackageIfNamed(packages: Map<string, string>, dir: string): void {
  try {
    const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    if (typeof pkg.name === 'string' && pkg.name.length > 0 && !packages.has(pkg.name)) {
      packages.set(pkg.name, dir);
    }
  } catch {
    // unreadable/invalid package.json -- skip
  }
}

const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out']);

function scanForPackages(
  dir: string,
  projectRoot: string,
  packages: Map<string, string>,
  depth: number
): void {
  if (depth > 6) return; // bound recursion on pathological trees
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  if (entries.includes('package.json')) {
    addPackageIfNamed(packages, dir);
  }
  for (const entry of entries) {
    if (SCAN_SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) scanForPackages(full, projectRoot, packages, depth + 1);
  }
}
