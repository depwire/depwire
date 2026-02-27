import { DirectedGraph } from 'graphology';
import { dirname } from 'path';
import { SymbolKind } from '../parser/types.js';
import { header, timestamp, table, formatNumber, formatPercent, codeBlock, unorderedList } from './templates.js';

interface LanguageStats {
  [key: string]: number;
}

interface DirectoryStats {
  name: string;
  fileCount: number;
  symbolCount: number;
  connectionCount: number;
  role: string;
  typeCount: number;
  functionCount: number;
  outboundEdges: number;
  inboundEdges: number;
}

interface CyclePath {
  path: string[];
  suggestion: string;
}

/**
 * Generate ARCHITECTURE.md
 */
export function generateArchitecture(
  graph: DirectedGraph,
  projectRoot: string,
  version: string,
  parseTime: number
): string {
  const startTime = Date.now();
  
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  output += timestamp(version, now, getFileCount(graph), graph.order);
  
  output += header('Architecture Overview');
  
  // 1. Project Summary
  output += header('Project Summary', 2);
  output += generateProjectSummary(graph, parseTime);
  
  // 2. Module Structure
  output += header('Module Structure', 2);
  output += generateModuleStructure(graph);
  
  // 3. Entry Points
  output += header('Entry Points', 2);
  output += generateEntryPoints(graph);
  
  // 4. Hub Files
  output += header('Hub Files', 2);
  output += generateHubFiles(graph);
  
  // 5. Layer Analysis
  output += header('Layer Analysis', 2);
  output += generateLayerAnalysis(graph);
  
  // 6. Circular Dependencies
  output += header('Circular Dependencies', 2);
  output += generateCircularDependencies(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function getLanguageStats(graph: DirectedGraph): LanguageStats {
  const stats: LanguageStats = {};
  const files = new Set<string>();
  
  graph.forEachNode((node, attrs) => {
    if (!files.has(attrs.filePath)) {
      files.add(attrs.filePath);
      
      const ext = attrs.filePath.toLowerCase();
      let lang: string;
      if (ext.endsWith('.ts') || ext.endsWith('.tsx')) {
        lang = 'TypeScript';
      } else if (ext.endsWith('.py')) {
        lang = 'Python';
      } else if (ext.endsWith('.js') || ext.endsWith('.jsx') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) {
        lang = 'JavaScript';
      } else if (ext.endsWith('.go')) {
        lang = 'Go';
      } else {
        lang = 'Other';
      }
      
      stats[lang] = (stats[lang] || 0) + 1;
    }
  });
  
  return stats;
}

function generateProjectSummary(graph: DirectedGraph, parseTime: number): string {
  const fileCount = getFileCount(graph);
  const symbolCount = graph.order;
  const edgeCount = graph.size;
  const languages = getLanguageStats(graph);
  
  let output = '';
  
  output += `- **Total Files:** ${formatNumber(fileCount)}\n`;
  output += `- **Total Symbols:** ${formatNumber(symbolCount)}\n`;
  output += `- **Total Edges:** ${formatNumber(edgeCount)}\n`;
  output += `- **Parse Time:** ${parseTime.toFixed(1)}s\n`;
  
  if (Object.keys(languages).length > 1) {
    output += '\n**Languages:**\n\n';
    const totalFiles = fileCount;
    for (const [lang, count] of Object.entries(languages).sort((a, b) => b[1] - a[1])) {
      output += `- ${lang}: ${count} files (${formatPercent(count, totalFiles)})\n`;
    }
  }
  
  output += '\n';
  return output;
}

function generateModuleStructure(graph: DirectedGraph): string {
  const dirStats = getDirectoryStats(graph);
  
  if (dirStats.length === 0) {
    return 'No module structure detected (single file or flat structure).\n\n';
  }
  
  const headers = ['Directory', 'Files', 'Symbols', 'Connections', 'Role'];
  const rows = dirStats.slice(0, 15).map(dir => [
    `\`${dir.name}\``,
    formatNumber(dir.fileCount),
    formatNumber(dir.symbolCount),
    formatNumber(dir.connectionCount),
    dir.role,
  ]);
  
  return table(headers, rows);
}

function getDirectoryStats(graph: DirectedGraph): DirectoryStats[] {
  const dirMap = new Map<string, DirectoryStats>();
  
  // Count symbols per directory
  graph.forEachNode((node, attrs) => {
    const dir = dirname(attrs.filePath);
    if (dir === '.') return; // Skip root-level files for now
    
    if (!dirMap.has(dir)) {
      dirMap.set(dir, {
        name: dir,
        fileCount: 0,
        symbolCount: 0,
        connectionCount: 0,
        role: '',
        typeCount: 0,
        functionCount: 0,
        outboundEdges: 0,
        inboundEdges: 0,
      });
    }
    
    const dirStat = dirMap.get(dir)!;
    dirStat.symbolCount++;
    
    // Count symbol kinds
    if (attrs.kind === 'interface' || attrs.kind === 'type_alias') {
      dirStat.typeCount++;
    } else if (attrs.kind === 'function' || attrs.kind === 'method') {
      dirStat.functionCount++;
    }
  });
  
  // Count files per directory
  const filesPerDir = new Map<string, Set<string>>();
  graph.forEachNode((node, attrs) => {
    const dir = dirname(attrs.filePath);
    if (!filesPerDir.has(dir)) {
      filesPerDir.set(dir, new Set());
    }
    filesPerDir.get(dir)!.add(attrs.filePath);
  });
  
  filesPerDir.forEach((files, dir) => {
    if (dirMap.has(dir)) {
      dirMap.get(dir)!.fileCount = files.size;
    }
  });
  
  // Count edges per directory
  const dirEdges = new Map<string, { in: number; out: number }>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    const sourceDir = dirname(sourceAttrs.filePath);
    const targetDir = dirname(targetAttrs.filePath);
    
    if (sourceDir !== targetDir) {
      if (!dirEdges.has(sourceDir)) {
        dirEdges.set(sourceDir, { in: 0, out: 0 });
      }
      if (!dirEdges.has(targetDir)) {
        dirEdges.set(targetDir, { in: 0, out: 0 });
      }
      
      dirEdges.get(sourceDir)!.out++;
      dirEdges.get(targetDir)!.in++;
    }
  });
  
  // Assign edges to directory stats
  dirEdges.forEach((edges, dir) => {
    if (dirMap.has(dir)) {
      const stat = dirMap.get(dir)!;
      stat.inboundEdges = edges.in;
      stat.outboundEdges = edges.out;
      stat.connectionCount = edges.in + edges.out;
    }
  });
  
  // Infer roles
  dirMap.forEach(dir => {
    const typeRatio = dir.symbolCount > 0 ? dir.typeCount / dir.symbolCount : 0;
    const outboundRatio = dir.connectionCount > 0 ? dir.outboundEdges / dir.connectionCount : 0;
    const inboundRatio = dir.connectionCount > 0 ? dir.inboundEdges / dir.connectionCount : 0;
    
    if (typeRatio > 0.7) {
      dir.role = 'Type definitions';
    } else if (outboundRatio > 0.7) {
      dir.role = 'Orchestration / Entry points';
    } else if (inboundRatio > 0.7) {
      dir.role = 'Shared utilities / Foundation';
    } else {
      dir.role = 'Core logic';
    }
  });
  
  // Sort by symbol count descending
  return Array.from(dirMap.values()).sort((a, b) => b.symbolCount - a.symbolCount);
}

function generateEntryPoints(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  
  // Entry points: high outbound, low inbound (they import a lot, few things import them)
  const entryPoints = fileStats
    .filter(f => f.outgoingRefs > 0)
    .map(f => ({
      ...f,
      ratio: f.incomingRefs === 0 ? Infinity : f.outgoingRefs / (f.incomingRefs + 1),
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5);
  
  if (entryPoints.length === 0) {
    return 'No clear entry points detected.\n\n';
  }
  
  const headers = ['File', 'Outgoing', 'Incoming', 'Ratio'];
  const rows = entryPoints.map(f => [
    `\`${f.filePath}\``,
    formatNumber(f.outgoingRefs),
    formatNumber(f.incomingRefs),
    f.ratio === Infinity ? '∞' : f.ratio.toFixed(1),
  ]);
  
  return table(headers, rows);
}

function generateHubFiles(graph: DirectedGraph): string {
  const fileStats = getFileStats(graph);
  
  // Hub files: high inbound edges (most other files depend on them)
  const hubFiles = fileStats
    .sort((a, b) => b.incomingRefs - a.incomingRefs)
    .slice(0, 10);
  
  if (hubFiles.length === 0 || hubFiles[0].incomingRefs === 0) {
    return 'No hub files detected.\n\n';
  }
  
  const headers = ['File', 'Dependents', 'Symbols'];
  const rows = hubFiles.map(f => [
    `\`${f.filePath}\``,
    formatNumber(f.incomingRefs),
    formatNumber(f.symbolCount),
  ]);
  
  return table(headers, rows);
}

function getFileStats(graph: DirectedGraph): {
  filePath: string;
  symbolCount: number;
  incomingRefs: number;
  outgoingRefs: number;
}[] {
  const fileMap = new Map<string, {
    symbolCount: number;
    incomingRefs: Set<string>;
    outgoingRefs: Set<string>;
  }>();
  
  // Count symbols per file
  graph.forEachNode((node, attrs) => {
    if (!fileMap.has(attrs.filePath)) {
      fileMap.set(attrs.filePath, {
        symbolCount: 0,
        incomingRefs: new Set(),
        outgoingRefs: new Set(),
      });
    }
    fileMap.get(attrs.filePath)!.symbolCount++;
  });
  
  // Count cross-file references
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceFile = fileMap.get(sourceAttrs.filePath);
      const targetFile = fileMap.get(targetAttrs.filePath);
      
      if (sourceFile) {
        sourceFile.outgoingRefs.add(targetAttrs.filePath);
      }
      if (targetFile) {
        targetFile.incomingRefs.add(sourceAttrs.filePath);
      }
    }
  });
  
  // Convert to array
  const result: {
    filePath: string;
    symbolCount: number;
    incomingRefs: number;
    outgoingRefs: number;
  }[] = [];
  
  for (const [filePath, data] of fileMap.entries()) {
    result.push({
      filePath,
      symbolCount: data.symbolCount,
      incomingRefs: data.incomingRefs.size,
      outgoingRefs: data.outgoingRefs.size,
    });
  }
  
  return result;
}

function generateLayerAnalysis(graph: DirectedGraph): string {
  const dirStats = getDirectoryStats(graph);
  
  if (dirStats.length === 0) {
    return 'No layered architecture detected (flat or single-file project).\n\n';
  }
  
  // Classify directories into layers
  const foundation = dirStats.filter(d => d.inboundEdges > d.outboundEdges * 2);
  const orchestration = dirStats.filter(d => d.outboundEdges > d.inboundEdges * 2);
  const core = dirStats.filter(d => !foundation.includes(d) && !orchestration.includes(d));
  
  let output = '';
  
  if (foundation.length > 0) {
    output += '**Foundation Layer** (mostly imported by others):\n\n';
    output += unorderedList(foundation.map(d => `\`${d.name}\` — ${d.role}`));
  }
  
  if (core.length > 0) {
    output += '**Core Layer** (balanced dependencies):\n\n';
    output += unorderedList(core.map(d => `\`${d.name}\` — ${d.role}`));
  }
  
  if (orchestration.length > 0) {
    output += '**Orchestration Layer** (mostly imports from others):\n\n';
    output += unorderedList(orchestration.map(d => `\`${d.name}\` — ${d.role}`));
  }
  
  return output;
}

function generateCircularDependencies(graph: DirectedGraph): string {
  const cycles = detectCycles(graph);
  
  if (cycles.length === 0) {
    return '✅ No circular dependencies detected.\n\n';
  }
  
  let output = `⚠️ Found ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}:\n\n`;
  
  for (let i = 0; i < Math.min(cycles.length, 10); i++) {
    const cycle = cycles[i];
    output += `**Cycle ${i + 1}:**\n\n`;
    output += codeBlock(cycle.path.join(' →\n'), '');
    output += `**Suggested fix:** ${cycle.suggestion}\n\n`;
  }
  
  if (cycles.length > 10) {
    output += `... and ${cycles.length - 10} more cycles.\n\n`;
  }
  
  return output;
}

function detectCycles(graph: DirectedGraph): CyclePath[] {
  const cycles: CyclePath[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];
  
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
  
  function dfs(file: string): boolean {
    visited.add(file);
    recStack.add(file);
    pathStack.push(file);
    
    const neighbors = fileGraph.get(file);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = pathStack.indexOf(neighbor);
          const cyclePath = pathStack.slice(cycleStart);
          cyclePath.push(neighbor); // Complete the cycle
          
          cycles.push({
            path: cyclePath,
            suggestion: 'Extract shared types/interfaces to a common file',
          });
          return true;
        }
      }
    }
    
    recStack.delete(file);
    pathStack.pop();
    return false;
  }
  
  // Try DFS from each file
  for (const file of fileGraph.keys()) {
    if (!visited.has(file)) {
      dfs(file);
      // Reset for next search
      recStack.clear();
      pathStack.length = 0;
    }
  }
  
  return cycles;
}
