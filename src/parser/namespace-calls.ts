import type { ParsedFile, SymbolKind } from './types.js';

const MAX_ALIAS_DEPTH = 8;

/** Prove imported qualified calls against namespace declarations and members. */
export function resolveNamespaceCalls(parsedFiles: ParsedFile[]): { resolved: number; unresolved: number } {
  const kindsById = new Map<string, SymbolKind[]>();
  const namespaceIds = new Set<string>();
  const aliasTargets = new Map<string, string[]>();
  for (const file of parsedFiles) {
    for (const symbol of file.symbols) {
      const kinds = kindsById.get(symbol.id) ?? [];
      kinds.push(symbol.kind);
      kindsById.set(symbol.id, kinds);
      if (symbol.kind === 'module' || symbol.metadata?.namespace === true) namespaceIds.add(symbol.id);
    }
    for (const edge of file.edges) {
      if (edge.kind !== 'imports') continue;
      if (!(kindsById.get(edge.source) ?? []).includes('export')) continue;
      const targets = aliasTargets.get(edge.source) ?? [];
      targets.push(edge.target);
      aliasTargets.set(edge.source, targets);
    }
  }

  const resolveAlias = (start: string): string | null => {
    let current = start;
    const visited = new Set<string>();
    for (let depth = 0; depth <= MAX_ALIAS_DEPTH; depth++) {
      if (visited.has(current)) return null;
      visited.add(current);
      if (namespaceIds.has(current)) return current;
      const next = [...new Set(aliasTargets.get(current) ?? [])];
      if (next.length !== 1) return null;
      current = next[0];
    }
    return null;
  };

  let resolved = 0;
  let unresolved = 0;
  for (const file of parsedFiles) {
    for (const pending of file.pendingNamespaceCalls ?? []) {
      const namespaceRoot = resolveAlias(pending.namespaceRoot);
      const target = namespaceRoot
        ? `${namespaceRoot}${pending.target.slice(pending.namespaceRoot.length)}`
        : null;
      const targetKinds = target ? (kindsById.get(target) ?? []) : [];
      if (target && targetKinds.some((kind) => kind === 'function' || kind === 'method')) {
        file.edges.push({
          source: pending.source,
          target,
          kind: 'calls',
          filePath: file.filePath,
          line: pending.line,
        });
        resolved++;
      } else {
        if (!file.unresolvedCalls) file.unresolvedCalls = [];
        file.unresolvedCalls.push({
          fromFile: file.filePath,
          callee: pending.callee,
          reason: 'unresolvable-receiver',
        });
        unresolved++;
      }
    }
    delete file.pendingNamespaceCalls;
  }
  return { resolved, unresolved };
}
