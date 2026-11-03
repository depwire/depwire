# Python TYPE_CHECKING boundary — retroactive dimensions_v contract

## `2026-10-04-python-typechecking-v1`

**RETROACTIVE — this contract was written after the computation it describes. It is not a prospectively approved contract.**

The computation that emits `dimensions_v = '2026-10-04-python-typechecking-v1'` was implemented on 2026-10-04 before this contract existed. This document makes that computation's contract explicit after the fact and closes the contract-before-computation gap.

**Record date:** 2026-11-04. Verified against main `170896340327245d8785fb725e186ad68c7a91bf`.

## C1. What this methodology marker labels

`dimensions_v = '2026-10-04-python-typechecking-v1'` labels health and cyclic-group analyses that incorporate the Python `TYPE_CHECKING` split. Specifically, it labels analyses where Python imports guarded by `TYPE_CHECKING` are treated as type-only references and are excluded from the runtime dependency view used for cyclic-group detection and for the overall health score.

The marker replaces the previous methodology marker `2026-09-30-cyclic-groups-v1` for all projects parsed with the new Python classification. Scores or cyclic-group results produced under the two markers must not be compared directly.

## C2. Inputs

The computation accepts the same inputs as the `cyclic-groups-v1` analyzer, operating on a directed symbol graph produced by `parseProject` and `buildGraph`:

- A `graphology` `DirectedGraph` whose nodes carry a canonical, project-relative `filePath` attribute.
- Edge attributes with at least `kind`, `line`, and for type-reference edges `typeOnlyImport`, `typeOnlyFallback`, and `originalImportTarget`.
- An optional `edgeView` selecting one of:
  - `legacy-normalized-dependencies-v1` (default)
  - `value-dependencies-v1`
  - `all-dependencies-v1`
- An optional `sourceCoverage` value of `complete`, `partial`, or `unknown` (default `unknown`).

The graph is expected to have been parsed with `RESOLUTION_VERSION >= 10`, the first resolution version that emits the new Python `references-type` / `typeOnlyImport` classification.

The `.py` exclusion tests the edge attribute `filePath` in both projections; callers supplying graphs directly must preserve that source-file metadata.

## C3. Outputs

The computation emits the shared `CyclicGroupsResult` type defined in `src/graph/cyclic-groups.ts`, with these identity fields:

```ts
{
  contractVersion: 'cyclic-groups-v1';
  dimensions_v: '2026-10-04-python-typechecking-v1';
  edgeView: 'legacy-normalized-dependencies-v1' | 'value-dependencies-v1' | 'all-dependencies-v1';
  sourceCoverage: 'complete' | 'partial' | 'unknown';
  // ... followed by the analyzed / no_graph_files / unavailable shape from cyclic-groups-v1
}
```

The full health report carries the same marker:

```ts
{
  dimensions_v: '2026-10-04-python-typechecking-v1';
  cyclicGroups: CyclicGroupsResult;
  // ... remaining HealthReport fields
}
```

When a previous health-history entry has any other `dimensions_v` value, the trend comparison returns the methodology-change message:

> Health methodology changed: Python TYPE_CHECKING imports no longer count as runtime dependencies. Older history may also use the prior cycle methodology. Scores across this boundary are not directly comparable; no improvement or regression delta is shown.

## C4. Scope and exclusions

This contract covers **only** the following:

- The `dimensions_v` methodology marker itself.
- The rule that Python `TYPE_CHECKING` imports are classified as `references-type` with `typeOnlyImport === true` and are excluded from the runtime health/cyclic-group view.
- The companion rule that `.py` files do not receive legacy type-only import normalization in the `legacy-normalized-dependencies-v1` view (see Amendment 3 in [the cyclic-groups contract](CYCLIC-GROUPS-CONTRACT.md)).

This contract does **not** cover:

- Parser resolution of absolute `from package import Name` in Python, which remains at its pre-existing boundary.
- Classification of type-only imports in languages other than Python.
- The scoring curve, group-definition, witness-selection, or comparison semantics of cyclic-groups analysis; those remain governed by the `2026-09-30` cyclic-groups contract.
- Changes to dimension scoring formulas. The shared health projection also excludes these Python type-only edges before calculating the other health dimensions.
- Retroactive rescoring of previously stored health history. Historical rows keep their original methodology marker.
- Any future edge view or scoring change that would require a new `dimensions_v` value.

## C5. Implementation commit and retroactive status

The uncontracted computation was introduced in commit `8e0d62c0752b9cbd1611527edcb32a4e359a22fc` (`Python relative import completeness and TYPE_CHECKING split (#61)`, 2026-10-04 12:41 +0400). The same marker and `.py` exclusion were also present in the earlier fix commit `081b5a727ebbffcf1f4869d0b9fb490e8bbdaa68` (`fix: keep Python TYPE_CHECKING edges out of runtime health`, 2026-10-04 02:03 +0400), whose changes were subsumed by PR #61. Commit `8e0d62c0752b9cbd1611527edcb32a4e359a22fc` is in `origin/main` history; `081b5a727ebbffcf1f4869d0b9fb490e8bbdaa68` is available locally but is not an ancestor of `origin/main`. The latter is implementation provenance, not a second mainline introduction.

**Why this is retroactive:** on 2026-10-04 the implementation changed `DIMENSIONS_VERSION` from `2026-09-30-cyclic-groups-v1` to `2026-10-04-python-typechecking-v1`, added the `.py` exclusion in the cyclic-group projector, and classified Python `TYPE_CHECKING` imports as type-only, all before any contract was registered for that marker. This document is written afterward to record the inputs, outputs, and scope of the computation that was already shipped in code.

## C6. Versioning and trend boundary

- `dimensions_v` value: `2026-10-04-python-typechecking-v1`.
- `contractVersion` for cyclic groups remains `cyclic-groups-v1`.
- `formatVersion` remains `2`; stored graphs load but must be reparsed to gain the corrected Python classification.
- The implementation in PR #61 moved `RESOLUTION_VERSION` from `9` to `10` because parsed edge contents and diagnostics changed. Current main uses `13`; this historical contract does not reset that value.

A trend boundary must be enforced whenever `dimensions_v` differs between two health history entries. Return the methodology-change message, suppress numeric deltas, and split the trend line. Do not interpolate or compare across the boundary.
