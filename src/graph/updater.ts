import { DirectedGraph } from 'graphology';
import { join } from 'path';
import { parseTypeScriptFile } from '../parser/typescript.js';
import type { ParsedFile } from '../parser/types.js';

export function removeFileFromGraph(graph: DirectedGraph, filePath: string): void {
  // Find all nodes where the file path matches
  const nodesToRemove: string[] = [];

  graph.forEachNode((node, attrs) => {
    if (attrs.filePath === filePath) {
      nodesToRemove.push(node);
    }
  });

  // Remove nodes (edges are automatically removed by graphology)
  nodesToRemove.forEach(node => {
    try {
      graph.dropNode(node);
    } catch (error) {
      // Node might have already been removed, ignore
    }
  });
}

export function addFileToGraph(graph: DirectedGraph, parsedFile: ParsedFile): void {
  // Add all symbols as nodes
  for (const symbol of parsedFile.symbols) {
    const nodeId = `${parsedFile.filePath}::${symbol.name}`;
    
    try {
      graph.addNode(nodeId, {
        name: symbol.name,
        kind: symbol.kind,
        filePath: parsedFile.filePath,
        startLine: symbol.location.startLine,
        endLine: symbol.location.endLine,
        exported: symbol.exported,
        scope: symbol.scope,
      });
    } catch (error) {
      // Node might already exist, skip
    }
  }

  // Add all edges
  for (const edge of parsedFile.edges) {
    try {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        sourceFile: edge.sourceFile,
        targetFile: edge.targetFile,
      });
    } catch (error) {
      // Source or target node might not exist, skip
    }
  }
}

export async function updateFileInGraph(
  graph: DirectedGraph,
  projectRoot: string,
  relativeFilePath: string
): Promise<void> {
  // Remove old version
  removeFileFromGraph(graph, relativeFilePath);

  // Parse new version
  const absolutePath = join(projectRoot, relativeFilePath);
  
  try {
    const parsedFile = parseTypeScriptFile(absolutePath, relativeFilePath);
    
    // Add new version
    addFileToGraph(graph, parsedFile);
  } catch (error) {
    console.error(`Failed to parse file ${relativeFilePath}:`, error);
    // Don't re-add if parsing failed
  }
}
