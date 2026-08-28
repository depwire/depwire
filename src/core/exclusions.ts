/**
 * Shared exclusion logic for orphan and dead-code reporting.
 * 
 * This module provides a single source of truth for determining which files
 * should be excluded from orphan/dead-code analysis, ensuring consistency
 * across all reporting paths (health metrics, dead-code detector,
 * architecture summary, documentation generation).
 */

/**
 * Options controlling exclusion behavior.
 */
export interface OrphanExclusionOptions {
  /**
   * When true, test fixtures and static assets are included in reporting.
   * When false (default), they are excluded.
   */
  includeFixtures?: boolean;
}

/**
 * Returns true if the given file path should be excluded from orphan and
 * dead-code reporting.
 * 
 * Excluded by default:
 * - Test fixtures (paths containing /fixtures/ or /__fixtures__/)
 * - Static HTML entry points (.html files)
 * - Test files (via isTestFile)
 * 
 * @param filePath - Relative or absolute file path to check
 * @param options - Exclusion options (includeFixtures defaults to false)
 * @returns true if the file should be excluded
 */
export function isExcludedFromOrphanReporting(
  filePath: string,
  options?: OrphanExclusionOptions
): boolean {
  const includeFixtures = options?.includeFixtures ?? false;
  
  if (includeFixtures) {
    return false;
  }
  
  // Test fixtures
  if (filePath.includes("/fixtures/") || filePath.includes("/__fixtures__/")) {
    return true;
  }
  
  // Static HTML entry points
  if (filePath.endsWith(".html")) {
    return true;
  }
  
  // Test files
  if (isTestFile(filePath)) {
    return true;
  }
  
  return false;
}

/**
 * Directory segment names that mark a file as test-only. Matched against
 * path segments, not "/dir/" substrings, so a root-level `tests/foo.py`
 * (filePath === "tests/foo.py", no leading slash) is still recognized —
 * see #13. A substring check for "/tests/" never matches a path that
 * starts with "tests/", which is the dominant convention in pure-Python
 * repos (pytest) and common in JS repos too.
 */
// `spec` is not sufficient evidence: protocol/OpenAPI/RFC repositories often
// use it for production sources. Explicit `.spec.` filenames remain excluded.
const TEST_DIR_SEGMENTS = new Set(["test", "tests", "__tests__"]);

/**
 * Returns true if the given file path is a test file.
 * 
 * Test files are identified by:
 * - A path segment named test, tests, or __tests__ (anywhere in the
 *   path, including the first segment for root-level test directories)
 * - Filename ending in .test.ts, .test.js, .spec.ts, .spec.js
 * - Filename containing .test. or .spec.
 */
export function isTestFile(filePath: string): boolean {
  const segments = filePath.split("\\").join("/").split("/");
  if (segments.some((seg) => TEST_DIR_SEGMENTS.has(seg))) {
    return true;
  }

  const filename = segments[segments.length - 1] || "";
  if (filename.endsWith(".test.ts") || filename.endsWith(".test.js")) {
    return true;
  }
  if (filename.endsWith(".spec.ts") || filename.endsWith(".spec.js")) {
    return true;
  }
  if (filename.includes(".test.") || filename.includes(".spec.")) {
    return true;
  }
  if (filename.includes("_spec.")) {
    return true;
  }
  
  return false;
}
