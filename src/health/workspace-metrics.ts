import { DirectedGraph } from 'graphology';
import { relative, resolve } from 'path';
import { isExcludedFromOrphanReporting } from '../core/exclusions.js';
import { findDeadSymbols } from '../dead-code/detector.js';
import { calculateOrphansScore } from './metrics.js';
import type { HealthDimension } from './types.js';

/**
 * Workspace-aware orphan and dead-code scoring.
 *
 * Thin delegator to {@link calculateOrphansScore} (#11) -- injects the real
 * fs-backed dead-symbol detector and file-exclusion predicate, keeping the
 * filesystem-backed detector import (`node:fs`, transitively) confined to
 * this module rather than health/metrics.ts, which SimulationEngine and the
 * Workers-compatible depwire-cli/graph entry point depend on directly.
 */
export function calculateWorkspaceOrphansScore(
  graph: DirectedGraph,
  projectRoot: string,
  includeFixtures = false,
): HealthDimension {
  return calculateOrphansScore(graph, {
    projectRoot,
    findDeadSymbols: (g, root) => findDeadSymbols(g, root, false, false, includeFixtures),
    isFileExcluded: includeFixtures
      ? undefined
      : (filePath) => {
          // attrs.filePath is project-relative by design; resolve against
          // projectRoot before diffing so this doesn't silently fall back to
          // process.cwd() (see detector.ts shouldExclude for the same fix).
          const relativePath = relative(projectRoot, resolve(projectRoot, filePath));
          return isExcludedFromOrphanReporting(relativePath, { includeFixtures });
        },
  });
}
