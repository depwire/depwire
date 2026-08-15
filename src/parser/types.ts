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
  | 'module'         // Python: module-level scope
  | 'template';      // HTML/Angular: a template file pseudo-node

export interface SymbolNode {
  id: string;          // Unique ID: "relative/path.ts::symbolName"
  name: string;        // The symbol name itself
  kind: SymbolKind;
  filePath: string;    // Relative to project root
  startLine: number;
  endLine: number;
  exported: boolean;
  scope?: string;      // Parent class/namespace if nested (e.g., "MyClass")
  metadata?: Record<string, unknown>; // Optional parser-specific data (e.g. Angular selector, template refs)
}

export type EdgeKind =
  | 'imports'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'inherits'       // Python: class inheritance
  | 'decorates'      // Python: decorator application
  | 'references'
  | 'type_references'
  | 'injects'        // TS/Angular: constructor/field dependency injection
  | 'uses';          // HTML/Angular: template -> component/directive/pipe usage

export interface SymbolEdge {
  source: string;      // Source symbol ID
  target: string;      // Target symbol ID
  kind: EdgeKind;
  filePath: string;    // File where the reference occurs
  line: number;
}

export type UnresolvedImportReason =
  | 'alias-unresolved'      // matched a tsconfig `paths` pattern but the target file was not found
  | 'workspace-package'     // matched a known internal workspace package name but no source entry found
  | 'external'              // bare specifier matching a real dependency, or a node: builtin
  | 'relative-not-found'    // ./ or ../ that did not resolve to a real file
  | 'chain-exceeded-depth'  // resolved to a barrel file, but the re-export chain to the real
                            // declaration exceeded the depth cap or hit a cycle
  | 'other';

export interface UnresolvedImport {
  fromFile: string;
  specifier: string;
  reason: UnresolvedImportReason;
}

export interface ParsedFile {
  filePath: string;    // Relative to project root
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  /**
   * Imports/re-exports this file contains that did not resolve to a local
   * symbol edge, with a classified reason. Populated during parsing (for
   * relative/alias/bare-specifier misses) and extended by the re-export
   * chain resolver post-process (for barrel chains that exceed the depth
   * cap). Additive field -- existing consumers that only read
   * `symbols`/`edges` are unaffected.
   */
  unresolvedImports?: UnresolvedImport[];
  /**
   * Resolved target file paths (relative to project root) that this file
   * wildcard re-exports from, e.g. `export * from './expressions'`. Used by
   * the re-export chain resolver to search through barrel files that
   * re-export everything without naming it. Empty/absent for files with no
   * wildcard re-exports.
   */
  wildcardReExports?: string[];
}

/**
 * Flattens `unresolvedImports` across a full parse result into a single
 * list. This is the Phase 1 instrument's public surface -- the per-file
 * field is what parsing populates; this helper is what callers (CLI
 * reporting, health/dead-code diagnostics, depwire-cloud) consume.
 */
export function aggregateUnresolvedImports(parsedFiles: ParsedFile[]): UnresolvedImport[] {
  const out: UnresolvedImport[] = [];
  for (const file of parsedFiles) {
    if (file.unresolvedImports) out.push(...file.unresolvedImports);
  }
  return out;
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
