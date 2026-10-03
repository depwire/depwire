# Coupling dimension — proposed contract (approval required)

Status: **proposal only, 2026-10-04**. This document defines a possible replacement for the coupling dimension. It changes no parser, graph, score, history, product, or release. Approval of the definition and weight is required before implementation.

The trigger is v1.25.0: valid TypeScript call edges made Zod's coupling score fall 90 → 30 and its overall score 64 → 49. Tests and benchmarks supplied 86.7% of added cross-file calls. In production source, distinct file pairs moved only 200 → 218 while runtime cross-file edge volume moved 574 → 1,337. These previously established figures are the motivating comparison, **not** recomputed by the calibration below.

## C1. What the released dimension actually computes

The input is the built directed symbol graph after the health view removes `references-type` edges, except a type-only import which is normalized back to an `imports` edge. Other edge kinds, including imports, calls, inheritance, injection and cross-language edges, enter coupling. `isRuntimeHealthEdge` excludes only `references-type` ([health/index.ts](../src/health/index.ts), lines 48–76; [health/metrics.ts](../src/health/metrics.ts), lines 7–9, 27–110).

Let `F` be every distinct `filePath` on graph nodes, including tests, fixtures, benchmarks and examples. For each **symbol edge** whose endpoint files differ, increment `V`. Increment both endpoint files' connection counters. Increment `D` if the **first slash-delimited component of each endpoint's dirname** differs. Thus this is not a general directory-distance or package-boundary test. Repeated edges along one file pair each count, but same-file edges do not. Then:

- `avgConnections = V / |F|`, rounded to two decimals in `metrics`. The label is misleading: the arithmetic is edges per file, while the mean of the per-file endpoint counters would be `2V/|F|`.
- `maxConnections = max` of the endpoint counters, or zero. A file receives one count whether it is the source or target of each edge.
- `crossDirCoupling = 100 D/V`, or zero for no edges, rounded to one decimal. It is a share of **symbol-edge volume**, not distinct relationships.
- Base score is 100 for `V/|F| ≤ 3`, 80 for `≤ 6`, 60 for `≤ 10`, 40 for `≤ 15`, otherwise 20. Subtract 10 if `maxConnections > 3(V/|F|)`, and another 10 if `D/V > 0.7`. Clamp to `[0,100]`.
- Coupling weight is 0.25 of `Math.round(Σ dimension.score × dimension.weight)`; letter grades are A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, otherwise F ([health/index.ts](../src/health/index.ts), lines 70–83; [health/metrics.ts](../src/health/metrics.ts), lines 12–20).

The released result reports only the three raw values above plus score, grade and a prose detail. A zero-file direct call returns 100, but the normal `calculateHealthScore` path returns `no_parseable_files` rather than presenting a numeric health score. The released dimension therefore primarily measures **symbol-edge traffic per parsed file**, with threshold jumps and two volume-sensitive penalties. It does not directly measure the number of connected file pairs.

## C2. Meaning, candidate tests, and proposed scoring rule

**Definition:** coupling should measure how many **distinct other production files each production file depends on**, including the upper tail of that outward fan-out. This is a file-level dependency-surface measure. It cannot say that a complete architecture is good or bad on its own; cohesion, cycles, god files and depth answer different questions. A shared utility with high fan-in is not inherently harmful coupling on its consumer side.

Use the same normalized health-edge projection as C1. Project each surviving cross-file symbol edge to an **ordered** `(sourceFile,targetFile)` pair and deduplicate; a reciprocal relationship is two pairs. A file's `outDegree` is its number of distinct target files, including zero-outgoing files in the denominator. Let `N` be production graph files, `P` distinct ordered pairs among them, `M=P/N`, and `T95` the nearest-rank 95th percentile of production-file out-degrees including zeros (`sorted[ceil(.95N)-1]`). Proposed score:

`couplingScore = round(clamp(100 − 6M − 2T95, 0, 100))`.

Compute from full-precision values, round once at the end. `N=0` means *unscored*, not 100. A relationship already represented by an import, call or many symbol calls counts once. The two contributions are reported separately: `6M` measures breadth, `2T95` checks widespread high fan-out. The weights are proposed calibration constants, not statistically learned parameters. The 95th percentile leaves a single large inbound shared utility unpenalized as a consumer, while an outbound hub is still visible in `maxOutDegree` and may affect `T95` in a small project. For a fixed file set, adding a distinct dependency can never increase the score; adding ten more calls on an existing pair cannot change it.

| Candidate | Hot path called 10× | New outward dependency | Merge two files / split one | Decision |
|---|---|---|---|---|
| Total distinct ordered pairs | Stable | Increases | Varies with partition and size | Report; raw total alone is size-sensitive. |
| Cross-file symbol/call volume | Increases 10× | Increases | Varies | Report as traffic, never call it architectural coupling. This is the current failure. |
| Mean distinct outward fan-out | Stable | Cannot decrease at fixed `N` | May rise or fall when `N` changes | Score component, normalized for size. |
| Fan-in/fan-out concentration | Stable if deduplicated | May rise | May rise or fall | Score outward tail; report inward tail separately. High fan-in can be a healthy shared service. |
| Proposed `M + T95` composite | Stable | Cannot improve at fixed `N` | No partition invariance | Score plus separate raw components and an explicit file-partition warning. |

There is no honest file-level scalar that is invariant to a file split or merge: collapsing every file into one would make cross-file coupling zero even when it creates a god file. The contract therefore requires a trend or simulation to show `N`, added/deleted/merged/split files and pair transitions beside the score. A score improvement when the file partition changes is **not** a standalone architecture-improvement claim. This is the cyclic-groups lesson: track the mechanism that changed, not just the direction of one number. For a known merge, report preserved external pairs, removed internal pairs, newly introduced pairs and the other health dimensions; for a split, report the analogous transitions. The score remains a snapshot, with a partition-change qualification on comparisons.

## C3. Scope decision and measured effect

**Default score: production-to-production relationships only.** Tests, benchmarks, fixtures, generated code and examples are excluded from both its numerator and denominator. Their files, pair counts and edge volume must still appear in a separate `allParsed` diagnostic view, with `excludedByCategory` and cross-scope pair counts. An explicit `scope=all` request may return a separately labeled diagnostic score, but must not silently replace the production score or alter overall health. Scope must be in every response, persisted health row and trend identity. Unclassified paths remain production and their classification/coverage status is visible; do not silently infer generated status from a symbol's name. An implementation must use an ordered, published path/metadata classifier with user overrides for atypical layouts.

The following measurement used a **provisional** deterministic path classifier: `generated`, `dist`, `build`, then bench/benchmark, then fixture/testdata, then test/spec/e2e/integration, then example/demo; first match wins, all others production. It is a calibration assumption, not an already-implemented feature. A production-only relationship requires **both** endpoints to be production. Counts come from fresh cache-disabled parses with the v1.25.0 CLI graph and the C1 health-edge projection. Each number is diagnostic, not a proposed score implementation. Production classification should be checked against repository-specific layout before accepting an implementation.

| Repository (commit) | Files all / prod | Distinct ordered pairs all / prod | Symbol edges all / prod | Excluded edges (%) | Calls all / prod |
|---|---:|---:|---:|---:|---:|
| code-graph `68c3b675` | 323 / 150 | 634 / 462 | 1,818 / 1,399 | 419 (23.0%) | 801 / 596 |
| nest `35142c3e` | 1,889 / 981 | 6,364 / 3,232 | 12,765 / 5,929 | 6,836 (53.6%) | 4,715 / 1,494 |
| drizzle `48e54060` | 885 / 625 | 6,090 / 4,221 | 24,680 / 11,806 | 12,874 (52.2%) | 13,937 / 3,529 |
| hono `8217d9ec` | 359 / 196 | 1,284 / 478 | 3,722 / 1,193 | 2,529 (67.9%) | 1,759 / 241 |
| express `7ef98448` | 147 / 7 | 311 / 4 | 311 / 4 | 307 (98.7%) | 0 / 0 |
| zod `004d800c` | 504 / 210 | 959 / 342 | 7,457 / 1,577 | 5,880 (78.9%) | 6,475 / 1,032 |
| flask `d73fa1cd` | 99 / 25 | 94 / 89 | 234 / 219 | 15 (6.4%) | 38 / 30 |
| fastapi `5f9fc5c5` (**holdout**) | 974 / 439 | 441 / 112 | 764 / 249 | 515 (67.4%) | 226 / 73 |

The all/prod difference includes example and cross-scope relationships as well as test/bench/fixture/generated traffic. It is **not** a test-only percentage. Zod's previous 86.7% statement concerns *added cross-file calls between versions*, a different denominator from this all-edge snapshot. The very small Express production slice (seven files) and sparse FastAPI graph warn that score interpretation depends on parser coverage and scope. Exclusion removes a large amount of noise, but a path rule can misclassify repository-specific production examples; the implementation gate must expose and review those counts, not hide them.

## C4. Result contract: report more than the scored scalar

Proposed `Coupling` dimension result, preserving the existing `score`, `weight`, `grade`, `details`, `metrics` outer fields:

| Field | Definition / use |
|---|---|
| `contractVersion`, `dimensions_v`, `scope`, `scopeClassifierVersion`, `status` | Method identity. `status=unscored` when no production graph files, with reason. |
| `productionFileCount=N`, `distinctDirectedFilePairs=P` | Scored population and architectural relationships. |
| `meanUniqueOutDegree=M`, `p95UniqueOutDegree=T95` | Only score inputs, full precision internally and display-rounded separately. |
| `meanPenalty=6M`, `tailPenalty=2T95`, `score` | Transparent arithmetic; no hidden cross-directory penalty. |
| `maxUniqueOutDegree`, `p95UniqueInDegree`, `maxUniqueInDegree`, `filesWithOutDegreeAbove5` | Concentration diagnostics; inbound fan-in is never treated as the same harm as outward fan-out. |
| `crossDirectoryDistinctPairs`, `crossDirectoryPairShare` | Directed pairs using a documented directory boundary, not symbol volume. Report both same-directory and cross-directory pairs. |
| `symbolEdgeVolume`, `callEdgeVolume`, `volumePerPair`, `edgeVolumeByKind` | Traffic, clearly marked **not scored**. |
| `allParsed` and `excludedByCategory` | All-scope files/pairs/volume and test, benchmark, fixture, generated, example, unknown counts. Also report cross-scope pairs; the totals must reconcile. |
| `sourceCoverage` / `scopeCoverage` | Parse failures, unclassified or overridden files, and whether score has enough source evidence. |

Use stable key names and deterministic sorted paths for drill-down lists. A score should never be presented without `scope` and denominator. Keep the historical `avgConnections`, `maxConnections` and `crossDirCoupling` keys only in legacy versioned records; reusing them for different arithmetic would make old consumers silently lie. Documentation and MCP text must say **distinct outward file dependencies** rather than “module interconnection density.”

## C5. Calibration, thresholds, holdout, and fixtures

The seven anchors used to choose the curve were code-graph, nest, drizzle, hono, express, zod and flask. Their production means span 0.57–6.75 and `T95` spans 2–19. FastAPI was designated as a holdout for **score selection**, but this is not a blinded holdout: an initial diagnostic displayed all eight raw rows before the constants were frozen. No coefficient was tuned to FastAPI, yet a prospective blind validation remains an implementation gate. The proposed coefficients make `M=5` cost 30 points and `T95=10` cost 20; together those represent a 50/100 high-dependency surface. A full ten-file directed clique costs 72 points (score 28). The implied operational bands are low concern 90–100 (penalty ≤10), moderate 70–89, elevated 50–69, high 30–49, critical 0–29. Existing A/B/C/D/F grade cutoffs remain a separate presentation rule. These are proposed interpretation thresholds, not claims of empirically optimized defect prediction.

| Repository | `M=P/N` prod | `T95` prod | `maxOut` | Current coupling | Proposed coupling | Current overall → projected overall, weight 25% |
|---|---:|---:|---:|---:|---:|---:|
| code-graph | 3.08 | 14 | 28 | 70 | 54 | 70 → 66 |
| nest | 3.29 | 10 | 46 | 50 | 60 | 52 → 54 |
| drizzle | 6.75 | 19 | 51 | 10 | 21 | 31 → 33 |
| hono | 2.44 | 8 | 11 | 30 | 69 | 48 → 57 |
| express | 0.57 | 2 | 2 | 90 | 93 | 82 → 83 |
| zod | 1.63 | 5 | 16 | 30 | 80 | 49 → 62 |
| flask | 3.56 | 10 | 11 | 90 | 59 | 81 → 73 |
| fastapi (**held out**) | 0.26 | 1 | 9 | 90 | 96 | 69 → 71 |

FastAPI's held-out 96 is consistent with its **observed sparse graph**, not independent proof that FastAPI has low architectural coupling; Python edge coverage remains a separate concern. Flask's 59 is a meaningful contrary case: excluding tests does not automatically raise every score; 89 directed production pairs among 25 files still imply breadth. Hono and Zod rise sharply because their all-scope edge traffic dominated the released measure. No threshold was adjusted to make either land in a desired grade.

Hand-verifiable fixtures use production files only, directed relationships and nearest-rank `T95`; other symbol edges on the same pair must deduplicate:

| Fixture | `N`, `P`, out-degree distribution | `M`, `T95` | Expected score / property |
|---|---|---|---|
| Inbound star: five leaves depend on one hub | 6, 5; `[0,1,1,1,1,1]` | `5/6`, 1 | 93; high fan-in reported, not punished as outward fan-out. |
| Outbound star: hub depends on five leaves | 6, 5; `[0,0,0,0,0,5]` | `5/6`, 5 | 85; report maxOut=5. |
| Fully connected six-file cluster | 6, 30; six `5`s | 5, 5 | 60; reciprocal pairs counted separately. |
| Fully connected ten-file cluster | 10, 90; ten `9`s | 9, 9 | 28; substantially worse than a star. |
| Clean two-layer graph: four entry files each depend on one of two lower-layer files | 6, 4; `[0,0,1,1,1,1]` | `4/6`, 1 | 94. |
| One hot path: `A→B` once, then ten symbol calls on `A→B` | 2, 1; `[0,1]` | `1/2`, 1 | 95 both times; volume 1→11 is reported but score unchanged. |
| Same-file calls added | Any | Unchanged | Score and pairs unchanged; volume of excluded same-file traffic may be reported separately. |
| Add a new outward pair with fixed files | Any | `M` rises, `T95` cannot fall | Score cannot improve. |

The implementation gate must calculate these exact fixtures, confirm all eight rows above using the approved classifier and graph snapshot, and rerun a holdout beyond these eight before production release. This contract's figures are **projections**, not new product outputs.

## C6. Actual blast radius, by surface

| Surface | Evidence of a coupling figure or health consumer | Required action if implemented |
|---|---|---|
| CLI README | [README.md](../README.md), lines 495–528, displays `Coupling 70 C` and describes six-dimension health. That example is illustrative, not a stored user measurement. | Update sample, definition and methodology boundary; no claim every README number is wrong. |
| `depwire.dev` | Live page [depwire.dev](https://depwire.dev/) describes `HEALTH.md` as containing coupling analysis and advertises architecture health scoring, but inspection on 2026-10-04 found **no numeric coupling value**. | Update wording/illustrations only where they describe traffic as architecture; no numerical backfill. |
| Benchmark repository | `depwire-benchmark/RESULTS.md:7` contains a **45/100 overall** v1.8.6 baseline, no coupling dimension. `depwire-benchmark-v2` active source/readme search found no numeric coupling claim; archived transcripts may contain tool output. | Label old overall by version if reused; no direct coupling figure to correct in the result table. |
| Cloud stored health | `depwire-cloud/api/src/routes/jobs.ts:14–32` inserts `score`, JSON `dimensions`, `dimensions_v` and `resolution_version` into `health_history`; `frontend/src/components/HealthScore.tsx:26–32` labels coupling 25%; `parser/src/healthMapping.ts:5–15` maps it under `coupling`. | New rows need new dimensions_v/scope. Retain old rows with their old method; suppress cross-version deltas. Old stored graph format can load, but graph contents may reflect earlier parser resolution. No production D1 row count was verified in this document. |
| Action PR comments | `depwire-action/src/comment.ts:62–73` prints each dimension including Coupling; `src/index.ts:178–181` may fail a PR on overall-score drop. README calls Coupling “Module interconnection density.” | Update description, label methodology and scope; avoid comparing base/PR across versions. Existing historical comments stay historical. |
| Generated docs | [src/docs/health.ts](../src/docs/health.ts), lines 18–50, writes score, breakdown, trend and detailed metrics to `HEALTH.md`; docs generation uses same report. | Update raw labels and trend boundary. Other generated docs may discuss graph relationships but do not necessarily contain this score. |
| MCP | [src/mcp/tools.ts](../src/mcp/tools.ts), lines 247–248 and 1524–1542, returns the full health report via `get_health_score`; `simulate_change`/`verify_change` use health deltas. | Include method/scope in responses; prevent cross-version delta language. |
| SLM data | `depwire-slm/scripts/parse.ts:74–125` stores `health` in graph snapshots; `scripts/generate_pairs.py:110–117` derives health assessment training pairs. Snapshot JSON contains dimension objects, including coupling, while generated pairs mainly use overall score. | Existing snapshots/pairs remain versioned historical data; future regeneration from the new method changes labels and some text. Do not assert every pair contains a coupling number. |

This is a **derived-metric** change. Historical coupling figures were produced by the old formula, but a figure is not necessarily “wrong” if it accurately described that version's traffic-based formula. The unsafe act is a cross-method trend or a current architectural claim made from that old number. Cloud's current production D1 contents and the count of affected stored rows remain unverified; code evidence proves the storage and presentation paths, not a deployed row inventory.

## C7. Version and comparison boundary

Propose `dimensions_v = "2026-10-04-coupling-file-relationships-v1"` for the six-dimension report. The coupling payload also carries `contractVersion="coupling-file-relationships-v1"`, `scope="production"`, and a separately incrementable classifier version. The global marker succeeds `2026-09-30-cyclic-groups-v1`; cyclic-groups arithmetic itself stays unchanged. Trend identity must compare `dimensions_v`, scope and classifier version. A scope/classifier change is also a methodology boundary even if the formula is unchanged.

Suggested user text: **“Health scoring changed: Coupling now scores distinct outward dependencies between production files, with tests and benchmarks reported separately. Earlier scores used cross-file edge volume and included non-production files. Scores across this boundary are not directly comparable, so no improvement or regression delta is shown.”** For a file merge/split within one methodology: **“The file partition changed; review added and removed file relationships and the other dimensions before interpreting this coupling delta.”**

`formatVersion` remains **2**: the serialized graph schema and edge kinds do not change. `RESOLUTION_VERSION` remains **8**: parsing and resolution do not change. Existing stored graphs can load; recalculating coupling from an old graph can still inherit its old graph *contents*, so a current score should be computed from an appropriate current parse or clearly labeled with its parser resolution. `dimensions_v` changes because the derived health methodology and its scope change.

## C8. The 25% overall weight is a separate decision

The C5 last column holds all five other dimension scores and weights exactly as measured, swaps only coupling, and applies the released `Math.round` aggregation. It is a **projection**, not an implementation or a claim that the eight repositories changed. Six overall scores rise and two fall; Zod rises 49→62 (+13), Hono 48→57 (+9), Flask falls 81→73 (−8), code-graph 70→66 (−4). The new coupling distribution spans 21–96, so this proposal neither compresses all results into one band nor forces parity with the old score.

**Recommendation: retain 25% for the first implementation, with explicit approval.** Changing the formula and the weight together would obscure which decision moved overall health, and there is no independent evidence from eight repositories that a different weight predicts quality better. This is not an automatic endorsement of 25% forever. Before releasing, compare an additional held-out corpus and inspect whether high-fan-out files correspond to genuine maintenance risk; if the dimension proves too dominant, write a separate weight contract and recalibrate **all six** weights rather than quietly redistributing five points. The current eight-repo projected overall shifts make the weight decision visible and reviewable.

## Approval boundary and implementation gates

Approval should cover the production-only default and path overrides, the ordered-pair projection, `100−6M−2T95` curve, reporting shape, trend wording, and retention of 25% weight. A later implementation must add exact fixture tests, scope audits, eight-repo and held-out projections, deterministic output, Cloud/Action/docs/MCP consumer updates, and version-boundary tests. This document authorizes none of those changes. **Stop here for Atef's contract approval.**

## V4 pre-registration — committed before parsing

This section is a prediction record. The three repositories below were freshly shallow-cloned and pinned, but **not parsed or measured with Depwire before this section's separate commit**. Selection checks found no mention of these repositories in Depwire's `recon/`, `docs/`, README or canonical calibration notes. This is a deliberately diverse Python command-line library, Rust search-tool workspace, and TypeScript state-management monorepo. Predictions use only the top-level source layout and the already frozen `100−6M−2T95` rule. The point predictions and expected components will not be revised after measurement.

| Repository and pinned SHA | Pre-parse architectural expectation | Predicted production `M`, `T95` | Predicted score |
|---|---|---:|---:|
| `pallets/click` `06b2a678741131fd577ce170e23e5ca0aeba0309` | Compact Python `src/click` package of roughly 17 code files; central `core`, `types`, `utils`, `termui` and parser likely connect much of the package. | `M≈4`, `T95≈10` | **56** |
| `BurntSushi/ripgrep` `3fce3b5bb0236da2df6d99672afb8a719642eca7` | Rust workspace split into small crates; each crate has concentrated local relationships, while cross-crate use may be external at file level. Expect moderate outward breadth. | `M≈3`, `T95≈7` | **68** |
| `vuejs/pinia` `98587ca465b2c45e4053548261e769cad380ba5a` | TypeScript packages for core state management and integrations. Some central files should have several dependencies, while many package and playground files are isolated or lightly connected. The provisional classifier may count `playground` as production. | `M≈2.5`, `T95≈8` | **69** |

Uncertainty is material: parser resolution and the provisional scope classifier may move these scores even if the architecture expectation is reasonable. That is part of what this blind check is intended to reveal. The next commit will append measured values and leave this record intact.

## Validation after the prediction commit (V1–V4)

The following inspection used the same cache-disabled graph and provisional scope rule as C3. The V4 measurements below were made **after** the separate prediction commit `1df4044e882b51b30f56bbff97dfcaee3be9f0e1`. This is a review of a proposed method, not a change to the product.

### V1. Inspect the three large reorderings

The `T95` boundary is the nearest-rank 95th-percentile file when production files are sorted by unique outward file count, including zeros. A tie at the boundary is listed so that the percentile is inspectable. Paths are relative to the named repository.

| Repository | `M`, `T95`; boundary file(s) | Five highest outward file counts | Architectural reading and verdict |
|---|---|---|---|
| **Zod**, 30 → 80 | `342/210=1.63`, `5`; `packages/zod/src/v4/core/errors.ts`, tied at 5 with `v4/classic/from-json-schema.ts` and `v4/core/json-schema-processors.ts` | `v4/classic/external.ts` **16**; `v4/mini/external.ts` **15**; `v4/classic/schemas.ts` **13**; `packages/resolution/src/index.ts` **9**; `v3/types.ts` **9** | The two `external.ts` files aggregate and re-export classic/mini APIs; `schemas.ts` spans its own checks/parse plus core schema helpers; `resolution/index.ts` selects entry points; `v3/types.ts` uses v3 helpers. These are mostly deliberate entry/facade and schema-core relationships, concentrated in a few files. **80 describes the observed production file topology better than 30:** 82/210 production files have zero outward pair and 342 pairs across 210 files is sparse. It does **not** certify Zod's full architecture or call resolution. |
| **Flask**, 90 → 59 | `89/25=3.56`, `10`; `src/flask/__init__.py` at the boundary | `src/flask/app.py` **11**; `src/flask/__init__.py` **10**; `src/flask/sansio/app.py` **9**; `src/flask/templating.py` **7**; `src/flask/blueprints.py` **6** | `app.py` depends on context, sessions, signals, templating, wrappers and the sans-I/O app; `sansio/app.py` reaches config, context, JSON provider, logging and scaffolding; `templating.py` and `blueprints.py` cross those same internals. This is a compact, intertwined 25-file core: 89/94 all-scope pairs are production. **59 is a better description of file dependency breadth than 90**, though `__init__.py` is an intentional public facade and its ten outward links should be annotated, not automatically treated as a refactoring defect. |
| **code-graph**, 70 → 54 | `462/150=3.08`, `14`; `src/docs/index.ts` at the boundary | `src/mcp/tools.ts` **28**; `src/index.ts` **27**; `src/parser/detect.ts` **18**; `src/docs/generator.ts` **15**; `src/parser/index.ts` **15** (tied with `src/sdk.ts` and `src/security/scanner.ts`) | `mcp/tools.ts` spans graph, health, docs, simulation and tool handlers; `index.ts` dispatches CLI commands; `parser/detect.ts` imports 17 language parsers; `docs/generator.ts` imports generated-document modules. Their fan-out is **real**, but much of it is intended composition/dispatch. **54 is explainable as outward dependency breadth, yet is not proven a better *quality judgment* than 70.** The contract must present the named hubs and role before calling this an architecture regression. |

The Zod/Flask ordering is supported by observed file relationships: Zod has a broad source tree with comparatively few outward pairs per file, while Flask's small core repeatedly crosses its own modules. Code-graph exposes a limitation of any fan-out score: a composition root can look heavily coupled while serving its intended role. This weakens confidence in the exact coefficient and grade, even though the raw breadth is valid.

### V2. Express: the filter is sound; graph coverage is limited

All seven framework source files survive: `index.js`, `lib/application.js`, `lib/express.js`, `lib/request.js`, `lib/response.js`, `lib/utils.js`, `lib/view.js`. The four **built** production pairs are all import relationships:

1. `index.js → lib/express.js` (`index.js:11`)
2. `lib/application.js → lib/view.js` (`lib/application.js:18`)
3. `lib/express.js → lib/request.js` (`lib/express.js:20`)
4. `lib/express.js → lib/response.js` (`lib/express.js:21`)

| Exclusion reason | Files removed | All-scope pairs removed, by endpoint category |
|---|---:|---:|
| `examples/` | 46 | `example→example` 64; `example→test` 60 |
| `test/` | 90 | `test→example` 98; `test→test` 85 |
| `test/fixtures/` (fixture takes precedence over test) | 4 | 0 distinct pairs |
| Benchmarks / generated | 0 | 0 |

These 140 excluded files and 307 pairs account exactly for the all/prod difference, 147→7 files and 311→4 pairs. None of the seven core files is wrongly excluded. The filter is behaving correctly **on Express**; therefore there is no Express-derived scope correction to apply to the other seven repositories' C3 figures.

The four-pair result is nevertheless **not a trustworthy complete map of Express's core**. `lib/express.js:18` requires `./application` and the parser emits an import to constructed ID `lib/application.js::proto`, but the built graph lacks that declaration, so the builder records an absent-endpoint drop. `lib/application.js:20–23` and `lib/response.js:27–29` require members of `./utils`, yet no built production pairs to `lib/utils.js` appear. These source relationships imply **at least seven** distinct production file pairs, versus four measured; with just those three restored, `M=1`, `T95=3` and the proposed score would be **88**, rather than 93. This is an illustrative lower-bound correction, not a parser fix or a verified complete pair inventory. Existing graph incompleteness can make a topology score over-generous even with a correct scope filter. Express must be removed as a trustworthy numerical anchor until import coverage is reconciled.

The blind Pinia check also exposes a **different scope risk**: the provisional classifier does not recognize `playground/` as non-production. Exactly 24 of its 72 graph-bearing “production” files are under that path. Reclassifying them as examples in a diagnostic rerun changes Pinia from 72 files / 98 pairs / score **82** to 48 files / 55 pairs / score **83**. This does **not** explain the 13-point prediction miss, nor change the eight C3 rows directly, but it requires a classifier review and explicit scope overrides before applying the contract generally. No classifier implementation is authorized here.

### V3. Coefficients and sensitivity

The constants **6 and 2 were chosen after viewing the seven calibration anchors** to produce a plausible spread and to make repeated call volume irrelevant. That is *fitting by judgment*, not an independently validated calibration. FastAPI was not blind, as C5 already discloses. The balance is interpretable as 6 points per additional mean distinct dependency and 2 points per additional dependency at the 95th-percentile file; the choice to weight mean three times as strongly as the tail is normative, not an empirically proven risk ratio.

Possible semantic anchors, stated **after** the chosen formula and therefore not independent evidence: a sparse core with `M=1,T95=2` scores 90; a moderately broad core with `M=3,T95=6` scores 70; a broadly interdependent core with `M=5,T95=10` scores 50. These three lie on `T95=2M` and **cannot uniquely determine both coefficients**. A distinguishing tail anchor would be `M=2,T95=9` scoring 70; together with `(1,2)→90`, it yields 6 and 2. Whether users actually consider that tail-heavy shape a 70 remains unvalidated. The anchors explain what the curve *says*; they do not establish that it says the right thing.

Sensitivity on the same eight graphs and production scope; columns follow code-graph, nest, drizzle, hono, express, zod, flask, FastAPI:

| Mean / tail coefficients | code-graph | nest | drizzle | hono | express | zod | flask | fastapi |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `4 / 1` | 74 | 77 | 54 | 82 | 96 | 88 | 76 | 98 |
| `5 / 2` | 57 | 64 | 28 | 72 | 93 | 82 | 62 | 97 |
| **`6 / 2` proposal** | **54** | **60** | **21** | **69** | **93** | **80** | **59** | **96** |
| `7 / 2` | 50 | 57 | 15 | 67 | 92 | 79 | 55 | 96 |
| `8 / 3` | 33 | 44 | 0 | 56 | 89 | 72 | 42 | 95 |

The broad ordering is stable across these pairs: Zod stays above Hono, and both above Flask and code-graph; drizzle stays worst. Nest/Flask are close, with Nest remaining just above Flask for positive mean coefficients because they share `T95=10`. **Score magnitude and grade are sensitive**, particularly drizzle (0–54) and code-graph (33–74). The shape of the metric is better supported than these numeric constants. Do not approve the 6/2 coefficients merely because the eight-repo table looks plausible.

### V4. Prospective blind results; predictions preserved above

The exact prediction commit precedes the first Depwire parse of these clones. Measurements used the same provisional classifier and health-edge projection as C3; no coefficient or prediction changed.

| Repository (pinned SHA above) | Predicted `M`, `T95`, score | Measured production files, pairs, `M`, `T95` | Measured score | Miss |
|---|---:|---:|---:|---:|
| Click | `≈4`, `≈10`, **56** | 18, 57, **3.17**, **9** | **63** | +7 |
| ripgrep | `≈3`, `≈7`, **68** | 87, 73, **0.84**, **7** | **81** | +13 |
| Pinia | `≈2.5`, `≈8`, **69** | 72, 98, **1.36**, **5** | **82** | +13 |

All three measured scores exceed the pre-registered predictions. The Rust workspace has fewer observed cross-file relationships than expected; this may reflect genuinely local crate organization or unmodeled Rust relationships, and has **not** been proven either way. Pinia's `playground/` classification is a concrete scope concern, although excluding it moves the measured score only 82→83. A 13-point miss in two of three repositories is material: this blind check does not validate the curve's ability to predict an intelligible architecture score. It argues for checking parser coverage, revising scope classification, and anchoring the coefficients to reviewed examples before approving the numeric curve. The predictions remain in the earlier commit as recorded.

### Generosity and overall-score movement

Across the eight C5 repositories, old coupling scores have **mean 57.5, median 60**; proposed scores have **mean 66.5, median 64.5**. The curve is nine points more generous on average, despite two substantial downward moves. Overall mean moves **60.25→62.375** (+2.125) and median **60.5→64** (+3.5); six overall scores rise and two fall. The overall range barely compresses, **31–82 → 33–83** (width 51→50), so “compression” is less important than the upward shift and reordering. Nothing in the repositories improved: these are methodological changes. Any eventual release note must say so explicitly and must not describe the increases as architectural gains.

## Updated approval recommendation after validation

Approve the **structural contract** only if desired: distinct production relationships as the scored evidence, all-scope volume and exclusions as separately labeled diagnostics, and a methodology boundary. **Do not yet approve the 6/2 numeric curve or its grades.** Express demonstrates that graph coverage can make even correct filtering look sparse; Pinia shows the provisional classifier can include playground code; code-graph's composition roots and the two 13-point blind misses leave the 54/59/80 ordering insufficiently validated as a quality judgment. The 25% weight remains the right isolated first-implementation assumption *once a score curve is approved*. This is still document-only work; there is no implementation authorization in this PR.
