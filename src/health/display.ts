import { HealthReport } from './types.js';

/**
 * Format health report for CLI display with colors
 */
export function formatHealthReport(report: HealthReport, trend: string | null, verbose: boolean): string {
  let output = '';
  
  // Header
  output += `\n${bold('Depwire Health Score')}\n\n`;
  
  // Overall score with trend
  const gradeColor = getGradeColor(report.grade);
  let overallLine = `${bold('Overall:')} ${report.overall}/100 (${gradeColor(bold(`Grade: ${report.grade}`))})`;
  
  if (trend) {
    const trendColor = trend.startsWith('↑') ? green : trend.startsWith('↓') ? red : gray;
    overallLine += ` ${trendColor(trend)} from last check`;
  }
  
  output += overallLine + '\n\n';
  
  // Dimensions table
  output += formatDimensionsTable(report.dimensions);
  
  // Summary
  output += `\n${bold('Summary:')}\n${report.summary}\n\n`;
  
  // Recommendations
  if (report.recommendations.length > 0) {
    output += `${yellow(bold('⚠️  Recommendations:'))}\n`;
    for (const rec of report.recommendations) {
      output += `  • ${rec}\n`;
    }
    output += '\n';
  }
  
  // Verbose output: per-dimension details
  if (verbose) {
    output += `${bold('Dimension Details:')}\n\n`;
    for (const dim of report.dimensions) {
      output += `${bold(dim.name)} (${dim.score}/100, Grade: ${getGradeColor(dim.grade)(dim.grade)})\n`;
      output += `  ${dim.details}\n`;
      output += `  Metrics: ${JSON.stringify(dim.metrics, null, 2)}\n\n`;
    }
  }
  
  // Project stats
  output += `${gray(`Parsed ${report.projectStats.files} files, ${report.projectStats.symbols} symbols, ${report.projectStats.edges} edges`)}\n`;
  
  return output;
}

/**
 * Format dimensions as a table
 */
function formatDimensionsTable(dimensions: Array<{ name: string; score: number; grade: string; weight: number }>): string {
  const headers = ['Dimension', 'Score', 'Grade', 'Weight'];
  const widths = [25, 8, 8, 8];
  
  let output = '';
  
  // Top border
  output += '┌' + widths.map(w => '─'.repeat(w)).join('┬') + '┐\n';
  
  // Headers
  output += '│';
  headers.forEach((h, i) => {
    output += ' ' + h.padEnd(widths[i] - 1);
    output += '│';
  });
  output += '\n';
  
  // Separator
  output += '├' + widths.map(w => '─'.repeat(w)).join('┼') + '┤\n';
  
  // Rows
  for (const dim of dimensions) {
    output += '│';
    const gradeColor = getGradeColor(dim.grade);
    
    // Dimension name
    output += ' ' + dim.name.padEnd(widths[0] - 1);
    output += '│';
    
    // Score
    output += ' ' + dim.score.toString().padEnd(widths[1] - 1);
    output += '│';
    
    // Grade (colored)
    const gradePadded = dim.grade.padEnd(widths[2] - 1);
    output += ' ' + gradeColor(gradePadded);
    output += '│';
    
    // Weight
    const weightStr = `${(dim.weight * 100).toFixed(0)}%`;
    output += ' ' + weightStr.padEnd(widths[3] - 1);
    output += '│';
    
    output += '\n';
  }
  
  // Bottom border
  output += '└' + widths.map(w => '─'.repeat(w)).join('┴') + '┘\n';
  
  return output;
}

/**
 * Get color function for grade
 */
function getGradeColor(grade: string): (text: string) => string {
  switch (grade) {
    case 'A': return green;
    case 'B': return cyan;
    case 'C': return yellow;
    case 'D': return magenta;
    case 'F': return red;
    default: return gray;
  }
}

/**
 * ANSI color codes
 */
function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}

function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

function magenta(text: string): string {
  return `\x1b[35m${text}\x1b[0m`;
}

function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

function gray(text: string): string {
  return `\x1b[90m${text}\x1b[0m`;
}
