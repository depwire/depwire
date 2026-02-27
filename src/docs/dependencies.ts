import { DirectedGraph } from 'graphology';
import { dirname } from 'path';
import { header, timestamp, table, formatNumber, impactEmoji, codeBlock, unorderedList } from './templates.js';

/**
 * Generate DEPENDENCIES.md
 */
export function generateDependencies(
  graph: DirectedGraph,
  projectRoot: string,
  version: string
): string {
  let output = '';
  
  // Header with timestamp
  const now = new Date().toISOString().split('T')[0];
  const fileCount = getFileCount(graph);
  output += timestamp(version, now, fileCount, graph.order);
  
  output += header('Dependency Map');
  output += 'Complete dependency mapping showing what connects to what.\n\n';
  
  // 1. Module Dependency Matrix
  output += header('Module Dependency Matrix', 2);
  output += generateModuleDependencyMatrix(graph);
  
  // 2. High-Impact Symbols
  output += header('High-Impact Symbols', 2);
  output += generateHighImpactSymbols(graph);
  
  // 3. Isolated Files
  output += header('Isolated Files', 2);
  output += generateIsolatedFiles(graph);
  
  // 4. Most Connected File Pairs
  output += header('Most Connected File Pairs', 2);
  output += generateConnectedFilePairs(graph);
  
  // 5. Dependency Chains
  output += header('Longest Dependency Chains', 2);
  output += generateDependencyChains(graph);
  
  // 6. Circular Dependencies
  output += header('Circular Dependencies (Detailed)', 2);
  output += generateCircularDependenciesDetailed(graph);
  
  return output;
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}

function generateModuleDependencyMatrix(graph: DirectedGraph): string {
  // Build directory-to-directory edges
  const dirEdges = new Map<string, Map<string, number>>();
  const allDirs = new Set<string>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceDir = getTopLevelDir(sourceAttrs.filePath);
      const targetDir = getTopLevelDir(targetAttrs.filePath);
      
      if (sourceDir && targetDir && sourceDir !== targetDir) {
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
    return 'No module structure detected (flat or single-directory project).\n\n';
  }
  
  // Calculate total edge count per directory
  const dirTotalEdges = new Map<string, number>();
  for (const [sourceDir, targets] of dirEdges.entries()) {
    let total = 0;
    for (const count of targets.values()) {
      total += count;
    }
    dirTotalEdges.set(sourceDir, total);
  }
  
  // Sort directories by total edge count and take top 15
  const sortedDirs = Array.from(allDirs)
    .sort((a, b) => (dirTotalEdges.get(b) || 0) - (dirTotalEdges.get(a) || 0))
    .slice(0, 15);
  
  if (sortedDirs.length === 0) {
    return 'No cross-module dependencies detected.\n\n';
  }
  
  // Build matrix table
  const headers = ['From / To', ...sortedDirs];
  const rows: string[][] = [];
  
  for (const sourceDir of sortedDirs) {
    const row: string[] = [sourceDir];
    
    for (const targetDir of sortedDirs) {
      if (sourceDir === targetDir) {
        row.push('-');
      } else {
        const count = dirEdges.get(sourceDir)?.get(targetDir) || 0;
        row.push(count > 0 ? count.toString() : '✗');
      }
    }
    
    rows.push(row);
  }
  
  return table(headers, rows);
}

/**
 * Get top-level directory (e.g., "src/parser/typescript.ts" -> "src/parser")
 * Filters out test fixtures and common non-source directories
 */
function getTopLevelDir(filePath: string): string | null {
  const parts = filePath.split('/');
  
  // Skip single-file projects
  if (parts.length < 2) {
    return null;
  }
  
  // For src/ structure with subdirectories, return src/subdirectory
  if (parts[0] === 'src' && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }
  
  // For src/ with file directly in src/, skip (e.g., src/index.ts)
  if (parts[0] === 'src' && parts.length === 2) {
    return null;
  }
  
  // For non-src structure, return first directory if not a test/fixture/example dir
  const firstDir = parts[0];
  if (firstDir.includes('test') || firstDir.includes('fixture') || 
      firstDir.includes('example') || firstDir.includes('__tests__') ||
      firstDir === 'node_modules' || firstDir === 'dist' || firstDir === 'build') {
    return null;
  }
  
  // Return first two levels for reasonable grouping
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  
  return parts[0];
}

function generateHighImpactSymbols(graph: DirectedGraph): string {
  const symbolImpact: Array<{
    name: string;
    filePath: string;
    kind: string;
    dependentCount: number;
  }> = [];
  
  graph.forEachNode((node, attrs) => {
    const inDegree = graph.inDegree(node);
    if (inDegree > 0 && attrs.name !== '__file__') {
      symbolImpact.push({
        name: attrs.name,
        filePath: attrs.filePath,
        kind: attrs.kind,
        dependentCount: inDegree,
      });
    }
  });
  
  // Sort by dependent count descending
  symbolImpact.sort((a, b) => b.dependentCount - a.dependentCount);
  
  const top = symbolImpact.slice(0, 15);
  
  if (top.length === 0) {
    return 'No high-impact symbols detected.\n\n';
  }
  
  const headers = ['Symbol', 'File', 'Kind', 'Dependents', 'Impact'];
  const rows = top.map(s => {
    const impact = s.dependentCount >= 20 ? `${impactEmoji(s.dependentCount)} Critical` :
                   s.dependentCount >= 10 ? `${impactEmoji(s.dependentCount)} High` :
                   s.dependentCount >= 5 ? `${impactEmoji(s.dependentCount)} Medium` :
                   `${impactEmoji(s.dependentCount)} Low`;
    
    return [
      `\`${s.name}\``,
      `\`${s.filePath}\``,
      s.kind,
      formatNumber(s.dependentCount),
      impact,
    ];
  });
  
  return table(headers, rows);
}

function generateIsolatedFiles(graph: DirectedGraph): string {
  const fileConnections = new Map<string, { incoming: number; outgoing: number }>();
  
  // Count connections per file
  graph.forEachNode((node, attrs) => {
    if (!fileConnections.has(attrs.filePath)) {
      fileConnections.set(attrs.filePath, { incoming: 0, outgoing: 0 });
    }
  });
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const sourceConn = fileConnections.get(sourceAttrs.filePath);
      const targetConn = fileConnections.get(targetAttrs.filePath);
      
      if (sourceConn) sourceConn.outgoing++;
      if (targetConn) targetConn.incoming++;
    }
  });
  
  // Find isolated files (zero incoming edges)
  const isolated: string[] = [];
  
  for (const [file, conn] of fileConnections.entries()) {
    if (conn.incoming === 0) {
      isolated.push(file);
    }
  }
  
  if (isolated.length === 0) {
    return 'No isolated files detected. All files are connected.\n\n';
  }
  
  let output = `Found ${isolated.length} file${isolated.length === 1 ? '' : 's'} with no incoming dependencies:\n\n`;
  
  if (isolated.length <= 20) {
    output += unorderedList(isolated.map(f => `\`${f}\``));
  } else {
    output += unorderedList(isolated.slice(0, 20).map(f => `\`${f}\``));
    output += `... and ${isolated.length - 20} more.\n\n`;
  }
  
  output += 'These files could be entry points, standalone scripts, or dead code.\n\n';
  
  return output;
}

function generateConnectedFilePairs(graph: DirectedGraph): string {
  const filePairEdges = new Map<string, number>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      const pair = [sourceAttrs.filePath, targetAttrs.filePath].sort().join(' <-> ');
      filePairEdges.set(pair, (filePairEdges.get(pair) || 0) + 1);
    }
  });
  
  const pairs = Array.from(filePairEdges.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (pairs.length === 0) {
    return 'No cross-file dependencies detected.\n\n';
  }
  
  const headers = ['File 1', 'File 2', 'Edges'];
  const rows = pairs.map(([pair, count]) => {
    const [file1, file2] = pair.split(' <-> ');
    return [`\`${file1}\``, `\`${file2}\``, formatNumber(count)];
  });
  
  return table(headers, rows);
}

function generateDependencyChains(graph: DirectedGraph): string {
  const chains = findLongestPaths(graph, 5);
  
  if (chains.length === 0) {
    return 'No significant dependency chains detected.\n\n';
  }
  
  let output = '';
  
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    output += `**Chain ${i + 1}** (${chain.length} files):\n\n`;
    output += codeBlock(chain.join(' →\n'), '');
  }
  
  return output;
}

function findLongestPaths(graph: DirectedGraph, limit: number): string[][] {
  // Build file-level graph
  const fileGraph = new Map<string, Set<string>>();
  const fileInDegree = new Map<string, number>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceFile = graph.getNodeAttributes(source).filePath;
    const targetFile = graph.getNodeAttributes(target).filePath;
    
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, new Set());
      }
      fileGraph.get(sourceFile)!.add(targetFile);
      
      fileInDegree.set(targetFile, (fileInDegree.get(targetFile) || 0) + 1);
      if (!fileInDegree.has(sourceFile)) {
        fileInDegree.set(sourceFile, 0);
      }
    }
  });
  
  // Find files with zero in-degree (roots)
  const roots: string[] = [];
  for (const [file, inDegree] of fileInDegree.entries()) {
    if (inDegree === 0) {
      roots.push(file);
    }
  }
  
  // DFS from each root to find longest paths
  const allPaths: string[][] = [];
  const visited = new Set<string>();
  
  function dfs(file: string, path: string[]) {
    visited.add(file);
    path.push(file);
    
    const neighbors = fileGraph.get(file);
    if (!neighbors || neighbors.size === 0) {
      allPaths.push([...path]);
    } else {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, path);
        }
      }
    }
    
    path.pop();
    visited.delete(file);
  }
  
  for (const root of roots.slice(0, 10)) {
    dfs(root, []);
  }
  
  // Sort by path length descending
  allPaths.sort((a, b) => b.length - a.length);
  
  return allPaths.slice(0, limit);
}

function generateCircularDependenciesDetailed(graph: DirectedGraph): string {
  const cycles = detectCyclesDetailed(graph);
  
  if (cycles.length === 0) {
    return '✅ No circular dependencies detected.\n\n';
  }
  
  let output = `⚠️ Found ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}:\n\n`;
  
  for (let i = 0; i < Math.min(cycles.length, 5); i++) {
    const cycle = cycles[i];
    output += `**Cycle ${i + 1}:**\n\n`;
    output += codeBlock(cycle.files.join(' →\n') + ' → ' + cycle.files[0], '');
    
    if (cycle.symbols.length > 0) {
      output += '**Symbols involved:**\n\n';
      output += unorderedList(cycle.symbols.map(s => `\`${s.name}\` (${s.kind}) at \`${s.filePath}:${s.line}\``));
    }
    
    output += `**Suggested fix:** ${cycle.suggestion}\n\n`;
  }
  
  if (cycles.length > 5) {
    output += `... and ${cycles.length - 5} more cycles.\n\n`;
  }
  
  return output;
}

interface CycleDetail {
  files: string[];
  symbols: Array<{ name: string; kind: string; filePath: string; line: number }>;
  suggestion: string;
}

function detectCyclesDetailed(graph: DirectedGraph): CycleDetail[] {
  const cycles: CycleDetail[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];
  
  // Build file-level graph with symbol details
  const fileGraph = new Map<string, Map<string, Array<{ symbolName: string; symbolKind: string; line: number }>>>();
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    const sourceFile = sourceAttrs.filePath;
    const targetFile = targetAttrs.filePath;
    
    if (sourceFile !== targetFile) {
      if (!fileGraph.has(sourceFile)) {
        fileGraph.set(sourceFile, new Map());
      }
      
      const targetMap = fileGraph.get(sourceFile)!;
      if (!targetMap.has(targetFile)) {
        targetMap.set(targetFile, []);
      }
      
      targetMap.get(targetFile)!.push({
        symbolName: targetAttrs.name,
        symbolKind: targetAttrs.kind,
        line: attrs.line || sourceAttrs.startLine,
      });
    }
  });
  
  function dfs(file: string): boolean {
    visited.add(file);
    recStack.add(file);
    pathStack.push(file);
    
    const neighbors = fileGraph.get(file);
    if (neighbors) {
      for (const [neighbor, symbols] of neighbors.entries()) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = pathStack.indexOf(neighbor);
          const cyclePath = pathStack.slice(cycleStart);
          
          // Collect symbols involved
          const cycleSymbols: Array<{ name: string; kind: string; filePath: string; line: number }> = [];
          for (let i = 0; i < cyclePath.length; i++) {
            const currentFile = cyclePath[i];
            const nextFile = cyclePath[(i + 1) % cyclePath.length];
            const edgeSymbols = fileGraph.get(currentFile)?.get(nextFile) || [];
            
            for (const sym of edgeSymbols.slice(0, 3)) {
              cycleSymbols.push({
                name: sym.symbolName,
                kind: sym.symbolKind,
                filePath: currentFile,
                line: sym.line,
              });
            }
          }
          
          cycles.push({
            files: cyclePath,
            symbols: cycleSymbols,
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
