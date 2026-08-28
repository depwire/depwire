# P1 block-scoped symbol ID recon (bug #9)

Date: 2026-08-28  
Scope: recon only; no symbol-ID implementation is included in this branch.

## Result

On current `main` (`4a15771`), the parser emits multiple declaration spans with the same ID and `buildGraph` keeps only the first node. The measurement below groups parser output by `SymbolNode.id`, deduplicates identical `startLine:endLine` spans, and counts the declarations lost as `distinct spans - 1` per ID.

| Repository | Pin | All-variable collision IDs | Variable declarations represented | Variable declarations collapsed | Other collision IDs | Other declarations collapsed |
|---|---:|---:|---:|---:|---:|---:|
| code-graph | `4a15771` | 237 | 749 | **512** | 4 | 5 |
| drizzle | `b7862528fd8f` | 1,583 | 12,391 | **10,808** | 73 | 117 |

The bold values are the strict bug-#9 population: groups in which every distinct declaration is a `variable`. The additional non-variable groups are overload/declaration-merging and cross-kind problems and are not attributed to block scope. For completeness, the observable all-kind loss is 517 declarations across 241 IDs on code-graph and 10,925 declarations across 1,656 IDs on drizzle.

The roadmap's “~311” estimate is therefore stale for current main. The dominant pattern is repeated local names in sibling lexical scopes (for example `names`, `result`, `path`, and `expected`). Callback bodies that are not represented as named function scopes amplify the same failure in test-heavy repositories such as drizzle.

## Why declarations merge

`SymbolNode.id` is documented as `relative/path.ts::symbolName` (`src/parser/types.ts:18-27`). TypeScript adds class/function scope, but not a lexical block path. `buildGraph` keys graphology nodes by that ID and deliberately ignores every later declaration with the same key (`src/graph/index.ts:8-23`). Edges consequently attach to the surviving node, and line/span/export metadata from later declarations disappears.

## Consumers of the ID shape

### CLI and serialized graphs

- Parser resolution constructs IDs and edge endpoints throughout `src/parser/*.ts`; changing declaration IDs also requires lexical reference resolution and shadowing rules, not just a string-format change.
- `buildGraph` uses the ID as the graphology node key and `source`/`target` as edge foreign keys (`src/graph/index.ts:8-23`, `58-90`).
- JSON serialization writes node IDs and edge endpoints verbatim; deserialization recreates nodes by ID and drops edges whose endpoints do not exist (`src/graph/serializer.ts:4-50`, `54-88`). The current schema is `formatVersion: 1`.
- Exact-ID query/MCP surfaces advertise and accept `path::symbol` (`src/tools.ts`, `src/index.ts`), while `src/commands/diff.ts` derives display names with `split('::').pop()`.
- Parse cache rows contain serialized `ParsedFile` values, so a resolver/parser version bump and cache invalidation are mandatory.

### Fixtures, dead code, and counts

- Exact IDs are asserted in parser, workspace, query, member-call, serialization, and type-reference tests. `test/fixtures/dead-code-snapshot.json` and its manifest are generated graph contracts and must be regenerated.
- `test/parser-duplication.test.ts` explicitly permits different-line duplicates today; that exception must be replaced by a zero-collision assertion after migration.
- Dead-code detection iterates graph nodes and uses `inDegree(node)` (`src/dead-code/detector.ts:142-180`). Splitting a merged ID increases its candidate denominator and gives each declaration an independent reachability result.
- `countGraphSymbols` counts graph nodes other than structural file nodes (`src/graph/counts.ts:3-14`), so corrected IDs increase symbol counts by the collapsed population before exclusions.

### Cloud and R2

- Cloud treats `repos/{owner}/{repo}/latest.json` in R2 as the graph source of truth and returns it directly (`depwire-cloud/api/src/routes/repos.ts:203-220`). The docs mutation route rewrites the same object (`:493-510`).
- The Cloud callback adapter preserves node `id`/`key` and edge `source`/`target` verbatim (`depwire-cloud/api/src/index.ts:92-124`).
- Cloud MCP normalization builds `nodesById`, rejects edges with missing endpoints, and hands the result to `deserializeGraph` (`depwire-cloud/api/src/mcp/context.ts:45-123`).
- Therefore old R2 objects cannot be combined with new endpoints. Every stored graph needs reparse/backfill or explicit versioned read-only retention; historical health series will cross a counting-methodology boundary.

### VSCode extension

- Both graph panels derive file paths by splitting edge endpoints at the first `::` (`depwire-vscode/src/panels/GraphPanel.ts:193-207`, `FullGraphPanel.ts:258-271`). Either proposed suffix remains compatible with file aggregation.
- Any cached `ParsedFile[]`, exact-symbol selection, or command payload using the old ID is not compatible and must be refreshed. Extension fixtures should still be re-run because the number of symbol-level edges can change even though file extraction remains stable.

### SLM snapshots and pairs

- `depwire-slm/scripts/parse.ts:84-113` writes graph node IDs into `dependencyPairs` and hotspot `symbol` fields.
- `depwire-slm/scripts/generate_pairs.py:31-97` uses IDs as the join key for nodes/edges and embeds them directly into prompts and completions.
- Existing graph snapshots, train/validation JSONL, holdouts, evaluations, and every derived pair are invalid under either scheme. They must be regenerated from one parser/schema version; mixing old and new IDs would create false negatives and duplicate concepts.

## Option A — lexical block-path suffix

Example: `src/x.ts::run.$b0.$b2.result`, where `$bN` is the named-child index path of lexical blocks beneath the existing function/class scope.

Properties:

- Models lexical identity directly and permits correct nearest-scope/shadowing resolution.
- More stable than line numbers when editing statements inside an existing block, but inserting/reordering sibling blocks can still renumber paths.
- Requires a scope prepass or maintained AST scope stack in every affected parser, plus reference binding to the nearest visible declaration. Applying a suffix only when a collision happens is rejected because unrelated edits could toggle IDs between suffixed and unsuffixed forms.

Migration cost: **high implementation, medium ongoing churn**. Update parsers/resolvers, cache version, exact-ID tests, snapshots, query documentation, Cloud stored graphs, extension caches, and all SLM artifacts.

## Option B — source-position disambiguator

Example: `src/x.ts::run.result@L123:C9` (byte offset could replace line/column).

Properties:

- Simple to emit and guarantees uniqueness for declarations in one parse.
- Reference binding still needs lexical-scope analysis; appending a location to declarations without resolving references to that exact ID would merely create disconnected nodes.
- Any line insertion above a declaration churns its ID, producing noisy diffs, invalidating bookmarks/caches, and reducing temporal graph continuity. A byte offset has the same weakness.

Migration cost: **medium implementation, very high ongoing churn**. The one-time migration set is the same as Option A, with additional recurring cache/R2/snapshot churn after ordinary edits.

## Version and sequencing decision

Either option changes node primary keys and edge foreign keys, so **`formatVersion` must bump from 1 to 2**. An importer cannot losslessly upgrade v1 graphs because the discarded declarations and their lexical paths are absent; migration means reparsing source, not rewriting JSON.

Recommendation: choose Option A, sequence it after SLM v0.5 training/evaluation completes, freeze one parser commit for the new corpus, then perform CLI v2 serialization, Cloud R2 reparse/backfill, extension refresh, and SLM regeneration as one coordinated migration. No part of that migration is implemented here.
