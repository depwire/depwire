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
 * Returns true if the given file path is a test file.
 * 
 * Test files are identified by:
 * - Path containing /test/ or /tests/
 * - Filename ending in .test.ts, .test.js, .spec.ts, .spec.js
 * - Filename containing .test. or .spec.
 */
export function isTestFile(filePath: string): boolean {
  if (filePath.includes("/test/") || filePath.includes("/tests/")) {
    return true;
  }
  
  const filename = filePath.split("/").pop() || "";
  if (filename.endsWith(".test.ts") || filename.endsWith(".test.js")) {
    return true;
  }
  if (filename.endsWith(".spec.ts") || filename.endsWith(".spec.js")) {
    return true;
  }
  if (filename.includes(".test.") || filename.includes(".spec.")) {
    return true;
  }
  
  return false;
}
