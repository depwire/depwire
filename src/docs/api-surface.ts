import { DirectedGraph } from 'graphology';
import { header, timestamp, formatNumber, unorderedList, code } from './templates.js';
import { SymbolKind } from '../parser/types.js';

/**
 * Generate API_SURFACE.md - all exported symbols (public API)
 */
export function generateApiSurface(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('API Surface');
  output += 'Every exported symbol in the project — the public API.\n\n';
  
  // 1. Exports by File
  output += header('Exports by File', 2);
  output += generateExportsByFile(graph);
  
  // 2. Exports by Kind
  output += header('Exports by Kind', 2);
  output += generateExportsByKind(graph);
  
  // 3. Most-Used Exports
  output += header('Most-Used Exports', 2);
  output += generateMostUsedExports(graph);
  
  // 4. Unused Exports
  output += header('Unused Exports', 2);
  output += generateUnusedExports(graph);
  
  // 5. Re-exports / Barrel Files
  output += header('Re-exports / Barrel Files', 2);
  output += generateReExports(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

interface ExportInfo {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  dependentCount: number;
}

function getExportedSymbols(graph: DirectedGraph): ExportInfo[] {
  const exports: ExportInfo[] = [];
  
  graph.forEachNode((node, attrs) => {
    if (attrs.exported && attrs.name !== '__file__') {
      const dependentCount = graph.inDegree(node);
      
      exports.push({
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        line: attrs.startLine,
        dependentCount,
      });
    }
  });
  
  return exports;
}

function generateExportsByFile(graph: DirectedGraph): string {
  const exports = getExportedSymbols(graph);
  
  if (exports.length === 0) {
    return 'No exported symbols detected.\n\n';
  }
  
  // Group by file
  const fileExports = new Map<string, ExportInfo[]>();
  
  for (const exp of exports) {
    if (!fileExports.has(exp.filePath)) {
      fileExports.set(exp.filePath, []);
    }
    fileExports.get(exp.filePath)!.push(exp);
  }
  
  // Sort files by export count descending
  const sortedFiles = Array.from(fileExports.entries())
    .sort((a, b) => b[1].length - a[1].length);
  
  let output = '';
  
  for (const [filePath, fileExports] of sortedFiles) {
    output += header(filePath, 3);
    
    // Sort exports by dependent count descending
    const sorted = fileExports.sort((a, b) => b.dependentCount - a.dependentCount);
    
    const items = sorted.map(exp => {
      const depInfo = exp.dependentCount > 0 ? ` — ${formatNumber(exp.dependentCount)} dependents` : '';
      return `${code(exp.name)} (${exp.kind}, line ${exp.line})${depInfo}`;
    });
    
    output += unorderedList(items);
  }
  
  return output;
}

function generateExportsByKind(graph: DirectedGraph): string {
  const exports = getExportedSymbols(graph);
  
  if (exports.length === 0) {
    return 'No exported symbols detected.\n\n';
  }
  
  // Group by kind
  const kindGroups = new Map<SymbolKind, ExportInfo[]>();
  
  for (const exp of exports) {
    if (!kindGroups.has(exp.kind)) {
      kindGroups.set(exp.kind, []);
    }
    kindGroups.get(exp.kind)!.push(exp);
  }
  
  let output = '';
  
  // Sort by count descending
  const sortedKinds = Array.from(kindGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);
  
  for (const [kind, kindExports] of sortedKinds) {
    if (kind === 'import' || kind === 'export') continue; // Skip meta symbols
    
    output += `**${capitalizeKind(kind)}s (${kindExports.length}):**\n\n`;
    
    // Sort by dependent count descending, take top 20
    const sorted = kindExports
      .sort((a, b) => b.dependentCount - a.dependentCount)
      .slice(0, 20);
    
    const items = sorted.map(exp => {
      return `${code(exp.name)} — ${code(exp.filePath)}:${exp.line}`;
    });
    
    output += unorderedList(items);
  }
  
  return output;
}

function capitalizeKind(kind: SymbolKind): string {
  const map: Record<SymbolKind, string> = {
    function: 'Function',
    class: 'Class',
    variable: 'Variable',
    constant: 'Constant',
    type_alias: 'Type',
    interface: 'Interface',
    enum: 'Enum',
    import: 'Import',
    export: 'Export',
    method: 'Method',
    property: 'Property',
    decorator: 'Decorator',
    module: 'Module',
  };
  return map[kind] || kind;
}

function generateMostUsedExports(graph: DirectedGraph): string {
  const exports = getExportedSymbols(graph);
  
  if (exports.length === 0) {
    return 'No exported symbols detected.\n\n';
  }
  
  // Sort by dependent count descending
  const sorted = exports
    .filter(exp => exp.dependentCount > 0)
    .sort((a, b) => b.dependentCount - a.dependentCount)
    .slice(0, 20);
  
  if (sorted.length === 0) {
    return 'No exports with dependents detected.\n\n';
  }
  
  let output = 'Top 20 exports by dependent count — these are the most critical symbols:\n\n';
  
  const items = sorted.map(exp => {
    return `${code(exp.name)} (${exp.kind}) — ${formatNumber(exp.dependentCount)} dependents — ${code(exp.filePath)}:${exp.line}`;
  });
  
  output += unorderedList(items);
  
  return output;
}

function generateUnusedExports(graph: DirectedGraph): string {
  const exports = getExportedSymbols(graph);
  
  if (exports.length === 0) {
    return 'No exported symbols detected.\n\n';
  }
  
  // Find exports with zero dependents
  const unused = exports.filter(exp => exp.dependentCount === 0 && exp.kind !== 'export');
  
  if (unused.length === 0) {
    return '✅ No unused exports detected. All exports are used.\n\n';
  }
  
  let output = `Found ${unused.length} exported symbol${unused.length === 1 ? '' : 's'} with zero dependents:\n\n`;
  
  // Group by file
  const fileGroups = new Map<string, ExportInfo[]>();
  
  for (const exp of unused) {
    if (!fileGroups.has(exp.filePath)) {
      fileGroups.set(exp.filePath, []);
    }
    fileGroups.get(exp.filePath)!.push(exp);
  }
  
  for (const [filePath, fileExports] of fileGroups.entries()) {
    output += `**${filePath}:**\n\n`;
    const items = fileExports.map(exp => `${code(exp.name)} (${exp.kind}, line ${exp.line})`);
    output += unorderedList(items);
  }
  
  output += 'These symbols may be part of the intended public API but are not currently used, or they may be dead code.\n\n';
  
  return output;
}

function generateReExports(graph: DirectedGraph): string {
  // Find files that primarily re-export from other files
  const fileStats = new Map<string, {
    exportCount: number;
    reExportCount: number;
    reExportSources: Set<string>;
  }>();
  
  graph.forEachNode((node, attrs) => {
    if (!fileStats.has(attrs.filePath)) {
      fileStats.set(attrs.filePath, {
        exportCount: 0,
        reExportCount: 0,
        reExportSources: new Set(),
      });
    }
    
    const stats = fileStats.get(attrs.filePath)!;
    
    if (attrs.exported) {
      stats.exportCount++;
    }
    
    // Detect re-exports (export symbols)
    if (attrs.kind === 'export') {
      stats.reExportCount++;
    }
  });
  
  // Also track what they re-export from
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.kind === 'export' && sourceAttrs.filePath !== targetAttrs.filePath) {
      const stats = fileStats.get(sourceAttrs.filePath);
      if (stats) {
        stats.reExportSources.add(targetAttrs.filePath);
      }
    }
  });
  
  // Find barrel files (files where re-exports are majority)
  const barrels: Array<{
    filePath: string;
    exportCount: number;
    reExportCount: number;
    sources: string[];
  }> = [];
  
  for (const [filePath, stats] of fileStats.entries()) {
    if (stats.reExportCount > 0 && stats.reExportCount >= stats.exportCount * 0.5) {
      barrels.push({
        filePath,
        exportCount: stats.exportCount,
        reExportCount: stats.reExportCount,
        sources: Array.from(stats.reExportSources),
      });
    }
  }
  
  if (barrels.length === 0) {
    return 'No barrel files detected.\n\n';
  }
  
  let output = `Found ${barrels.length} barrel file${barrels.length === 1 ? '' : 's'} (files that primarily re-export from other files):\n\n`;
  
  for (const barrel of barrels) {
    output += header(barrel.filePath, 3);
    output += `- **Total exports:** ${formatNumber(barrel.exportCount)}\n`;
    output += `- **Re-exports:** ${formatNumber(barrel.reExportCount)}\n`;
    
    if (barrel.sources.length > 0) {
      output += `- **Sources:**\n\n`;
      output += unorderedList(barrel.sources.map(s => code(s)));
    } else {
      output += '\n';
    }
  }
  
  return output;
}
