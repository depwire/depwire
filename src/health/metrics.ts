import { DirectedGraph } from 'graphology';
import { HealthDimension } from './types.js';
import { dirname } from 'path';

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
  // Build file-level graph
  const fileGraph = new Map<string, Set<string>>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
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
  
  let score = 100;
  if (cycleCount === 0) {
    score = 100;
  } else if (cycleCount <= 2) {
    score = 80;
  } else if (cycleCount <= 5) {
    score = 60;
  } else if (cycleCount <= 10) {
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
    metrics: { cycles: cycleCount }
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
      metrics: { godFiles: 0, threshold: 0 }
    };
  }
  
  // Count connections
  graph.forEachEdge((edge, attrs, source, target) => {
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
  
  let score = 100;
  if (godFiles === 0) {
    score = 100;
  } else if (godFiles === 1) {
    score = 80;
  } else if (godFiles <= 3) {
    score = 60;
  } else if (godFiles <= 5) {
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
    metrics: { godFiles, threshold: parseFloat(godThreshold.toFixed(1)) }
  };
}

/**
 * Dimension 5: Orphan Files (Weight: 10%)
 * Files with zero connections
 */
export function calculateOrphansScore(graph: DirectedGraph): HealthDimension {
  const files = new Set<string>();
  const connectedFiles = new Set<string>();
  
  graph.forEachNode((node, attrs) => {
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
  
  const orphanCount = files.size - connectedFiles.size;
  const orphanPercent = files.size > 0 ? (orphanCount / files.size) * 100 : 0;
  
  let score = 100;
  if (orphanPercent === 0) {
    score = 100;
  } else if (orphanPercent <= 5) {
    score = 80;
  } else if (orphanPercent <= 10) {
    score = 60;
  } else if (orphanPercent <= 20) {
    score = 40;
  } else {
    score = 20;
  }
  
  return {
    name: 'Orphan Files',
    score,
    weight: 0.10,
    grade: scoreToGrade(score),
    details: orphanCount === 0 ? 'No orphan files' : `${orphanCount} orphan file${orphanCount === 1 ? '' : 's'} (${orphanPercent.toFixed(0)}%)`,
    metrics: { orphans: orphanCount, percentage: parseFloat(orphanPercent.toFixed(1)) }
  };
}

/**
 * Dimension 6: Dependency Depth (Weight: 10%)
 * Measures the longest dependency chains
 */
export function calculateDepthScore(graph: DirectedGraph): HealthDimension {
  // Build file-level graph
  const fileGraph = new Map<string, Set<string>>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, new Set());
      }
      fileGraph.get(sourceFile)!.add(targetFile);
    }
  });
  
  // Find longest path using BFS from each node
  function findLongestPath(start: string): number {
    const visited = new Set<string>();
    let maxDepth = 0;
    
    function dfs(node: string, depth: number): void {
      if (visited.has(node)) {
        return;
      }
      
      visited.add(node);
      maxDepth = Math.max(maxDepth, depth);
      
      const neighbors = fileGraph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor, depth + 1);
        }
      }
      
      visited.delete(node);
    }
    
    dfs(start, 0);
    return maxDepth;
  }
  
  let maxDepth = 0;
  for (const node of fileGraph.keys()) {
    const depth = findLongestPath(node);
    maxDepth = Math.max(maxDepth, depth);
  }
  
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
    details: `Maximum dependency chain: ${maxDepth} level${maxDepth === 1 ? '' : 's'}`,
    metrics: { maxDepth }
  };
}
