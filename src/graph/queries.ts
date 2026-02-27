import { DirectedGraph } from 'graphology';
import { SymbolNode, EdgeKind } from '../parser/types.js';

export interface SymbolMatch {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  scope?: string;
  dependentCount: number;
}

/**
 * Find symbols by name or full ID.
 * - If query contains "::", does exact match on node ID
 * - Otherwise, finds all nodes where name matches (case-insensitive)
 * - Results are sorted by dependentCount descending (most impactful first)
 */
export function findSymbols(graph: DirectedGraph, query: string): SymbolMatch[] {
  // If query contains "::", try exact match on node ID first
  if (query.includes('::')) {
    if (graph.hasNode(query)) {
      const attrs = graph.getNodeAttributes(query);
      return [{
        id: query,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        exported: attrs.exported,
        scope: attrs.scope,
        dependentCount: graph.inDegree(query),
      }];
    }
    // If exact match fails, continue to name-based search
  }

  // Find all nodes matching by name (case-insensitive)
  const queryLower = query.toLowerCase();
  const results: SymbolMatch[] = [];

  graph.forEachNode((nodeId, attrs) => {
    if (attrs.name.toLowerCase() === queryLower) {
      results.push({
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        exported: attrs.exported,
        scope: attrs.scope,
        dependentCount: graph.inDegree(nodeId),
      });
    }
  });

  // Sort by dependentCount descending (most impactful first)
  results.sort((a, b) => b.dependentCount - a.dependentCount);

  return results;
}

export function getDependencies(graph: DirectedGraph, symbolId: string): SymbolNode[] {
  if (!graph.hasNode(symbolId)) return [];
  
  const dependencies: SymbolNode[] = [];
  const neighbors = graph.outNeighbors(symbolId);
  
  for (const neighborId of neighbors) {
    const attrs = graph.getNodeAttributes(neighborId);
    dependencies.push({
      id: neighborId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope,
    });
  }
  
  return dependencies;
}

export function getDependents(graph: DirectedGraph, symbolId: string): SymbolNode[] {
  if (!graph.hasNode(symbolId)) return [];
  
  const dependents: SymbolNode[] = [];
  const neighbors = graph.inNeighbors(symbolId);
  
  for (const neighborId of neighbors) {
    const attrs = graph.getNodeAttributes(neighborId);
    dependents.push({
      id: neighborId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope,
    });
  }
  
  return dependents;
}

export function getImpact(graph: DirectedGraph, symbolId: string): {
  directDependents: SymbolNode[];
  transitiveDependents: SymbolNode[];
  affectedFiles: string[];
} {
  if (!graph.hasNode(symbolId)) {
    return {
      directDependents: [],
      transitiveDependents: [],
      affectedFiles: [],
    };
  }
  
  const directDependents = getDependents(graph, symbolId);
  const visited = new Set<string>([symbolId]);
  const queue: string[] = [symbolId];
  const allDependents: SymbolNode[] = [];
  const fileSet = new Set<string>();
  
  // BFS to find all transitive dependents
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = graph.inNeighbors(current);
    
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
        
        const attrs = graph.getNodeAttributes(neighborId);
        allDependents.push({
          id: neighborId,
          name: attrs.name,
          kind: attrs.kind,
          filePath: attrs.filePath,
          startLine: attrs.startLine,
          endLine: attrs.endLine,
          exported: attrs.exported,
          scope: attrs.scope,
        });
        
        fileSet.add(attrs.filePath);
      }
    }
  }
  
  return {
    directDependents,
    transitiveDependents: allDependents,
    affectedFiles: Array.from(fileSet).sort(),
  };
}

export function getCrossFileEdges(graph: DirectedGraph): {
  source: string;
  target: string;
  sourceFile: string;
  targetFile: string;
  kind: EdgeKind;
}[] {
  const crossFileEdges: {
    source: string;
    target: string;
    sourceFile: string;
    targetFile: string;
    kind: EdgeKind;
  }[] = [];
  
  graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    
    if (sourceAttrs.filePath !== targetAttrs.filePath) {
      crossFileEdges.push({
        source,
        target,
        sourceFile: sourceAttrs.filePath,
        targetFile: targetAttrs.filePath,
        kind: attrs.kind,
      });
    }
  });
  
  return crossFileEdges;
}

export function getFileSummary(graph: DirectedGraph): {
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
  
  return result.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

export function searchSymbols(graph: DirectedGraph, query: string): SymbolNode[] {
  const queryLower = query.toLowerCase();
  const results: SymbolNode[] = [];
  
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.name.toLowerCase().includes(queryLower)) {
      results.push({
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        exported: attrs.exported,
        scope: attrs.scope,
      });
    }
  });
  
  return results;
}

export function getArchitectureSummary(graph: DirectedGraph): {
  fileCount: number;
  symbolCount: number;
  edgeCount: number;
  mostConnectedFiles: { filePath: string; connections: number }[];
  orphanFiles: string[];
} {
  const fileSummary = getFileSummary(graph);
  const fileSet = new Set<string>();
  
  graph.forEachNode((node, attrs) => {
    fileSet.add(attrs.filePath);
  });
  
  // Calculate connections per file (incoming + outgoing)
  const fileConnections = fileSummary.map(f => ({
    filePath: f.filePath,
    connections: f.incomingRefs + f.outgoingRefs,
  }));
  
  // Sort by connections descending
  fileConnections.sort((a, b) => b.connections - a.connections);
  
  // Find orphan files (no cross-file references)
  const orphanFiles = fileSummary
    .filter(f => f.incomingRefs === 0 && f.outgoingRefs === 0)
    .map(f => f.filePath);
  
  return {
    fileCount: fileSet.size,
    symbolCount: graph.order,
    edgeCount: graph.size,
    mostConnectedFiles: fileConnections.slice(0, 5),
    orphanFiles,
  };
}
