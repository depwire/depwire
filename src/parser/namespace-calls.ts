import type { ParsedFile, SymbolKind } from './types.js';
import { searchWildcardChain } from './reexport-chains.js';

const MAX_ALIAS_DEPTH = 8;

/** Prove imported qualified calls against namespace declarations and members. */
export function resolveNamespaceCalls(parsedFiles: ParsedFile[]): { resolved: number; unresolved: number } {
  const kindsById = new Map<string, SymbolKind[]>();
  const namespaceIds = new Set<string>();
  const classIds = new Set<string>();
  const staticCallableIds = new Set<string>();
  const exportedIds = new Set<string>();
  const aliasTargets = new Map<string, string[]>();
  const byFile = new Map(parsedFiles.map(file => [file.filePath, file]));
  const exportedNames = new Map<string, Set<string>>();
  for (const file of parsedFiles) {
    for (const symbol of file.symbols) {
      const kinds = kindsById.get(symbol.id) ?? [];
      kinds.push(symbol.kind);
      kindsById.set(symbol.id, kinds);
      if (symbol.kind === 'module' || symbol.metadata?.namespace === true) namespaceIds.add(symbol.id);
      if (symbol.kind === 'class') classIds.add(symbol.id);
      if (symbol.metadata?.static === true &&
        (symbol.kind === 'method' || (symbol.kind === 'property' && symbol.metadata?.callable === true))) staticCallableIds.add(symbol.id);
      if (symbol.exported) exportedIds.add(symbol.id);
      if (symbol.exported || symbol.kind === 'export') {
        const names = exportedNames.get(file.filePath) ?? new Set<string>();
        names.add(symbol.name);
        exportedNames.set(file.filePath, names);
      }
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
    let viaExport = false;
    const visited = new Set<string>();
    for (let depth = 0; depth <= MAX_ALIAS_DEPTH; depth++) {
      if (visited.has(current)) return null;
      visited.add(current);
      if (namespaceIds.has(current) || classIds.has(current)) {
        return viaExport || exportedIds.has(current) ? current : null;
      }
      if (current.endsWith('::__file__') && byFile.has(current.slice(0, -'::__file__'.length))) return current;
      const next = [...new Set(aliasTargets.get(current) ?? [])];
      if (next.length === 0) {
        const separator = current.lastIndexOf('::');
        if (separator < 0) return null;
        const file = current.slice(0, separator);
        const name = current.slice(separator + 2);
        const candidates = searchWildcardChain(file, name, byFile, exportedNames);
        if (candidates.length !== 1) return null;
        current = `${candidates[0]}::${name}`;
        viaExport = true;
        continue;
      }
      if (next.length !== 1) return null;
      viaExport = true;
      current = next[0];
    }
    return null;
  };

  // A whole-file namespace import (`import * as api from './index'`) can
  // call a function exported through a barrel. Follow only explicit named
  // re-exports or wildcard paths with one exported declaration; a name match
  // elsewhere in the workspace is not enough evidence for an edge.
  const resolveExportedFunction = (start: string, seen = new Set<string>(), viaExport = false): string | null => {
    if (seen.has(start) || seen.size > MAX_ALIAS_DEPTH) return null;
    seen.add(start);
    const kinds = kindsById.get(start) ?? [];
    const separator = start.lastIndexOf('::');
    if (separator < 0) return null;
    const file = start.slice(0, separator);
    const name = start.slice(separator + 2);
    if (kinds.some(kind => kind === 'function' || kind === 'method')) {
      return viaExport || exportedNames.get(file)?.has(name) ? start : null;
    }
    if (kinds.includes('export')) {
      const next = [...new Set(aliasTargets.get(start) ?? [])];
      return next.length === 1 ? resolveExportedFunction(next[0], seen, true) : null;
    }
    if (!byFile.has(file)) return null;
    const candidates = searchWildcardChain(file, name, byFile, exportedNames);
    if (candidates.length !== 1) return null;
    return resolveExportedFunction(`${candidates[0]}::${name}`, seen, true);
  };

  let resolved = 0;
  let unresolved = 0;
  for (const file of parsedFiles) {
    for (const pending of file.pendingNamespaceCalls ?? []) {
      const namespaceRoot = resolveAlias(pending.namespaceRoot);
      const rawTarget = namespaceRoot
        ? namespaceRoot.endsWith('::__file__')
          ? `${namespaceRoot.slice(0, -'__file__'.length)}${pending.target.slice(pending.namespaceRoot.length).replace(/^\./, '')}`
          : `${namespaceRoot}${pending.target.slice(pending.namespaceRoot.length)}`
        : pending.target === pending.namespaceRoot
          ? resolveExportedFunction(pending.target)
          : null;
      const target = namespaceRoot?.endsWith('::__file__') && rawTarget
        ? resolveExportedFunction(rawTarget)
        : rawTarget;
      const targetKinds = target ? (kindsById.get(target) ?? []) : [];
      if (target && (targetKinds.some((kind) => kind === 'function' || kind === 'method') || staticCallableIds.has(target)) &&
        (!namespaceRoot || !classIds.has(namespaceRoot) || staticCallableIds.has(target)) &&
        (!namespaceRoot || !namespaceIds.has(namespaceRoot) || exportedIds.has(target))) {
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
