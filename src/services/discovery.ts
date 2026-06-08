/**
 * Service discovery — walks a parent directory and identifies each subdirectory
 * that looks like a deployable service (Gradle/Maven/Node).
 *
 * Deterministic. No LLM.
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';

export interface DiscoveredService {
  name: string;
  rootPath: string;
  buildSystem: 'gradle' | 'maven' | 'npm' | 'unknown';
}

const BUILD_MARKERS: Array<{ file: string; system: DiscoveredService['buildSystem'] }> = [
  { file: 'build.gradle', system: 'gradle' },
  { file: 'build.gradle.kts', system: 'gradle' },
  { file: 'settings.gradle', system: 'gradle' },
  { file: 'pom.xml', system: 'maven' },
  { file: 'package.json', system: 'npm' },
];

const SKIP_DIRS = new Set([
  'node_modules', 'build', 'dist', 'out', 'target', '.git', '.gradle',
  '.idea', '.vscode', 'bin', '.depwire', '.verdent', 'logs',
]);

/**
 * Discover all services under a parent path.
 *
 * Strategy:
 *   1. If parentPath itself is a service, return [parentPath].
 *   2. Otherwise scan one level down. Each child folder containing a build marker
 *      is a service.
 *   3. Optionally include nested services (multi-module Gradle) via includeNested.
 */
export function discoverServices(
  parentPath: string,
  options: { includeNested?: boolean; maxDepth?: number } = {}
): DiscoveredService[] {
  const maxDepth = options.maxDepth ?? 2;
  const services: DiscoveredService[] = [];

  // Self-check first
  const selfBuild = detectBuildSystem(parentPath);
  if (selfBuild !== 'unknown' && !options.includeNested) {
    return [{
      name: basename(parentPath),
      rootPath: parentPath,
      buildSystem: selfBuild,
    }];
  }

  walk(parentPath, 0, maxDepth, services, options.includeNested ?? false);
  return services;
}

function walk(
  dir: string,
  depth: number,
  maxDepth: number,
  out: DiscoveredService[],
  includeNested: boolean,
): void {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;

    const childPath = join(dir, entry);
    let stats;
    try {
      stats = statSync(childPath);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;

    const buildSystem = detectBuildSystem(childPath);
    if (buildSystem !== 'unknown') {
      out.push({
        name: entry,
        rootPath: childPath,
        buildSystem,
      });
      if (!includeNested) continue; // don't recurse into a recognized service
    }

    walk(childPath, depth + 1, maxDepth, out, includeNested);
  }
}

function detectBuildSystem(dir: string): DiscoveredService['buildSystem'] {
  for (const marker of BUILD_MARKERS) {
    if (existsSync(join(dir, marker.file))) {
      // For npm, only count it as a service if package.json has a "main" or similar
      // (this avoids treating tooling folders as services). For simplicity, accept it.
      return marker.system;
    }
  }
  return 'unknown';
}

/**
 * Try to read the Spring application.name from any of the standard config locations.
 * Returns undefined if not found.
 */
export function readSpringApplicationName(serviceRoot: string): string | undefined {
  const candidates = [
    'src/main/resources/application.yml',
    'src/main/resources/application.yaml',
    'src/main/resources/application.properties',
    'src/main/resources/bootstrap.yml',
    'src/main/resources/bootstrap.yaml',
    'src/main/resources/bootstrap.properties',
  ];
  for (const rel of candidates) {
    const path = join(serviceRoot, rel);
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf-8');
      // Match either YAML "name: my-service" under "application:" or
      // properties "spring.application.name=my-service".
      const propsMatch = content.match(/spring\.application\.name\s*=\s*([^\r\n#]+)/);
      if (propsMatch) return propsMatch[1].trim();

      // YAML — look for "application:" with a "name:" child within next ~5 lines.
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*application\s*:/.test(lines[i])) {
          for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            const m = lines[j].match(/^\s*name\s*:\s*([^\s#]+)/);
            if (m) return m[1].trim();
          }
        }
      }
    } catch {
      continue;
    }
  }
  return undefined;
}
