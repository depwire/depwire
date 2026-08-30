import { join, resolve, dirname, sep } from 'path';
import { existsSync, readFileSync } from 'fs';

export interface JvmModuleRoots {
  /** Relative source root paths (e.g., "module-a/src/main/java") */
  roots: string[];
  /** Pre-verified set of existing source root directories (absolute paths) */
  verifiedRootSet: Set<string>;
  /** Rejected module declarations, including traversal attempts. */
  errors: JvmModuleDiscoveryError[];
}

export interface JvmModuleDiscoveryError {
  path: string;
  reason: string;
}

const MAX_RECURSION_DEPTH = 10;

/**
 * Discover JVM module source roots from Maven pom.xml and Gradle settings files.
 * Scans for multi-module build files at the project root and recursively discovers
 * all module source directories.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Discovered source roots and a pre-verified set of existing directories
 */
export function discoverJvmModuleRoots(projectRoot: string): JvmModuleRoots {
  const roots: string[] = [];
  const verifiedRootSet = new Set<string>();
  const errors: JvmModuleDiscoveryError[] = [];

  // Discover Maven modules
  const rootPom = join(projectRoot, 'pom.xml');
  if (existsSync(rootPom)) {
    const mavenModules = discoverMavenModules(projectRoot, 'pom.xml', new Set<string>(), 0, errors);
    for (const modulePath of mavenModules) {
      addSourceRootsForModule(projectRoot, modulePath, roots, verifiedRootSet, 'java');
    }
  }

  // Discover Gradle modules
  const gradleModules = discoverGradleModules(projectRoot, errors);
  for (const modulePath of gradleModules) {
    addSourceRootsForModule(projectRoot, modulePath, roots, verifiedRootSet, 'kotlin');
  }

  return { roots, verifiedRootSet, errors };
}

/** Resolve a project-relative path and reject anything outside projectRoot. */
function resolveWithinProject(projectRoot: string, relativePath: string): string | null {
  const resolvedRoot = resolve(projectRoot);
  const candidate = resolve(resolvedRoot, relativePath);
  return candidate === resolvedRoot || candidate.startsWith(resolvedRoot + sep)
    ? candidate
    : null;
}

/**
 * Recursively discover Maven modules from pom.xml files.
 */
function discoverMavenModules(
  projectRoot: string,
  pomRelativePath: string,
  visited: Set<string>,
  depth: number,
  errors: JvmModuleDiscoveryError[]
): string[] {
  if (depth > MAX_RECURSION_DEPTH) return [];

  const normalizedPath = resolveWithinProject(projectRoot, pomRelativePath);
  if (!normalizedPath) {
    errors.push({
      path: pomRelativePath,
      reason: `Rejected Maven module path outside project root: ${pomRelativePath}`,
    });
    return [];
  }
  if (visited.has(normalizedPath)) return [];
  visited.add(normalizedPath);

  let content: string;
  try {
    content = readFileSync(normalizedPath, 'utf-8');
  } catch {
    return [];
  }

  const modules: string[] = [];
  const pomDir = dirname(pomRelativePath);

  // Extract <module> entries from pom.xml
  const moduleRegex = /<module>([^<]+)<\/module>/g;
  let match: RegExpExecArray | null;
  while ((match = moduleRegex.exec(content)) !== null) {
    const moduleName = match[1].trim();
    const modulePath = pomDir === '.' ? moduleName : join(pomDir, moduleName);
    const absoluteModulePath = resolveWithinProject(projectRoot, modulePath);

    if (!absoluteModulePath) {
      errors.push({
        path: modulePath,
        reason: `Rejected Maven module path outside project root: ${modulePath}`,
      });
      continue;
    }

    // Verify the module directory exists
    if (existsSync(absoluteModulePath)) {
      modules.push(modulePath);

      // Recurse into child pom.xml for nested modules
      const childPom = join(modulePath, 'pom.xml');
      if (existsSync(join(projectRoot, childPom))) {
        const childModules = discoverMavenModules(projectRoot, childPom, visited, depth + 1, errors);
        modules.push(...childModules);
      }
    }
  }

  return modules;
}

/**
 * Discover Gradle modules from settings.gradle.kts or settings.gradle.
 */
function discoverGradleModules(projectRoot: string, errors: JvmModuleDiscoveryError[]): string[] {
  // Check for settings files
  const settingsFiles = ['settings.gradle.kts', 'settings.gradle'];
  let settingsContent: string | null = null;

  for (const settingsFile of settingsFiles) {
    const fullPath = resolveWithinProject(projectRoot, settingsFile);
    if (!fullPath) continue;
    if (existsSync(fullPath)) {
      try {
        settingsContent = readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }
      break;
    }
  }

  if (!settingsContent) return [];

  const modules: string[] = [];

  // Match include(":module-a") or include ':module-a' or include(":module-a", ":module-b")
  // Also handles include(":services:auth") → services/auth
  const includeRegex = /['"]:?([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = includeRegex.exec(settingsContent)) !== null) {
    const moduleName = match[1];
    // Convert Gradle colon-separated paths to filesystem paths: services:auth → services/auth
    const modulePath = moduleName.replace(/:/g, '/');
    const absoluteModulePath = resolveWithinProject(projectRoot, modulePath);

    if (!absoluteModulePath) {
      errors.push({
        path: modulePath,
        reason: `Rejected Gradle module path outside project root: ${modulePath}`,
      });
      continue;
    }

    if (existsSync(absoluteModulePath)) {
      modules.push(modulePath);
    }
  }

  return modules;
}

/**
 * For a given module path, add all standard JVM source root directories
 * that actually exist on disk.
 */
function addSourceRootsForModule(
  projectRoot: string,
  modulePath: string,
  roots: string[],
  verifiedRootSet: Set<string>,
  primaryLanguage: 'java' | 'kotlin'
): void {
  // Standard Maven/Gradle source root suffixes, plus common non-standard layouts.
  // Many projects (e.g., google/guice) use <module>/src/ and <module>/test/ directly
  // instead of the Maven-conventional <module>/src/main/java/.
  const suffixes = [
    'src/main/java',
    'src/main/kotlin',
    'src/test/java',
    'src/test/kotlin',
    'src',   // Non-standard but common (e.g., google/guice uses core/src/)
    'test',  // Non-standard test root (e.g., google/guice uses core/test/)
  ];

  for (const suffix of suffixes) {
    const relativeRoot = join(modulePath, suffix);
    const absoluteRoot = resolveWithinProject(projectRoot, relativeRoot);

    if (absoluteRoot && existsSync(absoluteRoot)) {
      // Avoid duplicates
      if (!verifiedRootSet.has(absoluteRoot)) {
        roots.push(relativeRoot);
        verifiedRootSet.add(absoluteRoot);
      }
    }
  }
}
