import type { ParsedFile, SymbolEdge, SymbolNode } from './types.js';
import { rejectUnprovenEdge } from './reexport-chains.js';

/** Final project-wide proof step: parseProject never returns a dangling edge. */
export function validateParsedEdgeTargets(files: ParsedFile[]): { dropped: number; retargeted: number } {
  const symbols = new Map<string, SymbolNode>();
  const exportTargets = new Map<string, string[]>();
  for (const file of files) for (const symbol of file.symbols) symbols.set(symbol.id, symbol);
  for (const file of files) for (const edge of file.edges) {
    if (edge.kind !== 'imports' || symbols.get(edge.source)?.kind !== 'export') continue;
    const targets = exportTargets.get(edge.source) ?? [];
    targets.push(edge.target);
    exportTargets.set(edge.source, targets);
  }

  const resolveCallableExport = (start: string): { target?: string; candidates?: string[] } => {
    const seen = new Set<string>();
    let target = start;
    while (symbols.get(target)?.kind === 'export') {
      if (seen.has(target)) return { candidates: [...seen] };
      seen.add(target);
      const next = [...new Set(exportTargets.get(target) ?? [])];
      if (next.length !== 1) return { candidates: next };
      target = next[0];
    }
    return symbols.has(target) ? { target } : {};
  };

  let dropped = 0;
  let retargeted = 0;
  for (const file of files) {
    if (!/\.tsx?$/.test(file.filePath)) continue;
    const kept: SymbolEdge[] = [];
    for (const edge of file.edges) {
      if (edge.kind === 'calls' && symbols.get(edge.target)?.kind === 'export') {
        const proof = resolveCallableExport(edge.target);
        if (!proof.target) {
          rejectUnprovenEdge(file, edge, proof.candidates?.length ? 'ambiguous-reexport' : 'unproven-target', proof.candidates);
          dropped++;
          continue;
        }
        edge.target = proof.target;
        retargeted++;
      }
      const validSource = symbols.has(edge.source) || edge.source.endsWith('::__file__');
      const validTarget = symbols.has(edge.target) || edge.target.endsWith('::__file__');
      if (!validSource || !validTarget) {
        rejectUnprovenEdge(file, edge, 'unproven-target');
        dropped++;
      } else {
        kept.push(edge);
      }
    }
    file.edges = kept;
  }
  return { dropped, retargeted };
}
