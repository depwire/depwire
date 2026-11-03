# Process-failure note: methodology tag changed inside implementation PR

**Status:** Retrospective process record, recorded 2026-11-04  
**Repo:** `/Users/atefataya/Developer/code-graph` (depwire-cli)  
**Scope:** A `dimensions_v` methodology tag was changed inside an implementation change, violating the contract-before-computation rule.

---

## 1. What happened

On 2026-10-04, PR #61 (`Python relative import completeness and TYPE_CHECKING split`, commit `8e0d62c0752b9cbd1611527edcb32a4e359a22fc`) changed the health methodology tag while also changing Python import capture and cyclic-group projection logic. The tag change was not a separate contract amendment; it was nested inside the implementation diff.

In `src/graph/cyclic-groups.ts` the diff shows:

```diff
-export const DIMENSIONS_VERSION = '2026-09-30-cyclic-groups-v1' as const;
-export const HEALTH_METHODOLOGY_CHANGE = 'Health methodology changed: Cyclic Dependency Groups now measures the share of files in mutually dependent groups and the size of the largest group. The previous cycle count was incomplete and order-dependent. Scores across this boundary are not directly comparable; no improvement or regression delta is shown.';
+export const DIMENSIONS_VERSION = '2026-10-04-python-typechecking-v1' as const;
+export const HEALTH_METHODOLOGY_CHANGE = 'Health methodology changed: Python TYPE_CHECKING imports no longer count as runtime dependencies. Older history may also use the prior cycle methodology. Scores across this boundary are not directly comparable; no improvement or regression delta is shown.';
```

And in the same file, the same commit added a Python-specific exclusion to the cyclic-group projector (lines 77–79 of the current file):

```diff
-      if (view !== 'legacy-normalized-dependencies-v1' || attrs.typeOnlyImport !== true || attrs.typeOnlyFallback === true) return;
+      if (view !== 'legacy-normalized-dependencies-v1' || attrs.typeOnlyImport !== true
+        || attrs.typeOnlyFallback === true
+        || (typeof attrs.filePath === 'string' && attrs.filePath.endsWith('.py'))) return;
```

The methodology marker moved from `2026-09-30-cyclic-groups-v1` to `2026-10-04-python-typechecking-v1` inside a PR whose title and commits describe only parser and classification fixes.

---

## 2. What the rule says

The repo's cyclic-groups contract records the governing rule in `recon/CYCLIC-GROUPS-CONTRACT.md`, section C6 — the project's recorded expression of the contract-before-computation rule for methodology changes:

> Proposed **`dimensions_v = '2026-09-30-cyclic-groups-v1'`** everywhere producing this health method. This follows Cloud's existing opaque descriptive-string convention, replacing `2026-08-16-member-call-resolution-v1.14.0` (`parser/src/parse.ts:74`), not an invented numeric dimensions-v2 counter. Retain `scoring_version = '2026-08-16-exclusions-v1.12.0'`: exclusions do not change. Expose dimensions_v in CLI/SDK health and carry it through Cloud/MCP, not only the Cloud adapter. **Later curve/view changes require a new marker.**

And on comparability:

> Machine comparison: different or unknown/null dimensions_v means not comparable unless legacy provenance is explicitly established. Return delta=null plus reason `health_methodology_changed`; split trend lines, suppress arrows and percentage deltas. No interpolation across the boundary.

The rule is: a methodology marker is a contract-level attribute; changing it must be reviewed and approved as a contract change before any implementation emits the new marker.

---

## 3. Why this failure matters

A methodology change retrofitted into an implementation change makes the implementation's result unauditable against the pre-change methodology. The result either silently uses the new methodology under the old name, or silently uses the old methodology inconsistent with the new name. Both are instances of the Depwire-dominant defect class: a decision happening silently, surfaced as a success rather than as a flag. In this case, PR #61's Python `TYPE_CHECKING` classification was correct, but the `dimensions_v` rename bundled with it meant there was no approved contract defining what `2026-10-04-python-typechecking-v1` computes, excludes, or compares against.

---

## 4. What should have happened

The methodology tag change should have been its own PR, reviewed independently, with its own contract amendment, before the implementation PR that used it. The sequence should have been: (1) propose a new `dimensions_v` marker and a contract describing its inputs, outputs, exclusions, and trend-boundary behavior; (2) get that contract reviewed and approved; (3) only then update code to emit the new marker.

---

## 5. Recorded corrective action

The gap is recorded retroactively in two contract documents:

- [Python TYPE_CHECKING dimensions contract](PYTHON-TYPECHECKING-DIMENSIONS-CONTRACT.md) — the RETROACTIVE inputs, outputs, exclusions, and methodology boundary.
- [Cyclic-groups contract](CYCLIC-GROUPS-CONTRACT.md) — Amendment 3 records the existing `.py` policy clause.

These records do not undo the code change; they record the contract that should have existed before it. Future methodology marker changes must follow the contract-before-computation sequence.
