export type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'constant'       // Python: UPPER_CASE module-level variables
  | 'type_alias'
  | 'interface'
  | 'enum'
  | 'import'
  | 'export'
  | 'method'
  | 'property'
  | 'decorator'      // Python: @decorator definitions
  | 'module';        // Python: module-level scope

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
  | 'inherits'       // Python: class inheritance
  | 'decorates'      // Python: decorator application
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

export interface LanguageParser {
  /** Language name */
  name: string;
  
  /** File extensions this parser handles */
  extensions: string[];
  
  /** Parse a single file and return symbols + edges */
  parseFile(filePath: string, content: string, projectRoot: string): ParsedFile;
}
