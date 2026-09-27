import { canonicalNode, canonicalEdge } from './path-boundary.js';
import { DirectedGraph } from 'graphology';
import { ProjectGraph, SymbolNode, SymbolEdge } from '../parser/types.js';

export const GRAPH_FORMAT_VERSION = 2;

export class UnsupportedGraphFormatError extends Error {
  readonly code = 'UNSUPPORTED_GRAPH_FORMAT';
  readonly foundVersion: number | undefined;

  constructor(foundVersion: number | undefined) {
    const displayVersion = foundVersion === undefined ? 'unversioned' : `v${foundVersion}`;
    super(
      `Cannot load ${displayVersion} Depwire graph with graph format v${GRAPH_FORMAT_VERSION}. `
      + 'Block-scoped symbol ids cannot be reconstructed from stored v1 data; reparse the source with Depwire v1.20.0 or newer.',
    );
    this.name = 'UnsupportedGraphFormatError';
    this.foundVersion = foundVersion;
  }
}

export function assertSupportedGraphFormat(json: Pick<ProjectGraph, 'formatVersion'>): void {
  if (json.formatVersion !== GRAPH_FORMAT_VERSION) {
    throw new UnsupportedGraphFormatError(json.formatVersion);
  }
}

export function exportToJSON(graph: DirectedGraph, projectRoot: string): ProjectGraph {
  const nodes: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  const fileSet = new Set<string>();
  
  // Extract all nodes
  graph.forEachNode((nodeId, attrs) => {
    nodes.push({
      id: nodeId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope,
      metadata: attrs.metadata,
    });
    
    fileSet.add(attrs.filePath);
  });
  
  // Extract all edges
  graph.forEachEdge((edge, attrs, source, target) => {
    edges.push({
      source,
      target,
      kind: attrs.kind,
      filePath: attrs.filePath,
      line: attrs.line,
      typeOnlyImport: attrs.typeOnlyImport,
      typeOnlyFallback: attrs.typeOnlyFallback,
      originalImportTarget: attrs.originalImportTarget,
    });
  });
  
  return {
    formatVersion: GRAPH_FORMAT_VERSION,
    projectRoot,
    files: Array.from(fileSet).sort(),
    nodes,
    edges,
    metadata: {
      parsedAt: new Date().toISOString(),
      fileCount: fileSet.size,
      parsedFileCount: graph.getAttribute('parsedFileCount'),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

export function importFromJSON(json: ProjectGraph): DirectedGraph {
  assertSupportedGraphFormat(json);
  const graph = new DirectedGraph();
  
  graph.setAttribute('projectRoot', json.projectRoot);
  graph.setAttribute('parsedFileCount', json.metadata.parsedFileCount);
  // Restore legacy separator spellings at the same graph ingress boundary.
  for (const raw of json.nodes) {
    const node = canonicalNode(raw, json.projectRoot);
    graph.mergeNode(node.id, {
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      exported: node.exported,
      scope: node.scope,
      metadata: node.metadata,
    });
  }
  
  // Add all edges
  for (const raw of json.edges) {
    const edge = canonicalEdge(raw, json.projectRoot);
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        filePath: edge.filePath,
        line: edge.line,
        typeOnlyImport: edge.typeOnlyImport,
        typeOnlyFallback: edge.typeOnlyFallback,
        originalImportTarget: edge.originalImportTarget,
      });
    }
  }
  
  return graph;
}
