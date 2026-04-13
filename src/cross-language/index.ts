import { DirectedGraph } from 'graphology';
import type { ParsedFile } from '../parser/types.js';
import type { CrossLanguageEdge, CrossLanguageDetectionResult } from './types.js';
import { detectRestApiEdges } from './detectors/rest-api.js';
import { detectSubprocessEdges } from './detectors/subprocess.js';

export function detectCrossLanguageEdges(
  files: ParsedFile[],
  projectRoot: string,
  graph: DirectedGraph
): CrossLanguageDetectionResult {
  const startTime = Date.now();

  const restApiEdges = detectRestApiEdges(files, projectRoot);
  const subprocessEdges = detectSubprocessEdges(files, projectRoot);

  const allEdges = [...restApiEdges, ...subprocessEdges];

  // Add edges to graph
  for (const edge of allEdges) {
    const sourceNodeId = `${edge.sourceFile}::__file__`;
    const targetNodeId = `${edge.targetFile}::__file__`;

    // Ensure both file nodes exist
    if (!graph.hasNode(sourceNodeId)) {
      let hasSourceFile = false;
      graph.forEachNode((_nodeId, attrs) => {
        if (attrs.filePath === edge.sourceFile) hasSourceFile = true;
      });
      if (!hasSourceFile) continue;

      graph.addNode(sourceNodeId, {
        name: '__file__',
        kind: 'import',
        filePath: edge.sourceFile,
        startLine: 1,
        endLine: 1,
        exported: false,
      });
    }

    if (!graph.hasNode(targetNodeId)) {
      let hasTargetFile = false;
      graph.forEachNode((_nodeId, attrs) => {
        if (attrs.filePath === edge.targetFile) hasTargetFile = true;
      });
      if (!hasTargetFile) continue;

      graph.addNode(targetNodeId, {
        name: '__file__',
        kind: 'import',
        filePath: edge.targetFile,
        startLine: 1,
        endLine: 1,
        exported: false,
      });
    }

    graph.mergeEdge(sourceNodeId, targetNodeId, {
      kind: edge.edgeType,
      filePath: edge.sourceFile,
      line: edge.sourceLine || 1,
      crossLanguage: true,
      confidence: edge.confidence,
      edgeType: edge.edgeType,
      httpMethod: edge.metadata.httpMethod,
      path: edge.metadata.path,
      command: edge.metadata.command,
      calledFile: edge.metadata.calledFile,
    });
  }

  const detectionTimeMs = Date.now() - startTime;

  return {
    edges: allEdges,
    stats: {
      restApiEdges: restApiEdges.length,
      subprocessEdges: subprocessEdges.length,
      filesAnalyzed: files.length,
      detectionTimeMs,
    },
  };
}

export type { CrossLanguageEdge, CrossLanguageDetectionResult } from './types.js';
