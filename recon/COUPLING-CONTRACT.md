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
