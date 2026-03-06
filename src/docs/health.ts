import { DirectedGraph } from 'graphology';
import { header, timestamp, formatNumber, unorderedList, code, table } from './templates.js';
import { calculateHealthScore, loadHealthHistory } from '../health/index.js';
import { HealthReport } from '../health/types.js';

/**
 * Generate HEALTH.md - dependency health score report
 */
export function generateHealth(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Calculate health score
  const report = calculateHealthScore(graph, projectRoot);
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Dependency Health Score');
  output += 'Analysis of dependency architecture quality across 6 dimensions.\n\n';
  
  // 1. Overall Score
  output += header('Overall Score', 2);
  output += generateOverallScore(report);
  
  // 2. Dimensions Breakdown
  output += header('Dimension Breakdown', 2);
  output += generateDimensionsBreakdown(report.dimensions);
  
  // 3. Recommendations
  output += header('Recommendations', 2);
  output += generateRecommendations(report.recommendations);
  
  // 4. Historical Trend
  output += header('Historical Trend', 2);
  output += generateHistoricalTrend(projectRoot, report);
  
  // 5. Detailed Metrics
  output += header('Detailed Metrics', 2);
  output += generateDetailedMetrics(report.dimensions);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function generateOverallScore(report: HealthReport): string {
  let output = '';
  
  const gradeEmoji = {
    'A': '🟢',
    'B': '🔵',
    'C': '🟡',
    'D': '🟠',
    'F': '🔴'
  };
  
  output += `**Score:** ${report.overall}/100\n\n`;
  output += `**Grade:** ${gradeEmoji[report.grade as keyof typeof gradeEmoji]} ${report.grade}\n\n`;
  output += `**Summary:** ${report.summary}\n\n`;
  
  // Project stats
  output += `**Project Statistics:**\n\n`;
  output += `- Files: ${formatNumber(report.projectStats.files)}\n`;
  output += `- Symbols: ${formatNumber(report.projectStats.symbols)}\n`;
  output += `- Edges: ${formatNumber(report.projectStats.edges)}\n`;
  
  const langs = Object.entries(report.projectStats.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang} (${count})`)
    .join(', ');
  output += `- Languages: ${langs}\n\n`;
  
  return output;
}

function generateDimensionsBreakdown(dimensions: HealthReport['dimensions']): string {
  let output = '';
  
  const headers = ['Dimension', 'Score', 'Grade', 'Weight', 'Details'];
  const rows = dimensions.map(d => [
    d.name,
    `${d.score}/100`,
    d.grade,
    `${(d.weight * 100).toFixed(0)}%`,
    d.details
  ]);
  
  output += table(headers, rows);
  
  return output;
}

function generateRecommendations(recommendations: string[]): string {
  if (recommendations.length === 0) {
    return '✅ No critical issues detected.\n\n';
  }
  
  return unorderedList(recommendations);
}

function generateHistoricalTrend(projectRoot: string, currentReport: HealthReport): string {
  const history = loadHealthHistory(projectRoot);
  
  if (history.length < 2) {
    return 'No historical data available. Run `depwire health` regularly to track trends.\n\n';
  }
  
  let output = `Showing last ${Math.min(history.length, 10)} health checks:\n\n`;
  
  const headers = ['Date', 'Score', 'Grade', 'Trend'];
  const recent = history.slice(-10);
  
  const rows = recent.map((entry, idx) => {
    let trend = '—';
    if (idx > 0) {
      const prev = recent[idx - 1];
      const delta = entry.score - prev.score;
      if (delta > 0) {
        trend = `↑ +${delta}`;
      } else if (delta < 0) {
        trend = `↓ ${delta}`;
      } else {
        trend = '→ 0';
      }
    }
    
    return [
      entry.timestamp.split('T')[0],
      entry.score.toString(),
      entry.grade,
      trend
    ];
  });
  
  output += table(headers, rows);
  
  // Show trend summary
  const first = recent[0];
  const last = recent[recent.length - 1];
  const totalDelta = last.score - first.score;
  
  output += `\n**Trend:** `;
  if (totalDelta > 0) {
    output += `📈 Improved by ${totalDelta} points over ${recent.length} checks\n\n`;
  } else if (totalDelta < 0) {
    output += `📉 Declined by ${Math.abs(totalDelta)} points over ${recent.length} checks\n\n`;
  } else {
    output += `📊 Stable at ${last.score} points over ${recent.length} checks\n\n`;
  }
  
  return output;
}

function generateDetailedMetrics(dimensions: HealthReport['dimensions']): string {
  let output = '';
  
  for (const dim of dimensions) {
    output += header(dim.name, 3);
    output += `**Score:** ${dim.score}/100 (${dim.grade})\n\n`;
    output += `**Details:** ${dim.details}\n\n`;
    
    if (Object.keys(dim.metrics).length > 0) {
      output += `**Metrics:**\n\n`;
      for (const [key, value] of Object.entries(dim.metrics)) {
        output += `- ${key}: ${typeof value === 'number' ? formatNumber(value) : value}\n`;
      }
      output += '\n';
    }
  }
  
  return output;
}
