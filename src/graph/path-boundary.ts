import type { ParsedFile, SymbolNode, SymbolEdge } from '../parser/types.js';
import { canonicalPath, canonicalSymbolId } from './paths.js';

export function canonicalNode(node: SymbolNode, root = ''): SymbolNode {
  return { ...node, id: canonicalSymbolId(node.id, root), filePath: canonicalPath(node.filePath, root) };
}
export function canonicalEdge(edge: SymbolEdge, root = ''): SymbolEdge {
  return { ...edge, source: canonicalSymbolId(edge.source, root), target: canonicalSymbolId(edge.target, root),
    filePath: canonicalPath(edge.filePath, root),
    ...(edge.originalImportTarget === undefined ? {} : { originalImportTarget: canonicalSymbolId(edge.originalImportTarget, root) }) };
}
/** The ingress boundary for parser/cache records, before any project-wide resolution. */
export function canonicalParsedFile(file: ParsedFile, root = ''): ParsedFile {
  const diagnostics = <T extends { fromFile: string }>(rows: T[] | undefined) =>
    rows?.map(row => ({ ...row, fromFile: canonicalPath(row.fromFile, root) }));
  return { ...file, filePath: canonicalPath(file.filePath, root),
    symbols: file.symbols.map(n => canonicalNode(n, root)), edges: file.edges.map(e => canonicalEdge(e, root)),
    unresolvedImports: diagnostics(file.unresolvedImports),
    unresolvedCalls: diagnostics(file.unresolvedCalls)?.map(row => ({ ...row,
      ...(row.attemptedTarget ? { attemptedTarget: canonicalSymbolId(row.attemptedTarget, root) } : {}),
      ...(row.candidates ? { candidates: row.candidates.map(id => canonicalSymbolId(id, root)) } : {}),
    })),
    unresolvedExports: diagnostics(file.unresolvedExports),
    unresolvedTypeRefs: diagnostics(file.unresolvedTypeRefs),
    unresolvedEdges: file.unresolvedEdges?.map(row => ({ ...row,
      source: canonicalSymbolId(row.source, root), attemptedTarget: canonicalSymbolId(row.attemptedTarget, root),
      filePath: canonicalPath(row.filePath, root),
      ...(row.candidates ? { candidates: row.candidates.map(id => canonicalSymbolId(id, root)) } : {}),
    })),
    wildcardReExports: file.wildcardReExports?.map(p => canonicalPath(p, root)),
    pendingSuperCalls: file.pendingSuperCalls?.map(c => ({ ...c, source: canonicalSymbolId(c.source, root), declaringClass: canonicalSymbolId(c.declaringClass, root) })),
    pendingNamespaceCalls: file.pendingNamespaceCalls?.map(c => ({ ...c, source: canonicalSymbolId(c.source, root), target: canonicalSymbolId(c.target, root), namespaceRoot: canonicalSymbolId(c.namespaceRoot, root) })),
  };
}
