import { DirectedGraph } from 'graphology';
import { header, timestamp, formatNumber, unorderedList, code, table } from './templates.js';

/**
 * Generate ERRORS.md - error handling patterns
 */
export function generateErrors(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Error Handling Analysis');
  output += 'Analysis of error handling patterns and error-prone areas in the codebase.\n\n';
  
  // 1. Error-Related Symbols
  output += header('Error-Related Symbols', 2);
  output += generateErrorRelatedSymbols(graph);
  
  // 2. Custom Error Classes
  output += header('Custom Error Classes', 2);
  output += generateCustomErrorClasses(graph);
  
  // 3. Error-Prone Files
  output += header('Error-Prone Files', 2);
  output += generateErrorProneFiles(graph);
  
  // 4. Error Handling Patterns
  output += header('Detected Patterns', 2);
  output += generateErrorHandlingPatterns(graph);
  
  // 5. Recommendations
  output += header('Recommendations', 2);
  output += generateRecommendations(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

interface ErrorSymbol {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  category: string;
}

function getErrorRelatedSymbols(graph: DirectedGraph): ErrorSymbol[] {
  const errorKeywords = [
    'error', 'err', 'exception', 'throw', 'fail', 'invalid', 
    'not_found', 'notfound', 'unauthorized', 'forbidden', 
    'timeout', 'retry', 'catch', 'try'
  ];
  
  const symbols: ErrorSymbol[] = [];
  
  graph.forEachNode((node, attrs) => {
    if (attrs.name === '__file__') return;
    
    const nameLower = attrs.name.toLowerCase();
    
    for (const keyword of errorKeywords) {
      if (nameLower.includes(keyword)) {
        let category = 'error_handling';
        
        if (nameLower.includes('retry') || nameLower.includes('timeout')) {
          category = 'retry_timeout';
        } else if (nameLower.includes('invalid') || nameLower.includes('validate')) {
          category = 'validation';
        } else if (nameLower.includes('unauthorized') || nameLower.includes('forbidden')) {
          category = 'auth_error';
        } else if (nameLower.includes('notfound') || nameLower.includes('not_found')) {
          category = 'not_found';
        }
        
        symbols.push({
          name: attrs.name,
          kind: attrs.kind,
          filePath: attrs.filePath,
          line: attrs.startLine,
          category,
        });
        break;
      }
    }
  });
  
  return symbols;
}

function generateErrorRelatedSymbols(graph: DirectedGraph): string {
  const symbols = getErrorRelatedSymbols(graph);
  
  if (symbols.length === 0) {
    return 'No error-related symbols detected.\n\n';
  }
  
  let output = `Found ${symbols.length} error-related symbol${symbols.length === 1 ? '' : 's'}:\n\n`;
  
  // Group by category
  const categories = new Map<string, ErrorSymbol[]>();
  
  for (const sym of symbols) {
    if (!categories.has(sym.category)) {
      categories.set(sym.category, []);
    }
    categories.get(sym.category)!.push(sym);
  }
  
  for (const [category, syms] of categories.entries()) {
    output += `**${formatCategory(category)} (${syms.length}):**\n\n`;
    
    const items = syms.slice(0, 10).map(s => {
      return `${code(s.name)} (${s.kind}) — ${code(s.filePath)}:${s.line}`;
    });
    
    output += unorderedList(items);
    
    if (syms.length > 10) {
      output += `... and ${syms.length - 10} more.\n\n`;
    }
  }
  
  return output;
}

function formatCategory(category: string): string {
  const map: Record<string, string> = {
    'error_handling': 'Error Handling',
    'retry_timeout': 'Retry / Timeout',
    'validation': 'Validation',
    'auth_error': 'Authentication Errors',
    'not_found': 'Not Found Errors',
  };
  return map[category] || category;
}

function generateCustomErrorClasses(graph: DirectedGraph): string {
  const errorClasses: Array<{
    name: string;
    filePath: string;
    line: number;
  }> = [];
  
  graph.forEachNode((node, attrs) => {
    if (attrs.kind === 'class') {
      const nameLower = attrs.name.toLowerCase();
      if (nameLower.includes('error') || nameLower.includes('exception')) {
        errorClasses.push({
          name: attrs.name,
          filePath: attrs.filePath,
          line: attrs.startLine,
        });
      }
    }
  });
  
  if (errorClasses.length === 0) {
    return 'No custom error classes detected.\n\n';
  }
  
  let output = `Found ${errorClasses.length} custom error class${errorClasses.length === 1 ? '' : 'es'}:\n\n`;
  
  const items = errorClasses.map(c => {
    return `${code(c.name)} — ${code(c.filePath)}:${c.line}`;
  });
  
  output += unorderedList(items);
  
  return output;
}

function generateErrorProneFiles(graph: DirectedGraph): string {
  // Files with high connection count AND error-related symbols are risky
  const fileStats = new Map<string, {
    connectionCount: number;
    errorSymbolCount: number;
    symbolCount: number;
  }>();
  
  // Initialize file stats
  graph.forEachNode((node, attrs) => {
    if (!fileStats.has(attrs.filePath)) {
      fileStats.set(attrs.filePath, {
        connectionCount: 0,
        errorSymbolCount: 0,
        symbolCount: 0,
      });
    }
    fileStats.get(attrs.filePath)!.symbolCount++;
  });
  
  // Count error-related symbols
  const errorSymbols = getErrorRelatedSymbols(graph);
  for (const sym of errorSymbols) {
    const stats = fileStats.get(sym.filePath);
    if (stats) {
      stats.errorSymbolCount++;
    }
  }
  
  // Count connections
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceStats = fileStats.get(sourceAttrs.filePath);
      const targetStats = fileStats.get(targetAttrs.filePath);
      
      if (sourceStats) sourceStats.connectionCount++;
      if (targetStats) targetStats.connectionCount++;
    }
  });
  
  // Find files with high connections and error symbols
  const errorProneFiles: Array<{
    filePath: string;
    connectionCount: number;
    errorSymbolCount: number;
    riskScore: number;
  }> = [];
  
  for (const [filePath, stats] of fileStats.entries()) {
    if (stats.connectionCount > 5) {
      const riskScore = stats.connectionCount * (1 + stats.errorSymbolCount * 0.5);
      errorProneFiles.push({
        filePath,
        connectionCount: stats.connectionCount,
        errorSymbolCount: stats.errorSymbolCount,
        riskScore,
      });
    }
  }
  
  // Sort by risk score descending
  errorProneFiles.sort((a, b) => b.riskScore - a.riskScore);
  
  if (errorProneFiles.length === 0) {
    return 'No high-risk files detected.\n\n';
  }
  
  let output = 'Files with high complexity and error-related code (riskiest to modify):\n\n';
  
  const headers = ['File', 'Connections', 'Error Symbols', 'Risk Score'];
  const rows = errorProneFiles.slice(0, 15).map(f => [
    `\`${f.filePath}\``,
    formatNumber(f.connectionCount),
    formatNumber(f.errorSymbolCount),
    f.riskScore.toFixed(1),
  ]);
  
  output += table(headers, rows);
  
  return output;
}

function generateErrorHandlingPatterns(graph: DirectedGraph): string {
  const patterns: Record<string, number> = {
    custom_errors: 0,
    retry: 0,
    timeout: 0,
    validation: 0,
    guard: 0,
  };
  
  graph.forEachNode((node, attrs) => {
    const nameLower = attrs.name.toLowerCase();
    
    // Custom error classes
    if (attrs.kind === 'class' && (nameLower.includes('error') || nameLower.includes('exception'))) {
      patterns.custom_errors++;
    }
    
    // Retry pattern
    if (nameLower.includes('retry') || nameLower.includes('attempt')) {
      patterns.retry++;
    }
    
    // Timeout pattern
    if (nameLower.includes('timeout')) {
      patterns.timeout++;
    }
    
    // Validation pattern
    if (nameLower.includes('validate') || nameLower.includes('validator') || nameLower.includes('check')) {
      patterns.validation++;
    }
    
    // Guard pattern
    if (nameLower.includes('guard') || nameLower.startsWith('is') || nameLower.startsWith('has')) {
      patterns.guard++;
    }
  });
  
  const detectedPatterns = Object.entries(patterns).filter(([, count]) => count > 0);
  
  if (detectedPatterns.length === 0) {
    return 'No error handling patterns detected.\n\n';
  }
  
  let output = '';
  
  for (const [pattern, count] of detectedPatterns) {
    const description = getPatternDescription(pattern);
    output += `- **${formatPatternName(pattern)}:** ${count} occurrences — ${description}\n`;
  }
  
  output += '\n';
  return output;
}

function formatPatternName(pattern: string): string {
  const map: Record<string, string> = {
    custom_errors: 'Custom Error Hierarchy',
    retry: 'Retry Pattern',
    timeout: 'Timeout Handling',
    validation: 'Input Validation',
    guard: 'Guard Clauses',
  };
  return map[pattern] || pattern;
}

function getPatternDescription(pattern: string): string {
  const map: Record<string, string> = {
    custom_errors: 'Custom error classes for domain-specific exceptions',
    retry: 'Retry logic for transient failures',
    timeout: 'Timeout handling for long-running operations',
    validation: 'Input validation to prevent errors',
    guard: 'Guard clauses to check preconditions',
  };
  return map[pattern] || '';
}

function generateRecommendations(graph: DirectedGraph): string {
  const recommendations: string[] = [];
  
  // Check for files with high connections but no error symbols
  const fileStats = new Map<string, {
    connectionCount: number;
    errorSymbolCount: number;
  }>();
  
  graph.forEachNode((node, attrs) => {
    if (!fileStats.has(attrs.filePath)) {
      fileStats.set(attrs.filePath, {
        connectionCount: 0,
        errorSymbolCount: 0,
      });
    }
  });
  
  const errorSymbols = getErrorRelatedSymbols(graph);
  for (const sym of errorSymbols) {
    const stats = fileStats.get(sym.filePath);
    if (stats) {
      stats.errorSymbolCount++;
    }
  }
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceStats = fileStats.get(sourceAttrs.filePath);
      const targetStats = fileStats.get(targetAttrs.filePath);
      
      if (sourceStats) sourceStats.connectionCount++;
      if (targetStats) targetStats.connectionCount++;
    }
  });
  
  // Files with high connections but no error handling
  const needsErrorHandling: string[] = [];
  for (const [filePath, stats] of fileStats.entries()) {
    if (stats.connectionCount > 10 && stats.errorSymbolCount === 0) {
      needsErrorHandling.push(filePath);
    }
  }
  
  if (needsErrorHandling.length > 0) {
    recommendations.push(`**Add error handling to high-connection files:** ${needsErrorHandling.slice(0, 5).map(f => code(f)).join(', ')}`);
  }
  
  // Check for unused error classes
  const errorClasses: string[] = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.kind === 'class') {
      const nameLower = attrs.name.toLowerCase();
      if (nameLower.includes('error') || nameLower.includes('exception')) {
        const dependents = graph.inDegree(node);
        if (dependents === 0) {
          errorClasses.push(attrs.name);
        }
      }
    }
  });
  
  if (errorClasses.length > 0) {
    recommendations.push(`**Unused error classes detected:** ${errorClasses.slice(0, 5).map(c => code(c)).join(', ')} — Consider removing or documenting why they exist`);
  }
  
  if (recommendations.length === 0) {
    return '✅ No specific recommendations. Error handling appears well-distributed.\n\n';
  }
  
  return unorderedList(recommendations);
}
