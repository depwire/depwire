# PR #55 parser-to-graph edge contract and target audit

Cache-disabled corpus measurements. The PR #54 parser baseline is `fc070df`; the health baseline is `main` at `099b3f5`. Corpus commits are recorded in [the 150-edge sample](TYPESCRIPT-CALL-TARGET-SAMPLE.json). “Parsed” counts `ParsedFile.edges`; “built” counts the final graph, including cross-language edges. The exact parser conservation equation is `parsed = parserBuilt + builderDrops`; the final graph can add cross-language edges. A `pair-preserved` or `pair-replaced` drop is a same-endpoint relationship coalesced by the intentionally simple graph, not an unresolved call.

## Edge counts and corrected call headline

| Repository | Parsed all baseline→after | Built all baseline→after | Parsed calls baseline→after | Built calls baseline→after | Parser drops | Builder drops |
|---|---:|---:|---:|---:|---:|---:|
| code-graph | 4,762→5,283 | 3,965→4,349 | 2,718→3,243 | 1,968→2,351 | 4 | 940 |
| nest | 18,397→25,045 | 16,890→21,072 | 3,698→10,532 | 3,391→7,534 | 231 | 3,975 |
| drizzle | 32,704→53,808 | 24,184→36,200 | 9,817→31,210 | 4,475→16,027 | 485 | 17,608 |
| hono | 5,997→9,245 | 5,374→7,078 | 1,282→4,652 | 892→2,587 | 375 | 2,565 |
| express | 591→591 | 409→409 | 449→449 | 98→98 | 0 | 467 |
| zod | 9,503→21,434 | 7,658→14,763 | 1,950→13,954 | 1,276→8,199 | 684 | 6,671 |
| flask | 685→685 | 515→515 | 421→421 | 269→269 | 0 | 170 |
| fastapi | 4,753→4,753 | 1,711→1,711 | 2,831→2,831 | 1,065→1,065 | 0 | 3,042 |

Nest’s built calls are **3,391→7,534 (2.22×)** and Drizzle’s **4,475→16,027 (3.58×)**. The parsed call figures are 3,698→10,532 (2.85×) and 9,817→31,210 (3.18×). Compared with PR #55’s previous parsed headlines, the parser proof step removes 12 Nest and 188 Drizzle call records. These removals do not subtract 473 built calls: most invalid parsed targets were already omitted by the builder.

## Recorded parser drops

| Repository | Reasons |
|---|---|
| code-graph | unproven-target: 4 |
| nest | ambiguous-reexport: 23, unproven-target: 208 |
| drizzle | ambiguous-reexport: 225, unproven-target: 260 |
| hono | unproven-target: 375 |
| express | none |
| zod | ambiguous-reexport: 201, unproven-target: 483 |
| flask | none |
| fastapi | none |

## Builder conservation and recorded drops

| Repository | Parsed edges | Parser-built edges | Builder drops by reason | Final graph edges |
|---|---:|---:|---|---:|
| code-graph | 5,283 | 4,343 | pair-preserved: 109, pair-replaced: 831 | 4,349 |
| nest | 25,045 | 21,070 | pair-preserved: 2,187, pair-replaced: 1,788 | 21,072 |
| drizzle | 53,808 | 36,200 | missing-target: 13, pair-preserved: 5,601, pair-replaced: 11,994 | 36,200 |
| hono | 9,245 | 6,680 | pair-preserved: 932, pair-replaced: 1,633 | 7,078 |
| express | 591 | 124 | missing-target: 127, pair-replaced: 340 | 409 |
| zod | 21,434 | 14,763 | pair-preserved: 435, pair-replaced: 6,236 | 14,763 |
| flask | 685 | 515 | missing-source: 50, missing-target: 16, pair-replaced: 104 | 515 |
| fastapi | 4,753 | 1,711 | missing-both: 52, missing-source: 95, missing-target: 2,612, pair-replaced: 283 | 1,711 |

## Health against main

Order of dimensions: coupling, cohesion, cyclic groups, god files, orphans/dead code, dependency depth. Each score is `main→branch`.

| Repository | Overall | Coupling | Cohesion | Cycles | God files | Orphans/dead | Depth |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 71→66 | 70→50 | 60→60 | 100→100 | 60→60 | 89→89 | 40→40 |
| nest | 57→52 | 70→50 | 40→40 | 66→66 | 60→60 | 70→71 | 20→20 |
| drizzle | 34→31 | 10→10 | 40→20 | 20→20 | 60→60 | 69→70 | 40→40 |
| hono | 50→48 | 50→30 | 60→60 | 35→35 | 40→60 | 82→82 | 40→40 |
| express | 82→82 | 90→90 | 80→80 | 100→100 | 60→60 | 67→64 | 80→80 |
| zod | 64→49 | 90→30 | 40→40 | 88→88 | 60→60 | 45→50 | 20→20 |
| flask | 81→81 | 90→90 | 100→100 | 44→44 | 100→100 | 48→48 | 100→100 |
| fastapi | 69→69 | 90→90 | 40→40 | 84→84 | 80→80 | 41→41 | 60→60 |

### Raw health metrics

The next table records every raw under each dimension, using JSON objects so the value names and units remain explicit. Unchanged raw values are retained.

| Repository | Dimension | Main raws | Branch raws |
|---|---|---|---|
| code-graph | Coupling | `avgConnections`: 5.3<br>`maxConnections`: 221<br>`crossDirCoupling`: 9.1 | `avgConnections`: 6.01<br>`maxConnections`: 221<br>`crossDirCoupling`: 17.4 |
| code-graph | Cohesion | `avgInternalRatio`: 46.3<br>`directories`: 39 | `avgInternalRatio`: 46.4<br>`directories`: 39 |
| code-graph | Cyclic Dependency Groups | `groupCount`: 0<br>`cyclicFileCount`: 0<br>`cyclicFileRatio`: 0<br>`largestGroupSize`: 0<br>`graphFileCount`: 291<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 0<br>`cyclicFileCount`: 0<br>`cyclicFileRatio`: 0<br>`largestGroupSize`: 0<br>`graphFileCount`: 292<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| code-graph | God Files | `godFiles`: 14<br>`threshold`: 40.9<br>`godFilesPer100`: 4.8 | `godFiles`: 13<br>`threshold`: 46.4<br>`godFilesPer100`: 4.5 |
| code-graph | Orphans & Dead Code | `orphans`: 7<br>`orphanPercentage`: 5<br>`deadSymbols`: 185<br>`deadCodePercentage`: 2.5 | `orphans`: 7<br>`orphanPercentage`: 5<br>`deadSymbols`: 158<br>`deadCodePercentage`: 2.1 |
| code-graph | Dependency Depth | `maxDepth`: 12 | `maxDepth`: 12 |
| nest | Coupling | `avgConnections`: 5.27<br>`maxConnections`: 1000<br>`crossDirCoupling`: 35.4 | `avgConnections`: 6.76<br>`maxConnections`: 1000<br>`crossDirCoupling`: 34.2 |
| nest | Cohesion | `avgInternalRatio`: 13.5<br>`directories`: 504 | `avgInternalRatio`: 14.1<br>`directories`: 504 |
| nest | Cyclic Dependency Groups | `groupCount`: 18<br>`cyclicFileCount`: 92<br>`cyclicFileRatio`: 0.048754636989931106<br>`largestGroupSize`: 49<br>`graphFileCount`: 1887<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 18<br>`cyclicFileCount`: 92<br>`cyclicFileRatio`: 0.048703017469560614<br>`largestGroupSize`: 49<br>`graphFileCount`: 1889<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| nest | God Files | `godFiles`: 78<br>`threshold`: 32.3<br>`godFilesPer100`: 4.1 | `godFiles`: 97<br>`threshold`: 41.5<br>`godFilesPer100`: 5.1 |
| nest | Orphans & Dead Code | `orphans`: 34<br>`orphanPercentage`: 2.5<br>`deadSymbols`: 3537<br>`deadCodePercentage`: 16.3 | `orphans`: 36<br>`orphanPercentage`: 2.6<br>`deadSymbols`: 3382<br>`deadCodePercentage`: 15.6 |
| nest | Dependency Depth | `maxDepth`: 24 | `maxDepth`: 24 |
| drizzle | Coupling | `avgConnections`: 15.15<br>`maxConnections`: 1418<br>`crossDirCoupling`: 23.3 | `avgConnections`: 27.89<br>`maxConnections`: 2499<br>`crossDirCoupling`: 48.8 |
| drizzle | Cohesion | `avgInternalRatio`: 11.5<br>`directories`: 148 | `avgInternalRatio`: 9.9<br>`directories`: 148 |
| drizzle | Cyclic Dependency Groups | `groupCount`: 11<br>`cyclicFileCount`: 272<br>`cyclicFileRatio`: 0.3073446327683616<br>`largestGroupSize`: 188<br>`graphFileCount`: 885<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 11<br>`cyclicFileCount`: 272<br>`cyclicFileRatio`: 0.3073446327683616<br>`largestGroupSize`: 188<br>`graphFileCount`: 885<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| drizzle | God Files | `godFiles`: 50<br>`threshold`: 95.3<br>`godFilesPer100`: 5.6 | `godFiles`: 49<br>`threshold`: 175.5<br>`godFilesPer100`: 5.5 |
| drizzle | Orphans & Dead Code | `orphans`: 20<br>`orphanPercentage`: 3.2<br>`deadSymbols`: 5239<br>`deadCodePercentage`: 16.7 | `orphans`: 20<br>`orphanPercentage`: 3.2<br>`deadSymbols`: 5182<br>`deadCodePercentage`: 16.6 |
| drizzle | Dependency Depth | `maxDepth`: 9 | `maxDepth`: 9 |
| hono | Coupling | `avgConnections`: 6.78<br>`maxConnections`: 275<br>`crossDirCoupling`: 9.4 | `avgConnections`: 10.37<br>`maxConnections`: 555<br>`crossDirCoupling`: 7.6 |
| hono | Cohesion | `avgInternalRatio`: 31.4<br>`directories`: 80 | `avgInternalRatio`: 32.7<br>`directories`: 80 |
| hono | Cyclic Dependency Groups | `groupCount`: 6<br>`cyclicFileCount`: 80<br>`cyclicFileRatio`: 0.22284122562674094<br>`largestGroupSize`: 60<br>`graphFileCount`: 359<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 6<br>`cyclicFileCount`: 80<br>`cyclicFileRatio`: 0.22284122562674094<br>`largestGroupSize`: 60<br>`graphFileCount`: 359<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| hono | God Files | `godFiles`: 25<br>`threshold`: 42.3<br>`godFilesPer100`: 7 | `godFiles`: 19<br>`threshold`: 64.7<br>`godFilesPer100`: 5.3 |
| hono | Orphans & Dead Code | `orphans`: 7<br>`orphanPercentage`: 3.2<br>`deadSymbols`: 630<br>`deadCodePercentage`: 6.4 | `orphans`: 7<br>`orphanPercentage`: 3.2<br>`deadSymbols`: 626<br>`deadCodePercentage`: 6.3 |
| hono | Dependency Depth | `maxDepth`: 12 | `maxDepth`: 12 |
| express | Coupling | `avgConnections`: 2.15<br>`maxConnections`: 45<br>`crossDirCoupling`: 51 | `avgConnections`: 2.12<br>`maxConnections`: 45<br>`crossDirCoupling`: 51.1 |
| express | Cohesion | `avgInternalRatio`: 56.4<br>`directories`: 8 | `avgInternalRatio`: 50.2<br>`directories`: 9 |
| express | Cyclic Dependency Groups | `groupCount`: 0<br>`cyclicFileCount`: 0<br>`cyclicFileRatio`: 0<br>`largestGroupSize`: 0<br>`graphFileCount`: 144<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 0<br>`cyclicFileCount`: 0<br>`cyclicFileRatio`: 0<br>`largestGroupSize`: 0<br>`graphFileCount`: 147<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| express | God Files | `godFiles`: 7<br>`threshold`: 24.5<br>`godFilesPer100`: 4.9 | `godFiles`: 7<br>`threshold`: 24.2<br>`godFilesPer100`: 4.8 |
| express | Orphans & Dead Code | `orphans`: 11<br>`orphanPercentage`: 23.9<br>`deadSymbols`: 27<br>`deadCodePercentage`: 1.5 | `orphans`: 13<br>`orphanPercentage`: 26.5<br>`deadSymbols`: 50<br>`deadCodePercentage`: 2.8 |
| express | Dependency Depth | `maxDepth`: 5 | `maxDepth`: 5 |
| zod | Coupling | `avgConnections`: 2.33<br>`maxConnections`: 190<br>`crossDirCoupling`: 0.5 | `avgConnections`: 14.8<br>`maxConnections`: 4311<br>`crossDirCoupling`: 0.6 |
| zod | Cohesion | `avgInternalRatio`: 14.7<br>`directories`: 27 | `avgInternalRatio`: 11.4<br>`directories`: 27 |
| zod | Cyclic Dependency Groups | `groupCount`: 3<br>`cyclicFileCount`: 12<br>`cyclicFileRatio`: 0.023529411764705882<br>`largestGroupSize`: 5<br>`graphFileCount`: 510<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 3<br>`cyclicFileCount`: 12<br>`cyclicFileRatio`: 0.023809523809523808<br>`largestGroupSize`: 5<br>`graphFileCount`: 504<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| zod | God Files | `godFiles`: 27<br>`threshold`: 18.1<br>`godFilesPer100`: 5.3 | `godFiles`: 20<br>`threshold`: 112.7<br>`godFilesPer100`: 4 |
| zod | Orphans & Dead Code | `orphans`: 86<br>`orphanPercentage`: 28.3<br>`deadSymbols`: 2254<br>`deadCodePercentage`: 16.9 | `orphans`: 79<br>`orphanPercentage`: 26.5<br>`deadSymbols`: 1742<br>`deadCodePercentage`: 13.1 |
| zod | Dependency Depth | `maxDepth`: 16 | `maxDepth`: 16 |
| flask | Coupling | `avgConnections`: 2.36<br>`maxConnections`: 46<br>`crossDirCoupling`: 0 | `avgConnections`: 2.36<br>`maxConnections`: 46<br>`crossDirCoupling`: 0 |
| flask | Cohesion | `avgInternalRatio`: 84.5<br>`directories`: 5 | `avgInternalRatio`: 84.5<br>`directories`: 5 |
| flask | Cyclic Dependency Groups | `groupCount`: 2<br>`cyclicFileCount`: 21<br>`cyclicFileRatio`: 0.21212121212121213<br>`largestGroupSize`: 19<br>`graphFileCount`: 99<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 2<br>`cyclicFileCount`: 21<br>`cyclicFileRatio`: 0.21212121212121213<br>`largestGroupSize`: 19<br>`graphFileCount`: 99<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| flask | God Files | `godFiles`: 0<br>`threshold`: 48.4<br>`godFilesPer100`: 0 | `godFiles`: 0<br>`threshold`: 48.4<br>`godFilesPer100`: 0 |
| flask | Orphans & Dead Code | `orphans`: 6<br>`orphanPercentage`: 17.1<br>`deadSymbols`: 337<br>`deadCodePercentage`: 21.8 | `orphans`: 6<br>`orphanPercentage`: 17.1<br>`deadSymbols`: 337<br>`deadCodePercentage`: 21.8 |
| flask | Dependency Depth | `maxDepth`: 2 | `maxDepth`: 2 |
| fastapi | Coupling | `avgConnections`: 0.78<br>`maxConnections`: 147<br>`crossDirCoupling`: 33 | `avgConnections`: 0.78<br>`maxConnections`: 147<br>`crossDirCoupling`: 33 |
| fastapi | Cohesion | `avgInternalRatio`: 16.9<br>`directories`: 102 | `avgInternalRatio`: 16.9<br>`directories`: 102 |
| fastapi | Cyclic Dependency Groups | `groupCount`: 2<br>`cyclicFileCount`: 22<br>`cyclicFileRatio`: 0.022587268993839837<br>`largestGroupSize`: 15<br>`graphFileCount`: 974<br>`edgeView`: "legacy-normalized-dependencies-v1" | `groupCount`: 2<br>`cyclicFileCount`: 22<br>`cyclicFileRatio`: 0.022587268993839837<br>`largestGroupSize`: 15<br>`graphFileCount`: 974<br>`edgeView`: "legacy-normalized-dependencies-v1" |
| fastapi | God Files | `godFiles`: 28<br>`threshold`: 10.1<br>`godFilesPer100`: 2.9 | `godFiles`: 28<br>`threshold`: 10.1<br>`godFilesPer100`: 2.9 |
| fastapi | Orphans & Dead Code | `orphans`: 274<br>`orphanPercentage`: 62.3<br>`deadSymbols`: 1628<br>`deadCodePercentage`: 20.3 | `orphans`: 274<br>`orphanPercentage`: 62.3<br>`deadSymbols`: 1625<br>`deadCodePercentage`: 20.2 |
| fastapi | Dependency Depth | `maxDepth`: 7 | `maxDepth`: 7 |

## Accuracy and verification

The [seeded sample](TYPESCRIPT-CALL-TARGET-SAMPLE.md) has 150 newly resolved TypeScript call edges: Nest 40, Drizzle 40, Zod 40, code-graph 15, Hono 15. All 150 have a target declaration and were classified CORRECT; WRONG 0, AMBIGUOUS 0. It deliberately includes rare syntax and same-name, shared-method, overload, namespace, and static-member cases. The redraw script is `recon/typescript-target-sample.mjs` (force-added because `.gitignore` ignores `*.mjs`); seed `pr55-target-accuracy-2026-10-03-v2`.

The three contract fixtures fail at `fc070df` with the worktree changes stashed and pass after repair: ambiguous wildcard barrel, constructed absent import target, and builder absent target. Local `npm run build` followed by `npm test` passed with 325 tests. Shuffled-discovery and CI results are recorded separately in the PR body.

For discovery shuffle seeds 11, 29, and 47, both the parsed-file JSON and serialized-graph JSON SHA-256 hashes were byte-identical within each corpus: code-graph `79c736c6…` / `63bf197a…`, Nest `db225245…` / `13377b09…`, Drizzle `66391f0c…` / `f018e50c…` (parsed / graph). The full hashes are in the PR description.

Express matches PR #54's post-fix JavaScript result exactly: 591 parsed edges, 449 parsed calls, 98 built calls, 50 dead candidates (17 high, 33 medium, 0 low), and health 82. `createApplication` remains exported; `tryRender`, `sendfile`, and `tryStat` each retain an incoming call edge.

## Contract behavior and remaining scope

TypeScript project finalization now proves call targets against parsed declarations and follows unique named export aliases. Ambiguous wildcard searches remove the parsed edge and record `ambiguous-reexport` with the full candidate list. Other unproven TypeScript targets are removed and recorded as `unproven-target` with the attempted ID. `buildGraph` records missing endpoints and same-pair coalescing in `edgeDrops`, warns on missing endpoints, and exposes `parserEdgeCount` and `parserBuiltEdgeCount`. Serializer import, incremental update, and cross-language edge insertion now record their own skips rather than silently continuing.

The emit/record audit found these identical or adjacent mechanisms: `src/parser/reexport-chains.ts` recorded wildcard ambiguity while retaining every edge kind (fixed); `src/graph/index.ts` skipped missing endpoints and silently coalesced same-pair edges (recorded, with a warning for missing endpoints); `src/graph/serializer.ts` skipped malformed stored edges (recorded and warned); `src/graph/updater.ts` swallowed incremental edge merge errors (recorded and warned); `src/cross-language/index.ts` continued past missing file nodes and coalesced same-pair relationships (recorded as `crossLanguageDrops`, with a warning for missing nodes). `finalizeTypeReferences` already records unresolved type references when it drops their edges. The separate no-current-symbol call-return paths in other parsers remain the previously reported follow-up class.

JavaScript, Python, and R still construct some target IDs optimistically through distinct parser code paths. This session preserves the PR #54 JavaScript behavior; the builder backstop makes any missing endpoints visible. These are follow-up parser tasks, not evidence that TypeScript proof is incomplete.

Drizzle's 13 remaining builder `missing-target` drops are outside TypeScript: 11 `.cjs` imports from `integration-tests/js-tests/driver-init/commonjs/schema.cjs` and two JavaScript imports of a `.sql` and `.json` file from `integration-tests/tests/sqlite/durable-objects/drizzle/migrations.js`. Express's 127 remaining drops are likewise JavaScript paths. The parser-to-builder contract is now accounted for, while proving those language-specific target IDs remains follow-up work.

`RESOLUTION_VERSION` moves **7→8** because parsed graph contents change and cached parse results must invalidate. `formatVersion` remains **2** because serialized graph schema is unchanged. `package.json` version remains unchanged.
