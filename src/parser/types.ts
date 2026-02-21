export type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'type_alias'
  | 'interface'
  | 'enum'
  | 'import'
  | 'export'
  | 'method'
  | 'property';

export interface SymbolNode {
  id: string;          // Unique ID: "relative/path.ts::symbolName"
  name: string;        // The symbol name itself
  kind: SymbolKind;
  filePath: string;    // Relative to project root
  startLine: number;
  endLine: number;
  exported: boolean;
  scope?: string;      // Parent class/namespace if nested (e.g., "MyClass")
}

export type EdgeKind =
  | 'imports'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'references'
  | 'type_references';

export interface SymbolEdge {
  source: string;      // Source symbol ID
  target: string;      // Target symbol ID
  kind: EdgeKind;
  filePath: string;    // File where the reference occurs
  line: number;
}

export interface ParsedFile {
  filePath: string;    // Relative to project root
  symbols: SymbolNode[];
  edges: SymbolEdge[];
}

export interface ProjectGraph {
  projectRoot: string;
  files: string[];
  nodes: SymbolNode[];
  edges: SymbolEdge[];
  metadata: {
    parsedAt: string;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
  };
}
