import { DirectedGraph } from 'graphology';
import { SymbolNode, EdgeKind } from '../parser/types.js';
import { isExcludedFromOrphanReporting } from '../core/exclusions.js';
import { relative } from 'path';

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
  crossLanguage?: boolean;
  edgeType?: string;
}[] {
  const crossFileEdges: {
    source: string;
    target: string;
    sourceFile: string;
    targetFile: string;
    kind: EdgeKind;
    crossLanguage?: boolean;
    edgeType?: string;
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
        crossLanguage: attrs.crossLanguage || false,
        edgeType: attrs.edgeType,
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

// ── Test-file heuristics ───────────────────────────────────────────
const TEST_PATH_SEGMENTS = /[/\\](tests?|__tests__|spec)[/\\]/i;
const TEST_FILE_PATTERNS = /\.(test|spec)\.[jt]sx?$|_test\.(go|py)$|^test_.*\.py$/i;

function isTestFile(filePath: string): boolean {
  return TEST_PATH_SEGMENTS.test(filePath) || TEST_FILE_PATTERNS.test(filePath);
}

export interface AffectedFile {
  filePath: string;
  depth: number;
  reason: string;
  isTest: boolean;
}

/**
 * Given a target file path, BFS-traverse reverse edges (dependents) to find
 * every file transitively affected by a change, including test files.
 */
export function getAffectedFiles(
  graph: DirectedGraph,
  targetFilePath: string,
  options: { maxDepth?: number; testsOnly?: boolean } = {},
): { affected: AffectedFile[]; testFiles: AffectedFile[]; totalCount: number } {
  const maxDepth = options.maxDepth ?? 5;

  // Collect all node IDs that live in the target file
  const seedNodes: string[] = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === targetFilePath) {
      seedNodes.push(nodeId);
    }
  });

  if (seedNodes.length === 0) return { affected: [], testFiles: [], totalCount: 0 };

  // BFS on reverse edges (inNeighbors)
  const visited = new Set<string>(seedNodes);
  const fileMap = new Map<string, { depth: number; reason: string }>();

  interface QueueItem { nodeId: string; depth: number }
  let queue: QueueItem[] = seedNodes.map(n => ({ nodeId: n, depth: 0 }));

  while (queue.length > 0) {
    const next: QueueItem[] = [];
    for (const { nodeId, depth } of queue) {
      if (depth >= maxDepth) continue;
      for (const neighborId of graph.inNeighbors(nodeId)) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const attrs = graph.getNodeAttributes(neighborId);
        const srcAttrs = graph.getNodeAttributes(nodeId);
        const newDepth = depth + 1;

        // Track file at minimum depth
        if (!fileMap.has(attrs.filePath) || fileMap.get(attrs.filePath)!.depth > newDepth) {
          const relation = newDepth === 1 ? 'direct' : `indirect — depth ${newDepth}`;
          fileMap.set(attrs.filePath, {
            depth: newDepth,
            reason: `${relation} — imports ${srcAttrs.name} from ${srcAttrs.filePath}`,
          });
        }

        next.push({ nodeId: neighborId, depth: newDepth });
      }
    }
    queue = next;
  }

  // Remove the target file itself from the results
  fileMap.delete(targetFilePath);

  const affected: AffectedFile[] = Array.from(fileMap.entries())
    .map(([filePath, info]) => ({
      filePath,
      depth: info.depth,
      reason: info.reason,
      isTest: isTestFile(filePath),
    }))
    .sort((a, b) => a.depth - b.depth || a.filePath.localeCompare(b.filePath));

  const testFiles = affected.filter(f => f.isTest);

  return { affected, testFiles, totalCount: affected.length };
}

export function getArchitectureSummary(graph: DirectedGraph, projectRoot?: string, includeFixtures = false): {
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
  // Filter out test fixtures and static assets unless explicitly included
  const orphanFiles = fileSummary
    .filter(f => {
      if (f.incomingRefs !== 0 || f.outgoingRefs !== 0) return false;
      if (projectRoot && !includeFixtures) {
        const relativePath = relative(projectRoot, f.filePath);
        if (isExcludedFromOrphanReporting(relativePath, { includeFixtures })) {
          return false;
        }
      }
      return true;
    })
    .map(f => f.filePath);
  
  return {
    fileCount: fileSet.size,
    symbolCount: graph.order,
    edgeCount: graph.size,
    mostConnectedFiles: fileConnections.slice(0, 5),
    orphanFiles,
  };
}
