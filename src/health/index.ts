import { DirectedGraph } from 'graphology';
import { HealthReport, HealthDimension, HealthHistory } from './types.js';
import {
  calculateCouplingScore,
  calculateCohesionScore,
  calculateCircularDepsScore,
  calculateGodFilesScore,
  calculateDepthScore,
  scoreToGrade
} from './metrics.js';
import { calculateWorkspaceOrphansScore } from './workspace-metrics.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { getSupportedExtensions } from '../parser/detect.js';
import { countGraphSymbols, isCountableSymbol } from '../graph/counts.js';

/**
 * Calculate the overall health score for a project
 */
export function calculateHealthScore(graph: DirectedGraph, projectRoot: string): HealthReport {
  // Guard: if nothing was parsed, refuse to score rather than combining
  // six dimension functions that would each report a fake perfect score
  // for an absence of data. Never call the dimension functions below for
  // this case — that is the class of bug this guard exists to prevent.
  if (graph.order === 0) {
    return {
      status: 'no_parseable_files',
      overall: NaN,
      grade: 'N/A',
      dimensions: [],
      summary: 'No parseable files found. Nothing was analyzed, so no health score is reported.',
      recommendations: [],
      projectStats: {
        files: 0,
        symbols: 0,
        edges: 0,
        languages: {}
      },
      timestamp: new Date().toISOString(),
      message: 'No parseable files found. Nothing was analyzed, so no health score is reported.',
      supportedExtensions: getSupportedExtensions()
    };
  }

  // Health is a runtime-architecture view. Symbol-level type references are
  // excluded from every dimension. A type-only import, however, replaced an
  // imports edge that main already counted; normalize that one non-additive
  // retarget back to its prior relationship solely inside the health view.
  const healthGraph = graph.copy();
  const typeEdges = healthGraph.filterEdges((_edge, attrs) => attrs.kind === 'references-type');
  for (const edge of typeEdges) {
    const attrs = healthGraph.getEdgeAttributes(edge);
    if (attrs.typeOnlyImport !== true || attrs.typeOnlyFallback === true) {
      healthGraph.dropEdge(edge);
      continue;
    }
    const source = healthGraph.source(edge);
    const originalTarget = attrs.originalImportTarget;
    if (typeof originalTarget === 'string' && healthGraph.hasNode(originalTarget)) {
      healthGraph.dropEdge(edge);
      healthGraph.mergeEdge(source, originalTarget, { ...attrs, kind: 'imports' });
    } else {
      healthGraph.setEdgeAttribute(edge, 'kind', 'imports');
    }
  }

  // Calculate all 6 dimensions
  const coupling = calculateCouplingScore(healthGraph);
  const cohesion = calculateCohesionScore(healthGraph);
  const circular = calculateCircularDepsScore(healthGraph);
  const godFiles = calculateGodFilesScore(healthGraph);
  const orphans = calculateWorkspaceOrphansScore(healthGraph, projectRoot);
  const depth = calculateDepthScore(healthGraph);
  
  const dimensions = [coupling, cohesion, circular, godFiles, orphans, depth];
  
  // Calculate weighted overall score
  const overall = Math.round(
    dimensions.reduce((sum, dim) => sum + (dim.score * dim.weight), 0)
  );
  
  // Get project stats
  const files = new Set<string>();
  const languages: Record<string, number> = {};
  
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
    if (!isCountableSymbol(attrs.kind)) return;
    
    const ext = attrs.filePath.toLowerCase();
    let lang: string;
    if (ext.endsWith('.ts') || ext.endsWith('.tsx')) {
      lang = 'TypeScript';
    } else if (ext.endsWith('.js') || ext.endsWith('.jsx') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) {
      lang = 'JavaScript';
    } else if (ext.endsWith('.py')) {
      lang = 'Python';
    } else if (ext.endsWith('.go')) {
      lang = 'Go';
    } else {
      lang = 'Other';
    }
    
    languages[lang] = (languages[lang] || 0) + 1;
  });
  
  // Generate summary
  const grade = scoreToGrade(overall);
  let summary = `Project health score is ${overall}/100 (Grade: ${grade}). `;
  
  if (overall >= 90) {
    summary += 'Excellent architecture with minimal issues.';
  } else if (overall >= 80) {
    summary += 'Good architecture with some areas for improvement.';
  } else if (overall >= 70) {
    summary += 'Moderate architecture quality. Consider refactoring high-risk areas.';
  } else if (overall >= 60) {
    summary += 'Architecture needs improvement. Multiple issues detected.';
  } else {
    summary += 'Poor architecture quality. Significant refactoring recommended.';
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (coupling.score < 70) {
    recommendations.push(`High coupling detected: Average ${coupling.metrics.avgConnections} connections per file. Consider breaking down large modules.`);
  }
  
  if (cohesion.score < 70) {
    recommendations.push(`Low cohesion: Only ${cohesion.metrics.avgInternalRatio}% internal dependencies. Reorganize files by feature or domain.`);
  }
  
  if (circular.score < 80 && typeof circular.metrics.cycles === 'number' && circular.metrics.cycles > 0) {
    recommendations.push(`${circular.metrics.cycles} circular dependency cycle${circular.metrics.cycles === 1 ? '' : 's'} detected (${Number(circular.metrics.cyclesPer100).toFixed(1)} per 100 files). Break cycles by introducing interfaces or extracting shared code.`);
  }
  
  if (godFiles.score < 80 && typeof godFiles.metrics.godFiles === 'number' && godFiles.metrics.godFiles > 0) {
    recommendations.push(`${godFiles.metrics.godFiles} god file${godFiles.metrics.godFiles === 1 ? '' : 's'} detected with >${godFiles.metrics.threshold} connections (${Number(godFiles.metrics.godFilesPer100).toFixed(1)} per 100 files). Split into smaller, focused modules.`);
  }
  
  if (orphans.score < 80 && typeof orphans.metrics.orphans === 'number' && orphans.metrics.orphans > 0) {
    recommendations.push(`${orphans.metrics.orphans} orphan file${orphans.metrics.orphans === 1 ? '' : 's'} detected. Verify they're needed or remove dead code.`);
  }
  
  if (depth.score < 80 && typeof depth.metrics.maxDepth === 'number') {
    recommendations.push(`Maximum dependency depth is ${depth.metrics.maxDepth} levels. Consider flattening the deepest chains.`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('No critical issues detected. Maintain current architecture quality.');
  }
  
  const report: HealthReport = {
    status: 'scored',
    overall,
    grade,
    dimensions,
    summary,
    recommendations,
    projectStats: {
      files: files.size,
      symbols: countGraphSymbols(graph),
      edges: graph.size,
      languages
    },
    timestamp: new Date().toISOString()
  };
  
  // Save to history
  saveHealthHistory(projectRoot, report);
  
  return report;
}

/**
 * Get the health score trend (delta from last check)
 */
export function getHealthTrend(projectRoot: string, currentScore: number): string | null {
  const history = loadHealthHistory(projectRoot);
  
  if (history.length < 2) {
    return null;
  }
  
  const previous = history[history.length - 2];
  const delta = currentScore - previous.score;
  
  if (delta > 0) {
    return `↑ +${delta}`;
  } else if (delta < 0) {
    return `↓ ${delta}`;
  } else {
    return '→ 0';
  }
}

/**
 * Save health report to history
 */
function saveHealthHistory(projectRoot: string, report: HealthReport): void {
  const resolvedRoot = resolve(projectRoot);
  const historyFile = resolve(resolvedRoot, '.depwire', 'health-history.json');
  
  if (!historyFile.startsWith(resolvedRoot)) {
    return; // Path traversal blocked silently
  }
  
  const entry: HealthHistory = {
    timestamp: report.timestamp,
    score: report.overall,
    grade: report.grade,
    dimensions: report.dimensions.map(d => ({
      name: d.name,
      score: d.score,
      grade: d.grade
    }))
  };
  
  let history: HealthHistory[] = [];
  
  if (existsSync(historyFile)) {
    try {
      if (!historyFile.startsWith(resolvedRoot)) return; // resolve() containment
      const content = readFileSync(historyFile, 'utf-8');
      history = JSON.parse(content);
    } catch {
      // Ignore parse errors, start fresh
    }
  }
  
  history.push(entry);
  
  // Keep last 50 entries
  if (history.length > 50) {
    history = history.slice(-50);
  }
  
  // Ensure directory exists before writing
  mkdirSync(dirname(historyFile), { recursive: true });
  
  if (!historyFile.startsWith(resolvedRoot)) return; // resolve() containment
  writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * Load health history
 */
export function loadHealthHistory(projectRoot: string): HealthHistory[] {
  const resolvedRoot = resolve(projectRoot);
  const historyFile = resolve(resolvedRoot, '.depwire', 'health-history.json');
  
  if (!historyFile.startsWith(resolvedRoot) || !existsSync(historyFile)) {
    return [];
  }
  
  try {
    if (!historyFile.startsWith(resolvedRoot)) return []; // resolve() containment
    const content = readFileSync(historyFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}
