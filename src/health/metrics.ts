import { DirectedGraph } from 'graphology';
import { HealthDimension } from './types.js';
import { dirname } from 'path';
import { analyzeDependencyPaths } from '../graph/dependency-paths.js';

/** Type-only relationships inform impact/dead-code, not runtime architecture. */
export function isRuntimeHealthEdge(kind: unknown): boolean {
  return kind !== 'references-type';
}

/**
 * Calculate the letter grade from a 0-100 score
 */
export function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Dimension 1: Coupling (Weight: 25%)
 * Measures how tightly connected modules are
 */
export function calculateCouplingScore(graph: DirectedGraph): HealthDimension {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  
  if (files.size === 0) {
    return {
      name: 'Coupling',
      score: 100,
      weight: 0.25,
      grade: 'A',
      details: 'No files to analyze',
      metrics: { avgConnections: 0, maxConnections: 0, crossDirCoupling: 0 }
    };
  }
  
  // Count cross-file edges
  const fileConnections = new Map<string, number>();
  let crossDirEdges = 0;
  let totalEdges = 0;
  
  graph.forEachEdge((edge, attrs, source, target) => {
    if (!isRuntimeHealthEdge(attrs.kind)) return;
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      totalEdges++;
      fileConnections.set(sourceAttrs.filePath, (fileConnections.get(sourceAttrs.filePath) || 0) + 1);
      fileConnections.set(targetAttrs.filePath, (fileConnections.get(targetAttrs.filePath) || 0) + 1);
      
      // Check if cross-directory
      const sourceDir = dirname(sourceAttrs.filePath).split('/')[0];
      const targetDir = dirname(targetAttrs.filePath).split('/')[0];
      if (sourceDir !== targetDir) {
        crossDirEdges++;
      }
    }
  });
  
  const avgConnections = totalEdges / files.size;
  const maxConnections = Math.max(...Array.from(fileConnections.values()), 0);
  const crossDirCoupling = totalEdges > 0 ? (crossDirEdges / totalEdges) : 0;
  
  // Base score from average connections
  let score = 100;
  if (avgConnections <= 3) {
    score = 100;
  } else if (avgConnections <= 6) {
    score = 80;
  } else if (avgConnections <= 10) {
    score = 60;
  } else if (avgConnections <= 15) {
    score = 40;
  } else {
    score = 20;
  }
  
  // Penalize god files (max >> average)
  if (maxConnections > avgConnections * 3) {
    score -= 10;
  }
  
  // Penalize excessive cross-directory coupling
  if (crossDirCoupling > 0.7) {
    score -= 10;
  }
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    name: 'Coupling',
    score,
    weight: 0.25,
    grade: scoreToGrade(score),
    details: `Average ${avgConnections.toFixed(1)} connections per file, max ${maxConnections}, ${(crossDirCoupling * 100).toFixed(0)}% cross-directory`,
    metrics: {
      avgConnections: parseFloat(avgConnections.toFixed(2)),
      maxConnections,
      crossDirCoupling: parseFloat((crossDirCoupling * 100).toFixed(1))
    }
  };
}

/**
 * Dimension 2: Cohesion (Weight: 20%)
 * Measures how well files within directories relate to each other
 */
export function calculateCohesionScore(graph: DirectedGraph): HealthDimension {
  const dirEdges = new Map<string, { internal: number; total: number }>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    if (!isRuntimeHealthEdge(attrs.kind)) return;
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceDir = dirname(sourceAttrs.filePath);
      const targetDir = dirname(targetAttrs.filePath);
      
      if (!dirEdges.has(sourceDir)) {
        dirEdges.set(sourceDir, { internal: 0, total: 0 });
      }
      
      const stats = dirEdges.get(sourceDir)!;
      stats.total++;
      
      if (sourceDir === targetDir) {
        stats.internal++;
      }
    }
  });
  
  if (dirEdges.size === 0) {
    return {
      name: 'Cohesion',
      score: 100,
      weight: 0.20,
      grade: 'A',
      details: 'No inter-file dependencies',
      metrics: { avgInternalRatio: 1.0, directories: 0 }
    };
  }
  
  // Calculate average internal ratio
  let totalRatio = 0;
  for (const stats of dirEdges.values()) {
    if (stats.total > 0) {
      totalRatio += stats.internal / stats.total;
    }
  }
  
  const avgInternalRatio = totalRatio / dirEdges.size;
  
  let score = 100;
  if (avgInternalRatio >= 0.7) {
    score = 100;
  } else if (avgInternalRatio >= 0.5) {
    score = 80;
  } else if (avgInternalRatio >= 0.3) {
    score = 60;
  } else if (avgInternalRatio >= 0.1) {
    score = 40;
  } else {
    score = 20;
  }
  
  return {
    name: 'Cohesion',
    score,
    weight: 0.20,
    grade: scoreToGrade(score),
    details: `Average ${(avgInternalRatio * 100).toFixed(0)}% internal dependencies per directory`,
    metrics: {
      avgInternalRatio: parseFloat((avgInternalRatio * 100).toFixed(1)),
      directories: dirEdges.size
    }
  };
}

/**
 * Dimension 3: Circular Dependencies (Weight: 20%)
 * Detects files that depend on each other in cycles
 */
export function calculateCircularDepsScore(graph: DirectedGraph): HealthDimension {
  const files = new Set<string>();

  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });

  if (files.size === 0) {
    return {
      name: 'Circular Dependencies',
      score: 100,
      weight: 0.20,
      grade: 'A',
      details: 'No files to analyze',
      metrics: { cycles: 0, cyclesPer100: 0 }
    };
  }

  // Build file-level graph
  const fileGraph = new Map<string, Set<string>>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    if (!isRuntimeHealthEdge(attrs.kind)) return;
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, new Set());
      }
      fileGraph.get(sourceFile)!.add(targetFile);
    }
  });
  
  // Find cycles using DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];
  
  function dfs(node: string, path: string[]): void {
    if (recStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }
    
    if (visited.has(node)) {
      return;
    }
    
    visited.add(node);
    recStack.add(node);
    path.push(node);
    
    const neighbors = fileGraph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path]);
      }
    }
    
    recStack.delete(node);
  }
  
  for (const node of fileGraph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }
  
  // Deduplicate cycles
  const uniqueCycles = new Set<string>();
  for (const cycle of cycles) {
    const sorted = [...cycle].sort().join(',');
    uniqueCycles.add(sorted);
  }
  
  const cycleCount = uniqueCycles.size;
  const cyclesPer100 = (cycleCount / files.size) * 100;
  
  let score = 100;
  if (cycleCount === 0) {
    score = 100;
  } else if (cyclesPer100 <= 1) {
    score = 80;
  } else if (cyclesPer100 <= 5) {
    score = 60;
  } else if (cyclesPer100 <= 15) {
    score = 40;
  } else {
    score = 20;
  }
  
  return {
    name: 'Circular Dependencies',
    score,
    weight: 0.20,
    grade: scoreToGrade(score),
    details: cycleCount === 0 ? 'No circular dependencies detected' : `${cycleCount} circular dependency cycle${cycleCount === 1 ? '' : 's'} detected`,
    metrics: { cycles: cycleCount, cyclesPer100: parseFloat(cyclesPer100.toFixed(1)) }
  };
}

/**
 * Dimension 4: God Files (Weight: 15%)
 * Files with abnormally high connection counts
 */
export function calculateGodFilesScore(graph: DirectedGraph): HealthDimension {
  const files = new Set<string>();
  const fileConnections = new Map<string, number>();

  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  
  if (files.size === 0) {
    return {
      name: 'God Files',
      score: 100,
      weight: 0.15,
      grade: 'A',
      details: 'No files to analyze',
      metrics: { godFiles: 0, threshold: 0, godFilesPer100: 0 }
    };
  }
  
  // Count connections
  graph.forEachEdge((edge, attrs, source, target) => {
    if (!isRuntimeHealthEdge(attrs.kind)) return;
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      fileConnections.set(sourceFile, (fileConnections.get(sourceFile) || 0) + 1);
      fileConnections.set(targetFile, (fileConnections.get(targetFile) || 0) + 1);
    }
  });
  
  const connections = Array.from(fileConnections.values());
  const avgConnections = connections.length > 0 ? connections.reduce((a, b) => a + b, 0) / connections.length : 0;
  const godThreshold = avgConnections * 3;
  
  const godFiles = connections.filter(c => c > godThreshold).length;
  const godFilesPer100 = (godFiles / files.size) * 100;
  
  let score = 100;
  if (godFiles === 0) {
    score = 100;
  } else if (godFilesPer100 <= 3) {
    score = 80;
  } else if (godFilesPer100 <= 6) {
    score = 60;
  } else if (godFilesPer100 <= 10) {
    score = 40;
  } else {
    score = 20;
  }
  
  return {
    name: 'God Files',
    score,
    weight: 0.15,
    grade: scoreToGrade(score),
    details: godFiles === 0 ? 'No god files detected' : `${godFiles} god file${godFiles === 1 ? '' : 's'} (>${godThreshold.toFixed(0)} connections)`,
    metrics: {
      godFiles,
      threshold: parseFloat(godThreshold.toFixed(1)),
      godFilesPer100: parseFloat(godFilesPer100.toFixed(1))
    }
  };
}

/**
 * Optional filesystem-backed dependencies for {@link calculateOrphansScore}.
 * `calculateWorkspaceOrphansScore` (workspace-metrics.ts) used to be a
 * completely separate reimplementation of this dimension that silently
 * diverged from this one (#11). It now injects the real fs-aware detector
 * through this interface instead, so there is exactly one function that
 * computes the Orphans dimension. When `deps` is omitted, this module
 * (health/metrics.ts) still imports nothing from
 * `node:fs` — required so `SimulationEngine` and the Workers-compatible
 * `depwire-cli/graph` / `depwire-cli/tools` entry points (v1.10.0) can keep
 * calling this function with zero filesystem dependency in their bundle.
 */
export interface OrphanScoreDependencies {
  projectRoot: string;
  /** Full, exclusion-aware dead-symbol detector (src/dead-code/detector.ts). */
  findDeadSymbols: (graph: DirectedGraph, projectRoot: string) => { symbols: unknown[] };
  /** Drops fixture/test/framework/entry-point files from orphan-file counting. */
  isFileExcluded?: (relativeFilePath: string) => boolean;
}

/**
 * Dimension 5: Orphan Files & Dead Code (Weight: 10%)
 * Files with zero connections + Dead exported symbol percentage
 *
 * Two modes, one function (#11 -- previously `calculateOrphansScore` and
 * `calculateWorkspaceOrphansScore` were separate implementations that
 * silently diverged; measured 15-19 points apart on real repos):
 *
 * - No `deps` (used by SimulationEngine / depwire-cli/graph, fs-free):
 *   dead-symbol counting only considers symbols that are (1) exported,
 *   (2) of a relevant top-level kind (function, class, interface,
 *   type_alias, enum, exported variable), (3) zero incoming edges. Class
 *   methods, interface properties, and other member-level details are
 *   deliberately excluded — they are not meaningful "dead code" candidates
 *   at the architecture level, and there is no filesystem access here to
 *   apply test/framework/entry-point exclusions, so keeping the kind list
 *   narrow limits false positives. Orphan-FILE counting includes every
 *   file in the graph, including fixtures -- there is no fs access to
 *   detect which directories are fixtures.
 * - With `deps` (used by calculateWorkspaceOrphansScore, has a real repo):
 *   dead-symbol counting delegates to the full detector (broader kind
 *   list including methods/properties, exported-only for variable kinds,
 *   full test/framework/entry-point/config exclusion). Orphan-FILE
 *   counting also drops excluded files via `deps.isFileExcluded`.
 *
 * These two modes are NOT expected to produce the same absolute score on
 * the same repo -- only the same scoring curve
 * (`calculateOrphansScoreFromMetrics`). A repo with fixtures, test
 * directories, or many non-exported dead methods will score differently
 * under each mode; that is an inherent consequence of one mode having no
 * filesystem access, not a bug to eliminate.
 */
export function calculateOrphansScore(
  graph: DirectedGraph,
  deps?: OrphanScoreDependencies,
): HealthDimension {
  const files = new Set<string>();
  const connectedFiles = new Set<string>();

  graph.forEachNode((node, attrs) => {
    if (deps?.isFileExcluded?.(attrs.filePath)) return;
    files.add(attrs.filePath);
  });

  graph.forEachEdge((edge, attrs, source, target) => {
    if (!isRuntimeHealthEdge(attrs.kind)) return;
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      connectedFiles.add(sourceFile);
      connectedFiles.add(targetFile);
    }
  });

  let deadSymbolCount: number;
  if (deps) {
    deadSymbolCount = deps.findDeadSymbols(graph, deps.projectRoot).symbols.length;
  } else {
    deadSymbolCount = 0;
    const relevantExportedKinds = new Set([
      'function', 'class', 'interface', 'type', 'type_alias',
      'enum', 'const', 'constant', 'let', 'var', 'variable'
    ]);
    graph.forEachNode((node, attrs) => {
      if (!attrs.exported) return;
      if (!relevantExportedKinds.has(attrs.kind)) return;
      if (graph.inDegree(node) === 0) {
        deadSymbolCount++;
      }
    });
  }

  return calculateOrphansScoreFromMetrics(graph, files, connectedFiles, deadSymbolCount);
}

export function calculateOrphansScoreFromMetrics(
  graph: DirectedGraph,
  files: Set<string>,
  connectedFiles: Set<string>,
  deadSymbolCount: number,
): HealthDimension {
  // Count membership directly rather than subtracting set sizes:
  // `connectedFiles` can contain fixture/HTML paths that were filtered out
  // of `files` above (e.g. a real source file importing a static asset),
  // which would otherwise make connectedFiles.size exceed files.size and
  // produce a nonsensical negative orphan count.
  let orphanCount = 0;
  for (const file of files) {
    if (!connectedFiles.has(file)) orphanCount++;
  }
  const orphanPercent = files.size > 0 ? (orphanCount / files.size) * 100 : 0;
  
  const deadCodePercent = graph.order > 0
    ? (deadSymbolCount / graph.order) * 100
    : 0;
  
  // Scoring scale calibrated for exported-only dead code:
  // 0% → 100, 1-2% → 90-95, 3-5% → 80-89, 6-10% → 70-79, 11-20% → 50-69, 21%+ → 30-49
  let deadScore: number;
  if (deadCodePercent === 0) {
    deadScore = 100;
  } else if (deadCodePercent <= 2) {
    deadScore = 95 - (deadCodePercent * 2.5); // 90-95
  } else if (deadCodePercent <= 5) {
    deadScore = 89 - ((deadCodePercent - 2) * 3); // 80-89
  } else if (deadCodePercent <= 10) {
    deadScore = 79 - ((deadCodePercent - 5) * 2); // 69-79
  } else if (deadCodePercent <= 20) {
    deadScore = 69 - ((deadCodePercent - 10) * 2); // 49-69
  } else {
    deadScore = Math.max(0, 49 - ((deadCodePercent - 20) * 1)); // 0-49
  }
  
  // Orphan file scoring
  let orphanScore: number;
  if (orphanPercent === 0) {
    orphanScore = 100;
  } else if (orphanPercent <= 5) {
    orphanScore = 90;
  } else if (orphanPercent <= 10) {
    orphanScore = 70;
  } else if (orphanPercent <= 20) {
    orphanScore = 50;
  } else {
    orphanScore = 30;
  }
  
  // Combined score (weighted: 60% dead code, 40% orphans)
  const score = Math.round(deadScore * 0.6 + orphanScore * 0.4);
  
  return {
    name: 'Orphans & Dead Code',
    score,
    weight: 0.10,
    grade: scoreToGrade(score),
    details: `${orphanCount} orphan file${orphanCount === 1 ? '' : 's'} (${orphanPercent.toFixed(0)}%), ${deadSymbolCount} dead symbols (${deadCodePercent.toFixed(1)}%)`,
    metrics: { 
      orphans: orphanCount, 
      orphanPercentage: parseFloat(orphanPercent.toFixed(1)),
      deadSymbols: deadSymbolCount,
      deadCodePercentage: parseFloat(deadCodePercent.toFixed(1))
    }
  };
}

/**
 * Dimension 6: Dependency Depth (Weight: 10%)
 * Measures the longest dependency chains
 */
/**
 * Longest simple path in a general directed graph is NP-hard once cycles
 * exist (it generalizes Hamiltonian path) -- there is no principled single
 * answer to "how long is the chain through a cycle", since a cycle can be
 * entered and exited at any of its member nodes. Rather than brute-force an
 * intractable exact answer (the previous implementation's exhaustive
 * backtracking search, which is exponential and can hang indefinitely on a
 * cyclic file graph), this computes the longest path in the DAG of strongly
 * connected components: each SCC -- including single-file SCCs on an
 * acyclic graph -- collapses to one node, and a cycle contributes exactly
 * one hop of depth regardless of its size. On an acyclic graph every SCC is
 * a singleton, so this reduces to exactly the same computation as before
 * (longest path on a DAG is unambiguous) -- acyclic repos get an identical
 * score, not an approximately-similar one. Runs in O(V+E): Tarjan's SCC
 * decomposition is linear, and the longest path over the resulting DAG is a
 * bounded dynamic pass in reverse topological order.
 */
export function calculateDepthScore(graph: DirectedGraph): HealthDimension {
  const { maxDepth, sccCount, nodeCount } = analyzeDependencyPaths(graph, 0, isRuntimeHealthEdge);
  const hasCycles = sccCount < nodeCount;
  
  let score = 100;
  if (maxDepth <= 4) {
    score = 100;
  } else if (maxDepth <= 6) {
    score = 80;
  } else if (maxDepth <= 8) {
    score = 60;
  } else if (maxDepth <= 12) {
    score = 40;
  } else {
    score = 20;
  }
  
  return {
    name: 'Dependency Depth',
    score,
    weight: 0.10,
    grade: scoreToGrade(score),
    details: hasCycles
      ? `Maximum dependency chain: ${maxDepth} level${maxDepth === 1 ? '' : 's'} through the codebase's dependency clusters (cycles collapsed to one hop each)`
      : `Maximum dependency chain: ${maxDepth} level${maxDepth === 1 ? '' : 's'}`,
    metrics: { maxDepth }
  };
}
