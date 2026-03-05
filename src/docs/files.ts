import { DirectedGraph } from 'graphology';
import { dirname, basename } from 'path';
import { header, timestamp, table, formatNumber, formatPercent, unorderedList } from './templates.js';

/**
 * Generate FILES.md - complete file catalog
 */
export function generateFiles(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('File Catalog');
  output += 'Complete catalog of every file in the project with key metrics.\n\n';
  
  // 1. File Summary Table
  output += header('File Summary', 2);
  output += generateFileSummaryTable(graph);
  
  // 2. Directory Breakdown
  output += header('Directory Breakdown', 2);
  output += generateDirectoryBreakdown(graph);
  
  // 3. File Size Distribution
  output += header('File Size Distribution', 2);
  output += generateFileSizeDistribution(graph);
  
  // 4. Orphan Files
  output += header('Orphan Files', 2);
  output += generateOrphanFiles(graph);
  
  // 5. Hub Files
  output += header('Hub Files', 2);
  output += generateHubFiles(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

interface FileStats {
  filePath: string;
  language: string;
  symbolCount: number;
  importCount: number;
  exportedSymbolCount: number;
  incomingConnections: number;
  outgoingConnections: number;
  totalConnections: number;
  maxLine: number;
}

function getFileStats(graph: DirectedGraph): FileStats[] {
  const fileMap = new Map<string, FileStats>();
  
  // Initialize file stats
  graph.forEachNode((node, attrs) => {
    if (!fileMap.has(attrs.filePath)) {
      fileMap.set(attrs.filePath, {
        filePath: attrs.filePath,
        language: getLanguageFromPath(attrs.filePath),
        symbolCount: 0,
        importCount: 0,
        exportedSymbolCount: 0,
        incomingConnections: 0,
        outgoingConnections: 0,
        totalConnections: 0,
        maxLine: 0,
      });
    }
    
    const stats = fileMap.get(attrs.filePath)!;
    stats.symbolCount++;
    
    // Track exported symbols
    if (attrs.exported && attrs.name !== 'default') {
      stats.exportedSymbolCount++;
    }
    
    // Track import statements
    if (attrs.kind === 'import') {
      stats.importCount++;
    }
    
    // Track max line number
    if (attrs.endLine > stats.maxLine) {
      stats.maxLine = attrs.endLine;
    }
  });
  
  // Count cross-file connections
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceStats = fileMap.get(sourceAttrs.filePath);
      const targetStats = fileMap.get(targetAttrs.filePath);
      
      if (sourceStats) {
        sourceStats.outgoingConnections++;
      }
      if (targetStats) {
        targetStats.incomingConnections++;
      }
    }
  });
  
  // Calculate total connections
  fileMap.forEach(stats => {
    stats.totalConnections = stats.incomingConnections + stats.outgoingConnections;
  });
  
  return Array.from(fileMap.values());
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.toLowerCase();
  if (ext.endsWith('.ts') || ext.endsWith('.tsx')) return 'TypeScript';
  if (ext.endsWith('.js') || ext.endsWith('.jsx') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) return 'JavaScript';
  if (ext.endsWith('.py')) return 'Python';
  if (ext.endsWith('.go')) return 'Go';
  return 'Other';
}

function generateFileSummaryTable(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  
  if (fileStats.length === 0) {
    return 'No files detected.\n\n';
  }
  
  // Sort by directory then file name
  fileStats.sort((a, b) => a.filePath.localeCompare(b.filePath));
  
  const headers = ['File', 'Language', 'Symbols', 'Imports', 'Exports', 'Connections', 'Lines'];
  const rows = fileStats.map(f => [
    `\`${f.filePath}\``,
    f.language,
    formatNumber(f.symbolCount),
    formatNumber(f.importCount),
    formatNumber(f.exportedSymbolCount),
    formatNumber(f.totalConnections),
    formatNumber(f.maxLine),
  ]);
  
  return table(headers, rows);
}

function generateDirectoryBreakdown(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  const dirMap = new Map<string, {
    fileCount: number;
    symbolCount: number;
    mostConnectedFile: string;
    maxConnections: number;
  }>();
  
  // Group by top-level directory
  for (const file of fileStats) {
    const dir = dirname(file.filePath);
    const topDir = dir === '.' ? '.' : dir.split('/')[0];
    
    if (!dirMap.has(topDir)) {
      dirMap.set(topDir, {
        fileCount: 0,
        symbolCount: 0,
        mostConnectedFile: '',
        maxConnections: 0,
      });
    }
    
    const dirStats = dirMap.get(topDir)!;
    dirStats.fileCount++;
    dirStats.symbolCount += file.symbolCount;
    
    if (file.totalConnections > dirStats.maxConnections) {
      dirStats.maxConnections = file.totalConnections;
      dirStats.mostConnectedFile = basename(file.filePath);
    }
  }
  
  if (dirMap.size === 0) {
    return 'No directories detected.\n\n';
  }
  
  let output = '';
  
  const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => b[1].fileCount - a[1].fileCount);
  
  for (const [dir, stats] of sortedDirs) {
    output += `**${dir === '.' ? 'Root' : dir}/**\n\n`;
    output += `- **Files:** ${formatNumber(stats.fileCount)}\n`;
    output += `- **Symbols:** ${formatNumber(stats.symbolCount)}\n`;
    output += `- **Most Connected:** \`${stats.mostConnectedFile}\` (${formatNumber(stats.maxConnections)} connections)\n\n`;
  }
  
  return output;
}

function generateFileSizeDistribution(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  
  if (fileStats.length === 0) {
    return 'No files detected.\n\n';
  }
  
  // Sort by symbol count
  const bySymbols = [...fileStats].sort((a, b) => b.symbolCount - a.symbolCount);
  
  let output = '';
  
  // Largest files
  output += '**Largest Files (by symbol count):**\n\n';
  const largest = bySymbols.slice(0, 10);
  const headers1 = ['File', 'Symbols', 'Lines'];
  const rows1 = largest.map(f => [
    `\`${f.filePath}\``,
    formatNumber(f.symbolCount),
    formatNumber(f.maxLine),
  ]);
  output += table(headers1, rows1);
  
  // Smallest files
  if (bySymbols.length > 10) {
    output += '**Smallest Files (by symbol count):**\n\n';
    const smallest = bySymbols.slice(-10).reverse();
    const headers2 = ['File', 'Symbols', 'Lines'];
    const rows2 = smallest.map(f => [
      `\`${f.filePath}\``,
      formatNumber(f.symbolCount),
      formatNumber(f.maxLine),
    ]);
    output += table(headers2, rows2);
  }
  
  // Average
  const avgSymbols = Math.round(fileStats.reduce((sum, f) => sum + f.symbolCount, 0) / fileStats.length);
  const avgLines = Math.round(fileStats.reduce((sum, f) => sum + f.maxLine, 0) / fileStats.length);
  
  output += `**Average File Size:**\n\n`;
  output += `- Symbols per file: ${formatNumber(avgSymbols)}\n`;
  output += `- Lines per file: ${formatNumber(avgLines)}\n\n`;
  
  return output;
}

function generateOrphanFiles(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  
  // Find files with zero connections
  const orphans = fileStats.filter(f => f.totalConnections === 0);
  
  if (orphans.length === 0) {
    return '✅ No orphan files detected. All files are connected.\n\n';
  }
  
  let output = `Found ${orphans.length} file${orphans.length === 1 ? '' : 's'} with zero connections:\n\n`;
  
  output += unorderedList(orphans.map(f => `\`${f.filePath}\` (${f.symbolCount} symbols)`));
  
  output += 'These files may be entry points, standalone scripts, or dead code.\n\n';
  
  return output;
}

function generateHubFiles(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  
  // Sort by total connections
  const hubs = fileStats
    .filter(f => f.totalConnections > 0)
    .sort((a, b) => b.totalConnections - a.totalConnections)
    .slice(0, 10);
  
  if (hubs.length === 0) {
    return 'No hub files detected.\n\n';
  }
  
  let output = 'Files with the most connections (changing these breaks the most things):\n\n';
  
  const headers = ['File', 'Total Connections', 'Incoming', 'Outgoing', 'Symbols'];
  const rows = hubs.map(f => [
    `\`${f.filePath}\``,
    formatNumber(f.totalConnections),
    formatNumber(f.incomingConnections),
    formatNumber(f.outgoingConnections),
    formatNumber(f.symbolCount),
  ]);
  
  output += table(headers, rows);
  
  return output;
}
