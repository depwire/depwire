import { DirectedGraph } from 'graphology';
import { dirname } from 'path';
import { header, timestamp, formatNumber, code, codeBlock, unorderedList } from './templates.js';
import { SymbolKind } from '../parser/types.js';

/**
 * Generate CURRENT.md - complete codebase snapshot
 * 
 * NOTE: This document will be LARGE for big projects. That's intentional.
 */
export function generateCurrent(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Complete Codebase Snapshot');
  output += '> **Note:** This is a complete snapshot of the entire codebase. For a high-level overview, see ARCHITECTURE.md.\n\n';
  
  // 1. Project Overview
  output += header('Project Overview', 2);
  output += generateProjectOverview(graph);
  
  // 2. Complete File Index
  output += header('Complete File Index', 2);
  output += generateCompleteFileIndex(graph);
  
  // 3. Complete Symbol Index
  output += header('Complete Symbol Index', 2);
  output += generateCompleteSymbolIndex(graph);
  
  // 4. Complete Edge List
  output += header('Complete Edge List', 2);
  output += generateCompleteEdgeList(graph);
  
  // 5. Connection Matrix
  output += header('Connection Matrix', 2);
  output += generateConnectionMatrix(graph);
  
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

function generateProjectOverview(graph: DirectedGraph): string {
  const fileCount = getFileCount(graph);
  const symbolCount = graph.order;
  const edgeCount = graph.size;
  const languages = getLanguageStats(graph);
  
  let output = '';
  
  output += `- **Total files:** ${formatNumber(fileCount)}\n`;
  output += `- **Total symbols:** ${formatNumber(symbolCount)}\n`;
  output += `- **Total edges:** ${formatNumber(edgeCount)}\n`;
  
  if (Object.keys(languages).length > 0) {
    output += '\n**Language breakdown:**\n\n';
    for (const [lang, count] of Object.entries(languages).sort((a, b) => b[1] - a[1])) {
      output += `- ${lang}: ${count} files\n`;
    }
  }
  
  output += '\n';
  return output;
}

interface FileInfo {
  filePath: string;
  language: string;
  symbols: Array<{ name: string; kind: SymbolKind; line: number }>;
  importsFrom: string[];
  importedBy: string[];
  incomingEdges: number;
  outgoingEdges: number;
}

function getFileInfo(graph: DirectedGraph): FileInfo[] {
  const fileMap = new Map<string, FileInfo>();
  
  // Initialize file info
  graph.forEachNode((node, attrs) => {
    if (!fileMap.has(attrs.filePath)) {
      fileMap.set(attrs.filePath, {
        filePath: attrs.filePath,
        language: getLanguageFromPath(attrs.filePath),
        symbols: [],
        importsFrom: [],
        importedBy: [],
        incomingEdges: 0,
        outgoingEdges: 0,
      });
    }
    
    const info = fileMap.get(attrs.filePath)!;
    
    if (attrs.name !== '__file__') {
      info.symbols.push({
        name: attrs.name,
        kind: attrs.kind,
        line: attrs.startLine,
      });
    }
  });
  
  // Build cross-file edges
  const fileEdges = new Map<string, Set<string>>();
  const fileEdgesReverse = new Map<string, Set<string>>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      // Forward edges (imports from)
      if (!fileEdges.has(sourceAttrs.filePath)) {
        fileEdges.set(sourceAttrs.filePath, new Set());
      }
      fileEdges.get(sourceAttrs.filePath)!.add(targetAttrs.filePath);
      
      // Reverse edges (imported by)
      if (!fileEdgesReverse.has(targetAttrs.filePath)) {
        fileEdgesReverse.set(targetAttrs.filePath, new Set());
      }
      fileEdgesReverse.get(targetAttrs.filePath)!.add(sourceAttrs.filePath);
    }
  });
  
  // Populate edge info
  for (const [filePath, info] of fileMap.entries()) {
    const importsFrom = fileEdges.get(filePath);
    const importedBy = fileEdgesReverse.get(filePath);
    
    info.importsFrom = importsFrom ? Array.from(importsFrom) : [];
    info.importedBy = importedBy ? Array.from(importedBy) : [];
    info.outgoingEdges = info.importsFrom.length;
    info.incomingEdges = info.importedBy.length;
  }
  
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

function generateCompleteFileIndex(graph: DirectedGraph): string {
  const fileInfos = getFileInfo(graph);
  
  if (fileInfos.length === 0) {
    return 'No files detected.\n\n';
  }
  
  // Sort by file path
  fileInfos.sort((a, b) => a.filePath.localeCompare(b.filePath));
  
  // Group by directory
  const dirGroups = new Map<string, FileInfo[]>();
  
  for (const info of fileInfos) {
    const dir = dirname(info.filePath);
    const topDir = dir === '.' ? 'root' : dir.split('/')[0];
    
    if (!dirGroups.has(topDir)) {
      dirGroups.set(topDir, []);
    }
    dirGroups.get(topDir)!.push(info);
  }
  
  let output = '';
  
  for (const [dir, files] of Array.from(dirGroups.entries()).sort()) {
    output += header(dir === 'root' ? 'Root Directory' : `${dir}/`, 3);
    
    for (const file of files) {
      output += header(file.filePath, 4);
      
      output += `- **Language:** ${file.language}\n`;
      output += `- **Symbols (${file.symbols.length}):** `;
      
      if (file.symbols.length === 0) {
        output += 'None\n';
      } else if (file.symbols.length <= 10) {
        output += file.symbols.map(s => s.name).join(', ') + '\n';
      } else {
        output += file.symbols.slice(0, 10).map(s => s.name).join(', ');
        output += `, ... and ${file.symbols.length - 10} more\n`;
      }
      
      // Imports from
      if (file.importsFrom.length > 0) {
        output += `- **Imports from (${file.importsFrom.length}):** `;
        if (file.importsFrom.length <= 5) {
          output += file.importsFrom.map(f => code(f)).join(', ') + '\n';
        } else {
          output += file.importsFrom.slice(0, 5).map(f => code(f)).join(', ');
          output += `, ... and ${file.importsFrom.length - 5} more\n`;
        }
      }
      
      // Imported by
      if (file.importedBy.length > 0) {
        output += `- **Imported by (${file.importedBy.length}):** `;
        if (file.importedBy.length <= 5) {
          output += file.importedBy.map(f => code(f)).join(', ') + '\n';
        } else {
          output += file.importedBy.slice(0, 5).map(f => code(f)).join(', ');
          output += `, ... and ${file.importedBy.length - 5} more\n`;
        }
      }
      
      output += `- **Connections:** ${file.incomingEdges} inbound, ${file.outgoingEdges} outbound\n\n`;
    }
  }
  
  return output;
}

function generateCompleteSymbolIndex(graph: DirectedGraph): string {
  const symbolsByKind = new Map<SymbolKind, Array<{ name: string; filePath: string; line: number }>>();
  
  graph.forEachNode((node, attrs) => {
    if (attrs.name === '__file__') return;
    
    if (!symbolsByKind.has(attrs.kind)) {
      symbolsByKind.set(attrs.kind, []);
    }
    
    symbolsByKind.get(attrs.kind)!.push({
      name: attrs.name,
      filePath: attrs.filePath,
      line: attrs.startLine,
    });
  });
  
  if (symbolsByKind.size === 0) {
    return 'No symbols detected.\n\n';
  }
  
  let output = '';
  
  // Sort by kind name
  const sortedKinds = Array.from(symbolsByKind.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  for (const [kind, symbols] of sortedKinds) {
    output += header(`${capitalizeKind(kind)}s (${symbols.length})`, 3);
    
    // Sort by name
    const sorted = symbols.sort((a, b) => a.name.localeCompare(b.name));
    
    // Limit to first 100 per kind to avoid massive output
    const limit = 100;
    const items = sorted.slice(0, limit).map(s => {
      return `${code(s.name)} — ${code(s.filePath)}:${s.line}`;
    });
    
    output += unorderedList(items);
    
    if (symbols.length > limit) {
      output += `... and ${symbols.length - limit} more.\n\n`;
    }
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

function generateCompleteEdgeList(graph: DirectedGraph): string {
  const fileEdges = new Map<string, string[]>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      if (!fileEdges.has(sourceAttrs.filePath)) {
        fileEdges.set(sourceAttrs.filePath, []);
      }
      
      const edgeDesc = `${sourceAttrs.filePath} → ${targetAttrs.filePath}`;
      if (!fileEdges.get(sourceAttrs.filePath)!.includes(edgeDesc)) {
        fileEdges.get(sourceAttrs.filePath)!.push(edgeDesc);
      }
    }
  });
  
  if (fileEdges.size === 0) {
    return 'No cross-file edges detected.\n\n';
  }
  
  let output = `Total cross-file edges: ${graph.size}\n\n`;
  
  // Sort by source file
  const sortedEdges = Array.from(fileEdges.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  // Limit to first 50 source files to avoid massive output
  const limit = 50;
  
  for (const [sourceFile, edges] of sortedEdges.slice(0, limit)) {
    output += header(sourceFile, 3);
    output += unorderedList(edges.map(e => e.replace(`${sourceFile} → `, '')));
  }
  
  if (sortedEdges.length > limit) {
    output += `... and ${sortedEdges.length - limit} more source files with edges.\n\n`;
  }
  
  return output;
}

function generateConnectionMatrix(graph: DirectedGraph): string {
  // Build directory-to-directory edges
  const dirEdges = new Map<string, Map<string, number>>();
  const allDirs = new Set<string>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceDir = getTopLevelDir(sourceAttrs.filePath);
      const targetDir = getTopLevelDir(targetAttrs.filePath);
      
      if (sourceDir && targetDir) {
        allDirs.add(sourceDir);
        allDirs.add(targetDir);
        
        if (!dirEdges.has(sourceDir)) {
          dirEdges.set(sourceDir, new Map());
        }
        
        const targetMap = dirEdges.get(sourceDir)!;
        targetMap.set(targetDir, (targetMap.get(targetDir) || 0) + 1);
      }
    }
  });
  
  if (allDirs.size === 0) {
    return 'No directory structure detected.\n\n';
  }
  
  const sortedDirs = Array.from(allDirs).sort();
  
  // Build matrix
  let output = 'Compact matrix showing which directories depend on which:\n\n';
  
  output += codeBlock(buildMatrixString(sortedDirs, dirEdges), '');
  
  return output;
}

function buildMatrixString(dirs: string[], edges: Map<string, Map<string, number>>): string {
  if (dirs.length === 0) return 'No directories';
  
  // Header row
  let result = '           ';
  for (const dir of dirs) {
    result += dir.padEnd(10, ' ').substring(0, 10);
  }
  result += '\n';
  
  // Data rows
  for (const sourceDir of dirs) {
    result += sourceDir.padEnd(10, ' ').substring(0, 10) + ' ';
    
    for (const targetDir of dirs) {
      if (sourceDir === targetDir) {
        result += '-         ';
      } else {
        const count = edges.get(sourceDir)?.get(targetDir) || 0;
        if (count > 0) {
          result += '→         ';
        } else {
          // Check reverse
          const reverseCount = edges.get(targetDir)?.get(sourceDir) || 0;
          if (reverseCount > 0) {
            result += '←         ';
          } else {
            result += '          ';
          }
        }
      }
    }
    
    result += '\n';
  }
  
  return result;
}

function getTopLevelDir(filePath: string): string | null {
  const parts = filePath.split('/');
  
  if (parts.length < 2) {
    return null;
  }
  
  // For src/ structure, return src/subdirectory
  if (parts[0] === 'src' && parts.length >= 2) {
    return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  
  // For test directories, skip
  const firstDir = parts[0];
  if (firstDir.includes('test') || firstDir.includes('__tests__') || 
      firstDir === 'node_modules' || firstDir === 'dist' || firstDir === 'build') {
    return null;
  }
  
  return parts[0];
}
