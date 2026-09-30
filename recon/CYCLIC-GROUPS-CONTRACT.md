# Cyclic dependency groups — proposed contract (phase 1)

**Approval status: proposed, not approved. No implementation in this PR.**
Phase 2 must not begin until Atef explicitly approves this contract in a later
message. No source, package version, release process, deployment or stored data
is changed. This is a Class F health-methodology proposal, not a shape change.

Branch `feat/cyclic-groups-metric` starts directly from main `28ec599`
(depwire-cli 1.21.2). The earlier investigation is carried forward unchanged as
[DETERMINISTIC-OUTPUT-INVESTIGATION.md](DETERMINISTIC-OUTPUT-INVESTIGATION.md).
The requested filename `DETERMINISM-INVESTIGATION.md` did not exist; this is the
actual report. Its cycle enumeration measurements were **not rerun**.

Architecture/source context: `parseProject` produces per-file symbols/edges;
`buildGraph` constructs the directed symbol graph; `calculateHealthScore`
currently makes a legacy health projection and calls six dimension functions.
Docs, security and simulation have four additional cycle implementations.
SDK, pure `/graph` and `/tools`, CLI and MCP expose these results. Repository
connector methods were unavailable; source and the installed SDK were read
directly. No implementation delegation was used.

## C1. What harm is measured, and the complete result contract

**Harm:** the extent to which graph-bearing files cannot be separated into a
directed acyclic dependency order, plus the concentration of that mutual
dependency in the largest inseparable group. This is structural entanglement,
not a count of execution loops, a proof of runtime failure, or a vulnerability
count. Dense and sparse SCCs of equal size receive the same score: edge density
and removal effort are intentionally not claimed by this metric.

Project the supplied symbol graph to the file graph specified in C2. Include
every distinct canonical, project-relative file path represented by a node,
including isolated graph files. A **cyclic dependency group** is a maximal
strongly connected component with at least two different files. Same-file
symbol edges are excluded; recursion inside one file is not a file-level
architectural cycle. A self-import is consequently not counted here.

Let:

- `N = graphFileCount`: distinct graph-bearing files, not files discovered or
  successfully parsed without nodes. Existing graph file-count labeling remains.
- `G = groupCount`: number of cyclic SCCs, **reporting only**.
- `C = cyclicFileCount`: sum of group sizes; SCCs are disjoint.
- `p = 100 × C/N`: cyclic-file percentage, primary scoring signal.
- `L = largestGroupSize`: maximum group size, zero when G=0, secondary signal.

Tests/examples/generated code remain in scope if present in the supplied graph;
there is no new hidden exclusion rule. A caller-scoped subgraph must disclose
that scope. Adding unrelated isolated files can lower p: that is an explicit
limitation of an exposure proportion, not an improvement to the existing tangle.
Therefore show C and L alongside the score and report added/removed files in
comparisons. Monotonicity claims below hold for a fixed vertex set.

New dimension name **`Cyclic Dependency Groups`**, stable dimension key
**`cyclicGroups`**, replacing the old circular dimension at its existing 20%
weight. Do not return `cycles` or `cyclesPer100` with a new interpretation.

Proposed result shape (documentation, not executable implementation):

```ts
type CyclicGroupsResult = {
  contractVersion: 'cyclic-groups-v1';
  dimensions_v: '2026-09-30-cyclic-groups-v1';
  edgeView: 'value-dependencies-v1' | 'all-dependencies-v1';
  status: 'analyzed';
  sourceCoverage: 'complete' | 'partial' | 'unknown';
  // Complete analysis of the supplied graph, even if source parsing was partial.
  graphFileCount: number;
  groupCount: number;
  cyclicFileCount: number;
  cyclicFileRatio: number;             // C/N, unrounded; percentages only in UI
  largestGroupSize: number;
  score: number | null;                // integer 0..100; null for alternate view
  groups: Array<{
    key: string;                      // JSON encoding of sorted member-path array
    files: string[];                   // canonical path order
    size: number;
    witness: {
      files: string[];                 // closed path, e.g. [a,b,a]
      edges: Array<{
        sourceFile: string;
        targetFile: string;
        sourceSymbol: string;
        targetSymbol: string;
        kind: string;
        line: number | null;
      }>;
    };
  }>;
} | {
  contractVersion: 'cyclic-groups-v1';
  dimensions_v: '2026-09-30-cyclic-groups-v1';
  edgeView: 'value-dependencies-v1' | 'all-dependencies-v1';
  status: 'no_graph_files' | 'unavailable';
  sourceCoverage: 'complete' | 'partial' | 'unknown';
  score: null;
  reason: string;
};
```

Failure/no-input results deliberately omit success counters and groups. An
unavailable analysis must not masquerade as zero groups. A partial parse can
produce an analyzed result, but its score must be labeled partial; no clean
bill of health for unparsed files. Unknown provenance remains `unknown`.
The lightweight health dimension embeds the counters/ratio in `metrics`, with
name/key/score/grade/weight/details as usual; group details can be a sibling
analysis payload. A null score has no grade. Machine ratio is not rounded
before scoring. Every consumer gets the same counters for the same view/scope.

**Determinism and bounded explanation:** one shared SCC analysis, one shared
scorer, one shared comparison contract. Order members by Unicode scalar-value
lexicographic order of their canonical paths (no locale-dependent collation);
order groups lexicographically by member arrays. Membership keys use JSON array
encoding to avoid delimiter collisions. Do not sort only by size or return
implementation-assigned SCC numbers. Sort all evidence ties by source/target
path, symbol identity, kind, then line (null last).

One witness per group: take its smallest member, choose a shortest directed
cycle through that member, breaking equal-length paths lexicographically.
The returned path repeats its first file at the end. Reverse direction is not
equivalent. Every step must have a real qualifying edge. Reverse-distance BFS
within the SCC can select this witness without enumerating simple cycles.
For security's explanation, a caller can explicitly request an anchor that is
the smallest security-related member; this changes only the witness, never G/C/L.
Witnesses are illustrative, not every cycle and not every group member.
Summaries may paginate groups but must expose total count, returned count and
truncation. Analysis and scoring never truncate. Tarjan/Kosaraju SCC work is
O(V+E); canonical sorting adds sorting cost, so the entire output procedure is
not advertised as strictly linear.

## C2. One edge projection, explicitly versioned

**Default `value-dependencies-v1`:** retain existing edge kinds `imports`,
`calls`, `extends` (legacy alias), `implements`, `inherits`, `decorates`,
`references`, `injects`, `uses`, `rest-api`, `subprocess`. Exclude every
`references-type` edge. This defines a view of the graph's recorded labels;
it is not a promise that every retained legacy relationship executes at
runtime (notably `implements`), nor that heuristic cross-language matches are
runtime load dependencies. The view includes cross-language architectural
dependencies deliberately. A future reclassification requires a new view version.

Endpoints map through their actual nodes' canonical file paths. Keep one
directed file edge per ordered file pair; retain sorted original-edge evidence
for witnesses. Exclude intra-file edges. Parallel symbol edges affect neither
SCC membership nor weight. Missing endpoints, missing file paths or unsupported
edge kinds make analysis unavailable with a reason, not a clean empty graph.

**Do not reconstruct an edge from `originalImportTarget`.** The current health
projection turns selected `references-type` / `typeOnlyImport` edges back into
imports to preserve an older score. That historical compatibility maneuver is
not the new edge contract. Analyze the original graph for this dimension;
other five dimensions retain their existing projection/behavior in this change.
`typeOnlyFallback` does not change the exclusion of `references-type`.

Explicit alternative **`all-dependencies-v1`** adds `references-type` using its
actual target, without legacy retargeting. This is useful to users investigating
compile-time/type coupling. It uses the same shared algorithm, includes its view
in every result and yields `score: null`: do not apply a curve calibrated on a
different view or blend it into overall health. Alternate-view comparisons
must use the same view on both sides. Default output always uses the default
view; no consumer chooses a different filter invisibly.

| Consumer | Proposed default and what changes |
|---|---|
| Full health | Stops counting legacy-restored type-only imports; gets exact SCC membership and new score. Other dimensions untouched. |
| Docs architecture | Previously all edges, incomplete paths. Default now excludes type references; can explicitly show a separately labeled all-dependencies appendix. |
| Docs dependencies | Existing type exclusion retained, but complete groups replace early-return DFS; symbol evidence remains attached to actual qualifying edges. |
| Security architecture | Default excludes type-only group membership previously included. One finding per cyclic group intersecting auth/crypto files, with explicit member list and anchored witness. Existing severity policy is retained for this proposal; explain structural risk, not proof of exploitability. An all-dependencies appendix is not silently another runtime-security finding. |
| Simulation / verify-change | Uses this projection before and after; removes mismatch between cycle diff and health dimension. All-dependencies comparison only through explicit view selection. |

**Measured policy sensitivity on identical graph artifacts**, not a graph change:

| Repo | Default G / C / L | All-dependencies G / C / L |
|---|---|---|
| code-graph | 0 / 0 / 0 | 0 / 0 / 0 |
| Nest | 16 / 86 / 48 | 17 / 89 / 48 |
| Drizzle | 18 / 207 / 43 | 11 / 272 / 188 |
| Hono | 7 / 50 / 36 | 6 / 79 / 59 |
| Express | 0 / 0 / 0 | 0 / 0 / 0 |
| Zod | 1 / 2 / 2 | 2 / 14 / 9 |
| Flask | 2 / 21 / 19 | 2 / 21 / 19 |

The prior investigation's 17/11 groups belonged to its legacy health projection.
They are not assumed to be the answer under every edge policy. In particular,
removing type edges can split Drizzle's 188-file group into smaller groups,
**increasing** G while decreasing C and L. This is direct evidence against
using G as the score signal. This policy choice needs approval along with the
score, not an undocumented implementation decision.

## C3. Change semantics: file exposure and group transitions

Compare results with identical contractVersion, dimensions_v, view and scope.
Otherwise return `status: 'not_comparable'` with a reason; do not return zero
change. One shared comparison implementation serves What If and verify-change.

Track persistent file identities. Use an explicit bijective rename map supplied
by the simulation operation; never guess identity from similar basenames. Pure
renames must produce zero cyclic-exposure change. New/deleted files are separate;
split/merge file operations without a valid bijection are additions/removals.

Proposed replacement for old `circularDepsIntroduced/Resolved` and
`new_circular_dependencies` fields:

```ts
cyclicGroupChanges: {
  status: 'compared';
  contractVersion: 'cyclic-groups-v1';
  dimensions_v: '2026-09-30-cyclic-groups-v1';
  edgeView: 'value-dependencies-v1' | 'all-dependencies-v1';
  before: { graphFileCount: number; groupCount: number; cyclicFileCount: number;
            largestGroupSize: number; score: number | null };
  after:  { graphFileCount: number; groupCount: number; cyclicFileCount: number;
            largestGroupSize: number; score: number | null };
  newlyCyclicFiles: string[];      // persistent: noncyclic before, cyclic after
  freedFiles: string[];           // persistent: cyclic before, noncyclic after
  addedCyclicFiles: string[];     // did not exist before, cyclic after
  removedCyclicFiles: string[];   // no longer exist; NOT described as freed
  groupsMerged: Array<{ beforeKeys: string[]; afterKey: string }>;
  groupsSplit: Array<{ beforeKey: string; afterKeys: string[] }>;
  groupsFormed: string[];         // after groups with no predecessor group
  groupsEliminated: string[];     // before groups with no successor group
  membershipsChanged: Array<{ beforeKey: string; afterKey: string;
                              addedMembers: string[]; removedMembers: string[] }>;
  internalEdgesChanged: Array<{ beforeKey: string; afterKey: string;
                               addedFileEdges: [string,string][];
                               removedFileEdges: [string,string][] }>;
}
```

Link before/after cyclic groups when they share at least one persistent file
identity (after applying rename mapping). An after group with two or more
predecessors is a merge; a before group with two or more successors is a split.
Both can occur in a complex edit and both must be returned. One-to-one links
with different membership belong to `membershipsChanged`. Formation/elimination
requires zero predecessor/successor, not just a changed membership key. Include
before/after group details or resolvable keys in the response. A vanished group
does not imply all its files were freed: deleted files are accounted separately.

Within a one-to-one group link, changes to internal qualifying file edges are
reported even if membership is unchanged. Do not call them new/resolved cycles:
adding a chord can add simple cycles without changing entanglement membership.
Comparisons of symbol-only edge changes on an already-present file edge belong
to the normal graph diff, not this group-delta signal. Witness changes alone
never constitute introduction/resolution.

If either graph has partial or unknown source coverage, expose that limitation
alongside the comparison and do not certify the proposed change safe on the
strength of empty cyclic-regression lists. Membership comparison is exact only
for the supplied graphs; it cannot establish facts about missing source files.

All collections use canonical keys. Health delta is computed from the same
scorer; it remains distinct from structural transition labels. Existing
simulation-vs-full-health orphan-score caveats remain; fixing one dimension
does not certify identical overall health implementations.

### Required merge/split examples (100 graph files, other files isolated)

Before: `A↔B`, `C↔D`, `B→C`. After: add `D→A`.

- Before groups `[A,B]`, `[C,D]`; after `[A,B,C,D]`.
- G 2→1, C 4→4, L 2→4; **score 84→82** under C4.
- newlyCyclicFiles=[], freedFiles=[], addedCyclicFiles=[], removedCyclicFiles=[].
- groupsMerged=[{beforeKeys:[AB,CD],afterKey:ABCD}], groupsSplit=[].
- groupsFormed=[], groupsEliminated=[]; no false claim that two cycles resolved.

Reverse edit: remove `D→A`.

- G 1→2, C 4→4, L 4→2; **score 82→84**.
- Same four empty file-transition lists; groupsSplit=[{beforeKey:ABCD,
  afterKeys:[AB,CD]}], groupsMerged=[]. No file was freed from cyclicity.

Additional acceptance cases: close `A→B→C` with `C→A` (three newly cyclic
files, one formed group); break that ring (three freed files, one eliminated
group); delete B from A↔B (A freed, B removed, not two freed); rename A with
the explicit map (no transition); add a chord inside a persistent SCC (only
internalEdgesChanged); simultaneous merge+split (both represented).

**Safety contract:** newly cyclic persistent files, added cyclic files and group
merges are cyclic-regression evidence for verify-change; do not let unchanged
group count or rounded score suppress them. A split is reported as reduced
concentration, not complete resolution. Internal-edge-only changes remain
visible context, not automatic proof of a new cyclic group. Preserve independent
broken-import checks. If the operation cannot construct an after graph, return
an unavailable comparison: do not infer safe from empty arrays. Removing legacy
result fields requires coordinating SDK/Cloud/MCP clients and explicit release
notes; a dimensions_v marker alone does not make API removal nonbreaking.

## C4. Calibration, fixtures and proposed curve

Evidence: [CYCLIC-GROUPS-CALIBRATION.json](CYCLIC-GROUPS-CALIBRATION.json).
These are temporary diagnostic calculations using NetworkX 3.4.2 SCCs, not
the proposed production implementation. Existing Node 25.2.1 / npm CLI 1.21.2
graphs for code-graph/Nest/Drizzle were reused; **no simple-cycle enumeration
was repeated**. Hono was frozen using git archive; four other public repositories
were cloned to /tmp and parsed cache-off with that same registry SDK. No source
checkout, dependency install, cache or training data was changed in the user's
other repositories. All eight completed corpus parses had no observed parse
errors. The initial FastAPI attempt ran before clone checkout completed and
produced no data; discarded, then rerun after completion, not counted as healthy.

### Proposed score, not a learned model

`score = round(clamp(100 - P(p) - Q(L), 0, 100))`, round halves upward.
P and Q are continuous piecewise-linear functions through these anchors:

| Cyclic-file percentage p | 0 | 1 | 5 | 15 | 30 | 50 | 100 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Primary penalty P | 0 | 5 | 20 | 40 | 60 | 70 | 80 |

| Largest group L | 0 | 2 | 5 | 10 | 25 | 50 | 100 | 200+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Secondary penalty Q | 0 | 0 | 2 | 5 | 10 | 15 | 18 | 20 |

Coverage dominates the available penalty budget (80 versus 20); concentration
is bounded. G is absent. Existing grade thresholds and 20% dimension weight
stay; this dimension may now reach zero, unlike the legacy floor of 20. Rounding
can make small changes score-neutral but never reverse their direction.
After rounding, cap the score at 99 whenever C>0, so a small real group in a
very large graph never rounds up to a misleading perfect score. C=0 and N>0
scores 100; N=0 remains unscored. This cap changes none of the measured rows.

For fixed N, adding edges can only maintain/increase C and L, so score cannot
improve. Removing edges cannot worsen it. Joining two groups with unchanged C
can maintain/decrease score, never improve it. Equal C/N but one larger group
is penalized at least as much. This is not a strict lexicographic ranking:
the bounded secondary signal can distinguish repositories with close coverage.
Graph size changes are explained by separate absolute counts and C3 transitions.

**Calibration rationale:** the seven design-set repositories span 99–1,745
graph files and legacy overall scores 34–82, rather than only the two failing
cases. Observed coverage is 0, 0, 0.39%, 4.93%, 13.93%, 21.21%, 23.39%.
Use round, interpretable exposure boundaries: sparse ≤1%, localized up to 5%,
substantial 5–15%, broad 15–30%, majority 50%, total 100%. Largest groups span
0, 0, 2, 19, 36, 43, 48; anchors 2/5/10/25/50 bracket small pairs through
multi-module tangles, with 100/200 supplied by stress fixtures. Do not derive
thresholds by quantiles, preserve old grades, or fit Nest/Drizzle's old numbers.

The distribution checks dynamic range and avoids collapsing every nonzero
project into one band. It cannot establish empirical maintenance-cost truth:
these weights and anchors are **normative, provisional choices for approval**.
The sample is biased toward libraries/frameworks and TS/JS; broaden language and
application coverage before claiming universal predictive calibration. Above
30% and groups >50 are fixture-backed, not supported by this default-view real
sample. C4 measures the proposal; it does not assert statistical validation.

### Eight real repositories; FastAPI held out from anchor selection

| Repo / pinned revision | Graph files | G | C | C/N % | L | New dimension | Old overall → projected overall |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph `28ec599c841964d39d0bc67f0d534da50eddbf83` | 276 | 0 | 0 | 0 | 0 | 100 | 71 → 71 |
| Nest `4c751c503bc753095f4b4f052e106f95218cc33f` | 1,745 | 16 | 86 | 4.9284 | 48 | 66 | 55 → 57 |
| Drizzle `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10` | 885 | 18 | 207 | 23.3898 | 43 | 35 | 34 → 37 |
| Hono `8217d9ece6f4d302e446b8dc353d1b3cbf51d92e` | 359 | 7 | 50 | 13.9276 | 36 | 50 | 47 → 53 |
| Express `7ef98448f8b38099ab1ded55e458538ad47a51e7` | 144 | 0 | 0 | 0 | 0 | 100 | 82 → 82 |
| Zod `1d1b35a1ba47e08c3ac8645341deed4a9ca13fb7` | 510 | 1 | 2 | 0.3922 | 2 | 98 | 58 → 66 |
| Flask `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | 99 | 2 | 21 | 21.2121 | 19 | 44 | 76 → 81 |
| FastAPI, holdout `33d411dbc3236275dd64d200bfe18d5d60a49b2e` | 974 | 2 | 22 | 2.2587 | 15 | 84 | 65 → 69 |

Projected totals recompute the existing weighted sum from all six unrounded
dimension contributions, replacing only the circular score, then round once.
They are **not post-implementation CLI runs**. No claims of score invariance.
No thresholds were changed after adding FastAPI. Existing overall values are
legacy diagnostics, not independent ground-truth health labels.

### Hand-verifiable graph fixtures, constructed and checked

| Fixture | N | Construction | G / C / L | Score |
|---|---:|---|---|---:|
| Bidirected triangle | 3 | all 6 directed edges between A/B/C | 1 / 3 / 3 | 19 |
| Clean layered graph | 100 | 10 layers of 10, edges only to next layer (900 edges) | 0 / 0 / 0 | 100 |
| One large tangle | 1,000 | complete bidirected group of 188, 812 isolated files | 1 / 188 / 188 | 35 |
| Many small tangles | 1,000 | 94 disjoint bidirected pairs, 812 isolates | 94 / 188 / 2 | 55 |
| Single long cycle | 100 | directed ring, 100 edges | 1 / 100 / 100 | 2 |
| Before merge / after split | 100 | two pairs and one-way bridge | 2 / 4 / 2 | 84 |
| After merge / before split | 100 | add closing bridge | 1 / 4 / 4 | 82 |

The triangle's five simple cycles and this contract's one group are different
correct quantities. A 100-file ring is severely entangled even though it has
only one simple cycle. The dense 188-file tangle and 94 pairs have equal cyclic
coverage, but their scores differ by 20 points. No enumeration needed.

Reproduction evidence is retained in `/tmp/depwire-cyclic-contract/`:
`parse-corpus.mjs`, `parse-holdout.mjs`, `measure.py`, `score.py`, `fixtures.py`,
eight input graph/health JSONs (first three under `/tmp/depwire-determinism/`),
and parse logs. The checked-in calibration JSON records input SHA-256 hashes,
node/edge counts, both view distributions, projected scores and fixture results.
The diagnostic Python scripts use existing NetworkX SCCs; no Depwire algorithm
was replaced. Production determinism/performance gates belong to Phase 2.

## C5. Correction blast radius — evidence, not blanket claims

Audit date: 2026-09-30. CLI baseline `28ec599`; local Cloud `bc8ec6aa`; local SLM
`6a2d0ea`. Other repositories and their dirty working trees were read only.
Scope limitations below are explicit; a code path is not proof of live row contents.

| Surface | Contains defective number/result? | Evidence and correction required |
|---|---|---|
| CLI README | **No numeric cycle total found; yes affected feature claims.** | README:242,462 describes circular dependency verification; :572 describes circular includes. Update terminology/examples and add release correction. Do not retract unrelated performance/count claims. |
| depwire.dev live homepage | **No numeric cycle total found in fetched text; yes affected feature claims.** | [Live page](https://depwire.dev/), fetched this audit: What If, verify-change and generated architecture/health docs advertise circular analysis. Update that wording. This is homepage-text evidence, not certification of historical pages, screenshots or every asset. |
| Benchmark repository reports | **No literal cycle count found in inspected reports; a derived health baseline exists.** | `depwire-benchmark` at `2683c6f`: `RESULTS.md:7` says baseline health 45/100, v1.8.6. Fifteen text/JSON/report files searched, zero `cycles`/`circular` hits. Annotate methodology on that baseline; do not invent a corrected 45 without reproducing its exact old source/version. |
| Benchmark v2 | **No cycle figure found in inspected reports.** | `depwire-benchmark-v2` at `aa2fb27`: 83 report/result text/JSON files searched (excluding source checkouts/node_modules/.git), zero cycle/circular hits. README/BLOG concerns impact benchmark validity, not this metric. No demonstrated need to rerun impact benchmark outcomes solely for this change. Live publication of the first benchmark could not be verified: its configured GitHub repo content request returned 404; v2 has no origin remote. |
| Cloud health_history | **Storage path contains the defective detail/derived score; live rows UNVERIFIED.** | `parser/src/parse.ts:242–270` stores circular score/grade/details, dropping raw metrics; `api/src/routes/jobs.ts:14–34` JSON-serializes those dimensions into history. Thus numeric counts can survive in `details`, even though a structured `metrics.cycles` field is not retained. Actual production row query failed authorization (below). Do not claim a row count or that every historical row is wrong. |
| SLM numeric `cycles` oracle label | **NO in audited pair files and active checker contract.** | All top-level training-data JSONL files scanned for literal/escaped `cycles` and `cyclesPer100` keys: zero. Active `oracle_eval.py:541` checks verdict/risk/blast radius/broken imports, not numeric cycle count. `generate_pairs.py:84` sets score=0; its old health templates are gated off. Snapshot health can contain legacy metrics (`scripts/parse.ts:79,125`), but that is not proof those numeric labels reach current pairs. |
| SLM cycle-derived facts / v0.5 relevance | **YES. The SLM branch does not drop away.** | Seven security pairs contain the exact defective detector title in current distill data, seven in the v0.5 backup, and seven in current MLX training. Change-safety also consumes cycle-derived verdict/warnings. Details below. Numeric-field absence is insufficient to certify v0.5 unaffected. |
| Generated docs | **YES when those sections are generated.** | CLI `src/docs/architecture.ts:405–490`, `dependencies.ts:338–465`, and `health.ts` emit partial counts/paths or derived health. Regenerate affected docs from the same source graph under the new version; preserve/annotate historical docs. Existing valid zeroes are not declared wrong. |
| Security findings | **YES, cycle-derived findings rather than a numeric health total.** | `src/security/checks/architecture.ts:96–157` emits incomplete auth/crypto cycle findings. Regenerate that class; expect grouping/filtering and possibly IDs/severity elevation context to change. Do not assert every old positive is false: an emitted path may be real while enumeration is incomplete. |
| CLI/pure-tools/MCP | **YES.** | `src/mcp/tools.ts:1524` health response; :1802–1803 and `src/tools.ts:627–628` count introduced/resolved arrays; `src/core/verify-change.ts:141,387` emits new circular dependencies. Update SDK types, tool schemas, descriptions and consumers together. |
| Cloud MCP verify_change (additional finding) | **YES, a separate bounded DFS remains.** | Cloud `api/src/mcp/tools/verify-change.ts:118–157` caps DFS findings; :290–302 uses length to penalize health/risk. `api/src/mcp/server.ts:438` dispatches this handler. CLI-only replacement of five implementations does not fix this sixth consumer. Schedule explicit Cloud adoption of the shared graph-only analysis/comparison; no Cloud code is changed here. |

### Production D1 read limitation

Using installed Wrangler 4.143.1, read-only inline `--command`, never `--file`:

```sh
cd ~/Developer/depwire-cloud/api
../node_modules/.bin/wrangler d1 execute depwire-db --remote --json --command \
"SELECT count(*) AS total_rows,
 sum(CASE WHEN dimensions LIKE '%circular%' OR dimensions LIKE '%Circular%'
          THEN 1 ELSE 0 END) AS circular_rows,
 sum(CASE WHEN dimensions LIKE '%cycles%' THEN 1 ELSE 0 END) AS cycle_text_rows
 FROM health_history;
 SELECT dimensions_v, count(*) AS rows FROM health_history GROUP BY dimensions_v;
 SELECT dimensions FROM health_history WHERE dimensions LIKE '%cycles%' LIMIT 2;"
```

Result: Cloudflare API **7403**, account not valid or not authorized. No row
results returned. No auth/account configuration changed, no staging upload,
no DDL/DML and no R2 operation performed. This is an **open audit item**, not a
successful production check. Authorized read access must resolve it before
claiming C5 complete. Syntax checked against installed help/version and
[Cloudflare D1 command documentation](https://developers.cloudflare.com/d1/wrangler-commands/).

Future correction: preserve original history with original methodology. Do not
overwrite old scans or invent graph snapshots for them. Compute a new-version
current score from a compatible stored graph; original historical rescoring
requires the matching historical graph/source. If only aggregate score/details
remain, the new SCC metrics cannot be recovered from them. Latest stored graph
is not a substitute for each historical graph. Validate format/provenance before
reusing it; reparse only where that evidence is missing/incompatible. Add current
metrics to Cloud's persisted dimension payload—the current mapping drops them.

### SLM audit detail and limits

Current `distill-train.jsonl`: 9,709 pairs (3,709 impact, 1,000 change-safety,
1,000 whatif, 2,000 security, 2,000 dead-code). Numeric cycle keys: zero.
`distill-raw.jsonl`: 10,000 attempts; 1,005 `facts_fed.new_circular_dependencies`
fields, **all empty**. No-op changes explain why that does not prove the general
comparison correct. `distill_all.py:736–761` forwards the field and warnings;
`oracle_eval.py:481` invokes actual CLI verify-change.

Seven current security pairs carry **“Circular dependency in auth/crypto module”**:
lines 240, 3389, 4626, 6157, 6855, 7002, 7643. Repositories respectively:
AndrewWalsh/openapi-devtools, Prisma-care/mobile-app, Wellenline/auddly-server,
bennycode/coinbase-pro-node, code-chat-br/whatsapp-api, conwnet/github1s,
doug-martin/nestjs-query. The v0.5 backup has the same seven at lines
247, 3478, 4751, 6179, 6873, 7019, 7665 (9,873 pairs total).

Current `mlx/train.jsonl` contains 9,223 rows and the same detector title in
seven; first is line 2505. `mlx/valid.jsonl` has 486 rows; no such title.
`lora_config.yaml:2` trains from that directory. Existing model-card counts
(9,422 training / 496 validation, three tasks) differ from the current local
five-task files; an immutable released-adapter dataset manifest was not found
in this audit. Therefore establish exact released-weight lineage before saying
which weights must be retrained. No training or pair regeneration was run.

Audit hashes:

- current distill: `49e450718a009cd0ae6b80ea9ccf821d4291fb36b8b9461c16bea7dba8a84245`
- v0.5 backup: `4f7e7ebe5d5c82044310c0d290e7cea352a5f32bf488428e2da4515f4ddb6439`
- raw attempts: `8990c6beab3810f67ff13a7e7bb279d0ffef6c8ec7f85c4470e82fe0b2f0981f`

Action after approval: version the oracle facts, re-evaluate affected security
and change-safety facts under the approved contract, and selectively regenerate
changed pairs. Do not assume only these seven pairs can change: old enumeration
could miss findings, so run the revised check across the security candidate
population too. Impact/dead-code labels do not need blanket regeneration solely
because this metric changes. Deciding retraining/re-evaluation is separate from
asserting every existing label is wrong. The straight answers are **no numeric
cycles label; yes cycle-derived facts in training**.

## C6. Versioning, trend boundary and approval scope

Proposed **`dimensions_v = '2026-09-30-cyclic-groups-v1'`** everywhere producing
this health method. This follows Cloud's existing opaque descriptive-string
convention, replacing `2026-08-16-member-call-resolution-v1.14.0`
(`parser/src/parse.ts:74`), not an invented numeric dimensions-v2 counter.
Retain `scoring_version = '2026-08-16-exclusions-v1.12.0'`: exclusions do not
change. Expose dimensions_v in CLI/SDK health and carry it through Cloud/MCP,
not only the Cloud adapter. Later curve/view changes require a new marker.

**formatVersion stays 2. RESOLUTION_VERSION stays 5.** This session/Phase 2
proposal changes analysis of existing graph contents, not parsers, resolver
targets, node/edge kinds, stored graph schema or parse-cache resolution records.
Canonical ordering and this derived-metric replacement do not justify either
bump. Resolver ambiguity fixes belong to a separate change and may require a
resolution bump; do not include them opportunistically here.

Trend UI exact proposed text at a boundary:

> Health methodology changed: Cyclic Dependency Groups now measures the share
> of files in mutually dependent groups and the size of the largest group.
> The previous cycle count was incomplete and order-dependent. Scores across
> this boundary are not directly comparable; no improvement or regression
> delta is shown.

Machine comparison: different or unknown/null dimensions_v means not comparable
unless legacy provenance is explicitly established. Return delta=null plus
reason `health_methodology_changed`; split trend lines, suppress arrows and
percentage deltas. No interpolation across the boundary. Cloud already compares
scoring/dimensions/resolution markers and separates series in
`frontend/src/components/healthTrend.tsx:28–67`; retain this and update the
boundary explanation. Two null markers must not establish known comparability.
Local CLI health history currently stores neither methodology nor raw metrics
(`src/health/index.ts:214–240`); it also needs markers before trend comparison.

Public correction wording:

> Earlier releases labeled a traversal-dependent subset of dependency cycles
> as a cycle count. The subset could change with file-discovery order. We have
> replaced that metric with explicitly named cyclic dependency groups, reporting
> affected-file coverage and largest-group size. Historical scores use a
> different methodology and should not be compared directly across this boundary.

This does not claim all old numbers were wrong: acyclic zeroes are correct and
some nonzero subset counts may coincide with complete counts. Update verified
affected publications, do not erase history or claim an unverified SLM exemption.

### Decisions requested and hard stop

Approve/revise together: C1 result/API names; C2 default edge policy (including
removal of legacy type-only restoration); C3 transitions and regression signals;
C4 provisional curve; C6 version/boundary text. I do not recommend overriding
the primary-coverage direction. I specifically recommend the bounded concentration
penalty and explicit alternative view, rather than scoring by group count or
silently inheriting health's old compatibility projection.

**C5 remains partially blocked** on production D1 read authorization and precise
released-SLM dataset lineage; benchmark remote publication was also not accessible.
The local/static findings and real corpus measurements are complete as stated,
not substitutes for those missing checks. Contract approval must acknowledge
these follow-up requirements; do not call the production impact audit closed.

Only report/reference/evidence files are committed. No production implementation,
tests weakened, merge, publication, deployment, Cloud rewrite or training change.
Phase 2 requires a later explicit approval and will implement one shared module,
test hand fixtures and merge/split semantics, N=5 shuffled determinism, graph
content invariance and real health movement. This draft PR is not permission
to start that work.
