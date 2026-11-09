# verify-change verdict contract — approved 8 Nov 2026

Applies to local CLI JSON and local MCP `verify_change`; base `8b654da5c9dec6521f8fc0864905d400483d9689`. Implementation follows the approved ruling and Addenda 1–8.
Destination: /Users/atefataya/Developer/code-graph/recon/VERIFY-CHANGE-VERDICT-CONTRACT.md.
Authority: /tmp/depwire-recon/verify-change-ruling-ATEF-2026-11-08.md; option A in /tmp/depwire-recon/verify-change-366-375.md; corrections in /tmp/depwire-recon/vc-repro.md take precedence over that recon.
MUST/MUST NOT are normative requirements.

## 1. Verdict and precedence

1. Any failed REQUIRED STRUCTURAL analysis MUST return `safe:false`, `risk_level:"error"`, and a non-empty `error_reason`. This includes invalid input, malformed/unparseable diff, parser/topology failure and simulation throw. Error MUST take precedence over all structural risk levels; a warning or fallback MUST NOT erase failure or fabricate a clean result.
2. Otherwise, `high` MUST mean at least one broken import, or a compared topology with nonempty `newlyCyclicFiles`, `addedCyclicFiles`, or `groupsMerged`; `safe` MUST be false.
3. Otherwise, `medium` MUST mean a supported but incomplete structural comparison (`not_comparable`), including export-only edits, valid diffs without a fully resolved after-graph, unmatched/new graph paths, and an empty after-graph following last-file deletion; `safe` MUST be false. Actual parse/topology failures MUST use error, not medium.
4. Otherwise, `low` and `safe:true` MUST require valid input, successful structural analysis, a fully resolved after-graph representing the proposed change, a successful comparable cyclic-group result, no broken imports, and empty arrays for all three high-risk topology triggers. `safe:false` with `low` MUST NOT occur.
5. `safe` MUST mean only this structural assessment against the loaded graph. It MUST NOT promise runtime correctness, security, passing builds/tests, or complete source coverage. Existing cycles alone, blast radius, and warning count MUST NOT independently raise risk.
6. Health/security values, findings, status, reasons and their copies MUST be informational. No verdict or exit-code gate MUST read them, including indirectly through warning count. A health regression of any magnitude MUST NOT change a successful structural verdict. `--health-threshold` MUST be removed from parsing, types and help, not retained as ignored/deprecated.

Informational operations MUST NOT set the verdict, including by crashing. A health scorer crash MUST set all three health scores to null, health_status to "error", and a nonempty health_reason. A security scan crash MUST set security_findings to null, security_status to "error", and a nonempty security_reason. Either crash MUST set partial:true; safe, risk_level, and exit code remain determined by structural analysis. Crashed sections MUST NOT fabricate [] or 0.

Exactly one typed input mode MUST be accepted: nonempty file path plus string content (including empty content for deletion), OR nonempty syntactically valid unified diff. Conflicting modes and wrong runtime types MUST be rejected. A valid unmatched path/intentional empty graph remains medium; missing required parser, reported parse errors, invalid topology, and malformed diff are errors. Unsupported patch syntax MUST fail explicitly rather than be treated as an empty patch. No new full-diff application capability is required.

## 2. Failure inventory at the pinned base

These are source paths, not claims that every exception was reproduced naturally. Each required-analysis failure below MUST reach the error envelope; expected limitations are identified separately. An outer boundary MUST also normalize unexpected exceptions, retaining stage and cause in `error_reason`.

| Path and evidence | Required treatment |
|---|---|
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:184, :189, :198; /Users/atefataya/Developer/code-graph/src/graph/paths.ts:28 | Argument access/type/path normalization failures and missing input currently throw or return high with zeros: error; no invented health. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:86, :196 | Header-only regex accepts malformed text, ignores hunks/deletion semantics, can return no paths; non-string diff can throw at split. Validate diff and reject malformed/unparseable input as error. |
| /Users/atefataya/Developer/code-graph/src/commands/verify-change.ts:27, :75, :86, :97, :102, :111 | Missing mode, diff/content-file read error, stdin read error or absent content: error. Partial stdin MUST NOT be verified. Empty explicit replacement content MUST remain distinguishable from absent input. |
| /Users/atefataya/Developer/code-graph/src/commands/verify-change.ts:34, :37, :38; /Users/atefataya/Developer/code-graph/src/utils/files.ts:35, :73 | Root resolution, directory/file inspection, project parse and graph-build failures: error. |
| /Users/atefataya/Developer/code-graph/src/parser/index.ts:72, :89, :171, :180, :183 | Grammar initialization and per-file I/O/parser failures can become `errorFiles`; JVM discovery errors are logged. Required-analysis failures MUST NOT disappear when CLI builds a graph from partial results. |
| /Users/atefataya/Developer/code-graph/src/parser/index.ts:53, :175; /Users/atefataya/Developer/code-graph/src/graph/index.ts:141 | Oversize/no-parser skips and dropped unproven edges expose coverage limits. A required changed-file parse failure is error; declared partial coverage cannot earn safe. Ordinary configured exclusions are not automatically failed analysis (O2). |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:237, :267, :271, :275, :277, :282; /Users/atefataya/Developer/code-graph/src/parser/wasm-init.ts:47, :55, :87, :96, :100 | WASM/grammar failure, parser selection failure, parse exception or removed-export/dependent-query exception: error. Conservative deletion fallback MUST NOT conceal the original failure. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:130, :132, :139, :144, :258, :287, :298 | Simulation or result extraction throws are swallowed into null in genuine deletion, parse fallback, and unified-diff paths. All MUST produce error; never retain before as after. |
| /Users/atefataya/Developer/code-graph/src/simulation/engine.ts:149, :150, :151, :464; /Users/atefataya/Developer/code-graph/src/health/metrics.ts:192 | Simulation diff/scoring can fail, including unavailable cyclic topology. The explicit engine throw at :367 is split-only, not a demonstrated delete trigger. O1 applies to isolated informational failures; structural failure always errors. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:254, :256; /Users/atefataya/Developer/code-graph/src/graph/cyclic-groups.ts:67, :74, :152, :161, :166, :168 | Graph copy/drop/comparison failure; missing filePath/unknown dependency kind become unavailable; comparison can hide that under not_comparable. Inspect nested statuses: unavailable/error MUST yield error. Partial coverage/no_graph_files are limitations, not successful comparisons; invalid rename identities fail if ever supplied. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:107, :165, :312, :325, :330 | Graph lookup, dependent/impact traversal, deduplication and path normalization exceptions MUST reach the boundary, not become empty evidence. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:225; /Users/atefataya/Developer/code-graph/src/health/index.ts:27, :52, :74, :178; /Users/atefataya/Developer/code-graph/src/health/metrics.ts:193 | Before scorer can throw; empty graph and last-file after-score can be NaN. Nonfinite scores MUST become explicit null/unavailable, never clean zero. Expected no-score is not itself a structural failure; thrown scorer failures set null scores, health_status:"error", a reason and partial:true without changing the structural verdict. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:337, :351; /Users/atefataya/Developer/code-graph/src/security/scanner.ts:34, :44 | Security parse errors/no parseable target/scan throws currently become warnings. Preserve explicit unavailability, never infer a clean scan from []; scan crashes set null findings, security_status:"error", a reason and partial:true without changing the structural verdict. |
| /Users/atefataya/Developer/code-graph/src/core/verify-change.ts:243 | Unmatched path currently skips analysis. It MUST NOT produce fabricated after/delta; valid-new-path limitation is medium, not proof of safety (O2). |
| /Users/atefataya/Developer/code-graph/src/mcp/tools.ts:670, :794, :802; /Users/atefataya/Developer/code-graph/src/index.ts:895 | No loaded project, dispatch/normalization/core/serialization exceptions currently use unrelated error shapes or stderr-only exit. Local verify-change failures MUST expose the same verdict error envelope (O6). |

The injected simulation failure reproduced low/safe with a warning and fabricated zero; no natural delete throw was found. Malformed diff reproduced medium/false with fake unchanged health. Last-file deletion reproduced medium/false with NaN. These MUST NOT be described as three naturally reproduced safe escapes.

## 3. Complete local JSON/MCP payload

All top-level fields below MUST be present. Unless marked nullable or optional, fields MUST NOT be null/omitted. Numbers MUST be finite; counts MUST be nonnegative integers. Arrays MUST never be null except security_findings, coverage_gaps and skipped_files under their explicit null rules. On error they contain only known evidence, possibly empty, and MUST NOT imply completed analysis.

| Field | Type and meaning/null rule |
|---|---|
| `safe` | boolean; exactly `risk_level === "low"`. |
| `risk_level` | `"low" | "medium" | "high" | "error"`; precedence in §1. |
| `error_reason` | string or null; nonempty stage/cause on error, null otherwise. No stack trace required; unknown thrown values MUST still yield a nonempty reason. |
| `broken_imports` | array of `{file:string, missing_symbol:string, reason?:string}`; reason may be omitted, never null. Deduplicate canonical file/symbol pairs. |
| `dimensions_v` | string; scorer/topology methodology version, currently `2026-10-04-python-typechecking-v1`; not nullable, including errors. |
| `cyclicGroupChanges` | non-null union specified below; MUST NOT invent compared results after failure. |
| `health_score_before`, `health_score_after`, `health_score_delta` | each number or null; finite legitimately computed scores only; delta is after minus before under §4, otherwise null. |
| `health_status` | `"computed" | "unavailable" | "not_applicable" | "error"`; comparison availability, not a verdict. |
| `health_reason` | string or null; null iff computed; otherwise nonempty explanation of which score/comparison was not computed and why. |
| `security_findings` | array of `{severity:string, description:string, file:string, line:number}` or null; null iff security_status is not computed; line is nonnegative integer, 0 means unknown location, not an uncomputed health score. Existing scan covers files on disk, not certified proposed content. |
| `security_status` | `"computed" | "unavailable" | "not_applicable" | "error"`; informational scan availability. |
| `security_reason` | string or null; null iff computed, otherwise a nonempty reason. |
| `partial` | boolean, always present; true iff health_status or security_status is "error". Structural coverage limits do NOT set it. Completeness requires partial:false AND coverage_gaps:[] (not null). |
| `affected_files` | canonical, deduplicated, sorted string array of known changed/impacted files. |
| `coverage_gaps` | array of `{file:string, reason:string}` or null; affected-file syntax gaps, with completion/null rules below. |
| `skipped_files` | array of `{file:string, reason:string}` or null; loader skip records explaining a null coverage_gaps. Always present once the project census ran (possibly `[]`); null when the census did not run, including error envelopes. Structural: never copied into unrelated_context. Reasons come from the parse loader's four skip branches (oversized, path containment, configured exclusion, no parser). |
| `syntax_errors_outside_affected_set` | nonnegative integer or null; count of files with syntax errors outside affected_files, with completion/null rules below. |
| `syntax_check` | `"checked" | "not_applicable" | null`; changed-file syntax check, with completion/null rules below. |
| `blast_radius` | nonnegative integer, exactly affected_files.length; on error only the known count, not a completeness claim. |
| `warnings`, `relevant_warnings` | string arrays; warnings explain limitations/context; relevant_warnings concerns this change. Preserve current equal copies for this correction (O3); neither count gates verdict. |
| `unrelated_context` | non-null object containing `note:string`, exact copies of all three nullable health fields, health_status, health_reason, security_findings, security_status, security_reason, and partial; no divergent copies. |

`unrelated_context.note` MUST state: “Health score and security findings are informational and do NOT affect the safety verdict.” A missing/failed scan MUST be identified in warnings; [] MUST NOT be presented as a completed clean scan when unavailable.

Health `computed` means both scores and their valid delta exist; `unavailable` means a meaningful comparison was requested but cannot be computed; `not_applicable` means invalid input/no admissible change, with all three health fields null. A finite before-score MAY remain on unavailable comparisons; it MUST NOT be copied into after. Security `computed` means a completed scan, `unavailable` means no usable scan, `not_applicable` means no admissible change, and `error` means a crashed scan. An unavailable or not-applicable scan MUST be null, never []. Both sections use `error` for crashes with the null rules in §1. The warning alias and all other array shapes remain unchanged.

Nested cyclic schema MUST preserve the pinned contract from /Users/atefataya/Developer/code-graph/src/graph/cyclic-groups.ts:6, :14, :18, :158:

- Minimal not-comparable object: `{status:"not_comparable", reason:string}`; reason MUST be nonempty.
- Full comparison includes `contractVersion:"cyclic-groups-v1"`, `dimensions_v:string`, `edgeView:"legacy-normalized-dependencies-v1"|"value-dependencies-v1"|"all-dependencies-v1"`, and `before`/`after` result objects. All are non-null. On not_comparable these full fields may be absent as a group when no comparison ran; change arrays MUST be absent, not fabricated.
- Each before/after result includes that identity plus `sourceCoverage:"complete"|"partial"|"unknown"`. An `analyzed` result includes numeric `graphFileCount`, `groupCount`, `cyclicFileCount`, `cyclicFileRatio`, `largestGroupSize`, `score:number|null`, and `groups:Group[]`. Score is null for an unscored edge view; ratio is finite in [0,1].
- A `no_graph_files` or `unavailable` result instead has `score:null` and nonempty `reason:string`; analyzed-only counts/groups are absent. Unavailable MUST propagate error, not merely the medium floor.
- `Group` is `{key:string,files:string[],size:number,witness:{files:string[],edges:Evidence[]}}`. Evidence is `{sourceFile:string,targetFile:string,sourceSymbol:string,targetSymbol:string,kind:string,line:number|null,normalizedTypeOnlyImport:boolean}`; line is null if unknown. No other field here is nullable.
- A `compared` result MUST have both analyzed snapshots and these non-null arrays: `newlyCyclicFiles`, `freedFiles`, `addedCyclicFiles`, `removedCyclicFiles`, `groupsFormed`, `groupsEliminated` are string[]; `groupsMerged` entries are `{beforeKeys:string[],afterKey:string}`; `groupsSplit` entries are `{beforeKey:string,afterKeys:string[]}`.
- `membershipsChanged` entries are `{beforeKey:string,afterKey:string,addedMembers:string[],removedMembers:string[]}`; `internalEdgesChanged` entries are `{beforeKey:string,afterKey:string,addedFileEdges:string[][],removedFileEdges:string[][]}` with each inner array a source/target pair. These arrays MUST be present on compared, including when empty.

### Syntax coverage and persistence (Addendum 5)

- I1 — **approved (Atef, Addendum 6)**: The affected set is exactly the existing affected_files set. Changed-file syntax errors remain error; syntax errors in other affected files create coverage_gaps entries with canonical file and a reason including the first error's file:line and node text.
- I2 — **approved (Atef, Addendum 6)**: Precedence is error > high > medium > low. An affected syntax gap raises low to medium only, never lowers high or overrides error. Non-error results keep error_reason:null. coverage_gaps is structural, is not copied into unrelated_context, and does not set partial.
- I3 — **approved (Atef, Addendum 6)**: syntax_errors_outside_affected_set is always present: a real integer count of files, only when the project syntax census completed; null when unavailable or incomplete, including oversized/skipped files. Warnings identify skipped files. Outside-set syntax errors do not affect the verdict. coverage_gaps is always present: null whenever the affected-set check did not complete (including early errors); [] only for a completed check with no gaps. **Addendum 7/D2 amendment**: coverage_gaps is null whenever any project file was skipped for an oversized, path-containment, or no-parser-on-a-supported-extension reason; configured exclusions and no-parser skips on unsupported extensions are listed in skipped_files only and do NOT null it. (A no-parser skip on a supported extension cannot arise: grammar-initialization failure short-circuits before the parse loop and getParserForFile is static extension matching.)
- I4 — **approved (Atef, Addendum 6)**: syntax_check is always present: checked only when changed-file checking completed, not_applicable for pattern/manifest branches, null when it could not complete. Stored parsed-file records carry enumerable syntaxCheck and syntaxErrors: checked pairs with an array ([] only when checked and clean); not_applicable pairs with null, present rather than omitted. Diagnostics follow the symbol-producing parse under Addendum 4.

canonicalParsedFile and SQLite MUST preserve these real fields. Increment the existing RESOLUTION_VERSION from 13 to 14 so old rows rebuild; absent metadata MUST NOT mean clean. Only verify-change interprets syntax metadata. Other consumers' serialization may change ONLY by adding syntaxCheck/syntaxErrors on parsed-file records; buildGraph, health, simulate and other CLI/MCP output remain byte-identical except the new verdict fields.

## 4. Health computation and history

Atef’s 21:26 decision (Addendum 2): simulate() MUST offer an opt-in option that skips internal health scoring entirely (never calling or catching computeHealthScore) and returns only structural results. verify-change MUST use this option and call workspace-aware calculateHealthScore once per state with history disabled. With the option absent, engine output MUST remain byte-identical to the pinned base, verified against fixed-fixture golden outputs captured before the engine edit.

Before and after MUST use the same scorer, weights, exclusions, edge normalization and dimensions version. Delta MUST describe the actual proposed after-state, not a substitute full-file deletion or the last of multiple independent simulations.

The required scorer is workspace-aware `calculateHealthScore` from /Users/atefataya/Developer/code-graph/src/health/index.ts:22, :48, :78 for BOTH graphs, with equivalent before/after workspace context and history disabled. Reject mixing it with SimulationEngine's graph-only scorer at /Users/atefataya/Developer/code-graph/src/simulation/engine.ts:464. If a faithful after-state/context cannot be supplied, after and delta MUST be null/unavailable.

Verifier item 3 measured workspace before 93, engine before/after 91, and actual reparsed workspace after 97: old -2 versus same-workspace-method +4; engine-only delta was 0. Item 2's valid unified diff really computed -2 using a conservative deletion, refuting “diff never computes an after-score.” A valid diff's delta MUST now be recomputed under the single selected method on its actual after-state OR reported unavailable; preserving -2 is not an acceptance criterion.

| Case | Before | After / delta | Status |
|---|---|---|---|
| Fully computed comparable health | finite computed score | finite computed score / actual subtraction (including genuine 0) | computed |
| Export-only edit, unmatched valid path, valid diff without faithful after-state | finite if actually computed, else null | null / null | unavailable |
| Invalid input or malformed/unparseable diff rejected before scoring | null | null / null | not_applicable |
| Last-file deletion/no score for empty after-graph | finite if actually computed, else null | null / null | unavailable |
| Required structural simulation failure | finite before only if independently completed, else null | null / null | unavailable; verdict error |
| Health scorer crash | null | null / null | error; nonempty reason; partial:true; structural verdict unchanged |
| Security scan crash | health unaffected unless it also crashes | security_findings:null | security_status:error; nonempty reason; partial:true; structural verdict unchanged |
| Empty baseline/nonfinite result/scoring unavailable | null for each uncomputed/nonfinite score | delta null; never infer unchanged | unavailable |

All null rules apply identically to unrelated_context. Uncomputed MUST NOT be 0, NaN, Infinity, undefined, or a numeric string in memory, JSON, MCP or human output. Formatting MUST check availability before arithmetic/toFixed and render unavailable/error with a reason, not “unchanged.”

verify-change MUST NOT write health history at all: neither original before scores nor simulated/actual after scores, on success or failure. Verifier item 4 establishes that the old path writes ORIGINAL before scores via /Users/atefataya/Developer/code-graph/src/health/index.ts:178; SimulationEngine is side-effect free. The recon/ruling item-key framing “every run writes simulated scores” is false. This rule deliberately removes the actual before-history side effect; it is not merely a fix for hypothetical simulated-history pollution. Other scorer callers retain their existing persistence behavior.

## 5. CLI/MCP and compatibility

`--fail-on-warnings` MUST retain its name until a major release. Existing successful-analysis exit semantics MUST remain: without flag, low/medium/high exit 0; with flag, low exits 0, medium 1, high 2. Warning presence MUST NOT affect exits (/Users/atefataya/Developer/code-graph/src/commands/verify-change.ts:60). Help MUST explain risk-based behavior, not promise failure on every warning.

Required structural analysis error exits 1 with or without flag, preserving operational-error convention; CLI --json MUST print the full error payload even for input/load failures. MCP MUST return `{content:[{type:"text",text:string}]}`, with text containing the identical JSON payload and no alternate error-only shape; no new isError field is proposed. Human/quiet output MUST show error and error_reason. Exact help: “Exit 1 on medium risk and 2 on high risk; warning count is ignored. Analysis errors always exit 1.” This extends the existing three-risk behavior only for error; informational errors and partial never alter exits.

The command retains existing rejection behavior (including stdin failure without verifying truncated content); the outer CLI commander action catches rejections, renders the complete error envelope, and exits 1, preserving existing rejection assertions unchanged.

v1.29.0 MUST ship this as an explicit corrective contract migration, not docs-only or silently backward compatible. Numeric-to-nullable and enum expansion can break unguarded external clients despite the minor release choice already approved by Atef.

The verifier's consumer audit found NO consumer of CLI verify-change output in depwire-action or depwire-cloud. Cloud dispatches its separate implementation at /Users/atefataya/Developer/depwire-cloud/api/src/mcp/server.ts:438; Action invokes health at /Users/atefataya/Developer/depwire-action/src/depwire.ts:142 (parse at :69). This is bounded evidence from the recorded revisions, not proof about every external consumer.

Required CHANGELOG wording:

> ## v1.29.0 (Unreleased) — verify-change corrective contract migration
>
> Local CLI/MCP verify-change now uses a structural-only safety verdict. Health and security fields are informational and are not verdict or exit-code gates. The unused --health-threshold option has been removed. --fail-on-warnings retains its risk-based behavior and name; its help text now describes that behavior.
>
> JSON/MCP health_score_before, health_score_after and health_score_delta, including their unrelated_context copies, change from number to number | null. Uncomputed scores and deltas are null, never fabricated zero or NaN; health_status and health_reason explain availability. Computed comparisons use the same workspace-aware scorer for both states; a diff without a faithful scored after-state reports unavailable health. verify-change no longer writes health history, including original before scores.
>
> security_findings changes from array to array | null, including its unrelated_context copy. New security_status, security_reason, and partial fields explain scan availability and informational failures, with identical unrelated_context copies. health_status and security_status include "error": a crashed health scorer yields all health scores null, and a crashed security scan yields null findings, never []. Both provide nonempty reasons and set partial:true without changing the structural verdict or exit code. partial is true iff either informational status is "error"; structural coverage limits do not set it.
>
> risk_level adds "error". Any failed required structural analysis, including invalid input, malformed/unparseable diffs, parser/topology failures and simulation failures, returns safe:false, risk_level:"error" and a non-empty error_reason; successful-analysis results use error_reason:null. Analysis errors exit 1 regardless of --fail-on-warnings. Clients must handle nullable health and security fields and expanded status/risk enums. Structurally low results previously raised to medium solely by health regression can now return safe:true and exit 0 with --fail-on-warnings. Unsupported topology comparisons remain unsafe and at least medium unless analysis fails, which is error. This correction applies to local CLI/MCP, not Cloud's separate verify_change implementation or Action's health-report pipeline.

> Syntax diagnostics now persist through canonicalization and the versioned parse cache. New structural coverage_gaps, syntax_errors_outside_affected_set and syntax_check fields distinguish affected-file syntax gaps, outside-set errors and changed-file checking. Uncomputed checks/counts are null; pattern/manifest checks are not_applicable. Changed-file syntax errors remain error; other affected syntax errors impose a medium floor without lowering high; outside-set errors do not change the verdict.

## Limitations

tree-sitter recovery can flag valid syntax beyond the grammar; error_reason shows where.

Pattern-based parsers (Mojo, Dart, R, HTML) and manifest/build-file branches (CMakeLists.txt, conanfile.txt, vcpkg.json, .csproj, Maven/Gradle, Gemfile, Package.swift) perform no syntax check; a syntax error there cannot yield error and the verdict stays as structural analysis decides.

Nonstandard `diff --git` headers that git accepts are not malformed. Overlapping hunks and patch apply-ability are outside this correction's scope; both verifier diff cases stay medium because a faithful after-graph is unavailable, not because required analysis failed.

Required changed-source syntax errors MUST produce error with file:line and the first ERROR/MISSING node text (sensibly truncated). Diagnostics MUST follow the parse that produced symbols: original outside recovered fragments, normalized re-parse within recovered fragments. Recovery MUST NOT discard unrelated original-file errors. Only verify-change acts on the additive syntaxErrors metadata; other consumers retain their output except the explicitly permitted parsed-file metadata additions in §3.

## 6. Acceptance and scope

Implementation MUST verify: injected simulation failure; parser and topology failure; malformed diff/invalid input; CLI input I/O and MCP no-project errors; export-only/unmatched/last-file health nulls; exact top-level/context parity; genuine computed zero; single-method before/after and valid-diff unavailable handling; health/security value independence; risk-based exit matrix; removed threshold; no history creation or modification. Also verify health crash with safe unchanged and partial:true; security crash with null findings, never []; both crashing together; and an outer CLI stdin-failure envelope with exit 1 while the existing command-rejection assertion remains unchanged. Other health callers MUST retain persistence, proven by tests.

Addendum 5 acceptance: cache round-trip; byte-identical cache-hit/cache-miss output; version-13 rows rebuild; broken affected non-changed file cannot reach low; outside-set broken file preserves verdict and counts one; pattern/manifest changes report not_applicable; no-project MCP and stdin-failure envelopes have null syntax_check, coverage_gaps and outside count; oversized/skipped files leave incomplete counts/checks null and identify skipped paths in warnings. Preserve pre-edit consumer goldens except the exact parsed-record field additions, reporting the exact diff.

Out of scope: Cloud's separate verify_change heuristic; Action formatDelta and its HealthReport pipeline; rename of --fail-on-warnings before a major; redesign of cyclic-group or general health metric internals; new full-diff graph reconstruction. The error contract MUST NOT be deferred merely because a failure was previously swallowed.

Approval order MUST remain: verifier reproduction → Atef approves this contract and resolves O1–O6 → writer implements and cites it → verification → Atef merges. The approved contract is committed separately before implementation.

## Decisions (Atef, 8 Nov 2026)

- O1: Only required structural failures set the error verdict. Informational crashes set section null/error/reason and partial:true without changing safe, risk_level, or exits.
- O2: Exactly one typed input mode; malformed/unsupported diffs and required parser/topology failures are errors; valid unresolved after-states remain medium.
- O3: error_reason and health statuses/reasons are approved; security_status/security_reason mirror health, with error added to both enums and security_findings nullable. Exact context copies include partial; its iff-error interpretation is confirmed by Addendum 2.
- O4: Both scores use workspace-aware calculateHealthScore with equivalent context and history disabled; no mixed scorer or substitute after-state.
- O5: verify-change writes no history on any path; other callers retain persistence.
- O6: Required structural errors exit 1 and use the complete CLI/MCP payload; successful risk exits and the flag name remain, with the exact help text in §5. Existing rejection assertions stay intact through outer-boundary normalization.

- Addendum 2 (Atef, 21:26): approve the opt-in structural-only simulation option in §4 with default output unchanged; confirm partial is true only for informational status "error", never unavailable/not_applicable.

- Addendum 3 (Atef, 8 Nov 22:40): add syntaxErrors to the 13 tolerant tree-sitter source branches only; preserve manifest/build-file and pattern-based branches. Only verify-change interprets the metadata. Prove other consumer outputs unchanged with pre-edit goldens and exercise natural syntax failures through core/CLI/MCP. The two verifier diff cases remain medium for the reasons in Limitations.
- Addendum 4 (Atef, 9 Nov 00:32): diagnostics follow the symbol-producing parse, including normalized TypeScript recovery; retain diagnostics outside recovered fragments. Test valid recovered exports, a genuinely broken rewritten export, and a valid recovered export alongside an unrelated syntax error. The pattern/manifest limitation was subsequently confirmed in Addendum 5.

- Addendum 5 (Atef, 9 Nov 01:01): persist enumerable syntax metadata through canonicalization and the versioned SQLite cache; changed-file errors remain error, affected-file errors impose a medium floor, and outside-set errors are counted without affecting the verdict. Confirm pattern/manifest not_applicable and retain the limitation. Manager interpretations I1–I4 in §3 include the subsequent approved null rules and were approved in Addendum 6.

- Addendum 6 (Atef, 9 Nov 01:50): approve I1–I4 and per-check completeness. Completeness requires partial:false AND coverage_gaps:[] (not null). An oversized non-changed file inside affected_files makes coverage_gaps null; syntax_check retains its independently completed result and the outside census follows I3. RESOLUTION_VERSION 13→14 invalidates cached metadata only; resolution behaviour is unchanged.

- Addendum 7 (Atef, 9 Nov 09:38): implement now. coverage_gaps null when any file was skipped, plus skipped_files:[{file, reason}] from the loader's skip info so the null is explicable. Tests run through the real built CLI and a fresh MCP load with no prepared graph; the prepared graph is removed from the existing test. Item (c) (unparsed files as marked graph nodes) is queued for a contract-first PR after v1.29.0; item (b) (second parse path) is rejected.

- Addendum 8 (Atef, 9 Nov 09:41): D1 — the loader records `{file, reason}` at its four skip branches, returned beside errorFiles; graph/health/simulate outputs stay byte-identical (the only permitted golden diff is the new metadata on parseProject's return). D2 — coverage_gaps is null for oversized, containment, and no-parser skips on a SUPPORTED extension; configured exclusions and no-parser skips on unsupported extensions are listed in skipped_files only and do NOT null it. The writer determined that a no-parser skip cannot fire for a supported extension: grammar-initialization failure returns before the parse loop (src/parser/index.ts init guard) and getParserForFile (src/parser/detect.ts:44) is static extension/filename matching over registered parsers. No failure path; no stop required.
