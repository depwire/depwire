import { DirectedGraph } from 'graphology';
import { basename } from 'path';
import { getCrossFileEdges, getFileSummary } from '../graph/queries.js';
import type { VizData, VizFile, VizArc } from './types.js';

export function prepareVizData(graph: DirectedGraph, projectRoot: string): VizData {
  const fileSummary = getFileSummary(graph);
  const crossFileEdges = getCrossFileEdges(graph);
  
  // Build files array
  const files: VizFile[] = fileSummary.map(f => ({
    path: f.filePath,
    directory: f.filePath.includes('/') ? f.filePath.substring(0, f.filePath.lastIndexOf('/')) : '.',
    symbolCount: f.symbolCount,
    incomingCount: f.incomingRefs,
    outgoingCount: f.outgoingRefs,
  }));
  
  // Sort files by directory then by filename
  files.sort((a, b) => {
    if (a.directory !== b.directory) {
      return a.directory.localeCompare(b.directory);
    }
    return a.path.localeCompare(b.path);
  });
  
  // Aggregate edges at file level
  const arcMap = new Map<string, VizArc>();
  
  for (const edge of crossFileEdges) {
    const key = `${edge.sourceFile}::${edge.targetFile}`;
    
    if (arcMap.has(key)) {
      const arc = arcMap.get(key)!;
      arc.edgeCount++;
      if (!arc.edgeKinds.includes(edge.kind)) {
        arc.edgeKinds.push(edge.kind);
      }
    } else {
      arcMap.set(key, {
        sourceFile: edge.sourceFile,
        targetFile: edge.targetFile,
        edgeCount: 1,
        edgeKinds: [edge.kind],
      });
    }
  }
  
  const arcs = Array.from(arcMap.values());
  
  // Get project name from path
  const projectName = basename(projectRoot);
  
  return {
    files,
    arcs,
    stats: {
      totalFiles: files.length,
      totalSymbols: graph.order,
      totalEdges: graph.size,
      totalCrossFileEdges: arcs.reduce((sum, arc) => sum + arc.edgeCount, 0),
    },
    projectName,
  };
}
