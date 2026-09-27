import { canonicalParsedFile } from './path-boundary.js';
import { canonicalPath } from './paths.js';
import { DirectedGraph } from 'graphology';
import { join } from 'path';
import { readFileSync } from 'fs';
import { parseTypeScriptFile } from '../parser/typescript.js';
import type { ParsedFile } from '../parser/types.js';

export function removeFileFromGraph(graph: DirectedGraph, filePath: string): void {
  filePath = canonicalPath(filePath, graph.getAttribute('projectRoot'));
  // Find all nodes where the file path matches
  const nodesToRemove: string[] = [];

  graph.forEachNode((node, attrs) => {
    if (attrs.filePath === filePath) {
      nodesToRemove.push(node);
    }
  });

  if (nodesToRemove.length) graph.setAttribute('parsedFileCount', undefined);
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
  parsedFile = canonicalParsedFile(parsedFile, graph.getAttribute('projectRoot'));
  graph.setAttribute('parsedFileCount', undefined);
  // Add all symbols as nodes
  for (const symbol of parsedFile.symbols) {
    const nodeId = symbol.id;
    
    try {
      graph.addNode(nodeId, {
        name: symbol.name,
        kind: symbol.kind,
        filePath: parsedFile.filePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
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
        filePath: edge.filePath,
        line: edge.line,
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
  relativeFilePath = canonicalPath(relativeFilePath, projectRoot);
  // Parsed count cannot be inferred from graph nodes after an incremental update.
  // Parse new version
  const absolutePath = join(projectRoot, relativeFilePath);
  
  try {
    const sourceCode = readFileSync(absolutePath, 'utf-8');
    const parsedFile = parseTypeScriptFile(relativeFilePath, sourceCode, projectRoot);
    
    // Keep the previous graph if reading or parsing the replacement fails.
    removeFileFromGraph(graph, relativeFilePath);

    // Add new version
    addFileToGraph(graph, parsedFile);
  } catch (error) {
    console.error(`Failed to parse file ${relativeFilePath}:`, error);
    throw error;
  }
}
