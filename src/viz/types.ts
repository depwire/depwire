export interface VizData {
  files: VizFile[];
  arcs: VizArc[];
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalEdges: number;
    totalCrossFileEdges: number;
  };
  projectName: string;
}

export interface VizFile {
  path: string;
  directory: string;
  symbolCount: number;
  incomingCount: number;
  outgoingCount: number;
}

export interface VizArc {
  sourceFile: string;
  targetFile: string;
  edgeCount: number;
  edgeKinds: string[];
}
