import type { ParsedFile, SymbolEdge, SymbolNode } from './types.js';

// Matches the existing re-export traversal bound: inheritance chains beyond
// eight hops are left unresolved rather than searched without limit.
const MAX_INHERITANCE_DEPTH = 8;

export interface SuperCallResolutionResult {
  resolved: number;
  unresolved: number;
}

/** Resolve buffered super.method() calls against proven inheritance edges. */
export function resolveSuperCalls(parsedFiles: ParsedFile[]): SuperCallResolutionResult {
  const symbols = new Map<string, SymbolNode>();
  const parentByClass = new Map<string, string[]>();

  for (const file of parsedFiles) {
    for (const symbol of file.symbols) symbols.set(symbol.id, symbol);
    for (const edge of file.edges) {
      // `inherits` is canonical. Keep accepting `extends` forever so loaded
      // graphs written by older releases retain identical super resolution.
      if (edge.kind !== 'inherits' && edge.kind !== 'extends') continue;
      const parents = parentByClass.get(edge.source) ?? [];
      parents.push(edge.target);
      parentByClass.set(edge.source, parents);
    }
  }

  let resolved = 0;
  let unresolved = 0;
  for (const file of parsedFiles) {
    for (const pending of file.pendingSuperCalls ?? []) {
      const target = findInheritedMethod(
        pending.declaringClass,
        pending.methodName,
        symbols,
        parentByClass,
      );
      if (target) {
        const edge: SymbolEdge = {
          source: pending.source,
          target,
          kind: 'calls',
          filePath: file.filePath,
          line: pending.line,
        };
        file.edges.push(edge);
        resolved++;
      } else {
        if (!file.unresolvedCalls) file.unresolvedCalls = [];
        file.unresolvedCalls.push({
          fromFile: file.filePath,
          callee: `super.${pending.methodName}`,
          reason: 'receiver-not-local',
        });
        unresolved++;
      }
    }
    delete file.pendingSuperCalls;
  }

  return { resolved, unresolved };
}

function findInheritedMethod(
  declaringClass: string,
  methodName: string,
  symbols: Map<string, SymbolNode>,
  parentByClass: Map<string, string[]>,
): string | null {
  const visited = new Set<string>([declaringClass]);
  const queue = (parentByClass.get(declaringClass) ?? [])
    .map((classId) => ({ classId, depth: 1 }));

  let index = 0;
  while (index < queue.length) {
    const { classId, depth } = queue[index++];
    if (visited.has(classId)) continue;
    visited.add(classId);
    if (depth > MAX_INHERITANCE_DEPTH) continue;

    const candidate = `${classId}.${methodName}`;
    if (symbols.get(candidate)?.kind === 'method') return candidate;

    if (depth < MAX_INHERITANCE_DEPTH) {
      for (const parent of parentByClass.get(classId) ?? []) {
        if (!visited.has(parent)) queue.push({ classId: parent, depth: depth + 1 });
      }
    }
  }
  return null;
}
