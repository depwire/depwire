export type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'constant'       // Python: UPPER_CASE module-level variables
  | 'type_alias'
  | 'interface'
  | 'enum'
  | 'file'           // Structural file-level pseudo-node (`path::__file__`)
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

/** Internal evidence retained between the file parser and project finalizer. */
export interface PendingSuperCall {
  source: string;
  declaringClass: string;
  methodName: string;
  line: number;
}

export interface PendingNamespaceCall {
  source: string;
  namespaceRoot: string;
  target: string;
  callee: string;
  line: number;
}

/**
 * Graph relationship kinds.
 *
 * `inherits` is the canonical class-level inheritance relationship for every
 * language. `extends` is its legacy read-only alias: consumers must continue
 * accepting it from stored graphs, but parsers must never emit it. Serialized
 * legacy graphs retain `extends` unchanged rather than being normalized.
 */
export type EdgeKind =
  | 'imports'
  | 'calls'
  | 'extends'        // Legacy read-only alias for class inheritance
  | 'implements'
  | 'inherits'       // Class-level inheritance, all languages
  | 'decorates'      // Python: decorator application
  | 'references'
  | 'references-type'
  | 'injects'        // TS/Angular: constructor/field dependency injection
  | 'uses';          // HTML/Angular: template -> component/directive/pipe usage

export interface SymbolEdge {
  source: string;      // Source symbol ID
  target: string;      // Target symbol ID
  kind: EdgeKind;
  filePath: string;    // File where the reference occurs
  line: number;
  /** Internal parser hint; omitted by graph serialization. */
  typeContext?: 'heritage';
  /** Marks the non-additive import-type retarget for health normalization. */
  typeOnlyImport?: boolean;
  typeOnlyFallback?: boolean;
  originalImportTarget?: string;
}

export type UnresolvedImportReason =
  | 'alias-unresolved'      // matched a tsconfig `paths` pattern but the target file was not found
  | 'workspace-package'     // matched a known internal workspace package name but no source entry found
  | 'external'              // bare specifier matching a real dependency, or a node: builtin
  | 'relative-not-found'    // ./ or ../ that did not resolve to a real file
  | 'chain-exceeded-depth'  // resolved to a barrel file, but the re-export chain to the real
                            // declaration exceeded the depth cap or hit a cycle
  | 'ambiguous-reexport'    // resolved to a barrel file, and the re-export chain reached MORE
                            // THAN ONE file declaring the same name -- picking one would be a
                            // guess, so the import is recorded unresolved instead of guessing
  | 'other';

export interface UnresolvedImport {
  fromFile: string;
  specifier: string;
  reason: UnresolvedImportReason;
}

export type UnresolvedCallReason =
  | 'unresolvable-receiver' // member call (`obj.method()`) whose receiver is not `this`/`super` --
                             // resolving it would require a type checker, so no edge is guessed
  | 'receiver-not-local'    // receiver IS known (`this`/`super`, i.e. the enclosing instance) but
                             // the called property does not match any member declared on the
                             // enclosing class within this file (inherited from outside the file,
                             // dynamically added, or a typo) -- still not guessed
  | 'local-binding-not-modeled' // a parameter, catch binding, or destructured local shadows a
                                // same-named graph symbol; the binding has no SymbolNode to target
  | 'unresolved-import-callee' // a bare callee comes from an import with no local source target
  | 'no-local-target'       // no declared local value supports a bare call/new-expression edge
  | 'receiver-required';    // a bare call/new expression matched only a method or property, which
                            // cannot be referenced without an explicit receiver

export interface UnresolvedCall {
  fromFile: string;
  callee: string; // e.g. "arr.push", "this.unknownMethod"
  reason: UnresolvedCallReason;
}

export type UnresolvedTypeRefReason =
  | 'external-type'
  | 'no-project-symbol'
  | 'unsupported-target-kind'
  | 'ambiguous-reexport';

export interface UnresolvedTypeRef {
  fromFile: string;
  typeName: string;
  reason: UnresolvedTypeRefReason;
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
   * Member-expression calls (`obj.method()`, `new a.b.Foo()`) whose receiver
   * could not be resolved to a real declared symbol without guessing.
   * Populated in place of the wrong same-file `calls` edge that earlier
   * versions fabricated -- see UnresolvedCallReason for what was rejected
   * and why.
   */
  unresolvedCalls?: UnresolvedCall[];
  /** Internal parser hint used to resolve super.method() after all classes are known. */
  pendingSuperCalls?: PendingSuperCall[];
  /** Internal parser hint; project finalization proves imported namespace members. */
  pendingNamespaceCalls?: PendingNamespaceCall[];
  /** Type-position names rejected because no project symbol could be proven. */
  unresolvedTypeRefs?: UnresolvedTypeRef[];
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

/**
 * Flattens `unresolvedCalls` across a full parse result into a single list,
 * mirroring `aggregateUnresolvedImports`.
 */
export function aggregateUnresolvedCalls(parsedFiles: ParsedFile[]): UnresolvedCall[] {
  const out: UnresolvedCall[] = [];
  for (const file of parsedFiles) {
    if (file.unresolvedCalls) out.push(...file.unresolvedCalls);
  }
  return out;
}

export function aggregateUnresolvedTypeRefs(parsedFiles: ParsedFile[]): UnresolvedTypeRef[] {
  const out: UnresolvedTypeRef[] = [];
  for (const file of parsedFiles) {
    if (file.unresolvedTypeRefs) out.push(...file.unresolvedTypeRefs);
  }
  return out;
}

export interface ProjectGraph {
  /** Serialized graph schema version. Absent on payloads written before v1. */
  formatVersion?: number;
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
