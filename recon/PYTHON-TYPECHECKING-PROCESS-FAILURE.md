# Process-failure record: methodology approval and unexecuted Cloud CI tests

**Status:** Retrospective process record, recorded 2026-11-04
**Repo:** `/Users/atefataya/Developer/code-graph` (depwire-cli)
**Scope:** Two findings: a `dimensions_v` methodology tag changed inside an implementation PR before its contract existed, and the Cloud test workflow failed during setup without executing tests. The Cloud evidence below was inspected read-only through GitHub; this record does not change Cloud code.

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

---

## 6. Second finding: depwire-cloud CI never ran a test

**Scope of “never”:** all five available runs of `.github/workflows/test.yml`
inspected on 2026-11-04. This does not claim that developers never ran tests
locally or that no other workflow could run tests.

### Verified dates and run evidence

The workflow was added to main in
[`682e8bf3a59f946e75298ef5a5a428b2ebda245c`](https://github.com/depwire/depwire-cloud/commit/682e8bf3a59f946e75298ef5a5a428b2ebda245c)
on **2026-10-20 at 18:23:00 UTC**. GitHub's path-filtered main history reports
that addition; the commit file status is `added`.

The five available runs span **2026-10-20 18:24:55 through
2026-11-03 22:14:50 UTC**, or **October 20 through November 4 in Asia/Dubai
(UTC+04:00)**. This corrects the initially supplied November 1–4 date range:
the workflow and first failed run already existed on October 20. November 4 is
the local date of the latest observed run, not evidence of a UTC November 4 run.

| Run | Event | Created at (UTC) | Head SHA | Test result |
| --- | --- | --- | --- | --- |
| [39474512019](https://github.com/depwire/depwire-cloud/actions/runs/39474512019) | pull_request | 2026-10-20T18:24:55Z | `682e8bf3a59f946e75298ef5a5a428b2ebda245c` | Setup failed; both Vitest steps skipped |
| [41312308337](https://github.com/depwire/depwire-cloud/actions/runs/41312308337) | push | 2026-11-01T13:39:22Z | `21e5ff4fcceb0e392aca37efcae47482103f639e` | Setup failed; both Vitest steps skipped |
| [41314272715](https://github.com/depwire/depwire-cloud/actions/runs/41314272715) | push | 2026-11-01T14:03:42Z | `7fd1e7aa7759ef5f9c9fe904c6cb28c869a42cc0` | Setup failed; both Vitest steps skipped |
| [41529405319](https://github.com/depwire/depwire-cloud/actions/runs/41529405319) | push | 2026-11-02T21:33:23Z | `41c890f033069677a2cdc4b0276a74dbd18f19ae` | Setup failed; both Vitest steps skipped |
| [41729094359](https://github.com/depwire/depwire-cloud/actions/runs/41729094359) | pull_request | 2026-11-03T22:14:50Z | `286bc7c11d99292b2e44eddcb8ffba02c2a6a509` | Setup failed; both Vitest steps skipped |
| [41736349655](https://github.com/depwire/depwire-cloud/actions/runs/41736349655) | pull_request | 2026-11-03T23:05:42Z | `3ae284cc6bc067b618bf5c8651b3074a8b7d77d6` | Setup failed; both Vitest steps skipped |

For every run, both `api-test` and `frontend-test` failed at
`Run actions/setup-node@v4`. Their `Run npm ci`, `Run npx tsc --noEmit`, and
`Run npx vitest run` steps were skipped. Full logs for all five runs contain
no Vitest output and show the setup error:

> Some specified paths were not resolved, unable to cache dependencies.

### Cause and misleading assurance

The workflow configured `cache-dependency-path: api/package-lock.json` and
`cache-dependency-path: frontend/package-lock.json`. Neither file exists at
any of the five run head SHAs. The root `package-lock.json` exists; the root
package manifest declares `api` and `frontend` as workspaces. Setup therefore
failed before dependency installation or test execution.

The only successful job in this workflow was
`assert-era-c-stash-verify-present`. It ran `test -f` on
`api/src/routes/pr-review_era-c_disable.test.ts` and `grep -q` for `apiKey` and
`session-auth`. Those assertions establish file and text presence, not test
execution. A passing presence check is not evidence that the test suite passed.

### Corrective action and evidence needed to close

The fix is **pending** in [depwire-cloud PR #25](https://github.com/depwire/depwire-cloud/pull/25),
which was open when checked. This record does not mark the workflow fixed.
Closure requires successful dependency setup and actual Vitest execution/output
for both workspaces; neither a named test file nor a skipped test step suffices.

Verification used `gh run list --workflow test.yml`, each run's jobs API and full
logs, the main-branch commit history for the workflow, the addition commit's
patch, and GitHub tree/package-manifest reads. No Cloud checkout, local Cloud
filesystem access, workflow rerun, or Cloud write was performed.
