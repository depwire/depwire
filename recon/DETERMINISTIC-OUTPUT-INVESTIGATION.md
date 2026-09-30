# Deterministic output: phase-one investigation

Status: investigation only; **no production fixes applied**. Branch
`fix/deterministic-output`, based on `origin/main` / v1.21.2 / `28ec599`.
The cycle metric decision below is pending. This is not a completed G1–G8 report.
No merge, release, deployment, package/version change or remote write was made.

Read first: PR #48's `recon/BUN-STANDALONE-SPIKE.md` from
`origin/spike/bun-standalone`. Its measurements are the starting evidence, not
recomputed Bun results. The requested repository connector methods are not
available in this session; source and installed SDK were inspected directly.

## I1 — Node-only reproduction

Node **25.2.1**, actual installed registry `depwire-cli@1.21.2` SDK from the
spike's `/tmp/depwire-bun-spike/node_modules`. `parseProject(root,
{useCache:false})`, then `buildGraph` and `calculateHealthScore`. Two independent
processes: original `fs.readdirSync`, versus its returned array reversed before
the parser imports. `syncBuiltinESMExports()` propagates the shim to named ESM
imports. Nothing about the parser implementation was changed. No Bun used.

| Corpus | Revision | Nodes | Edges | Forward cycles | Reverse cycles | Overall, both |
|---|---|---:|---:|---:|---:|---:|
| code-graph, frozen main source | 28ec599 | 7,353 | 3,844 | 0 | 0 | 71 |
| Nest | 4c751c50 | 18,328 | 14,961 | 59 | 86 | 55 |
| Drizzle | b7862528 | 31,284 | 24,181 | 622 | 742 | 34 |

All three pairs have **identical node, edge and file sets including attributes**
after order-independent comparison. This is stronger than matching counts.
The other five health dimensions and their raws also agree between each pair.
The defect is reachable on Node alone, and Drizzle's 742 differs from both
previous spike values (622 and 665).

Actual commands/evidence retained locally:

```sh
node /tmp/depwire-determinism/reproduce.mjs /tmp/nest-repro nest-forward
ORDER=reverse node /tmp/depwire-determinism/reproduce.mjs /tmp/nest-repro nest-reverse
# Same pair with /tmp/drizzle-repro and drizzle-{forward,reverse}.
# code-graph root: /tmp/depwire-bun-spike/corpus (git archive of main).
```

`/tmp/depwire-determinism/` holds the harnesses, six full graph/health JSON
outputs and logs, `output-comparison.json`, `exact-cycles.log`,
`verify-cycles.log`, `nest-exact-cycles.json`, and `drizzle-count.log`.
The SDK health call writes derived health history under each temporary corpus's
`.depwire`; source files were not altered. These are diagnostic artifacts, not
repository dependencies or release artifacts.

## I2 — cycle root cause and correctness

`src/health/metrics.ts:189` builds a file adjacency `Map<string, Set<string>>`
in graph edge insertion order. Its DFS (`:232`) marks each file globally visited
and records only edges back into the current recursion stack. Once a file has
been explored through one path, other paths through it are skipped. This
detects the existence of cycles, but **does not enumerate all simple cycles**.
Changing the root or neighbor visitation order changes the recorded subset.

The deduplication at `:267` sorts the vertices of a cycle. That also conflates
different directed cycles with the same vertex set. Rotation is a valid
equivalence for a directed cycle; arbitrary permutation is not. Sorting the
existing partial results would fix neither error.

There are four other implementations of the same family of mistake:

- `src/docs/architecture.ts:427`: globally visited DFS, early return after a cycle.
- `src/docs/dependencies.ts:372`: same early return; also first-three edge symbols.
- `src/security/checks/architecture.ts:96`: back-edge paths and sorted-vertex keys.
- `src/simulation/engine.ts:470`: back-edge paths and sorted-vertex keys; the
  introduced/resolved comparison at `:436` inherits the defect. Consequently a
  traversal change can appear to introduce or resolve a cycle without changing
  the underlying cyclic relationships.

These consumers do not currently use identical edge filters: full health
normalizes selected type-only imports to their original runtime targets;
dependencies docs exclude `references-type`; other cycle consumers include all
relationships. Unifying the algorithm must not silently erase those semantics.

### Independent exact-cycle checks

Definition tested: a directed simple cycle visits each vertex once, rotations
are equivalent, opposite directions are distinct if all required edges exist;
same-file edges are omitted as in the current file-level metric.

1. A bidirected triangle has exactly **five** cycles:
   `A→B→A`, `A→C→A`, `B→C→B`, `A→B→C→A`, `A→C→B→A`.
   Current health reports **three**. This is hand-verifiable, with no corpus
   ambiguity or filesystem involved.
2. NetworkX `simple_cycles` on the **health-projected** Nest graph terminates
   with **1,090**, in 0.013 seconds for enumeration alone.
3. A separate Node exhaustive DFS, restricted to paths starting at their
   smallest vertex and pruned to vertices able to return to that start, also
   terminates with **1,090**, in 532 ms. Its legacy metric control is 59.
   The complete cycle list is retained in `nest-exact-cycles.json`.
4. Drizzle is qualitatively different. NetworkX yielded **709,233** distinct
   cycles before the diagnostic's 30-second budget. The separate Node DFS
   yielded **3,000,000** in 37.826 seconds before its budget check stopped it.
   **These are lower bounds, not an exact total.** The Node check runs at
   million-cycle intervals, so it exceeded its nominal 30-second budget.

The independent Node algorithm does not retain Drizzle's cycle lists in memory.
Retaining and emitting every path would add significant cost beyond counting.
Neither diagnostic timeout is a proposed production limit or a claim of
complete enumeration. No assertion was weakened to accept a truncated count.

### Metric decision required before implementing cycles

The old numbers are not valid totals of distinct simple cycles. Stabilizing
their traversal would merely make an incomplete answer reproducible.

Options:

1. **Exact simple cycles:** preserves the requested mathematical meaning, but
   the complete Drizzle count remains unknown and full enumeration can be very
   expensive. Must not silently cap or label a lower bound as a total.
2. **Cyclic strongly connected components:** count mutually dependent file
   groups, report their membership and deterministic witness cycles. The
   health-projected graphs have **17** such groups in Nest and **11** in Drizzle;
   largest groups have 48 and 188 files respectively. This is a different
   metric and requires explicit naming, scoring and compatibility decisions.
3. **Bounded simple-cycle reporting:** exact while within a deterministic
   work/output budget, otherwise explicitly incomplete. Requires a result
   contract for incomplete counts, health and simulation comparisons; an
   elapsed-time cutoff would itself be machine-dependent.

Recommendation: choose a clearly named cyclic-group metric for scalable health,
with witness paths for explanation. Do not silently replace `cycles` with group
count or apply the old thresholds without reviewing their meaning. Atef's
decision is pending; no option has been implemented.

## I3 — output and ordering inventory

Classification: **V** = value, selected membership or explanation can change;
**P** = presentation/insertion order; **N** = order-independent for fixed graph
contents and fixed external inputs. Source-line references are against 28ec599.
"Inspected" is static evidence, not an assertion that all adversarial inputs
have been tested. Known corpus proofs and separate synthetic proofs are named.

| Output / location | Classification | Finding |
|---|---|---|
| Discovery, `src/utils/files.ts:15`; parser ingress `src/parser/index.ts:66` | P, propagating to V | Unsorted recursive readdir controls parse order, cache-hit reinsertion, postpasses and graph insertion. Proven on all three corpora. |
| Graph construction, `src/graph/index.ts:9,15,66,94` | P; V on collisions | Node first-wins and edge merge/last-wins policies can select attributes if conflicting records are supplied. Runtime/type-edge priorities are partially explicit. Sorting emitted JSON cannot repair a graph already built with a different winner. Corpus sets nevertheless match. |
| Graph loading/export, `src/graph/serializer.ts:34,50,67,89,105` | P; V on conflicting duplicate input | Files are sorted; nodes and edges are not. Loader preserves JSON insertion order and merges duplicate keys. Existing serialized graphs must also receive deterministic analysis, not only newly sorted parses. |
| Symbol IDs, e.g. `src/parser/typescript.ts:210,562,743` and other language parsers | N for discovery | IDs derive from canonical file path and source-local qualified names/scopes, not discovery sequence. Node ID sets matched all three corpora. Attribute collision policy is separate. |
| Angular selector index, `src/parser/index.ts:278` | V, inspected | First component for a duplicate selector wins across files. Sorting discovery stabilizes a potentially different target; it is resolution behavior, not display. Source-local AST declaration order is intentional. |
| Workspace package discovery, `src/parser/workspace.ts:115,133,156` | V, inspected | Unsorted wildcard/fallback directory traversal and first package for duplicate name wins. Config-declared precedence should remain distinct from filesystem order. |
| JVM module roots, `src/parser/jvm-modules.ts:38,45,135,202` | N for readdir | Declaration/constant-list precedence; no readdir used in this discovery. Sorting user declarations indiscriminately could change intended precedence. |
| Re-export/super/namespace postpasses, `src/parser/reexport-chains.ts:40,122`, `super-calls.ts:18`, `namespace-calls.ts:14` | P; potential V on duplicate IDs | Indexes use source identities; set membership is stable for unique records. Duplicate definitions/records require a winner policy, not arbitrary output sorting. |
| Subprocess target, `src/cross-language/detectors/subprocess.ts:141,175,180` | **V, synthetic proof** | `main.ts` invoking `python worker.py` resolves to `a/worker.py` or `b/worker.py` when the same ParsedFile array is reversed. Both targets exist. Actual edge target changes. |
| Cross-language edges, `src/cross-language/index.ts:17,21,61`; REST detector `src/cross-language/detectors/rest-api.ts:947` | P; collision V | Detection arrays follow files; simple-graph merge means colliding file-pair edge attributes can be overwritten. Corpus contents match; ambiguous inputs need explicit precedence. |
| Health cycle count/list, `src/health/metrics.ts:189–295` | **V, proven** | Incomplete traversal-dependent subset and invalid vertex-set deduplication. |
| Coupling, god-file count/threshold, orphan counts, `src/health/metrics.ts:28,300`; `src/health/workspace-metrics.ts` | N | Integer degree/count aggregations for fixed graph and workspace. All corresponding raws match in forward/reverse runs. |
| Cohesion, `src/health/metrics.ts:119,157` | Potential numerical V | Floating-point sum visits directory Map insertion order. Rounded raws match the corpora; canonical accumulation order is needed for strict guarantees near scoring thresholds. |
| Depth, `src/graph/dependency-paths.ts:30,87,92,254` | N depth; V witness/top-N | SCC-condensation longest depth is invariant. Equal-length candidate selection, component numbering, bridge choice and internal witness paths depend on traversal. Existing tests/fixtures must cover equal-length alternatives. |
| Health language object, `src/health/index.ts:105` | P | Counts invariant; property insertion order follows graph nodes. Dimension order is fixed. Timestamp/history are separate intentional inputs. |
| Dead-code detector/report/display, `src/dead-code/detector.ts:145`; `index.ts:31,48`; `display.ts:46` | P | Same finding sets, confidence and counts on all corpora; arrays differ. Diagnostic kind/reason counts sort numerically without tie keys at detector `:68,78`. |
| Dead-code confidence, `src/dead-code/classifier.ts:21` | N on tested/current graph contract | Per-symbol degree/export/path predicates; all confidence values matched. Legacy helper `:138` first-matches file/name using `attrs.file`, while current nodes use `filePath`: a separate schema concern, not evidence of discovery-dependent confidence. |
| Symbol lookup/search, `src/graph/queries.ts:41,87,301`; `src/tools.ts:394`; `src/mcp/tools.ts:1179` | P → V when selected/truncated | Equal dependent-count/relevance ties lack total ordering; name ambiguity/fuzzy/top-N selection can expose a different symbol. |
| Dependencies/dependents/impact, `src/graph/queries.ts:92,118,145` | P | Neighbor and BFS output follows insertion; reachability membership is invariant. `affectedFiles` already sorted at `:190`. |
| Affected files, `src/graph/queries.ts:348–399`; CLI `src/commands/affected.ts:88` | **V explanation; N membership/depth** | Result list already sorts by depth/path, but equal-depth first witness determines reason. Demonstrated on each corpus; sorting the final list is insufficient. |
| File/architecture summaries, `src/graph/queries.ts:246,294,428` | N counts; P nested data | File summary outer list is sorted; current most-connected tie order inherits that stable file order. Nested dependencies/symbols require sorting. Full architecture summaries matched the three corpus pairs. |
| CLI diff, `src/core/diff.ts:202,214,258,270`; `src/commands/diff.ts:116,206` | P → V excerpt | Map/Set iteration controls added/removed/modified arrays and the first 3/20 printed items. Set differences themselves are independent for fixed graph contents. |
| Simulation/whatif, `src/simulation/engine.ts:420,436,470` | **V cycles**, P other arrays | Cycle introduced/resolved values are wrong for the same reason as health; added/removed edges and affectedNodes need stable order. |
| Verify-change, `src/core/verify-change.ts:309,332,337` | N blast count; P findings; inherited cycle V | Canonical deduplicated affected paths are already sorted. Broken-import first-wins deduplication and security arrays preserve encounter order; simulation-derived cycles/health inherit their defects. |
| Security architecture, `src/security/checks/architecture.ts:96` | **V** | Same incorrect cycle subset; auth/crypto findings can be missed or change. God-file degree threshold is independent. |
| Security finding IDs, `src/security/scanner.ts:77,85,90` | **V IDs**, P findings | Severity-only sorting before assigning SEC-001 etc makes IDs dependent on discovery order. Suppressed results sort only by file; ties need full keys. |
| Security reachability, `src/security/graph-aware.ts:49,116,129` | N severity; V explanation; P paths | Reachable entry-point set is stable, but first HTTP/auth witness changes explanation and entryPoints ordering. External audit database/tool versions are independent inputs. |
| Temporal snapshot, `src/temporal/snapshots.ts:64,102,127` | P; V tied selection | File/edge arrays and language property order follow input; loading sorts only by commit date, so equal-time snapshots retain directory order. |
| Temporal diff, `src/temporal/diff.ts:8–29` | P | Set differences stable; emitted file/edge arrays preserve snapshot order. |
| Temporal sampling, `src/temporal/sampler.ts:37,60,105`; `git.ts:13` | N for discovery; other environmental V | Consumes Git commit order, not source file order. Local-calendar week/month grouping can differ by timezone; a broader cross-machine determinism issue requiring UTC semantics. |
| Docs architecture, `src/docs/architecture.ts:127,255,268,291,427` | V cycles/top-N; P rows | Incomplete cycles; equal counts/ratios rely on insertion for language/directory/file ranking. |
| Docs dependencies, `src/docs/dependencies.ts:69,124,212,303,372` | V cycles/top-N; P rows | Cycle bug plus incomplete rank ties. Typed-edge table `:69` already has a row key, but uses locale collation. |
| Docs files, `src/docs/files.ts:150,205,225,295` | V top-N; P rows | File stats sorted; directory-count ties and most-connected graph-order ties can choose different entries. Spike proved most-connected caller.ts vs leaf.ts. |
| Docs API, `src/docs/api-surface.ts:102,110,144,153,197` | V top-N; P rows | Export groups and dependent-count ranks lack full tie keys. |
| Docs onboarding, `src/docs/onboarding.ts:91,135,145,151,397,473,490,529` | V selections/names; P rows | Equal-language/rank/cluster-size/word-frequency ties and first cluster files. |
| Docs current, `src/docs/current.ts:101,233,243,254,296,366` | V excerpts; P rows | Sorted files/kinds do not stabilize nested symbol/import/dependent lists or same-name symbols before truncation. |
| Docs history, `src/docs/history.ts:147,263,285,420,451` | V sample/top-N; P rows | First 20 graph files choose age sample; equal dates, cluster strengths and word counts lack ties. Churn ranking already ties by file. Git history itself is an explicit input. |
| Docs tests, `src/docs/tests.ts:125,287,366,436` | V top-N; P rows | Outer test paths sorted; equal untested connections and directory totals lack tie keys. |
| Docs errors, `src/docs/errors.ts:127,253,399,417` | V top-N/excerpts; P rows | Risk-score ties, first symbols and recommendations. |
| Docs status, `src/docs/status.ts:201,224,246,333,376,441,469` | V excerpts/top-N; P rows | Same-file findings need line/identity ties; priorities, directory counts and in-progress slices inherit encounter order. |
| Docs conventions/health/dead-code, `src/docs/conventions.ts:396`; `health.ts:84`; `dead-code.ts` | P; inherited values | Row/count ties and delegated health/dead-code outputs. Median's numeric sort is correct and not a discovery-order defect. |
| MCP + pure tools file context/summary/viz, `src/mcp/tools.ts:1056,1166,1284,1348`; `src/tools.ts:285,383,486` | V truncated membership; P arrays | Both implementations need parity; nested symbols/importers and directory/top-file ties. Canonicalizing a re-export stub would not fix these. |
| Viz data/export, `src/viz/data.ts:21,37,67`; `generate-html.ts:25,216`; `generate-whatif-html.ts:262` | P; V tie-selected subset/edge label | File ordering already has directory/path keys; arc and edge-kind arrays follow graph; last cross-language edge label can win; tied filtered subsets inherit their input. |
| agents.md generation, `src/commands/agents-md.ts:27,50,88` | V top-language tie; P | Directories explicitly sorted; language-count ties need key; orphan excerpt inherits query order. |
| Claims/decisions, `src/mcp/tools/get-active-claims.ts:59,72`; `get-decisions.ts:87` | Deliberate event order; tie P/V | Not solely graph outputs: JSONL history and time affect results. Equal decision timestamps need stable ID ties before limit; do not reorder events before resolving latest state. |
| Watcher, `src/watcher.ts` | Deliberate event sequence; downstream P | Events arrive in time order; downstream rebuilt graph/output must be canonical. Sorting events indiscriminately is not valid. |
| Timestamps, elapsed time, history, UUIDs, version/root metadata | Deliberately variable | Freeze/normalize explicit observational metadata in tests, not graph values. Health `timestamp` and docs generation time also need explicit treatment; parsedAt is not the only clock field. |
| Locale-sensitive comparisons/formatting throughout docs, queries, viz | Cross-machine P/V | `localeCompare`/`toLocaleString` defaults are not an explicit locale-independent contract. Use code-point/defined collation for canonical keys; keep human-localized presentation separately defined. |

Additional corpus evidence (`output-comparison.json`): dead-code with confidence
`low` has 84 / 3,037 / 4,736 findings in code-graph / Nest / Drizzle respectively.
Each pair has identical complete finding sets (including confidence/reason), but
different array order. These counts are the filtered detector's counts, not the
health dimension's raw dead-symbol count.

Affected explanation examples for the same file/depth:

- code-graph: `test/windows-path-contract.test.ts`, depth 4, imports
  `handleToolCall` versus `verifyChange`.
- Nest: `integration/discovery/src/my-webhook/my-webhook.module.ts`, depth 2,
  imports `CleanupWebhook` versus `FlushWebhook`.
- Drizzle: `drizzle-kit/src/api.ts`, depth 2, imports `pgPushIntrospect` versus
  `sqlitePushIntrospect`.

## Health baseline and implications (G4 preparation, not a completed gate)

The following is measured forward-order main. Reverse order changes only the
cycle raws shown in I1. Values are `dimension score: raw metrics`.

| Dimension | code-graph | Nest | Drizzle |
|---|---|---|---|
| Overall | 71 C | 55 F | 34 F |
| Coupling | 70: avg 5.43, max 224, crossDir 8.3 | 70: avg 5.06, max 876, crossDir 35 | 10: avg 15.15, max 1418, crossDir 23.3 |
| Cohesion | 60: ratio 45.1, dirs 38 | 40: ratio 13.6, dirs 468 | 40: ratio 11.5, dirs 148 |
| Circular | 100: cycles 0, per100 0 | 60: cycles 59, per100 3.4 | 20: cycles 622, per100 70.3 |
| God Files | 60: count 12, threshold 41, per100 4.3 | 60: count 71, threshold 31.1, per100 4.1 | 60: count 50, threshold 95.3, per100 5.6 |
| Orphans & Dead Code | 89: orphans 6, pct 4.4, dead 179, pct 2.4 | 68: orphans 34, pct 2.7, dead 3300, pct 18 | 69: orphans 20, pct 3.2, dead 5239, pct 16.7 |
| Depth | 40: maxDepth 12 | 20: maxDepth 22 | 40: maxDepth 9 |

Under **exact simple cycles with unchanged scoring thresholds**, Nest's circular
score would be 20, overall **47** instead of 55. This is a projection from the
verified count and existing formula, not a post-fix run. Code-graph remains 71;
Drizzle's proven lower bound already keeps circular score 20 and overall 34,
but its exact raw is unknown. All published numbers called total simple-cycle
counts need reassessment; do not claim every corpus has a wrong value (the
acyclic corpus's zero is correct).

This is a Class F consequence. Cloud's stored health values/benchmark reports
would need recomputation and methodology/version attribution. If graph
contents truly remain unchanged, recomputing derived health from stored graphs
may suffice; source reparse is a separate question when resolution changes.

FormatVersion need not change for ordering alone or a derived metric. No bump
has been made. Sorting ambiguous resolver choices **can change targets**, as
the subprocess fixture proves, and therefore requires RESOLUTION_VERSION
consideration; claiming categorically that it stays 5 would be premature.
Health metric compatibility should not be disguised as a parser cache version.

## Gates and working status

- G1: not run; phase-one N=2 forward/reverse proves failure, not N=5 shuffled success.
- G2: not rerun; prior spike baseline retained. No replacement Bun binary built.
- G3: triangle has 5; Nest has 1,090 by two independent algorithms. Drizzle
  has at least 3,000,000; exact total not established. Metric decision pending.
- G4: measured main baseline above; exact-cycle Nest impact projected, no fix applied.
- G5: all three forward/reverse node/edge sets identical; separate ambiguity
  fixture changes an edge target. No candidate implementation comparison yet.
- G6: initial whole parse+graph+health diagnostics, forward/reverse respectively:
  code-graph 946/948 ms, Nest 2353/2214 ms, Drizzle 5607/5617 ms. Concurrent
  diagnostic processes and health I/O mean these are **not** an isolated
  before/after sorting benchmark. None is claimed as G6 passing evidence.
- G7: not run; no production source changes, no new CI run requested.
- G8: no versions changed; compatibility implications above require the chosen fix.

No implementation commit or PR yet. The requested final fix commit/PR would
misrepresent this state. Finish the cycle-contract decision before claiming
completion or posting a fix for review.
