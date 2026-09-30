# Cyclic groups implementation — PR #49

Branch: `feat/cyclic-groups-metric`, based on main `28ec599c841964d39d0bc67f0d534da50eddbf83` (confirmed unchanged remotely).
No merge, package version change, publication, deployment or production data write.

## Amendment 1: measured before implementation

A = exclude ordinary references-type, retain legacy type-only import normalization.
B = exclude references-type and drop that normalization. C = all dependency edges.
The scorer was applied to B/C here **only for sensitivity analysis**; public B/C
results are explicitly unscored. Measurements reuse all eight frozen phase-one
graphs; the original cycle investigation was not rerun.

| Repository | Policy | Groups | Cyclic files | Coverage % | Largest group | Dimension score |
|---|---|---:|---:|---:|---:|---:|
| code-graph | A | 0 | 0 | 0.0000 | 0 | 100 |
| code-graph | B | 0 | 0 | 0.0000 | 0 | 100 |
| code-graph | C | 0 | 0 | 0.0000 | 0 | 100 |
| nest | A | 17 | 89 | 5.1003 | 48 | 65 |
| nest | B | 16 | 86 | 4.9284 | 48 | 66 |
| nest | C | 17 | 89 | 5.1003 | 48 | 65 |
| drizzle | A | 11 | 272 | 30.7345 | 188 | 20 |
| drizzle | B | 18 | 207 | 23.3898 | 43 | 35 |
| drizzle | C | 11 | 272 | 30.7345 | 188 | 20 |
| hono | A | 6 | 80 | 22.2841 | 60 | 35 |
| hono | B | 7 | 50 | 13.9276 | 36 | 50 |
| hono | C | 6 | 79 | 22.0056 | 59 | 35 |
| express | A | 0 | 0 | 0.0000 | 0 | 100 |
| express | B | 0 | 0 | 0.0000 | 0 | 100 |
| express | C | 0 | 0 | 0.0000 | 0 | 100 |
| zod | A | 3 | 12 | 2.3529 | 5 | 88 |
| zod | B | 1 | 2 | 0.3922 | 2 | 98 |
| zod | C | 2 | 14 | 2.7451 | 9 | 84 |
| flask | A | 2 | 21 | 21.2121 | 19 | 44 |
| flask | B | 2 | 21 | 21.2121 | 19 | 44 |
| flask | C | 2 | 21 | 21.2121 | 19 | 44 |
| fastapi | A | 2 | 22 | 2.2587 | 15 | 84 |
| fastapi | B | 2 | 22 | 2.2587 | 15 | 84 |
| fastapi | C | 2 | 22 | 2.2587 | 15 | 84 |

**Decision: retain A**, named `legacy-normalized-dependencies-v1`. B removes 65
cyclic files from Drizzle, shrinks its largest group 188→43 and improves its score
20→35. Hono moves 35→50, Zod 88→98, and Nest 65→66. This is material, not a harmless
simplification. We preserve existing health relationships, without claiming these
legacy relationships independently prove runtime execution. Normalized witness
edges disclose `normalizedTypeOnlyImport: true`.

## Implementation and API

One implementation in `src/graph/cyclic-groups.ts` supplies health, architecture
docs, dependency docs, architecture security findings and simulation. Iterative
Kosaraju computes exact maximal SCCs; single-file components are excluded. Unicode
scalar ordering fixes members, group order and evidence ties. A reverse BFS gives
one shortest witness through the smallest member (security explicitly chooses
the smallest security-related member), with lexical ties. No cycle enumeration,
cap or traversal-dependent counting remains in those consumers.

`cyclicGroups` reports G, C, C/N and L separately. Only coverage (penalty up to 80)
and concentration (up to 20) score; G never does. The approved piecewise-linear
anchors are implemented literally. Unknown edge kinds/missing paths are unavailable,
not clean. Empty graphs are unscored. Source completeness is `unknown` unless a
caller supplies it; completeness of source parsing is not inferred from SCC success.

`cyclicGroupChanges` distinguishes persistent newly cyclic/freed files, added/deleted
cyclic files, merges/splits, formed/eliminated groups, 1:1 membership changes and
internal edge changes. Explicit bijective renames preserve identities. Results
include the full before/after payload so membership keys can be resolved.

The old `cycles`, `cyclesPer100`, `circularDepsIntroduced`, `circularDepsResolved`
and `new_circular_dependencies` fields are removed. CLI/MCP/pure-tool responses,
What If text/browser output, security findings and docs use the new semantics.
Security includes structured group membership, anchored witness and methodology.

**Verify-change limitation exposed:** edited-content/unified-diff paths previously
compared exports without constructing a fully resolved after-graph, yet returned an
empty cycle list. They now return `not_comparable` with an explanation and at least
medium risk (`safe: false`). A genuine deletion has an actual after-graph and uses
the shared comparison. Deleting the last graph file is unscored/not comparable.
No new resolver or speculative graph reconstruction was introduced. This is an
intentional compatibility change for callers that previously trusted a false-safe
empty result; export/broken-import checks still run.

## G1 and G4: asserted answers

Expected values were written in the test table before execution:

| Fixture | Graph files | Groups | Cyclic files | Largest | Score |
|---|---:|---:|---:|---:|---:|
| Bidirected triangle | 3 | 1 | 3 | 3 | 19 |
| Layered DAG | 100 | 0 | 0 | 0 | 100 |
| Dense 188-file tangle + isolates | 1000 | 1 | 188 | 188 | 35 |
| 94 disjoint pairs + isolates | 1000 | 94 | 188 | 2 | 55 |
| Single 100-file ring | 100 | 1 | 100 | 100 | 2 |
| Two pairs + one-way bridge | 100 | 2 | 4 | 2 | 84 |
| Add return bridge, merging pairs | 100 | 1 | 4 | 4 | 82 |

Merge: one merge, no freed files, no eliminated group. Reverse: one split, no freed
files and no eliminated group. Tests also assert internal chords, newly cyclic vs
added files, freed vs deleted files, explicit rename identity, type normalization,
unknown/empty graph handling, reversed insertion, exact witnesses, consumer parity,
trend suppression and verify-change's unavailable result.

## G2 and G3: shuffled discovery and Bun

Each corpus was parsed five times, cache disabled, with seeded Fisher–Yates
perturbation of `fs.readdirSync` before dynamically importing the parser. All 15
parses had zero errorFiles. Membership, metrics and witness evidence are included
in the full JSON digest. A preliminary run was interrupted by rebuilding dist;
it was discarded and the complete 15-run gate rerun after the final build.

| Corpus | Runs | Directory reads/run | Unique cyclicGroups digests | Groups Node / Bun | Cyclic files |
|---|---:|---:|---:|---:|---:|
| code-graph | 5 | 209 | 1 | 0 / 0 | 0 |
| nest | 5 | 698 | 1 | 17 / 17 | 89 |
| drizzle | 5 | 232 | 1 | 11 / 11 | 272 |

Bun 1.4.2 macOS arm64 binary rebuilt using PR #48's unmodified
`spike/build-bun.ts` (retrieved from `origin/spike/bun-standalone`). Node 25.2.1 and
that binary each ran `health <corpus> --json`; their complete `cyclicGroups`
payloads agree on all three corpora. No binary is committed or offered for release.

Reproduce shuffled discovery after `npm run build`:

```sh
node recon/cyclic-groups-probe.mjs /tmp/nest-repro 1
# Repeat seeds 1 through 5 for each pinned corpus. Compare metricSHA256.
```

## G5: eight-repository health movement

Scores below are actual full-health calculations using the same saved graph and
source root before/after. Other five dimensions, including every raw metric and
detail string, compare exactly equal. The frozen code-graph corpus is main's source,
not this branch's newly added implementation files. Corpus commit identities and
phase-one provenance remain in CYCLIC-GROUPS-CONTRACT.md.

| Repository | Overall | Coupling | Cohesion | Old circular → cyclicGroups | God files | Orphans | Depth |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 71 → 71 | 70 → 70 | 60 → 60 | 100 → 100 | 60 → 60 | 89 → 89 | 40 → 40 |
| nest | 55 → 56 | 70 → 70 | 40 → 40 | 60 → 65 | 60 → 60 | 68 → 68 | 20 → 20 |
| drizzle | 34 → 34 | 10 → 10 | 40 → 40 | 20 → 20 | 60 → 60 | 69 → 69 | 40 → 40 |
| hono | 47 → 50 | 50 → 50 | 60 → 60 | 20 → 35 | 40 → 40 | 82 → 82 | 40 → 40 |
| express | 82 → 82 | 90 → 90 | 80 → 80 | 100 → 100 | 60 → 60 | 67 → 67 | 80 → 80 |
| zod | 58 → 64 | 90 → 90 | 40 → 40 | 60 → 88 | 60 → 60 | 45 → 45 | 20 → 20 |
| flask | 76 → 81 | 90 → 90 | 100 → 100 | 20 → 44 | 100 → 100 | 48 → 48 | 100 → 100 |
| fastapi | 65 → 69 | 90 → 90 | 40 → 40 | 60 → 84 | 80 → 80 | 41 → 41 | 60 → 60 |

Full before/after **all six dimension raw maps**, details, grades and methodology
are checked in at [CYCLIC-GROUPS-IMPLEMENTATION-EVIDENCE.json](CYCLIC-GROUPS-IMPLEMENTATION-EVIDENCE.json).
The old defective raw count is preserved there only as labeled historical evidence.

| Repository | Old cycle subset / per 100 files | New G / C / coverage % / L |
|---|---|---|
| code-graph | 0 / 0 | 0 / 0 / 0.0000 / 0 |
| nest | 59 / 3.4 | 17 / 89 / 5.1003 / 48 |
| drizzle | 622 / 70.3 | 11 / 272 / 30.7345 / 188 |
| hono | 86 / 24 | 6 / 80 / 22.2841 / 60 |
| express | 0 / 0 | 0 / 0 / 0.0000 / 0 |
| zod | 7 / 1.4 | 3 / 12 / 2.3529 / 5 |
| flask | 35 / 35.4 | 2 / 21 / 21.2121 / 19 |
| fastapi | 20 / 2.1 | 2 / 22 / 2.2587 / 15 |

Drizzle now reports 30.7345% cyclic coverage under approved policy A (not the
phase-one B view's 23.3898%). Its old dimension already hit the score floor of 20;
the new curve also yields 20, so unchanged overall health is a coincidence, not an
engineered invariant. Zero remains correct on the two acyclic corpus graphs.

## G6: graph contents unchanged

Full node and edge records sorted solely for comparison match main byte-for-byte
on all three corpora; this is stronger than matching counts. No parser, resolver,
serializer, graph-format or resolution-version source changed.

| Corpus | Graph nodes | Edges | SHA-256 of canonical node/edge records, main = branch |
|---|---:|---:|---|
| code-graph | 7353 | 3844 | `1c1d1935c848b6928996728cbedf4d1619d0d3225d5298cea432a3bfb7f3f75a` |
| nest | 18328 | 14961 | `5ee0cb44edc10959c2c7b45840a7e3165ed975819e963b0c4db759a1a4707b95` |
| drizzle | 31284 | 24181 | `f7c3c26d2f32c488a1c44d95d703745f51b81c7c99e4825cc5b5d2b3eeaa2463` |

Edge-kind counts and all five shuffled graph digests are in the evidence JSON.
`formatVersion` stays **2**, `RESOLUTION_VERSION` stays **5**. The new marker is
**`dimensions_v: 2026-09-30-cyclic-groups-v1`**. It versions derived health semantics,
not graph resolution. Local health history and generated docs suppress deltas
across differing/missing methodology markers and display the approved explanation.

## G7 and G8

Local `npm run build` then `npm test`, sequential: **40 files, 280 tests passed**.
The fixture corrections changed invalid `kind: import` to the real `imports` kind
and supplied a real graph to a security test. Existing assertions remain; the
old cycle-score tests were replaced with explicit approved coverage/concentration
assertions. Empty cyclic analysis is no longer asserted to score 100.

Ubuntu/Windows × Node 20/22: see PR #49's current-head CI checks (recorded after
push in the PR description). No local Windows claim is substituted for CI.
An exploratory standalone `tsc --noEmit` is not a repository gate and reports
existing parser/Graphology/MCP typing errors; the configured declaration build
passes. No unrelated typing cleanup was made.

Production-source legacy-field search (exit 1, no matches):

```sh
rg -n '\bcycles\s*[:=]|\.cycles\b|cyclesPer100|circularDepsIntroduced|circularDepsResolved|new_circular_dependencies' src
```

Ordinary prose about cycles, dependency-depth SCC condensation and historical
recon evidence are not old output fields. Five local duplicate detectors are gone;
security shares the same membership computation with an explicit witness anchor.

## Published consequences and release blockers

This is a Class F methodology change. Old nonzero subset counts are not reliable
simple-cycle totals; do not assert every published value was wrong. Acyclic zero
is valid and counts can coincide. README now explains the correction and API
compatibility change. Previously audited site/benchmark statements and Cloud
history must keep their provenance and be corrected where the defective metric
was actually used; unrelated graph quantities are unchanged.

- **Cloud rows: unresolved.** The prior read-only production audit failed with
  authorization 7403. Affected health_history row count is unknown, not zero.
  Recompute current health from compatible stored graphs only after reviewed
  authorization; historical rescoring needs matching historical graphs/source.
  The Cloud dimension mapping and methodology boundary must be updated separately.
- **SLM: yes, cycle-derived facts occur in seven current and v0.5-backup security
  pairs.** Exact released-adapter dataset lineage remains unverified; no claim
  that the shipped v0.5 weights are unaffected is justified. Resolve in the SLM
  session before public grounding claims or release. No data generation/training
  was performed here.
- Cloud's independent capped detector is tracked in
  [depwire-cloud #15](https://github.com/depwire/depwire-cloud/issues/15).
  GitHub Project placement could not be verified: current token lacks
  `read:project`; no auth permissions were changed.

These are pre-shipping blockers, not reasons to merge/deploy/write production.
This branch is implementation for review; release is still Atef's decision after
those blockers close. Resolver ambiguity and broad presentation ordering remain
separate work, untouched here.
