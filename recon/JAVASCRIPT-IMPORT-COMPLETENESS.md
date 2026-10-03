# JavaScript import completeness audit

Branch: `fix/javascript-import-completeness`. Baseline: v1.25.0 (`68c3b67`). Corpus roots pinned at the SHAs in the measurements below; code-graph was measured from a clean detached main worktree to exclude the new fixtures. No release, merge, or deployment is part of this work.

## Phase 1: scope, recorded before implementation

### I1. Three Express failures

| Source | Form | Where it stopped | Classification |
|---|---|---|---|
| `lib/express.js:18` | `var proto = require('./application')` | `processRequireCall` in `src/parser/javascript.ts:343` constructed `lib/application.js::proto`, which has no declaration. The v1.25 builder at `src/graph/index.ts:122-133` recorded `missing-target` and dropped it. | (b), emitted with unproven target and recorded builder drop |
| `lib/application.js:20-23` | `require('./utils').methods`, `.compileETag`, `.compileQueryParser`, `.compileTrust` | The variable handler only recognized a direct `require(...)` initializer; a member expression was traversed as a call, but the nested `require` was not an import. | (a), never emitted |
| `lib/response.js:27-29` | `require('./utils').normalizeType`, `.normalizeTypes`, `.setCharset` | Same nested-member gap. | (a), never emitted |

The builder drop was recorded, so this is not a regression to silent builder discard. It is still an invalid parser edge and a lost import. The simple graph also coalesces repeated source/target symbol pairs; parsed edge counts cannot be compared directly to built counts without the recorded-drop ledger.

### I2. Import forms and baseline behavior

| Form | Real source evidence | Baseline result |
|---|---|---|
| `require('./x')` extensionless | Express `lib/express.js:18` | Path located, but constructed symbol target dropped; no built dependency for this pair |
| `require('./x.js')` | JavaScript fixture `test/fixtures/javascript-project/services/userService.js:1` and new syntax fixture | Path resolver supports exact extension; a local variable can still create an unproven symbol target |
| `require('../x')` | Express `examples/auth/index.js:7` (`../..`, directory) | Some direct symbol imports built; no guaranteed file dependency |
| `require('./dir')` / index | Express `examples/auth/index.js:7` | `index.js` path searched; no guaranteed file edge |
| destructured require | `test/fixtures/javascript-project/services/userService.js:1`; drizzle `integration-tests/js-tests/driver-init/commonjs/*.test.cjs:4` | Constructed member targets frequently absent; drizzle has 11 missing `.cjs` sites |
| nested, conditional, try/catch | Express `lib/application.js:20-23`, `lib/response.js:27-29` | Nested member form missed; direct calls within these statements did not consistently get a file edge |
| dynamic `import()` | Nest `gulpfile.mjs:13` (`./tools/gulp/gulpfile.ts`) | No built import |
| ESM `import` in `.js` | `test/fixtures/javascript-capture/imported-call.js:1` | Some named symbol edges built; side effect or unproven bindings lacked a guaranteed file edge |
| explicit `.cjs` / `.mjs` | Drizzle CommonJS tests above | Paths can be found, constructed symbol targets may fail; `.cjs` is parseable JS |
| `.json`, `.sql`, `.node` | Drizzle's `.sql`/`.json` are TypeScript imports; new JS syntax fixtures cover all three | Not parseable symbols. Existing unresolved status conflated a known local data/native dependency with failed resolution |
| computed specifier | Express `lib/view.js:81`, `require(mod)` | No source-provable target; baseline had no import diagnostic |

The explicit `.sql`/`.json` imports already noted in Drizzle are TypeScript parser records and a separate mechanism. This change does not alter TypeScript. The implementation resolves a literal relative path as exact file, then `.js`/`.json`/`.node`, then directory index; `.jsx`/`.mjs`/`.cjs` remain supported. It does not claim full Node package exports or runtime alias resolution.

### I3 and I4. Blast radius before fix

The syntax census counted source-visible, literal, local imports with an existing target and no **built** import edge. Counts are call sites, not distinct relationships. Python is reported separately because its parser is out of scope. Production-pair deficit is a confirmed JavaScript lower bound; the Python relative-import findings are not silently included.

| Repository (pinned SHA) | Missing JS sites | Missing explicit-relative Python sites | Confirmed missing JS production pairs |
|---|---:|---:|---:|
| code-graph `68c3b67` | 0 | 0 | 0 |
| nest `35142c3` | 1 | 0 | 1 |
| drizzle `48e5406` | 11 | 0 | 0 |
| hono `8217d9e` | 0 | 0 | 0 |
| express `7ef9844` | 37 | 0 | 3 |
| zod `004d800` | 0 | 0 | 0 |
| flask `d73fa1c` | 0 | 2 | 0 |
| fastapi `5f9fc5c` | 0 | 16 | 0 |
| click `06b2a67` | 0 | 1 | 0 |
| ripgrep `3fce3b5` | 0 | 0 | 0 |
| pinia `98587ca` | 0 | 0 | 0 |

Flask `src/flask/app.py:61-62` and Click `src/click/termui.py:28` are under `TYPE_CHECKING`. FastAPI includes runtime re-exports at `fastapi/__init__.py:21-25`. The Python parser has an equivalent source-visible import gap; fixing it is a separate parser programme. This conservative census does not prove completeness for package aliases, computed paths, or absolute Python imports.

## Phase 2: fix

`src/parser/javascript.ts` now visits module-load calls in direct declarations, nested members, functions, conditions, try/catch and dynamic imports; ESM import and re-export also record module loads. It emits a file-level import only for a local, parseable code target. `src/parser/edge-validation.ts` proves JavaScript endpoints against the parsed project; optimistic symbol IDs with no declaration become `unresolvedImports` with the original specifier and `unproven-symbol`, while a code file omitted by discovery becomes `target-not-parsed`. Missing literals become `relative-not-found`; computed specifiers are recorded without guessed edges. Known local JSON/native/assets are `nonCodeDependencies` with path and kind, not failure diagnostics and not symbol edges. `src/graph/path-boundary.ts` canonicalizes them. TypeScript logic in the shared edge-validation pass remains conditional on `.ts/.tsx` and unchanged.

`RESOLUTION_VERSION` is **9** (was 8), invalidating parse caches because parsed edges and diagnostics change. `GRAPH_FORMAT_VERSION` remains **2**: serialized graph shape does not change, so old stored graphs still load but must be reparsed for the new contents.

## Gates and measured deltas

Every fixture is a language construct, with no Express-specific rule. The 15 import-edge cases plus missing/computed and non-code diagnostics are asserted in `test/javascript-import-completeness.test.ts`; stashing parser changes makes **17/17 fail**, and restoring them makes **17/17 pass**. Build completed before test; local test run passed **45 files, 345 tests**. Three shuffled-discovery runs with seeds `11`, `29`, `47` for each of code-graph, nest and express produced byte-identical parsed output and serialized graphs.

The three Express pairs now exist as built imports. Production distinct pairs move **4→7**; the draft contract formula gives **93→88**. Its *current released* health, which includes examples and tests, moves **82→65 overall** and **90→70 coupling**. This is a second health movement caused by graph completeness with no source architecture change. The draft coupling formula remains unapproved.

### Graph contents: before → after

| Repository | Symbols | Built imports | Built calls | Other built edges | Total built | Production pairs |
|---|---:|---:|---:|---:|---:|---:|
| code-graph | 7,618 → 7,618 | 876 → 884 | 2,438 → 2,438 | 1,175 → 1,175 | 4,489 → 4,497 | 462 → 462 |
| nest | 20,156 → 20,156 | 7,021 → 7,027 | 7,534 → 7,534 | 6,517 → 6,517 | 21,072 → 21,078 | 3,232 → 3,233 |
| drizzle | 30,891 → 30,891 | 6,122 → 6,144 | 16,027 → 16,027 | 14,051 → 14,051 | 36,200 → 36,222 | 4,221 → 4,221 |
| hono | 9,616 → 9,616 | 1,009 → 1,009 | 2,587 → 2,587 | 3,482 → 3,482 | 7,078 → 7,078 | 478 → 478 |
| express | 1,658 → 1,658 | 26 → 178 | 98 → 98 | 285 → 285 | 409 → 561 | 4 → 7 |
| zod | 13,449 → 13,449 | 827 → 827 | 8,199 → 8,199 | 5,737 → 5,737 | 14,763 → 14,763 | 342 → 342 |
| flask | 1,778 → 1,778 | 158 → 158 | 269 → 269 | 88 → 88 | 515 → 515 | 89 → 89 |
| fastapi | 7,356 → 7,356 | 472 → 472 | 1,065 → 1,065 | 174 → 174 | 1,711 → 1,711 | 112 → 112 |
| click | 2,213 → 2,213 | 190 → 190 | 554 → 554 | 58 → 58 | 802 → 802 | 57 → 57 |
| ripgrep | 3,659 → 3,659 | 87 → 87 | 2,513 → 2,513 | 0 → 0 | 2,600 → 2,600 | 73 → 73 |
| pinia | 1,555 → 1,555 | 313 → 314 | 713 → 713 | 300 → 300 | 1,326 → 1,327 | 98 → 98 |

| Repository | Overall | Coupling | Cohesion | Cycles | God files | Orphans/dead | Depth |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 70→70 | 70→70 | 60→60 | 97→97 | 60→60 | 81→81 | 40→40 |
| nest | 52→52 | 50→50 | 40→40 | 66→66 | 60→60 | 71→71 | 20→20 |
| drizzle | 31→35 | 10→10 | 20→40 | 20→20 | 60→60 | 70→70 | 40→40 |
| hono | 48→48 | 30→30 | 60→60 | 35→35 | 60→60 | 82→82 | 40→40 |
| express | 82→65 | 90→70 | 80→40 | 100→87 | 60→60 | 64→88 | 80→40 |
| zod | 49→49 | 30→30 | 40→40 | 88→88 | 60→60 | 50→50 | 20→20 |
| flask | 81→81 | 90→90 | 100→100 | 44→44 | 100→100 | 48→48 | 100→100 |
| fastapi | 69→69 | 90→90 | 40→40 | 84→84 | 80→80 | 41→41 | 60→60 |

| Repository | Parsed | Built parser edges | Recorded drops (by reason) | Cross-language built edges |
|---|---:|---:|---|---:|
| code-graph | 5,485 | 4,491 | pair-replaced 881, pair-preserved 113 | 6 |
| nest | 25,051 | 21,076 | pair-preserved 2,187, pair-replaced 1,788 | 2 |
| drizzle | 53,817 | 36,222 | pair-replaced 11,994, pair-preserved 5,601 | 0 |
| hono | 9,245 | 6,680 | pair-replaced 1,633, pair-preserved 932 | 398 |
| express | 622 | 276 | pair-replaced 346 | 285 |
| zod | 21,434 | 14,763 | pair-preserved 435, pair-replaced 6,236 | 0 |
| flask | 685 | 515 | missing-target 16, pair-replaced 104, missing-source 50 | 0 |
| fastapi | 4,753 | 1,711 | pair-replaced 283, missing-target 2,612, missing-source 95, missing-both 52 | 0 |

| Repository | Before raw coupling (avg/max/cross-dir %) | After | Other changed raws |
|---|---|---|---|
| code-graph | 5.65/221/17.6 | 5.67/221/17.5 | God Files threshold 44.5→44.7 |
| nest | 6.76/1000/34.2 | 6.75/1000/34.2 | Cohesion avgInternalRatio 14.1→14; Cohesion directories 504→505; Cyclic Dependency Groups cyclicFileRatio 0.048703017469560614→0.048651507139079855; Cyclic Dependency Groups graphFileCount 1889→1891 |
| drizzle | 27.89/2499/48.8 | 27.91/2499/48.8 | Cohesion avgInternalRatio 9.9→10.5; Cohesion directories 148→149; God Files threshold 175.5→173.1 |
| hono | 10.37/555/7.6 | 10.37/555/7.6 | none |
| express | 2.12/45/51.1 | 3.15/97/60.5 | Cohesion avgInternalRatio 50.2→12.4; Cohesion directories 9→34; Cyclic Dependency Groups groupCount 0→1; Cyclic Dependency Groups cyclicFileCount 0→4; Cyclic Dependency Groups cyclicFileRatio 0→0.027210884353741496; Cyclic Dependency Groups largestGroupSize 0→4; God Files godFiles 7→8; God Files threshold 24.2→20.3; God Files godFilesPer100 4.8→5.4; Orphans & Dead Code orphans 13→2; Orphans & Dead Code orphanPercentage 26.5→4.1; Dependency Depth maxDepth 5→9 |
| zod | 14.8/4311/0.6 | 14.8/4311/0.6 | none |
| flask | 2.36/46/0 | 2.36/46/0 | none |
| fastapi | 0.78/147/33 | 0.78/147/33 | none |

All individual edge kinds grouped as “other built edges” are unchanged in every repository: `references-type`, `references`, `inherits`, `implements`, `injects`, `decorates`, and cross-language `rest-api` where present. No built edge kind decreased. No symbol count changed. The corpus also confirms v1.25 TypeScript built call counts remain **nest 7,534** and **drizzle 16,027**.

The health raw table lists every raw value that changed outside coupling; every unlisted raw value is unchanged. Coupling columns are average connections per file, maximum connections and cross-directory percentage. The reconciliation table counts built *parser* edges, excluding cross-language edges added by the builder. Every row satisfies parsed = built parser edges + the sum of itemized drops. Newly resolved JavaScript imports are built imports, not missing-endpoint drops. Existing Python missing-endpoint drops remain recorded and are outside this branch.

The updated production file-pair counts for coupling refitting are in the graph table for all eleven repositories. Express and Nest have new production relationships; the other nine counts did not change. The three V4 repositories (Click, ripgrep, Pinia) have already been measured and cannot serve as fresh holdouts. Python's open import gap means the all-language calibration graph is still not complete; no coefficient or grade mapping should be approved on this basis alone.

### Verification boundary

Ubuntu build and test are green locally. The project CI's Ubuntu and Windows jobs are the platform gate after the PR is pushed. Package version stays `1.25.0`; no merge, release or publish is part of this branch.
