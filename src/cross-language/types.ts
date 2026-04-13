export type CrossLanguageEdgeType =
  | 'rest-api'      // fetch/axios/requests call matched to a route definition
  | 'subprocess';   // execSync/subprocess.run/os.system calling another file

export interface CrossLanguageEdge {
  sourceFile: string;           // relative path of calling file
  targetFile: string;           // relative path of called file
  edgeType: CrossLanguageEdgeType;
  confidence: 'high' | 'medium' | 'low';
  sourceLanguage: string;       // e.g. 'typescript'
  targetLanguage: string;       // e.g. 'python'
  sourceLine?: number;          // line number of the call
  targetLine?: number;          // line number of the route/entry point
  metadata: {
    // For rest-api edges:
    httpMethod?: string;        // GET, POST, PUT, DELETE, PATCH
    path?: string;              // e.g. '/api/users'
    // For subprocess edges:
    command?: string;           // the raw command string
    calledFile?: string;        // extracted filename from command
  };
}

export interface CrossLanguageDetectionResult {
  edges: CrossLanguageEdge[];
  stats: {
    restApiEdges: number;
    subprocessEdges: number;
    filesAnalyzed: number;
    detectionTimeMs: number;
  };
}
