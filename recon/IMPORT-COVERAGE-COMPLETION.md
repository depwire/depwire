# Import coverage completion: measurement and gates

Baseline: head of draft PR #62 (`e5e1adb`), which includes draft PR #61. This table is the split PR #63 branch with its re-export file-relationship addition removed. Both were open when this branch started; this branch contains their changes without merging either PR. All roots were parsed with cache disabled. Full machine-readable before/after rows, including pinned SHA, are in `IMPORT-COVERAGE-BEFORE.jsonl` and `IMPORT-COVERAGE-AFTER.jsonl`. This document reports observed graph and health movement; the coupling formula and grade bands were not changed.

## Scope and decisions

TypeScript `import './x'` had no `import_clause`, so `processImportStatement` returned before creating an edge or diagnostic (`src/parser/typescript.ts`, pre-fix line 1112). The nine production sites below were therefore never emitted, not emitted-and-dropped. A module load without bindings is represented as a **file-level `imports` edge** with `sideEffectImport: true`; it creates a relationship while distinguishing itself from a binding import. Unprovable external/local specifiers go to `unresolvedImports`; parseable non-code assets go to `nonCodeDependencies`. Re-export-from file relationships are reserved for the separate draft branch. JavaScript ESM side-effect imports already made an edge and now carry the same marker.

| Source site | Target | Pre-fix | After |
|---|---|---|---|
| `drizzle-kit/src/cli/schema.ts:7` | `drizzle-kit/src/@types/utils.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `drizzle-kit/src/introspect-gel.ts:11` | `drizzle-kit/src/@types/utils.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `drizzle-kit/src/introspect-mysql.ts:3` | `drizzle-kit/src/@types/utils.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `drizzle-kit/src/introspect-pg.ts:11` | `drizzle-kit/src/@types/utils.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `drizzle-kit/src/introspect-singlestore.ts:3` | `drizzle-kit/src/@types/utils.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `drizzle-kit/src/introspect-sqlite.ts:3` | `drizzle-kit/src/@types/utils.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `src/middleware/jwk/jwk.ts:12` | `src/context.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `src/middleware/jwt/jwt.ts:12` | `src/context.ts` | no parsed edge or reason | built `imports`, marked side effect |
| `src/middleware/timing/timing.ts:8` | `src/context.ts` | no parsed edge or reason | built `imports`, marked side effect |

The same capture applies to two Hono test imports (`runtime-tests/lambda/index.test.ts:26` and `runtime-tests/lambda/stream.test.ts:9`). Zod `packages/docs/app/layout.tsx:4` loads CSS and is recorded as a non-code asset. `import 'pkg'` without a provable local file is recorded external. The fixture assertions for this branch cover side-effect imports, Python absolute imports, unresolved specifiers, non-code assets and JavaScript side-effect marking. Source evidence is in `test/import-coverage-completion.test.ts`.

Python absolute imports were censused independently with Python `ast` and `git ls-files` (`python-absolute-census.py`), then matched to built file pairs. First-party means a concrete `.py` or package `__init__.py` beneath the pinned root or its `src/`; stdlib and external packages were excluded. Recognized `TYPE_CHECKING` sites remain type-only. The census found no recognized type-only *absolute* sites in these three roots.

| Repository | First-party absolute syntax sites | Built relation before | Built relation after | Remaining gap |
|---|---:|---:|---:|---|
| flask | 123 | 0 | 123 | 0 |
| fastapi | 2,246 | 230 | 2,245 | 1 absent target |
| click | 135 | 6 | 135 | 0 |

Examples: Flask `tests/test_appctx.py:5` (`import flask`), `examples/celery/src/task_app/__init__.py:3` (`from flask import Flask`) and `tests/test_json.py:10` (`from flask import json`); FastAPI `fastapi/utils.py:9`, `docs_src/additional_responses/tutorial001_py310.py:1` and `fastapi/_compat/v2.py:18`; Click `examples/aliases/aliases.py:4` and `examples/completion/completion.py:4`. FastAPI `docs_src/pydantic_v1_in_v2/tutorial004_an_py310.py:4` imports `fastapi.temp_pydantic_v1_params.Body`, but that module is absent from the pinned source. It has no edge and is recorded `first-party-not-found`.

## Graph contents: all eleven roots (G1, G3, G4)

Edge counts below are **built graph** counts; parsed counts and recorded drops are in the raw JSONL. No symbol count changed, no built edge kind decreased. The import increases come from side-effect module loads and first-party Python absolute imports; the broad re-export addition is excluded.

| Repository | Symbols | Built imports | Built calls | Built type refs | Other built edge kinds before→after | Production file pairs |
|---|---:|---:|---:|---:|---|---:|
| code-graph | 7647→7647 | 908→908 | 2451→2451 | 1168→1168 | inherits 3→3, injects 1→1, references 1→1, rest-api 6→6 | 397→397 |
| nest | 20156→20156 | 7027→7031 | 7534→7534 | 5766→5766 | inherits 184→184, injects 565→565, rest-api 2→2 | 3071→3075 |
| drizzle | 30891→30891 | 6144→6151 | 16027→16027 | 12664→12664 | inherits 700→700, injects 687→687 | 2773→2780 |
| hono | 9616→9616 | 1009→1014 | 2587→2587 | 3044→3044 | inherits 8→8, injects 32→32, rest-api 398→398 | 297→300 |
| express | 1658→1658 | 178→178 | 98→98 | 0→0 | rest-api 285→285 | 7→7 |
| zod | 13449→13449 | 827→829 | 8199→8199 | 5687→5687 | inherits 44→44, injects 6→6 | 255→256 |
| flask | 1778→1778 | 210→282 | 269→269 | 51→51 | decorates 54→54, inherits 34→34 | 77→77 |
| fastapi | 7356→7356 | 633→2156 | 1065→1065 | 2→2 | decorates 72→72, inherits 102→102 | 123→577 |
| fastify | 6602→6602 | 501→501 | 484→484 | 51→51 | rest-api 1323→1323 | 108→108 |
| werkzeug | 2812→2812 | 661→806 | 956→956 | 22→22 | decorates 39→39, inherits 92→92 | 207→207 |
| tanstack-query | 21349→21349 | 3031→3031 | 13134→13134 | 5056→5056 | inherits 37→37, injects 79→79, uses 17→17 | 782→782 |

Drizzle production file pairs move 2,773→2,780 and Hono 297→300. Nine named pairs are individually verified as built `imports` edges with the side-effect marker. These counts isolate the split work; the larger re-export delta belongs to the separate draft branch. Existing built calls remain Nest **7,534** and Drizzle **16,027**; Express built imports remain **178**. This branch changes Python import relationships on top of PR #61; its relative-import and `TYPE_CHECKING` behavior remains.

## Health: eleven roots (G5)

Column order for dimensions: coupling / cohesion / cyclic groups / god files / orphans and dead code / dependency depth. These are released-methodology scores, not the rejected coupling proposal. The raw metric values follow so score movements can be inspected.

| Repository | Overall | Coupling | Cohesion | Cycles | God files | Orphans/dead | Depth |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 70→70 | 70→70 | 60→60 | 97→97 | 60→60 | 81→81 | 40→40 |
| nest | 52→52 | 50→50 | 40→40 | 66→66 | 60→60 | 71→71 | 20→20 |
| drizzle | 35→35 | 10→10 | 40→40 | 20→20 | 60→60 | 70→70 | 40→40 |
| hono | 48→48 | 30→30 | 60→60 | 35→34 | 60→60 | 82→82 | 40→40 |
| express | 65→65 | 70→70 | 40→40 | 87→87 | 60→60 | 88→88 | 40→40 |
| zod | 49→49 | 30→30 | 40→40 | 88→88 | 60→60 | 50→50 | 20→20 |
| flask | 79→56 | 90→70 | 100→40 | 45→45 | 80→40 | 56→57 | 100→100 |
| fastapi | 69→63 | 90→90 | 40→20 | 82→79 | 80→60 | 41→57 | 60→60 |
| fastify | 58→58 | 50→50 | 40→40 | 92→92 | 40→40 | 89→89 | 40→40 |
| werkzeug | 67→52 | 70→50 | 80→60 | 47→47 | 80→60 | 38→54 | 80→40 |
| tanstack-query | 45→45 | 10→10 | 40→40 | 86→86 | 60→60 | 66→66 | 20→20 |

Raw metrics before and after (same dimension order):

| Repository | Raw values before | Raw values after |
|---|---|---|
| code-graph | Coupling: {"avgConnections":5.42,"crossDirCoupling":17.6,"maxConnections":221}; Cohesion: {"avgInternalRatio":49,"directories":43}; Cyclic Dependency Groups: {"cyclicFileCount":2,"cyclicFileRatio":0.005847953216374269,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":342,"groupCount":1,"largestGroupSize":2}; God Files: {"godFiles":16,"godFilesPer100":4.7,"threshold":42}; Orphans & Dead Code: {"deadCodePercentage":2,"deadSymbols":158,"orphanPercentage":6.2,"orphans":9}; Dependency Depth: {"maxDepth":12} | Coupling: {"avgConnections":5.42,"crossDirCoupling":17.6,"maxConnections":221}; Cohesion: {"avgInternalRatio":49,"directories":43}; Cyclic Dependency Groups: {"cyclicFileCount":2,"cyclicFileRatio":0.005847953216374269,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":342,"groupCount":1,"largestGroupSize":2}; God Files: {"godFiles":16,"godFilesPer100":4.7,"threshold":42}; Orphans & Dead Code: {"deadCodePercentage":2,"deadSymbols":158,"orphanPercentage":6.2,"orphans":9}; Dependency Depth: {"maxDepth":12} |
| nest | Coupling: {"avgConnections":6.75,"crossDirCoupling":34.2,"maxConnections":1000}; Cohesion: {"avgInternalRatio":14,"directories":505}; Cyclic Dependency Groups: {"cyclicFileCount":92,"cyclicFileRatio":0.048651507139079855,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":1891,"groupCount":18,"largestGroupSize":49}; God Files: {"godFiles":97,"godFilesPer100":5.1,"threshold":41.5}; Orphans & Dead Code: {"deadCodePercentage":15.6,"deadSymbols":3382,"orphanPercentage":2.6,"orphans":36}; Dependency Depth: {"maxDepth":24} | Coupling: {"avgConnections":6.76,"crossDirCoupling":34.2,"maxConnections":1000}; Cohesion: {"avgInternalRatio":14,"directories":505}; Cyclic Dependency Groups: {"cyclicFileCount":92,"cyclicFileRatio":0.048651507139079855,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":1891,"groupCount":18,"largestGroupSize":49}; God Files: {"godFiles":97,"godFilesPer100":5.1,"threshold":41.5}; Orphans & Dead Code: {"deadCodePercentage":15.6,"deadSymbols":3382,"orphanPercentage":2.6,"orphans":36}; Dependency Depth: {"maxDepth":24} |
| drizzle | Coupling: {"avgConnections":27.91,"crossDirCoupling":48.8,"maxConnections":2499}; Cohesion: {"avgInternalRatio":10.5,"directories":149}; Cyclic Dependency Groups: {"cyclicFileCount":272,"cyclicFileRatio":0.3073446327683616,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":885,"groupCount":11,"largestGroupSize":188}; God Files: {"godFiles":49,"godFilesPer100":5.5,"threshold":173.1}; Orphans & Dead Code: {"deadCodePercentage":16.6,"deadSymbols":5182,"orphanPercentage":3.2,"orphans":20}; Dependency Depth: {"maxDepth":9} | Coupling: {"avgConnections":27.92,"crossDirCoupling":48.8,"maxConnections":2499}; Cohesion: {"avgInternalRatio":10.5,"directories":149}; Cyclic Dependency Groups: {"cyclicFileCount":272,"cyclicFileRatio":0.3073446327683616,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":885,"groupCount":11,"largestGroupSize":188}; God Files: {"godFiles":50,"godFilesPer100":5.6,"threshold":173}; Orphans & Dead Code: {"deadCodePercentage":16.6,"deadSymbols":5182,"orphanPercentage":3,"orphans":19}; Dependency Depth: {"maxDepth":9} |
| hono | Coupling: {"avgConnections":10.37,"crossDirCoupling":7.6,"maxConnections":555}; Cohesion: {"avgInternalRatio":32.7,"directories":80}; Cyclic Dependency Groups: {"cyclicFileCount":80,"cyclicFileRatio":0.22284122562674094,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":359,"groupCount":6,"largestGroupSize":60}; God Files: {"godFiles":19,"godFilesPer100":5.3,"threshold":64.7}; Orphans & Dead Code: {"deadCodePercentage":6.3,"deadSymbols":626,"orphanPercentage":3.2,"orphans":7}; Dependency Depth: {"maxDepth":12} | Coupling: {"avgConnections":10.38,"crossDirCoupling":7.6,"maxConnections":555}; Cohesion: {"avgInternalRatio":32.7,"directories":80}; Cyclic Dependency Groups: {"cyclicFileCount":81,"cyclicFileRatio":0.22562674094707522,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":359,"groupCount":6,"largestGroupSize":61}; God Files: {"godFiles":19,"godFilesPer100":5.3,"threshold":64.8}; Orphans & Dead Code: {"deadCodePercentage":6.3,"deadSymbols":626,"orphanPercentage":3.2,"orphans":7}; Dependency Depth: {"maxDepth":12} |
| express | Coupling: {"avgConnections":3.15,"crossDirCoupling":60.5,"maxConnections":97}; Cohesion: {"avgInternalRatio":12.4,"directories":34}; Cyclic Dependency Groups: {"cyclicFileCount":4,"cyclicFileRatio":0.027210884353741496,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":147,"groupCount":1,"largestGroupSize":4}; God Files: {"godFiles":8,"godFilesPer100":5.4,"threshold":20.3}; Orphans & Dead Code: {"deadCodePercentage":2.8,"deadSymbols":50,"orphanPercentage":4.1,"orphans":2}; Dependency Depth: {"maxDepth":9} | Coupling: {"avgConnections":3.15,"crossDirCoupling":60.5,"maxConnections":97}; Cohesion: {"avgInternalRatio":12.4,"directories":34}; Cyclic Dependency Groups: {"cyclicFileCount":4,"cyclicFileRatio":0.027210884353741496,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":147,"groupCount":1,"largestGroupSize":4}; God Files: {"godFiles":8,"godFilesPer100":5.4,"threshold":20.3}; Orphans & Dead Code: {"deadCodePercentage":2.8,"deadSymbols":50,"orphanPercentage":4.1,"orphans":2}; Dependency Depth: {"maxDepth":9} |
| zod | Coupling: {"avgConnections":14.8,"crossDirCoupling":0.6,"maxConnections":4311}; Cohesion: {"avgInternalRatio":11.4,"directories":27}; Cyclic Dependency Groups: {"cyclicFileCount":12,"cyclicFileRatio":0.023809523809523808,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":504,"groupCount":3,"largestGroupSize":5}; God Files: {"godFiles":20,"godFilesPer100":4,"threshold":112.7}; Orphans & Dead Code: {"deadCodePercentage":13.1,"deadSymbols":1742,"orphanPercentage":26.5,"orphans":79}; Dependency Depth: {"maxDepth":16} | Coupling: {"avgConnections":14.8,"crossDirCoupling":0.6,"maxConnections":4311}; Cohesion: {"avgInternalRatio":11.4,"directories":27}; Cyclic Dependency Groups: {"cyclicFileCount":12,"cyclicFileRatio":0.023809523809523808,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":504,"groupCount":3,"largestGroupSize":5}; God Files: {"godFiles":20,"godFilesPer100":4,"threshold":112.7}; Orphans & Dead Code: {"deadCodePercentage":13.1,"deadSymbols":1742,"orphanPercentage":26.5,"orphans":79}; Dependency Depth: {"maxDepth":16} |
| flask | Coupling: {"avgConnections":2.89,"crossDirCoupling":0,"maxConnections":56}; Cohesion: {"avgInternalRatio":88.3,"directories":6}; Cyclic Dependency Groups: {"cyclicFileCount":20,"cyclicFileRatio":0.20202020202020202,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":99,"groupCount":2,"largestGroupSize":18}; God Files: {"godFiles":1,"godFilesPer100":1,"threshold":52}; Orphans & Dead Code: {"deadCodePercentage":21.8,"deadSymbols":338,"orphanPercentage":5.7,"orphans":2}; Dependency Depth: {"maxDepth":2} | Coupling: {"avgConnections":3.62,"crossDirCoupling":20.1,"maxConnections":93}; Cohesion: {"avgInternalRatio":22.9,"directories":18}; Cyclic Dependency Groups: {"cyclicFileCount":20,"cyclicFileRatio":0.20202020202020202,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":99,"groupCount":2,"largestGroupSize":18}; God Files: {"godFiles":6,"godFilesPer100":6.1,"threshold":29.8}; Orphans & Dead Code: {"deadCodePercentage":21.3,"deadSymbols":338,"orphanPercentage":5.7,"orphans":2}; Dependency Depth: {"maxDepth":4} |
| fastapi | Coupling: {"avgConnections":0.95,"crossDirCoupling":27.6,"maxConnections":232}; Cohesion: {"avgInternalRatio":18.8,"directories":105}; Cyclic Dependency Groups: {"cyclicFileCount":25,"cyclicFileRatio":0.02556237218813906,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":978,"groupCount":3,"largestGroupSize":15}; God Files: {"godFiles":29,"godFilesPer100":3,"threshold":11.9}; Orphans & Dead Code: {"deadCodePercentage":20.2,"deadSymbols":1625,"orphanPercentage":60.8,"orphans":270}; Dependency Depth: {"maxDepth":7} | Coupling: {"avgConnections":2.48,"crossDirCoupling":66.7,"maxConnections":621}; Cohesion: {"avgInternalRatio":7.2,"directories":190}; Cyclic Dependency Groups: {"cyclicFileCount":35,"cyclicFileRatio":0.035496957403651115,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":986,"groupCount":4,"largestGroupSize":15}; God Files: {"godFiles":33,"godFilesPer100":3.3,"threshold":15.5}; Orphans & Dead Code: {"deadCodePercentage":20.1,"deadSymbols":1625,"orphanPercentage":6.6,"orphans":30}; Dependency Depth: {"maxDepth":8} |
| fastify | Coupling: {"avgConnections":7.07,"crossDirCoupling":24.8,"maxConnections":173}; Cohesion: {"avgInternalRatio":15.9,"directories":16}; Cyclic Dependency Groups: {"cyclicFileCount":4,"cyclicFileRatio":0.014705882352941176,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":272,"groupCount":1,"largestGroupSize":4}; God Files: {"godFiles":17,"godFilesPer100":6.3,"threshold":49.5}; Orphans & Dead Code: {"deadCodePercentage":2,"deadSymbols":138,"orphanPercentage":3.8,"orphans":2}; Dependency Depth: {"maxDepth":10} | Coupling: {"avgConnections":7.07,"crossDirCoupling":24.8,"maxConnections":173}; Cohesion: {"avgInternalRatio":15.9,"directories":16}; Cyclic Dependency Groups: {"cyclicFileCount":4,"cyclicFileRatio":0.014705882352941176,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":272,"groupCount":1,"largestGroupSize":4}; God Files: {"godFiles":17,"godFilesPer100":6.3,"threshold":49.5}; Orphans & Dead Code: {"deadCodePercentage":2,"deadSymbols":138,"orphanPercentage":3.8,"orphans":2}; Dependency Depth: {"maxDepth":10} |
| werkzeug | Coupling: {"avgConnections":5.43,"crossDirCoupling":0,"maxConnections":114}; Cohesion: {"avgInternalRatio":67.8,"directories":15}; Cyclic Dependency Groups: {"cyclicFileCount":30,"cyclicFileRatio":0.16759776536312848,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":179,"groupCount":1,"largestGroupSize":30}; God Files: {"godFiles":5,"godFilesPer100":2.8,"threshold":67}; Orphans & Dead Code: {"deadCodePercentage":39.7,"deadSymbols":1082,"orphanPercentage":17.1,"orphans":18}; Dependency Depth: {"maxDepth":6} | Coupling: {"avgConnections":6.24,"crossDirCoupling":13,"maxConnections":120}; Cohesion: {"avgInternalRatio":39.1,"directories":22}; Cyclic Dependency Groups: {"cyclicFileCount":30,"cyclicFileRatio":0.16759776536312848,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":179,"groupCount":1,"largestGroupSize":30}; God Files: {"godFiles":10,"godFilesPer100":5.6,"threshold":51.2}; Orphans & Dead Code: {"deadCodePercentage":39,"deadSymbols":1082,"orphanPercentage":2.9,"orphans":3}; Dependency Depth: {"maxDepth":11} |
| tanstack-query | Coupling: {"avgConnections":15.05,"crossDirCoupling":4.2,"maxConnections":2604}; Cohesion: {"avgInternalRatio":17.1,"directories":219}; Cyclic Dependency Groups: {"cyclicFileCount":17,"cyclicFileRatio":0.01678183613030602,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":1013,"groupCount":2,"largestGroupSize":14}; God Files: {"godFiles":51,"godFilesPer100":5,"threshold":106.3}; Orphans & Dead Code: {"deadCodePercentage":6.2,"deadSymbols":1363,"orphanPercentage":13.3,"orphans":85}; Dependency Depth: {"maxDepth":17} | Coupling: {"avgConnections":15.05,"crossDirCoupling":4.2,"maxConnections":2604}; Cohesion: {"avgInternalRatio":17.1,"directories":219}; Cyclic Dependency Groups: {"cyclicFileCount":17,"cyclicFileRatio":0.01678183613030602,"edgeView":"legacy-normalized-dependencies-v1","graphFileCount":1013,"groupCount":2,"largestGroupSize":14}; God Files: {"godFiles":51,"godFilesPer100":5,"threshold":106.3}; Orphans & Dead Code: {"deadCodePercentage":6.2,"deadSymbols":1363,"orphanPercentage":13.3,"orphans":85}; Dependency Depth: {"maxDepth":17} |

The largest movement is Flask overall 79→56, with coupling 90→70, cohesion 100→40 and god files 80→40 as its `src/` package becomes connected to previously isolated source files. FastAPI 69→63 and Werkzeug 67→52 also move materially. This is another health movement caused by graph completeness, without an architectural change in those repositories. It reinforces that the current coupling score must not be used as a calibrated architecture comparison.

## Edge accounting (G2)

For each row below, `parsed = built parser edges + itemized drops`; inferred cross-language attempted edges are separate. The existing buildGraph assertion passed for every root. Pair coalescing is an expected recorded drop, not a missing target. The gate cannot detect syntax the parser never emitted.

| Repository | Parsed | Built parser | Recorded drops | Drop reasons (count) | Cross-language attempted |
|---|---:|---:|---:|---|---:|
| code-graph | 5535 | 4532 | 1003 | pair-preserved:113, pair-replaced:890 | 8 |
| nest | 25055 | 21080 | 3975 | pair-preserved:2187, pair-replaced:1788 | 2 |
| drizzle | 53824 | 36229 | 17595 | pair-preserved:5601, pair-replaced:11994 | 0 |
| hono | 9250 | 6685 | 2565 | pair-preserved:932, pair-replaced:1633 | 3999 |
| express | 622 | 276 | 346 | pair-replaced:346 | 2031 |
| zod | 21436 | 14765 | 6671 | pair-preserved:435, pair-replaced:6236 | 0 |
| flask | 983 | 690 | 293 | missing-source:50, missing-target:16, pair-preserved:1, pair-replaced:226 | 0 |
| fastapi | 6532 | 3397 | 3135 | missing-both:52, missing-source:95, missing-target:2608, pair-replaced:380 | 0 |
| fastify | 1490 | 1036 | 454 | pair-preserved:160, pair-replaced:294 | 20826 |
| werkzeug | 2602 | 1915 | 687 | missing-source:60, missing-target:23, pair-preserved:2, pair-replaced:602 | 0 |
| tanstack-query | 25715 | 21354 | 4361 | missing-target:2, pair-preserved:1562, pair-replaced:2797 | 0 |

## Fixtures, determinism, versions, and platform gate (G6–G9)

The new language-construct fixtures assert local and aliased TypeScript side-effect imports, external/missing/non-code specifiers, JavaScript ESM side-effect marking, Python plain imports with multiple modules, `from pkg.mod import x`, `from pkg import mod`, `TYPE_CHECKING`, and genuinely missing first-party and external imports. All six new tests failed on the pre-fix parser when code changes were stashed, then passed after restoration. The missing specifier fixtures require no edge **and** a reason. Existing JS/TS/Python targeted suites also passed.

`RESOLUTION_VERSION` moves **10→11** so cached parse output cannot retain the missing edges or old diagnostics. `formatVersion` remains **2**: the graph schema still loads, although old stored graph contents stay stale until reparse. The optional `sideEffectImport` edge attribute is additive within v2. `package.json` remains 1.26.0.

Determinism and platform results are completed below after gate execution.

## Named boundary and next capture gate

`COVERAGE-BOUNDARY.md` lists checked and unchecked forms for TypeScript, JavaScript and Python. No language is declared complete. It proposes a source-AST **site ledger** that classifies every import syntax site independently of parser output into a built runtime/type-only relationship, external, non-code, unresolved with reason, or explicitly unsupported. A site-level assertion would detect never-attempted syntax; parsed/built reconciliation alone cannot.
