import { DirectedGraph } from 'graphology';
import { relative, resolve } from 'path';
import { isExcludedFromOrphanReporting } from '../core/exclusions.js';
import { findDeadSymbols } from '../dead-code/detector.js';
import { calculateOrphansScoreFromMetrics } from './metrics.js';
import type { HealthDimension } from './types.js';

/**
 * Workspace-aware orphan and dead-code scoring.
 *
 * This preserves the CLI health behavior while keeping filesystem-backed
 * dead-code detection out of the graph-only metrics module.
 */
export function calculateWorkspaceOrphansScore(
  graph: DirectedGraph,
  projectRoot: string,
  includeFixtures = false,
): HealthDimension {
  const files = new Set<string>();
  const connectedFiles = new Set<string>();

  graph.forEachNode((node, attrs) => {
    // Test fixtures (deliberately standalone sample projects) and static
    // HTML entry points have no real importer by design and inflate the
    // orphan count if counted — exclude them unless explicitly requested.
    if (!includeFixtures) {
      // attrs.filePath is project-relative by design; resolve against
      // projectRoot before diffing so this doesn't silently fall back to
      // process.cwd() (see detector.ts shouldExclude for the same fix).
      const relativePath = relative(projectRoot, resolve(projectRoot, attrs.filePath));
      if (isExcludedFromOrphanReporting(relativePath, { includeFixtures })) return;
    }
    files.add(attrs.filePath);
  });

  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;

    if (sourceFile !== targetFile) {
      connectedFiles.add(sourceFile);
      connectedFiles.add(targetFile);
    }
  });

  // Use the dead-code detector for accurate dead symbol counting.
  // It applies proper filters: relevant kinds, exported-only for vars,
  // exclusion of test files, entry points, config files, framework dirs, etc.
  const result = findDeadSymbols(graph, projectRoot, false, false, includeFixtures);

  return calculateOrphansScoreFromMetrics(
    graph,
    files,
    connectedFiles,
    result.symbols.length,
  );
}
