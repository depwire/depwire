import { DirectedGraph } from 'graphology';
import { ProjectGraph, SymbolNode, SymbolEdge } from '../parser/types.js';

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
    });
  });
  
  return {
    projectRoot,
    files: Array.from(fileSet).sort(),
    nodes,
    edges,
    metadata: {
      parsedAt: new Date().toISOString(),
      fileCount: fileSet.size,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

export function importFromJSON(json: ProjectGraph): DirectedGraph {
  const graph = new DirectedGraph();
  
  // Add all nodes
  for (const node of json.nodes) {
    graph.addNode(node.id, {
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      exported: node.exported,
      scope: node.scope,
    });
  }
  
  // Add all edges
  for (const edge of json.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        filePath: edge.filePath,
        line: edge.line,
      });
    }
  }
  
  return graph;
}
