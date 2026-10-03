# Coupling refit, candidate frozen before fresh holdouts

Status: **diagnostic contract revision, no implementation approval**. This uses the v1.26.0 graph plus the proposed Python PR #61 corrections, `recon/coupling-refit-measure.mjs`, and the path classifier frozen in that script. The eight measurements are in `COUPLING-REFIT-EIGHT.jsonl`. The fresh holdout names and SHAs were committed first in `COUPLING-REFIT-PREREGISTRATION.md`; none had been cloned or parsed for this refit when this candidate and its point predictions were recorded.

## Why the original 6/2 curve is withdrawn

The contract's `100 − 6×mean − 2×p95` coefficients were fitted after seeing the earlier eight-repo data; blind predictions missed ripgrep and Pinia by 13 points. The new parser state also changes the observed relationship table. The structure remains: score **distinct ordered production-to-production file pairs**; report edge volume, fan-in, fan-out tail, directory crossings and excluded relationships separately. This diagnostic view excludes every `references-type` edge, including `TYPE_CHECKING` imports. It never treats repeated calls along one pair as new architectural relationships.

## Frozen diagnostic candidate

`score = round(clamp(100 − 10 × P/N, 0, 100))`, where `P` is distinct ordered production file pairs and `N` is graph-bearing production files. `N=0` is unscored. The coefficient is a stated scale, not chosen to match the old scores: an average of **one** outward dependency per production file means 90, **three** means 70, **five** means 50, and **ten** means zero. A reader can inspect those anchors directly. `p95` and maximum outward fan-out are reported but not scored in this candidate: the V1 inspection showed that high-fan-out composition roots in code-graph are intentional, and a single tail penalty would turn that role into a quality judgment. Concentration remains visible for review. This choice needs Atef's approval if it survives blind validation.

The formula is monotone for a fixed file partition: adding a distinct outward pair cannot improve the score; adding ten calls on an existing pair changes only volume. File splits/merges can change `P/N`, so trend output must still identify partition changes. This is not an all-language quality score: `RELATIONSHIP-COVERAGE-BOUNDARY.md` records known capture gaps and applicability limits.

## Eight-repo prefit distribution

The path classifier excludes tests, benchmarks, fixtures, generated output, examples and `playground/` from both `P` and `N`. Only graph-bearing files enter `N`. Same-file edges and `references-type` are excluded. `P/N` uses full precision; displayed means are rounded after calculation. The last column is an illustrative overall recomputation at the current 25% coupling weight; no weight change or product score is implemented.

| Repository | Production files `N` | Pairs `P` | Mean `P/N` | p95 out | Max out | Runtime volume prod / excluded | Current coupling → candidate | Current overall → illustrative | Coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| code-graph | 149 | 397 | 2.66 | 14 | 27 | 1,289 / 433 | 70 → 73 | 70 → 71 | Construct-bounded |
| nest | 983 | 3,071 | 3.12 | 10 | 46 | 5,490 / 6,774 | 50 → 69 | 52 → 57 | Construct-bounded |
| drizzle | 625 | 2,773 | 4.44 | 14 | 41 | 8,310 / 12,749 | 10 → 56 | 35 → 46 | Six known missed side-effect imports |
| hono | 196 | 297 | 1.52 | 6 | 11 | 788 / 2,394 | 30 → 85 | 48 → 61 | Three production and two test side-effect imports missed |
| express | 7 | 7 | 1.00 | 3 | 3 | 10 / 453 | 70 → 90 | 65 → 70 | Checked JS literal-local forms; other forms unverified |
| zod | 210 | 255 | 1.21 | 4 | 16 | 1,432 / 5,873 | 30 → 88 | 49 → 64 | Construct-bounded; CSS asset separate |
| flask | 25 | 77 | 3.08 | 10 | 12 | 262 / 24 | 90 → 69 | 79 → 74 | Python absolute relationships unverified |
| fastapi | 443 | 123 | 0.28 | 2 | 9 | 279 / 646 | 90 → 97 | 69 → 71 | Python absolute relationships unverified; weak score anchor |

The candidate coupling mean is **78.375**, versus **55** under the current released formula on these same post-PR #61 graphs. Illustrative overall mean rises **58.375 → 64.25**. Nothing improved in the repositories: this is a more generous curve and an altered relationship measurement. The 25% weight amplifies it. A passing blind test would still require this inflation to be disclosed and the anchor meanings to be approved; a failing blind test rejects the curve. No grade mapping is proposed.

The known TypeScript misses do not justify guessing six or three runtime edges into the table. `drizzle-kit/src/@types/utils.ts` changes prototypes at runtime; Hono's `src/context.ts` is imported for side effects by three middleware files. Those nine production pairs are a **confirmed lower bound** on pair undercount, subject to checking whether another graph relationship already represents each pair. The source-to-built audit found none. FastAPI's 2,608 missing-target builder drops are repeated symbol attempts, not a pair deficit; absolute relationship coverage has no numeric bound yet. Thus these are diagnostic measurements, not an approved calibration set.

## Point predictions committed before holdout parsing

These are predictions for the exact pinned SHAs in `COUPLING-REFIT-PREREGISTRATION.md`, using only known project roles and the frozen classifier. The uncertainty is part of the prediction; the point values are not to be revised after measuring. A Python coverage failure will be reported alongside Werkzeug's score rather than used to discard it.

| Holdout | Predicted production `N` | Predicted pairs `P` | Predicted mean | Predicted p95 | Predicted candidate score | Rationale |
|---|---:|---:|---:|---:|---:|---|
| Fastify | 65 | 150 | 2.31 | 10 | 77 | Plugin-oriented JavaScript server expected to have a moderate core fan-out. |
| Werkzeug | 35 | 100 | 2.86 | 10 | 71 | Python HTTP toolkit expected to be somewhat broader than Flask's compact core. Absolute imports are a known coverage risk. |
| TanStack Query | 300 | 600 | 2.00 | 9 | 80 | TypeScript packages expected to have many local helpers and bounded outward links. Monorepo aliases are a coverage risk. |

Next step: clone only these exact SHAs, parse once with cache disabled, inspect scope classification, then report predicted versus measured `N`, `P`, mean, p95 and score. No coefficient change after seeing results. A material miss is a reason to reject or revise the **next** candidate in a separately preregistered run, not a reason to rewrite this candidate.

## Prospective results (later commit)

The predictions and candidate above were committed as `71f3035` before any of the three holdouts was cloned. The registration of names and SHAs was committed even earlier as `cb3d5f5`. Shallow clones were verified at the exact SHAs, parsed once with cache disabled, and measured by the frozen script. Raw output is `COUPLING-REFIT-HOLDOUTS.jsonl`; no coefficient, classifier or prediction was revised after seeing it.

| Holdout | Production files predicted → measured | Pairs predicted → measured | Mean predicted → measured | p95 predicted → measured | Score predicted → measured | Miss |
|---|---:|---:|---:|---:|---:|---:|
| Fastify | 65 → 34 | 150 → 108 | 2.31 → 3.18 | 10 → 12 | 77 → 68 | −9 |
| Werkzeug | 35 → 55 | 100 → 207 | 2.86 → 3.76 | 10 → 12 | 71 → 62 | −9 |
| TanStack Query | 300 → 383 | 600 → 782 | 2.00 → 2.04 | 9 → 6 | 80 → 80 | 0 |

The score errors are driven mainly by source topology predictions: Fastify has a smaller production core than predicted, while Werkzeug has a larger and more connected one. TanStack Query's 383 graph-bearing production files and 782 pairs produce nearly the predicted mean despite both raw counts being higher. The frozen classifier excludes 1,664 cross-scope/runtime-volume edges in Fastify, 203 in Werkzeug and 11,897 in TanStack Query; these are volume counts, not distinct pairs. `playground/` is excluded as preregistered. A TS syntax check found nine side-effect CSS imports in TanStack Query examples and no code-target side-effect site of the known Drizzle/Hono shape. CSS must remain a non-code dependency, not a coupling pair. Werkzeug's Python absolute import coverage remains unverified; its score is a lower-bound graph observation.

**Verdict: no numeric approval.** Two same-direction nine-point misses are smaller than the previous 13-point misses but still material for a dimension worth 25% of overall health. More importantly, the candidate raises mean coupling **55 → 78.375** and illustrative overall **58.375 → 64.25** across the eight anchors with no architecture change. The simple scale is easier to explain than 6/2, but these blind results and the known capture gaps do not establish that its grade or ordering is right. Do not implement this curve, map it to letter grades, or reuse these three repositories as blind holdouts in a later attempt. The settled contract remains the relationship-based measurement and separate diagnostics; numerical calibration requires another proposed curve with reviewed architectural anchors and a fresh blind set after the known production relationship gaps are addressed or explicitly bounded.
