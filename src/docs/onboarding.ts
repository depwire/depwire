import { DirectedGraph } from 'graphology';
import { dirname, relative } from 'path';
import { header, timestamp, orderedList, unorderedList, code } from './templates.js';

/**
 * Generate ONBOARDING.md
 */
export function generateOnboarding(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Onboarding Guide');
  output += 'A guide for developers new to this codebase.\n\n';
  
  // 1. Quick Orientation
  output += header('Quick Orientation', 2);
  output += generateQuickOrientation(graph);
  
  // 2. Where to Start Reading
  output += header('Where to Start Reading', 2);
  output += generateReadingOrder(graph);
  
  // 3. Module Map
  output += header('Module Map', 2);
  output += generateModuleMap(graph);
  
  // 4. Key Concepts
  output += header('Key Concepts', 2);
  output += generateKeyConcepts(graph);
  
  // 5. High-Impact Files Warning
  output += header('High-Impact Files', 2);
  output += generateHighImpactWarning(graph);
  
  // 6. Running Depwire
  output += header('Using Depwire with This Project', 2);
  output += generateDepwireUsage(projectRoot);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function getLanguageStats(graph: DirectedGraph): { [key: string]: number } {
  const stats: { [key: string]: number } = {};
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

function generateQuickOrientation(graph: DirectedGraph): string {
  const fileCount = getFileCount(graph);
  const languages = getLanguageStats(graph);
  const primaryLang = Object.entries(languages).sort((a, b) => b[1] - a[1])[0];
  
  const dirs = new Set<string>();
  graph.forEachNode((node, attrs) => {
    const dir = dirname(attrs.filePath);
    if (dir !== '.') {
      const topLevel = dir.split('/')[0];
      dirs.add(topLevel);
    }
  });
  
  const mainAreas = Array.from(dirs).sort().join(', ');
  
  let output = '';
  
  if (primaryLang) {
    output += `This is a **${primaryLang[0]}** project with **${fileCount} files** and **${graph.order} symbols**. `;
  } else {
    output += `This project has **${fileCount} files** and **${graph.order} symbols**. `;
  }
  
  if (dirs.size > 0) {
    output += `The main areas are: ${mainAreas}.`;
  } else {
    output += 'The project has a flat file structure.';
  }
  
  output += '\n\n';
  return output;
}

function generateReadingOrder(graph: DirectedGraph): string {
  const fileStats = getFileStatsWithDeps(graph);
  
  if (fileStats.length === 0) {
    return 'No files to analyze.\n\n';
  }
  
  // Strategy: Start with foundation files (high in-degree, low out-degree)
  // Then move to core files (balanced)
  // Finally, orchestration files (low in-degree, high out-degree)
  
  const foundation = fileStats
    .filter(f => f.incomingRefs > 0 && f.incomingRefs >= f.outgoingRefs * 2)
    .sort((a, b) => b.incomingRefs - a.incomingRefs)
    .slice(0, 3);
  
  const core = fileStats
    .filter(f => !foundation.includes(f))
    .filter(f => f.incomingRefs > 0 && f.outgoingRefs > 0)
    .filter(f => {
      const ratio = f.incomingRefs / (f.outgoingRefs + 0.1);
      return ratio > 0.3 && ratio < 3;
    })
    .sort((a, b) => (b.incomingRefs + b.outgoingRefs) - (a.incomingRefs + a.outgoingRefs))
    .slice(0, 5);
  
  const orchestration = fileStats
    .filter(f => !foundation.includes(f) && !core.includes(f))
    .filter(f => f.outgoingRefs > 0 && f.outgoingRefs >= f.incomingRefs * 2)
    .sort((a, b) => b.outgoingRefs - a.outgoingRefs)
    .slice(0, 3);
  
  if (foundation.length === 0 && core.length === 0 && orchestration.length === 0) {
    return 'No clear reading order detected. Start with any file.\n\n';
  }
  
  let output = 'Recommended reading order for understanding the codebase:\n\n';
  
  if (foundation.length > 0) {
    output += '**Foundation** (start here — these are building blocks):\n\n';
    output += orderedList(foundation.map(f => `${code(f.filePath)} — Shared foundation (${f.incomingRefs} dependents)`));
  }
  
  if (core.length > 0) {
    output += '**Core Logic** (read these next):\n\n';
    output += orderedList(core.map(f => `${code(f.filePath)} — Core logic (${f.symbolCount} symbols)`));
  }
  
  if (orchestration.length > 0) {
    output += '**Entry Points** (read these last to see how it all fits together):\n\n';
    output += orderedList(orchestration.map(f => `${code(f.filePath)} — Entry point (imports from ${f.outgoingRefs} files)`));
  }
  
  return output;
}

function getFileStatsWithDeps(graph: DirectedGraph): Array<{
  filePath: string;
  symbolCount: number;
  incomingRefs: number;
  outgoingRefs: number;
}> {
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
  const result: Array<{
    filePath: string;
    symbolCount: number;
    incomingRefs: number;
    outgoingRefs: number;
  }> = [];
  
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

function generateModuleMap(graph: DirectedGraph): string {
  const dirStats = getDirectoryStats(graph);
  
  if (dirStats.length === 0) {
    return 'Flat file structure (no subdirectories).\n\n';
  }
  
  let output = '';
  
  for (const dir of dirStats) {
    const description = inferDirectoryDescription(dir, graph);
    output += `- ${code(dir.name)} — ${description}\n`;
  }
  
  output += '\n';
  return output;
}

interface DirectoryStats {
  name: string;
  fileCount: number;
  symbolCount: number;
  inboundEdges: number;
  outboundEdges: number;
}

function getDirectoryStats(graph: DirectedGraph): DirectoryStats[] {
  const dirMap = new Map<string, DirectoryStats>();
  
  // Count symbols per directory
  graph.forEachNode((node, attrs) => {
    const dir = dirname(attrs.filePath);
    if (dir === '.') return;
    
    if (!dirMap.has(dir)) {
      dirMap.set(dir, {
        name: dir,
        fileCount: 0,
        symbolCount: 0,
        inboundEdges: 0,
        outboundEdges: 0,
      });
    }
    
    dirMap.get(dir)!.symbolCount++;
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
    }
  });
  
  return Array.from(dirMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function inferDirectoryDescription(dir: DirectoryStats, graph: DirectedGraph): string {
  const name = dir.name.toLowerCase();
  
  // Name-based heuristics
  if (name.includes('types') || name.includes('interfaces')) {
    return 'Type definitions and interfaces';
  }
  if (name.includes('utils') || name.includes('helpers')) {
    return 'Utility functions and helpers';
  }
  if (name.includes('services')) {
    return 'Business logic and services';
  }
  if (name.includes('components')) {
    return 'UI components';
  }
  if (name.includes('api') || name.includes('routes')) {
    return 'API routes and endpoints';
  }
  if (name.includes('models') || name.includes('entities')) {
    return 'Data models and entities';
  }
  if (name.includes('config')) {
    return 'Configuration files';
  }
  if (name.includes('test')) {
    return 'Test files';
  }
  
  // Dependency-based heuristics
  const totalEdges = dir.inboundEdges + dir.outboundEdges;
  if (totalEdges === 0) {
    return 'Isolated module';
  }
  
  const inboundRatio = dir.inboundEdges / totalEdges;
  
  if (inboundRatio > 0.7) {
    return 'Shared foundation — heavily imported by other modules';
  } else if (inboundRatio < 0.3) {
    return 'Orchestration — imports from many other modules';
  } else {
    return `Core logic — ${dir.fileCount} files, ${dir.symbolCount} symbols`;
  }
}

function generateKeyConcepts(graph: DirectedGraph): string {
  const clusters = detectClusters(graph);
  
  if (clusters.length === 0) {
    return 'No distinct concept clusters detected.\n\n';
  }
  
  let output = 'The codebase is organized around these key concepts:\n\n';
  
  for (const cluster of clusters.slice(0, 5)) {
    output += `- **${cluster.name}** — ${cluster.files.length} tightly-connected files: `;
    output += cluster.files.slice(0, 3).map(f => code(f)).join(', ');
    if (cluster.files.length > 3) {
      output += `, and ${cluster.files.length - 3} more`;
    }
    output += '\n';
  }
  
  output += '\n';
  return output;
}

interface Cluster {
  name: string;
  files: string[];
}

function detectClusters(graph: DirectedGraph): Cluster[] {
  // Group files by directory
  const dirFiles = new Map<string, Set<string>>();
  const fileEdges = new Map<string, Set<string>>();
  
  // Collect files per directory
  graph.forEachNode((node, attrs) => {
    const dir = dirname(attrs.filePath);
    if (!dirFiles.has(dir)) {
      dirFiles.set(dir, new Set());
    }
    dirFiles.get(dir)!.add(attrs.filePath);
  });
  
  // Build file-to-file edges
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      if (!fileEdges.has(sourceFile)) {
        fileEdges.set(sourceFile, new Set());
      }
      fileEdges.get(sourceFile)!.add(targetFile);
    }
  });
  
  const clusters: Cluster[] = [];
  
  // For each directory, check if files are interconnected
  for (const [dir, files] of dirFiles.entries()) {
    if (dir === '.' || files.size < 2) continue;
    
    const fileArray = Array.from(files);
    let internalEdgeCount = 0;
    
    // Count edges between files in the same directory
    for (const file of fileArray) {
      const targets = fileEdges.get(file);
      if (targets) {
        for (const target of targets) {
          if (files.has(target)) {
            internalEdgeCount++;
          }
        }
      }
    }
    
    // If files in this directory have at least 2 mutual edges, it's a cluster
    if (internalEdgeCount >= 2) {
      const clusterName = inferClusterName(fileArray);
      clusters.push({
        name: clusterName,
        files: fileArray,
      });
    }
  }
  
  return clusters.sort((a, b) => b.files.length - a.files.length);
}

function inferClusterName(files: string[]): string {
  // Extract common words from file names
  const words = new Map<string, number>();
  
  for (const file of files) {
    const fileName = file.toLowerCase();
    const parts = fileName.split(/[\/\-\_\.]/).filter(p => p.length > 3);
    
    for (const part of parts) {
      words.set(part, (words.get(part) || 0) + 1);
    }
  }
  
  // Find most common word
  const sortedWords = Array.from(words.entries()).sort((a, b) => b[1] - a[1]);
  
  if (sortedWords.length > 0 && sortedWords[0][1] > 1) {
    return capitalizeFirst(sortedWords[0][0]);
  }
  
  // Fallback: use directory name
  const commonDir = dirname(files[0]);
  if (files.every(f => dirname(f) === commonDir)) {
    return capitalizeFirst(commonDir.split('/').pop() || 'Core');
  }
  
  return 'Core';
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateHighImpactWarning(graph: DirectedGraph): string {
  const highImpactFiles: Array<{ file: string; dependents: number }> = [];
  
  const fileInDegree = new Map<string, number>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      fileInDegree.set(targetFile, (fileInDegree.get(targetFile) || 0) + 1);
    }
  });
  
  for (const [file, count] of fileInDegree.entries()) {
    if (count >= 5) {
      highImpactFiles.push({ file, dependents: count });
    }
  }
  
  highImpactFiles.sort((a, b) => b.dependents - a.dependents);
  
  if (highImpactFiles.length === 0) {
    return 'No high-impact files detected. Changes should be relatively isolated.\n\n';
  }
  
  let output = '⚠️ **Before modifying these files, check the blast radius:**\n\n';
  
  const topFiles = highImpactFiles.slice(0, 5);
  
  for (const { file, dependents } of topFiles) {
    output += `- ${code(file)} — ${dependents} dependent files (run \`depwire impact_analysis ${file}\`)\n`;
  }
  
  output += '\n';
  return output;
}

function generateDepwireUsage(projectRoot: string): string {
  let output = 'Use Depwire to explore this codebase:\n\n';
  
  output += '**Visualize the dependency graph:**\n\n';
  output += '```bash\n';
  output += `depwire viz ${projectRoot}\n`;
  output += '```\n\n';
  
  output += '**Connect to AI coding tools (MCP):**\n\n';
  output += '```bash\n';
  output += `depwire mcp ${projectRoot}\n`;
  output += '```\n\n';
  
  output += '**Analyze impact of changes:**\n\n';
  output += '```bash\n';
  output += `depwire query ${projectRoot} <symbol-name>\n`;
  output += '```\n\n';
  
  output += '**Update documentation:**\n\n';
  output += '```bash\n';
  output += `depwire docs ${projectRoot} --update\n`;
  output += '```\n\n';
  
  return output;
}
