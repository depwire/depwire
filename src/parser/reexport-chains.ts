import type { ParsedFile } from './types.js';

// Barrel/re-export chains rarely exceed 3-4 levels in real code (an entry
// index.ts re-exporting a submodule's index.ts re-exporting individual
// files). 8 gives generous headroom over that while still bounding
// worst-case traversal cost; a chain that genuinely needs to go deeper is
// treated as a design smell worth surfacing as unresolved, not something to
// keep walking through silently.
const MAX_CHAIN_DEPTH = 8;

/**
 * Post-process pass (run once per `parseProject` call, after every file has
 * been parsed and the full symbol table is known) that follows wildcard
 * re-export chains (`export * from './x'`) to find where an imported symbol
 * is actually declared.
 *
 * Why this can't happen during per-file parsing: resolving `eq` imported
 * from a barrel `pg-core/index.ts` requires knowing whether `pg-core/index.ts`
 * declares `eq` directly, or only wildcard-re-exports it from some sibling
 * file that hasn't necessarily been parsed yet when `pg-core/index.ts`
 * itself is parsed. This pass runs after all files are parsed, so the full
 * declared-symbol table and the full wildcard-re-export adjacency are both
 * available.
 *
 * Mutates `parsedFiles` in place: rewrites edge targets (any kind -- imports,
 * calls, extends, injects, etc. can all legitimately reference a name
 * re-exported through a barrel) that point at an undeclared name in a
 * barrel file to the real declaring file, and (for barrels that exhaust the
 * depth cap, hit a cycle, or reach more than one candidate declaring file
 * without a way to choose between them) records the miss into that file's
 * `unresolvedImports` with reason `chain-exceeded-depth` or
 * `ambiguous-reexport` rather than leaving it as a silent dangling edge or
 * guessing between candidates.
 */
export function resolveReExportChains(parsedFiles: ParsedFile[]): {
  rewritten: number;
  droppedAsUnresolved: number;
} {
  const byFile = new Map<string, ParsedFile>();
  for (const f of parsedFiles) byFile.set(f.filePath, f);

  const declaredNames = new Map<string, Set<string>>();
  for (const f of parsedFiles) {
    const names = new Set<string>();
    for (const s of f.symbols) names.add(s.name);
    declaredNames.set(f.filePath, names);
  }

  let rewritten = 0;
  let droppedAsUnresolved = 0;

  for (const file of parsedFiles) {
    for (const edge of file.edges) {
      // No kind filter: `edge.kind !== 'imports'` was the bug -- calls,
      // extends, injects and every other edge kind can point at a name
      // that only exists behind a barrel's wildcard re-export, exactly like
      // an imports edge does. The only thing that determines whether an
      // edge needs chasing is whether its target is an undeclared name in a
      // file that itself re-exports things, not what kind of relationship
      // the edge represents.
      const sep = edge.target.lastIndexOf('::');
      if (sep === -1) continue;
      const targetFile = edge.target.slice(0, sep);
      const targetName = edge.target.slice(sep + 2);
      if (targetName === '__file__') continue;
      if (declaredNames.get(targetFile)?.has(targetName)) continue; // already resolves fine

      const targetParsed = byFile.get(targetFile);
      if (!targetParsed?.wildcardReExports?.length) continue; // not a barrel -- nothing to chase

      const found = searchWildcardChain(targetFile, targetName, byFile, declaredNames);
      if (found.length === 1) {
        edge.target = `${found[0]}::${targetName}`;
        rewritten++;
      } else if (found.length === 0) {
        droppedAsUnresolved++;
        if (!file.unresolvedImports) file.unresolvedImports = [];
        file.unresolvedImports.push({
          fromFile: file.filePath,
          specifier: `${targetFile}::${targetName}`,
          reason: 'chain-exceeded-depth',
        });
      } else {
        // More than one file in the chain declares the same name. Picking
        // one (by BFS order, alphabetically, or any other rule) would be a
        // guess dressed up as a resolved edge -- a wrong edge is worse than
        // a missing one, so this is recorded unresolved instead.
        droppedAsUnresolved++;
        if (!file.unresolvedImports) file.unresolvedImports = [];
        file.unresolvedImports.push({
          fromFile: file.filePath,
          specifier: `${targetFile}::${targetName}`,
          reason: 'ambiguous-reexport',
        });
      }
    }
  }

  return { rewritten, droppedAsUnresolved };
}

/**
 * Breadth-first search over the wildcard re-export adjacency starting at
 * `startFile`'s own wildcard targets. Visited set doubles as cycle
 * protection -- barrels can be mutually recursive (`a` wildcard-exports `b`,
 * `b` wildcard-exports `a`), and a file is never re-enqueued once visited.
 *
 * Returns EVERY file that declares `targetName` reachable within the depth
 * cap, not just the first -- callers need the full candidate set to detect
 * ambiguity rather than silently keeping whichever happened to be visited
 * first.
 */
function searchWildcardChain(
  startFile: string,
  targetName: string,
  byFile: Map<string, ParsedFile>,
  declaredNames: Map<string, Set<string>>
): string[] {
  const visited = new Set<string>([startFile]);
  const queue: Array<{ file: string; depth: number }> = [{ file: startFile, depth: 0 }];
  const found: string[] = [];

  let i = 0;
  while (i < queue.length) {
    const { file, depth } = queue[i++];
    if (depth >= MAX_CHAIN_DEPTH) continue;

    const parsed = byFile.get(file);
    if (!parsed?.wildcardReExports) continue;

    for (const target of parsed.wildcardReExports) {
      if (visited.has(target)) continue; // cycle guard
      visited.add(target);

      if (declaredNames.get(target)?.has(targetName)) {
        found.push(target);
      }
      queue.push({ file: target, depth: depth + 1 });
    }
  }

  return found;
}
