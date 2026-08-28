import { DirectedGraph } from 'graphology';
import { ParsedFile, SymbolNode } from '../parser/types.js';
import { detectCrossLanguageEdges } from '../cross-language/index.js';

export function buildGraph(parsedFiles: ParsedFile[], projectRoot?: string): DirectedGraph {
  const graph = new DirectedGraph();
  
  // First pass: Add all nodes
  for (const file of parsedFiles) {
    for (const symbol of file.symbols) {
      if (!graph.hasNode(symbol.id)) {
        graph.addNode(symbol.id, {
          name: symbol.name,
          kind: symbol.kind,
          filePath: symbol.filePath,
          startLine: symbol.startLine,
          endLine: symbol.endLine,
          exported: symbol.exported,
          scope: symbol.scope,
        });
      }
    }
  }
  
  // Second pass: Add file-level pseudo-nodes for files that have imports
  const fileNodes = new Set<string>();
  for (const file of parsedFiles) {
    for (const edge of file.edges) {
      // If source is a file-level node (__file__), create it
      if (edge.source.endsWith('::__file__') && !fileNodes.has(edge.source)) {
        fileNodes.add(edge.source);
        const filePath = edge.source.replace('::__file__', '');
        graph.addNode(edge.source, {
          name: '__file__',
          kind: 'file',
          filePath,
          startLine: 1,
          endLine: 1,
          exported: false,
        });
      }
      // Also create target __file__ nodes
      if (edge.target.endsWith('::__file__') && !fileNodes.has(edge.target)) {
        fileNodes.add(edge.target);
        const filePath = edge.target.replace('::__file__', '');
        graph.addNode(edge.target, {
          name: '__file__',
          kind: 'file',
          filePath,
          startLine: 1,
          endLine: 1,
          exported: false,
        });
      }
    }
  }
  
  // Third pass: Add edges (only if both nodes exist)
  for (const file of parsedFiles) {
    for (const edge of file.edges) {
      // Only add edge if both source and target exist
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        const existing = graph.edge(edge.source, edge.target);
        if (existing) {
          const existingKind = graph.getEdgeAttribute(existing, 'kind');
          // The graph is intentionally simple (one relationship per symbol
          // pair). Preserve a pre-existing runtime/import relationship when
          // a new type reference connects the same pair, so the additive
          // parser phase never relabels an older edge kind.
          if (edge.kind === 'references-type' && existingKind !== 'references-type') {
            continue;
          }
          if (
            edge.kind === 'references-type'
            && existingKind === 'references-type'
            && graph.getEdgeAttribute(existing, 'typeOnlyImport') === true
            && edge.typeOnlyImport !== true
          ) {
            continue;
          }
        }
        // Use mergeEdge to avoid duplicate edge errors
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
  }
  
  // Cross-language edge detection
  if (projectRoot) {
    const result = detectCrossLanguageEdges(parsedFiles, projectRoot, graph);
    if (result.stats.restApiEdges > 0 || result.stats.subprocessEdges > 0) {
      console.error(`Cross-language edges: ${result.stats.restApiEdges} rest-api, ${result.stats.subprocessEdges} subprocess detected`);
    }
  }

  return graph;
}
