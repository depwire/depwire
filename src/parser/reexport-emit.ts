import type { ParsedFile, SymbolKind, SymbolNode } from './types.js';

// A named re-export without an inline `type` modifier is not necessarily a
// module load: tsc erases it when the named declaration is only a type. Prove
// at least one value through the project symbol table before adding the file
// relationship. Unknown aliases remain visible as emit-dependent sites.
const VALUE_KINDS = new Set<SymbolKind>([
  'function', 'class', 'variable', 'constant', 'enum', 'method', 'property', 'decorator',
]);
const TYPE_KINDS = new Set<SymbolKind>(['interface', 'type_alias', 'class', 'enum', 'module']);

export function finalizeReExportLoads(files: ParsedFile[]): void {
  const byPath = new Map(files.map(file => [file.filePath, file]));
  // The earlier symbol-re-export pass creates `imports` edges even for
  // `export type` and inline `type` bindings. Retag those before building the
  // value-forwarding index so type-only hops cannot prove a runtime load.
  for (const file of files) {
    for (const site of file.reExportSites ?? []) {
      if (!site.bindings?.length) continue;
      const wholeClauseTypeOnly = site.typeOnlyKeyword === true;
      for (const edge of file.edges) {
        if (edge.kind !== 'imports' || edge.line !== site.line || edge.source.endsWith('::__file__')) continue;
        const targetName = edge.target.slice(edge.target.lastIndexOf('::') + 2);
        const binding = site.bindings.find(item => item.name === targetName);
        if (wholeClauseTypeOnly || binding?.typeOnly) edge.kind = 'references-type';
      }
    }
  }
  const symbols = new Map<string, SymbolNode[]>();
  const forward = new Map<string, string[]>();
  const typeForward = new Map<string, string[]>();
  for (const file of files) {
    for (const symbol of file.symbols) {
      const declarations = symbols.get(symbol.id) ?? [];
      declarations.push(symbol);
      symbols.set(symbol.id, declarations);
    }
    for (const edge of file.edges) {
      if (edge.kind !== 'imports' && edge.kind !== 'references-type') continue;
      if (!file.symbols.some(symbol => symbol.id === edge.source && symbol.kind === 'export')) continue;
      const typeTargets = typeForward.get(edge.source) ?? [];
      typeTargets.push(edge.target);
      typeForward.set(edge.source, typeTargets);
      if (edge.kind !== 'imports') continue;
      const targets = forward.get(edge.source) ?? [];
      targets.push(edge.target);
      forward.set(edge.source, targets);
    }
  }

  const hasValue = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const declarations = symbols.get(id) ?? [];
    if (declarations.some(symbol => symbol.exported && VALUE_KINDS.has(symbol.kind))) return true;
    if (declarations.some(symbol => symbol.kind === 'export' && symbol.exported)) {
      const targets = [...new Set(forward.get(id) ?? [])];
      return targets.length === 1 && hasValue(targets[0], seen);
    }
    const separator = id.lastIndexOf('::');
    if (separator < 0) return false;
    const path = id.slice(0, separator);
    const name = id.slice(separator + 2);
    const wildcardTargets = [...new Set((byPath.get(path)?.reExportSites ?? [])
      .filter(site => site.classification === 'runtime' && /^export\s*\*/.test(site.statement)
        && !/^export\s*\*\s+as\b/.test(site.statement) && site.resolvedPath)
      .map(site => site.resolvedPath!))];
    // A name reached through two wildcard branches is ambiguous. Neither
    // branch is promoted to a proven value for this named module load.
    return wildcardTargets.filter(target => hasValue(`${target}::${name}`, new Set(seen))).length === 1;
  };
  const hasType = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const declarations = symbols.get(id) ?? [];
    if (declarations.some(symbol => symbol.exported && TYPE_KINDS.has(symbol.kind))) return true;
    if (declarations.some(symbol => symbol.kind === 'export' && symbol.exported)) {
      const targets = [...new Set(typeForward.get(id) ?? [])];
      return targets.length === 1 && hasType(targets[0], seen);
    }
    const separator = id.lastIndexOf('::');
    if (separator < 0) return false;
    const path = id.slice(0, separator);
    const name = id.slice(separator + 2);
    return [...new Set(byPath.get(path)?.wildcardReExports ?? [])]
      .filter(target => hasType(`${target}::${name}`, new Set(seen))).length === 1;
  };

  for (const file of files) {
    for (const site of file.reExportSites ?? []) {
      if (site.classification !== 'emit-dependent' || !site.bindings?.length || !site.resolvedPath) continue;
      if (!byPath.has(site.resolvedPath)) {
        site.classification = 'unresolved';
        site.reason = 'target-unresolved';
        (file.unresolvedImports ??= []).push({ fromFile: file.filePath, specifier: site.specifier, reason: 'target-not-parsed' });
        continue;
      }
      const proved = new Set(site.bindings.filter(binding => !binding.typeOnly
        && (binding.name === 'default' && byPath.get(site.resolvedPath)?.defaultExportRuntime === true
          || hasValue(`${site.resolvedPath}::${binding.name}`))).map(binding => binding.name));
      // A plain named binding that has no proven runtime value is neither a
      // runtime import nor a proven type edge. Keep the site and reason, but
      // do not let the old optimistic symbol import influence coupling.
      let droppedUnprovenBinding = false;
      file.edges = file.edges.filter(edge => {
        if (edge.kind !== 'imports' || edge.line !== site.line || edge.source.endsWith('::__file__')) return true;
        const targetName = edge.target.slice(edge.target.lastIndexOf('::') + 2);
        if (!site.bindings!.some(binding => binding.name === targetName && !binding.typeOnly)
          || proved.has(targetName)) return true;
        if (hasType(edge.target)) { edge.kind = 'references-type'; return true; }
        droppedUnprovenBinding = true;
        return false;
      });
      if (droppedUnprovenBinding) (file.unresolvedImports ??= []).push({
        fromFile: file.filePath, specifier: site.specifier, reason: 'unproven-symbol',
      });
      if (proved.size) {
        site.classification = 'runtime';
        site.reason = 'definite-load';
        file.edges.push({ source: `${file.filePath}::__file__`, target: `${site.resolvedPath}::__file__`,
          kind: 'imports', filePath: file.filePath, line: site.line, importSpecifier: site.specifier });
      }
    }
  }
}
