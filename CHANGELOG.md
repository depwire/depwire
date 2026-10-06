# Changelog

All notable changes to Depwire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## v1.28.0 — CLI telemetry removal and security scan controls

The CLI no longer collects usage data or sends telemetry events. The telemetry
client and the `DO_NOT_TRACK` and `DEPWIRE_NO_TELEMETRY` controls were removed;
there is no CLI usage collection left to disable. Older installed versions may
continue sending events to the existing Cloud endpoint until users upgrade.

Source-code analysis runs locally. Applicable security scans still perform
dependency vulnerability and supply-chain checks by default; these may contact
package registries and public advisory databases. Use
`depwire security --no-dependency-audit` to skip those checks and their network
requests while retaining the other security checks. `--class secrets` also
skips dependency checks. SDK and MCP callers can pass `dependencyAudit: false`.
Scan results identify when dependency checks were skipped.

The README and SECURITY.md now narrow unsupported claims about npm provenance,
read-only operation, exact dependency pinning, language coverage, and response
times. They distinguish local source-code analysis from dependency audit and
explicit GitHub requests. The What If browser page still loads D3 from a CDN;
offline rendering is tracked separately in issue #69.

This release does not change parsed graph contents: `RESOLUTION_VERSION` stays
13 and `formatVersion` stays 2. No parse-cache invalidation is required for
this release. The published npm and MCP versions must both be 1.28.0.

---

## v1.27.0 — Import capture and re-export emit evidence

**Health scores change on repositories whose imports were previously missing or classified as runtime when they were type-only.** The measured codebases did not change. The current coupling score still counts tests, benchmarks and repeated edges; its replacement curve remains unapproved. Do not interpret a score movement here as an architectural change.

`RESOLUTION_VERSION` moves **9 → 13**, invalidating parse caches for the Python, TypeScript side-effect and re-export changes. `formatVersion` stays **2**. Stored graphs still load, but their contents and stored health rows are stale until reparsed. The Python `TYPE_CHECKING` correction also crosses a health-methodology boundary. Regenerated SLM pairs will reflect the new graph.

### Python first-party imports

The parser now captures proven relative imports and first-party absolute imports, including packages under `src/`. An independent Python AST census found that Flask had **123/123** first-party absolute import sites with no built relationship before this fix; Click had **129/135** missing, and FastAPI **2,016/2,246**. After the fix, the site-level built counts are Flask **123/123**, Click **135/135**, and FastAPI **2,245/2,246**. FastAPI's one absent source target is recorded with `first-party-not-found`, without a guessed edge. FastAPI built imports rise **633 → 2,156** and production file pairs **123 → 577** on the pinned corpus.

Imports guarded by recognized `TYPE_CHECKING` are type relationships, not runtime imports. They remain visible to type-aware consumers but do not inflate runtime coupling. The released-methodology overall score moves **81 → 56** on Flask across the Python changes, **69 → 63** on FastAPI, and **67 → 52** on Werkzeug. Those movements reflect graph evidence and the type-only classification, not edits to those repositories.

### TypeScript module relationships

`import './x'` without bindings now records a proven file-level import, including six missing Drizzle and three Hono production pairs. A resolved source-only CSS, JSON, native or other asset target is recorded as a non-code dependency rather than a code edge; an unprovable target gets a reason and no guessed edge.

Re-exports now follow an explicit emit contract. `export * from './x'` is a module load even if the target exports only types. Explicit `export type` forms are erased. Inline-only `export { type A } from './x'`, and plain named re-exports whose runtime value cannot be proved, are recorded as **emit-dependent** without a guessed runtime edge. Definite loads get file-level imports; proven type-only symbol links use `references-type`. A three-named-barrel fixture confirms type impact reaches the original declaration while the value chain remains runtime.

Relative to the side-effect/Python split baseline, built imports move Nest **7,031 → 7,398**, Drizzle **6,151 → 6,509**, Zod **829 → 931**, Hono **1,014 → 1,008**, and TanStack Query **3,031 → 3,011**. The decreases remove type-only symbol edges previously counted as runtime imports. On that same comparison, Hono overall moves **48 → 46** and TanStack Query **45 → 50**. The coupling formula and grades have **not** been changed to offset these movements.

### Validation and coverage boundary

A seeded, source-verified sample of **130 newly resolved re-export relationships** found **130 correct, 0 wrong, 0 ambiguous**. Construct fixtures were checked against real TypeScript 5.9.3 output under ESNext, CommonJS and verbatim emit. Three shuffled-discovery runs on code-graph, Nest and Drizzle produced byte-identical parsed output and graphs.

The parser-to-builder invariant still checks **parsed edges = built edges + recorded drops**. A new independent source-AST CI ledger checks an earlier boundary: **71 pinned TypeScript, JavaScript and Python import/re-export sites** must each have an edge, non-code record, unresolved reason, or explicit type-only/emit-dependent outcome. A deliberate capture miss failed that gate at its source line. This is a construct boundary, **not** a claim of exhaustive capture in arbitrary repositories, other languages, or non-import relationships. Python external imports and repeated unresolved specifiers need further site-level instrumentation.

The [coverage boundary](recon/COVERAGE-BOUNDARY.md), [re-export contract](recon/REEXPORT-EMIT-CONTRACT.md), and [capture-gate report](recon/IMPORT-SITE-LEDGER-GATE.md) contain the pinned measurements and remaining limits. The draft coupling curve was rejected after blind validation and is not in this release. A new coupling contract and calibration will use freshly parsed graphs and new preregistered holdouts.

---

## v1.26.0 — JavaScript import completeness

**Express's current health score falls 82 → 65 even though its source architecture did not change.** The parser now captures import relationships it previously missed, including relationships in tests and examples. The current coupling metric counts those files and call/import volume; its definition is under review. This score movement is disclosed, not suppressed. A separate, **unapproved draft** production-only coupling formula moves 93 → 88 on Express after its production file pairs rise 4 → 7. That draft figure is not a replacement score.

`RESOLUTION_VERSION` moves **8 → 9**, invalidating parse caches because parsed graph contents change. `formatVersion` remains **2**: stored graphs still load, but their contents are stale until reparsed. Regenerated downstream data, including SLM pairs, will reflect the new edges.

### Source-visible JavaScript imports now reach the built graph

The Express audit found three missing production relationships:

- `lib/express.js → lib/application.js`: a direct `require('./application')` previously targeted a constructed `::proto` symbol with no declaration. The builder recorded a `missing-target` drop.
- `lib/application.js → lib/utils.js` and `lib/response.js → lib/utils.js`: nested `require('./utils').member` calls were never emitted as imports.

The first failure was caught by v1.25.0's parser-to-builder accounting contract. The other two happened before an edge existed, showing its limit: edge reconciliation cannot prove that every source-visible import was captured.

The parser now records proven local file dependencies for direct, destructured and nested `require`, relative and directory-index paths, imports inside functions, conditions and try/catch, dynamic `import()`, and ESM imports and re-exports in JavaScript files. Computed or missing targets produce no guessed edge and have a recorded reason. Known local JSON, native and asset files are recorded separately as non-code dependencies.

Built import edges on pinned repositories:

| Repository | Before → after |
|---|---:|
| code-graph | 876 → 884 |
| nest | 7,021 → 7,027 |
| drizzle-orm | 6,122 → 6,144 |
| express | **26 → 178** |
| pinia | 313 → 314 |
| hono, zod, flask, fastapi, click, ripgrep | unchanged |

No symbol count or other built edge kind decreased. TypeScript built call counts remain 7,534 on Nest and 16,027 on Drizzle.

### Health movement

| Repository | Overall | Coupling |
|---|---:|---:|
| express | **82 → 65** | **90 → 70** |
| drizzle-orm | 31 → 35 | 10 → 10 |
| code-graph, nest, hono, zod, flask, fastapi | unchanged | unchanged |

On Express, the current metric includes newly restored imports in tests and examples. Its cohesion, cycles, orphan and depth dimensions also move as those edges enter the graph; [the full audit](https://github.com/depwire/depwire/blob/main/recon/JAVASCRIPT-IMPORT-COMPLETENESS.md) reports all six dimensions and raw values. This is another graph-completeness movement, not evidence that Express was edited or its architecture worsened. The coupling contract is being revised separately to score distinct production file relationships and report excluded relationships explicitly.

### Validation and known boundary

All 17 language-construct fixture assertions failed against the pre-fix parser and pass with the fix. The parser-to-builder reconciliation assertion still holds across all eight calibration repositories. Three shuffled-discovery runs each on code-graph, Nest and Express produced byte-identical parsed output and serialized graphs. Build, tests and smoke checks pass on Ubuntu and Windows with Node 20 and 22.

A conservative audit also identified 19 missing explicit-relative Python import sites across Flask, FastAPI and Click. Python remains out of scope for this release. Imports under `TYPE_CHECKING` must be kept distinct from runtime relationships when that parser is fixed. These fixes cover named JavaScript and TypeScript constructs, **not a proof of complete relationship capture across all supported languages**. Coupling calibration remains blocked on a stated coverage boundary and fresh, preregistered holdouts; Click, ripgrep and Pinia have already been measured.

---

## v1.25.0 — Parser-to-graph edge contract; TypeScript call capture

**Health scores fall on several repositories.** The graph now contains call edges it was always missing. Scores move because the evidence changed, not because the pinned codebases changed. `RESOLUTION_VERSION` moves from 6 after the JavaScript fix to 8, invalidating parse caches. `formatVersion` remains 2: stored graphs still load, but their contents are stale until reparsed. Regenerated SLM pairs will also reflect the new graph.

### TypeScript call edges were silently dropped

A call whose source symbol could not be determined — a bare call inside an object-literal method, a class-property arrow, a callback, an IIFE, a decorator, a parameter default, or a heritage clause — produced no edge **and no record**. That contradicted the v1.14.0/v1.16.1 policy: an unresolvable call produces no edge, with a recorded reason.

Built call edges on the pinned calibration repositories, PR #54 baseline → final branch:

| Repository | Built calls | Change |
|---|---:|---:|
| nest | 3,391 → 7,534 | 2.22× |
| drizzle-orm | 4,475 → 16,027 | 3.58× |
| zod | 1,276 → 8,199 | 6.43× |
| hono | 892 → 2,587 | 2.90× |
| code-graph | 1,968 → 2,351 | 1.19× |

**2,223 TypeScript symbols** across the calibration corpus gain a dependent they previously lacked. Dead-code candidates fall accordingly: Nest **3,263 → 3,112** and Zod **1,368 → 794**. These final counts supersede figures measured at earlier PR heads.

The TypeScript parser also captures `export =`, `import x = require(...)`, and CommonJS assignment forms that it previously ignored.

### The parser and builder disagreed about what an edge means

Found while validating target accuracy: the parser constructed import target IDs before proving declarations existed; the graph builder silently omitted edges with absent endpoints. Parsed and built counts diverged without an accounting trail. This **predates this release**. At the PR #54 baseline, Nest had 18,397 parsed versus 16,890 built edges, and Drizzle had 32,704 versus 24,184. Parsed counts should not have been presented as built-graph counts.

The TypeScript finalizer now proves targets before emitting edges and records attempted IDs when proof fails. Ambiguous wildcard re-exports emit **no** edge and record `ambiguous-reexport` with the full candidate list. Previously the parser recorded ambiguity while retaining the invalid parsed edge. In the Nest `@Client(...)` case, that invalid edge **did not reach the built graph**: the builder had already omitted it because its target node did not exist.

The builder now records absent endpoints and same-pair coalescing instead of silently discarding them. It remains a defensive backstop for other parser paths. Stored-graph import, incremental updates, and cross-language insertion also record omitted relationships.

**A permanent reconciliation assertion runs in every graph build:** parsed edges = parser-built edges + recorded builder drops; cross-language attempted edges = added built edges + recorded cross-language drops. Drops are itemized by reason. A cache-disabled stress harness verified both identities on all eight calibration repositories, and a fixture proves the assertion fails if a drop is hidden.

### Validation

A seeded, stratified sample of 150 newly resolved call edges — 40 each from Nest, Drizzle and Zod; 15 each from code-graph and Hono — verified every target against its declaration: **150 CORRECT, 0 WRONG, 0 AMBIGUOUS**, with no declaration-less target. It covers object-literal methods, class-property arrows, callbacks, IIFEs, constructors, decorators, parameter defaults, heritage clauses, namespace and static-member targets, same-name symbols across files, shared method names, and overloads. Seed `pr55-target-accuracy-2026-10-03-v2` redraws the same 150 edges in order.

Three shuffled-discovery runs per corpus produced byte-identical parsed output and serialized graphs on code-graph, Nest and Drizzle. The final build and 326 tests passed locally; Node 20 and 22 build, test, and smoke jobs passed on Ubuntu and Windows.

### Health movement

| Repository | Overall |
|---|---:|
| code-graph | 71 → 66 |
| nest | 57 → 52 |
| drizzle-orm | 34 → 31 |
| hono | 50 → 48 |
| zod | 64 → 49 |
| express, flask, fastapi | unchanged |

The movement is driven mainly by coupling. **The coupling metric's definition is under review.** It counts call volume along file relationships, as well as test and benchmark files. Zod's coupling score falls **90 → 30** at 25% weight, accounting for approximately 15 points of its overall drop. Its average counted cross-file connections per file rises **2.33 → 14.8**; cross-directory share barely moves (**0.5% → 0.6%**).

In a follow-up measurement, tests and benchmarks account for **5,419 of 6,248 added built cross-file calls (86.7%)**. On a diagnostic production-source-only graph, distinct connected file pairs across runtime edge kinds rise **200 → 218 (+9%)**, while cross-file runtime edge volume rises **574 → 1,337 (+133%)**. Production-source cross-file calls rise **212 → 958**, and the existing coupling score still falls **70 → 30** when tests and benchmarks are filtered out. This explains the score movement; it does **not** establish that Zod's architecture worsened by 15 points. A separate contract will decide what coupling should measure. No metric was changed or score suppressed in this release.

### Known and recorded, not fixed

- Some real project calls remain unresolved when source alone cannot prove a target: typed receivers such as `db.query.usersTable.findMany`, callable aliases such as `z.string`, and dynamic dispatch. They are recorded with reasons rather than guessed.
- Eleven Drizzle `.cjs` imports and two `.sql`/`.json` imports remain recorded missing targets.
- JavaScript, Python and R have separate optimistic target-construction paths. Twelve other parsers share the no-current-symbol silent-return mechanism corrected here for TypeScript. These remain a separate parser programme.

---

## 1.24.0 — not released

The JavaScript export and call-capture work planned as 1.24.0 shipped as part of 1.25.0; the version number was skipped.

---

## 1.23.0 — Dead-code confidence reflects available evidence

The dead-code classifier previously classified almost every candidate as HIGH before constructor, type-only and other mitigating checks could run. Those checks now run before the general fallback.

- Constructors classify as LOW (`constructor-via-class`): `new ClassName()` edges target the class, not the constructor, so zero constructor dependents is expected rather than evidence of disuse.
- Exported symbols with no visible consumer classify as MEDIUM: consumers outside the parsed repository may use its public API.
- Type-only symbols classify as LOW. Framework-style directory matches are explicitly labelled a **path-name heuristic**, not proof of invocation; they reduce confidence without adding edges or removing candidates.
- Results include an optional `reasonCode`, and CLI, generated docs and MCP descriptions use less absolute confidence wording.

### Measured impact

| Repository | Before HIGH / MEDIUM / LOW | After HIGH / MEDIUM / LOW |
|---|---:|---:|
| code-graph | 87 / 0 / 0 | 48 / 36 / 3 |
| nest | 3267 / 0 / 0 | 2690 / 132 / 445 |
| drizzle-orm | 4722 / 14 / 0 | 3698 / 358 / 680 |
| hono | 329 / 4 / 0 | 230 / 31 / 72 |
| express | 27 / 0 / 0 | 27 / 0 / 0 |
| zod | 1365 / 3 / 0 | 617 / 557 / 194 |
| flask | 337 / 0 / 0 | 185 / 152 / 0 |
| fastapi | 1628 / 0 / 0 | 191 / 1433 / 4 |
| **Total** | **11762 / 21 / 0** | **7686 / 2699 / 1398** |

Across these pinned corpora, candidate counts remain unchanged at 11,783; 4,076 candidates leave HIGH confidence. This demonstrates corrected confidence, not that every demoted symbol is proven live. These totals include LOW; the default MEDIUM threshold can now display fewer findings.

### Known JavaScript graph limitation

Confidence reflects the evidence in the graph. Where the graph is incomplete, confidence is overstated. A known case: CommonJS `module.exports` assignments and some JavaScript call edges are not currently captured, so symbols in such codebases can appear unused when they are not. Tracked separately as [issue #52](https://github.com/depwire/depwire/issues/52).

The Express reproduction includes `createApplication` explicitly assigned to `module.exports`, plus directly called `tryRender`, `sendfile` and `tryStat`. Its unchanged 27/0/0 distribution is not evidence that all 27 symbols are dead. This release fixes the classifier; the parser defect remains open.

Graph format 2, RESOLUTION_VERSION 5 and the cyclic-groups methodology are unchanged. No parser or resolution changes are included.

---

## 1.22.0 — Cyclic dependency groups replace the cycle count

**Class F — health scores change.** The circular-dependency metric has been replaced. `dimensions_v` is now `2026-09-30-cyclic-groups-v1`; CLI/local-history trends crossing this boundary suppress deltas and explain the change. Graph format (`formatVersion` 2) and resolution (`RESOLUTION_VERSION` 5) are unchanged — graph node and edge contents are byte-identical to v1.21.2 on the same frozen code-graph, nest and drizzle corpora.

### The old metric was wrong

`cycles` reported an incomplete, traversal-dependent subset of simple cycles, not a count of them. Two demonstrations:

- A bidirected triangle has exactly 5 simple cycles. Depwire reported 3.
- On nest, the same graph produced 59 or 86 depending on directory enumeration order. The true simple-cycle count is 1,090, independently verified twice.

Two faults combined: a depth-first search that marked nodes globally visited and returned early, finding only some cycles; and deduplication that sorted each cycle's vertices, conflating distinct directed cycles sharing the same files. The same mistake existed in five implementations — health, architecture docs, dependency docs, security findings and simulation.

Exact simple-cycle counting is not the default metric we want. Counts can grow exponentially with graph size — drizzle-orm has a verified lower bound above 3,000,000 — and a number that large is neither interpretable nor actionable.

### What replaces it

**Cyclic dependency groups**: maximal strongly connected components of more than one file, computed exactly with an iterative Kosaraju traversal. Four values are reported separately:

- group count
- cyclic-file count
- coverage (cyclic files as a proportion of graph-bearing files, including isolates)
- largest-group size

**Coverage drives the score; group count never does.** Two tangled groups merging into one larger group decreases group count without improving the architecture. Scoring uses a continuous coverage penalty up to 80 points plus a concentration penalty up to 20 for the largest group, then rounds the final score.

Each group carries a shortest witness cycle through its lexicographically smallest member, with deterministic tie-breaking. Security findings explicitly anchor the witness at the smallest security-related member instead.

The existing health edge policy is retained: ordinary type references are excluded, while legacy type-only import normalization is preserved. Dropping that normalization would remove 65 cyclic files from Drizzle's health view and improve its dimension score by 15 points — a separate behavior change that this release deliberately avoids.

### Measured impact

| Repository | Old count / per 100 | New groups / cyclic files / coverage / largest | Dimension | Overall |
|---|---|---|---:|---:|
| code-graph | 0 / 0 | 0 / 0 / 0% / 0 | 100 → 100 | 71 → 71 |
| nest | 59 / 3.4 | 17 / 89 / 5.10% / 48 | 60 → 65 | 55 → 56 |
| drizzle-orm | 622 / 70.3 | 11 / 272 / 30.73% / 188 | 20 → 20 | 34 → 34 |
| hono | 86 / 24 | 6 / 80 / 22.28% / 60 | 20 → 35 | 47 → 50 |
| express | 0 / 0 | 0 / 0 / 0% / 0 | 100 → 100 | 82 → 82 |
| zod | 7 / 1.4 | 3 / 12 / 2.35% / 5 | 60 → 88 | 58 → 64 |
| flask | 35 / 35.4 | 2 / 21 / 21.21% / 19 | 20 → 44 | 76 → 81 |
| fastapi | 20 / 2.1 | 2 / 22 / 2.26% / 15 | 60 → 84 | 65 → 69 |

These are pinned calibration corpora, not measurements of today's upstream heads. All five other health dimensions and their raw metrics are unchanged on all eight corpora. Most overall scores rise under the new methodology; that is not evidence that the source architecture improved.

Drizzle's numbers deserve attention: 30.73% of its graph-bearing files participate in mutual dependency cycles, with one group containing 188 files. The old dimension had reached its floor of 20; the new formula also produces 20, though its floor is 0. The unchanged overall is a coincidence, not an engineered invariant.

Zero remains correct on acyclic graphs. Old nonzero counts were incomplete subsets, not necessarily numerically wrong in every individual case.

### Breaking API changes

Removed: `cycles`, `cyclesPer100`, `circularDepsIntroduced`, `circularDepsResolved`, `new_circular_dependencies`. Consumers must migrate to `cyclicGroups` and `cyclicGroupChanges`; the old fields are not repurposed with different meanings.

**`verify-change` no longer certifies export-only analysis as cyclic-dependency safety.** Edited-content and unified-diff requests never constructed a fully resolved after-graph, yet returned an empty cycle list — which callers reasonably read as “no cycles introduced.” These now return `cyclicGroupChanges.status: not_comparable` with an explanation, `safe: false`, and at least medium risk. Genuine deletion simulations build an after-graph and use the new comparison; deleting the last graph file is unscored/not comparable. Export and broken-import checks still run.

**Change reporting is decomposed.** Adding one edge can merge two groups while freeing nobody; removing one can split a group while every file stays cyclic. Results distinguish newly cyclic files, freed files, added/deleted cyclic files, group merges/splits and internal edge changes. The merge fixture keeps four files cyclic while scoring 84→82, correctly reporting a merge rather than a resolution.

### Determinism

Cyclic-group metrics, memberships and witness output are now a function of the graph, independent of its insertion order. Five parses per corpus with shuffled directory enumeration produced byte-identical `cyclicGroups` output. Node and the investigation-only Bun binary agree on all three corpora, with 0, 17 and 11 groups respectively.

Broader output ordering and resolver ambiguity remain separate work. This release does not claim all CLI output is deterministic and does not introduce a standalone-binary distribution.

### Cloud follow-on

This CLI release does not migrate Cloud data. Existing health history remains historical record with its existing methodology labels; unversioned legacy rows must not be treated as comparable to the new methodology. Cloud adoption requires the CLI pin and dimension mapping update, validation of stored latest graphs, fresh snapshots under the new boundary, and its separate bounded-detector correction. No historical rows are silently rewritten.

Implemented in #49. Validation: 280 tests; Ubuntu/Windows × Node 20/22; packed CLI/MCP smoke tests.

## 1.21.2

### Added — pre-commit and prek hook

- Use Depwire directly as a remote hook with `rev: v1.21.2` and `id: depwire`.
- Defaults to `parse . --stats`; `pass_filenames: false` keeps analysis at repository scope. Override `args` to choose another command.
- The hook's `files` pattern covers supported source languages and build manifests. Commits touching only unsupported files (including Markdown-only commits) are skipped; the CLI's empty-parse exit contract is unchanged.
- Git/source installs build the CLI through `prepare`, so hook environments use their own installed binary. Verified registry and branch-tarball installs do not run Depwire prepare/build or install devDependencies.

Thanks to @pygarap for the detailed request in #43, especially `pass_filenames: false`. Implemented in #44.

Includes the v1.21.1 security fixes. No parser, graph-format, or resolution-version change.

## 1.21.1

### Security — command injection in git invocations (remote code execution). Upgrade immediately.

Every git call in `depwire diff`, `depwire affected --git-diff`, `depwire temporal` and the `HISTORY.md` generator was assembled as a shell string and run through `execSync`. Values that an attacker can control reached those strings unescaped, so a crafted value ran arbitrary commands with the privileges of the user running Depwire. **All releases up to and including 1.21.0 are affected**, CLI and MCP server alike.

Three sinks were exploitable; two required no argument from the victim at all:

- **Branch name.** `depwire diff` restores the originally checked-out ref via `git checkout ${branch}` in a shell. Git permits `;`, `&`, `$`, `` ` `` and `>` in ref names, so cloning a repository whose checked-out branch is named `x&curl$IFS…|sh` and running `depwire diff A B` executes the payload. Confirmed by test: the payload created a file in the repository.
- **File name.** `depwire docs` (HISTORY.md) ran `git log … -- "${file}"` for repository file paths. A file named `` `cmd`.ts `` in the repository executes `cmd`. Confirmed by test.
- **Revision arguments.** `depwire diff <a> <b>` and `depwire affected --git-diff <ref>` passed the ref straight into the shell. On the CLI the victim types the argument, so this is lower risk; through the MCP server an AI client that has been prompt-injected can supply it.

`depwire temporal` already validated its inputs and was not exploitable, but used the same shell-string pattern.

**Fix.** All git invocations go through `execFileSync` with an argument array and `shell: false`. User-supplied revisions are validated against an allowlist and rejected (exit 2 for `diff`, exit 1 for `affected`) rather than sanitised; repository-derived branch names and paths are passed as single arguments after `--`. The `sort | uniq -c | sort | head` pipeline in the history generator is computed in-process. `test/command-injection.test.ts` holds a crafted-input test per sink; five fail against 1.21.0.

**Who should act.** Anyone who runs `depwire diff`, `depwire docs`, `depwire temporal` or the MCP server against repositories they did not author, including CI jobs on pull requests from forks. Upgrade with `npm install -g depwire-cli@1.21.1`. The GitHub Action pins its own `depwire-version`; bump it to `1.21.1`.

Reported indirectly via a third-party scanner finding ("untrusted input can reach command sinks"); triaged and fixed the same day.

### Fixed

- `server.json` now declares `packageArguments: ["mcp"]` and `runtimeHint: npx`. Registry-driven clients ran `npx depwire-cli` with no subcommand, got the usage text and exit 1, and reported the server as failing to start.
- MCP `serverInfo.version` reports the package version instead of a hard-coded `0.1.0`.
- `manifest.json` license identifier corrected from `BSL-1.1` (not an SPDX id) to `BUSL-1.1`; the release-metadata validator now enforces it. License terms are unchanged.

Graph output, all health dimensions, `formatVersion 2` and `RESOLUTION_VERSION 5` are unchanged; verified identical on code-graph, nest `4c751c50` and drizzle `b7862528`.

## 1.21.0

### Changed — smaller installation, unchanged runtime

Install size reduced **74%: 251.88 MB → 65.17 MB**, measured with clean npm installs on macOS arm64 for both the full CLI and a graph-only consumer.

Five native `tree-sitter-*` packages moved to `devDependencies` after verifying byte-identical parsing without them across **all 17 supported languages plus TSX/JSX (19 fixtures)**. The WASM-based parsers load bundled grammars via `web-tree-sitter`; the native packages were never used at runtime.

All **33 packed runtime files/assets** are SHA-256 identical to v1.20.2. Graph output, all health dimensions/raws, **formatVersion 2** and **RESOLUTION_VERSION 5** are unchanged. This is a minor release because it changes the dependency contract.

### Security

Upgraded development-only `sharp` to **0.35.4**, clearing the last high-severity audit finding. One existing low-severity development finding in `esbuild` remains.

## 1.20.2

### Fixed — canonical paths and parse contracts

- Canonicalize graph and request paths to project-relative POSIX separators,
  fixing empty Windows `affected_files` results and duplicate file counts in
  `verify-change`. Failed lookups now report an error; resolved files with no
  dependents still return an empty result.
- Write parse output using `--output` > explicit input directory > cwd.
- Exit 2 when no files parse successfully, closing a silent-success gap.
  Partial parses remain exit 0 with a warning and SDK `errorFiles`; valid
  comment-only sources also remain successful even without graph nodes.
- Label parsed files separately from graph files across CLI, architecture
  documentation and MCP tools. Surface accidental swallowed failures identified
  in the parse silent-failure sweep.
- Bump `RESOLUTION_VERSION` from 4 to 5 to invalidate incompatible path caches.
  Graph format remains 2. Symbols, edges and all health dimensions/raws remain
  identical on the fixed POSIX code-graph, Nest and Drizzle fixtures.
- Test Ubuntu and Windows on Node 20 and 22, including installed-tarball CLI,
  parse and all 24 MCP tools. Full evidence is in
  `recon/path-contracts-report.md` and `recon/parse-gates.md`.

## 1.20.1

### Fixed — dependency remediation and scanner accuracy

- Remediate all production dependency audit entries with compatible pinned
  dependency updates and constrained lockfile refreshes.
- Preserve npm advisory chains, identifiers, links, and installed versions.
  Aggregate findings explicitly identify vulnerable transitive dependencies.
- Distinguish automatic dependency-tree fixes from upstream patch availability;
  unavailable advisory metadata is reported as unknown.
- Graph shape and every health metric remain identical on fixed code-graph,
  Nest, and Drizzle inputs. Graph format and resolution versions are unchanged.
- Two development-only audit entries remain documented: sharp requires a
  breaking update, and tsup's esbuild constraint excludes its patched release.
  See `recon/V1.20.1-DEPENDENCY-SCANNER-REPORT.md` for the full audit and gates.

## 1.17.0

### Added — symbol-level TypeScript type references

- New `references-type` edges connect the referencing symbol—or the file node
  at top level—to resolvable project interfaces, type aliases, enums, and
  classes used in type position. Coverage includes heritage clauses, parameter
  and return types, properties, generic arguments, `as`, and `satisfies`.
- Type-only imports now resolve to their imported symbols and participate in
  affected-file and impact traversal. This restores all six `ModuleMetadata`
  oracle paths and all four `FactoryProvider` paths measured on Nest v12.0.1.
- Dead-code analysis and generated dependency docs count type references;
  coupling, cohesion, circular-dependency health, and dependency depth exclude
  them by design. Visualization renders type references distinctly.
- Unresolvable type names are recorded in `unresolvedTypeRefs` without guessing
  or using a builtin stoplist. Parser resolution cache version advances to 2;
  serialized graph `formatVersion` remains compatible at 1.
- Coupling and cohesion exclude `references-type` by design. File pairs
  connected only by type-only imports (previously counted via `imports` edges)
  leave coupling's input—measured impact: 11 of 12,719 pairs (-0.09%) on
  drizzle-orm, with no bucket crossing. Repositories with unusually many
  pure-type-only file pairs near a bucket boundary could see the dimension move.

## 1.16.1

### Fixed — evidence-gated TypeScript call resolution

- Bare calls and constructors no longer fabricate same-file `calls` edges from
  name collisions. Resolution now requires lexical, import, receiver, and
  value-kind evidence; rejected guesses are classified in `unresolvedCalls`.
- Imported constructors now target their actual imported declaration instead
  of a guessed same-file symbol. Parameter, catch, destructured-local, and
  external-import bindings no longer misresolve to same-named local symbols.
- On drizzle-orm SHA
  `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10`, the exhaustive comparison
  removed 4,955 raw occurrences, retargeted 516 calls, and removed 70 unique
  wrong graph relationships. This does not reproduce or supersede the
  v1.13.0-era figure of 558, which was measured on a different Drizzle state
  and is not directly comparable.
- Code-graph's health remains 71/C with all six dimension scores unchanged.
  The full recon and two seeded 30-edge audits are in
  `recon/P0-CORRECTNESS-RECON.md`.

## 1.16.0

### Changed — graph shape and compatibility

- Structural file nodes now have their own `file` kind; real import declarations
  keep the `import` kind. Serialized graphs carry `formatVersion: 1`, and older
  payloads are normalized on read so stored graphs keep working unmodified.
- Symbol counts across every surface—including file context, architecture
  summary, docs, dead-code totals, visualization, and temporal snapshots—now
  exclude structural nodes through one shared predicate.

### Disclosure — symbol-count correction

Symbol totals drop at this version (e.g. −149 on this repository) because structural file nodes are no longer counted as symbols. Totals-over-time views will show a one-time step down at the v1.16.0 boundary — a counting correction, not a code change. Dead-code percentages shift accordingly because the denominator is now real symbols.

## 1.15.0

### Added — reliability gates

- Added a required CI workflow for pull requests and pushes to `main`, running
  clean installs, sequential builds and tests, release-metadata validation, and
  packed CLI/MCP smoke tests on Node 20 and Node 22.
- Added release-metadata synchronization and validation scripts covering
  `package.json`, `server.json`, and `manifest.json`.

### Changed

- Raised the supported Node.js version to 20 or newer. Commander 14 and Vitest
  4 already require Node 20, and Node 18 is end-of-life; this support-contract
  correction is the reason for the minor version bump.
- Unknown `depwire docs --update --only` document names now fail before any
  document is generated and list all 13 valid names.
- Replaced the website's absolute parse-success claim with an accurate statement
  that parse failures are counted and reported.

## 1.14.3

### Fixed — bounded documentation dependency paths (#15)

`depwire docs --update` no longer exhausts the V8 heap while generating
`DEPENDENCIES.md` on highly connected repositories. Documentation and health
now share one bounded SCC/DAG dependency-path analysis in the graph layer, and
displayed documentation chains are expanded into real file-to-file edges.

### Changed — release metadata and documentation

Corrected the package description, README, website, and architecture assets to
report 24 MCP tools and 14 CLI commands. Refreshed the README tool table with
`affected_files` and updated the bundled website footer for v1.14.3.

## 1.14.2

### Removed — withdrawn benchmark claims

Removed the invalid performance and correctness claims from the README,
`depwire prompt` output, and website. The underlying benchmark exposed its
answer key, scored only a subset of the required monorepo consumers, and did not
launch every arm from the same working directory. No result from those runs is
presented as evidence of a Depwire effect. The benchmark is being rerun under a
corrected, pre-registered harness.

## 1.14.1

### Fixed — single Orphans implementation (#11)

`calculateOrphansScore` (src/health/metrics.ts, fs-free, used by `SimulationEngine`/`simulate_change` and the Workers-compatible `depwire-cli/graph` entry point) and `calculateWorkspaceOrphansScore` (src/health/workspace-metrics.ts, fs-aware, used by parse-time `calculateHealthScore`) were two **independent reimplementations** of the same named dimension — same seam introduced by the v1.10.0 SDK split to keep the graph core pure, but nothing kept them from drifting apart afterward. Measured divergence on real repos: 15 points on code-graph (73 pure vs. 88 workspace-aware), 19 points on drizzle-orm (81 vs. 62) — large, active, and in different directions depending on the repo, not latent.

`calculateOrphansScore` is now the only implementation. `calculateWorkspaceOrphansScore` is a thin delegator that injects the real fs-backed dead-symbol detector and file-exclusion predicate into it via an optional `OrphanScoreDependencies` parameter, rather than reimplementing the counting logic. When the dependencies are omitted (`SimulationEngine`, `depwire-cli/graph`), the fs-free fallback runs exactly as before — `health/metrics.ts` still imports nothing from `node:fs`, confirmed by re-running the v1.10.0 closure check against `dist/graph.js` and `dist/tools.js` (zero references to `fs`, `child_process`, `os`, `worker_threads`, tree-sitter, or `better-sqlite3` in either bundle).

**This does not eliminate the score divergence, and isn't meant to.** The fs-free mode (used where no checked-out repo is available, e.g. `simulate_change`) still can't apply test-file, framework-directory, or package-entry-point exclusions, and deliberately keeps a narrower "architecture-level" symbol-kind scope (excluding class methods/properties) than the full detector. That's now a documented, single-source-of-truth difference instead of two silently-diverging implementations — the two modes share one scoring curve and one counting function, and only differ in which inputs they're given.

No real repo's score moved: code-graph stays 71/C with Orphans at 88/B; `simulate_change`'s Orphans component on a real delete simulation stays 73/73 (delta 0). Patch version per this project's own score-movement bump rule (same precedent as #15).

**The residual divergence is now surfaced in the response, not just in code comments.** A single-source-of-truth fix is only useful to a user if they can see it: `simulate_change`'s output (both the pure-registry path in `src/tools.ts` and the legacy MCP path in `src/mcp/tools.ts` -- these are two independent response-formatting implementations wrapping the same `SimulationEngine`, and both needed the same change to stay conformant with each other) now includes a `caveats` array and per-dimension `note` field. When a simulation touches the Orphans dimension, the response explicitly states that its Orphans component is computed without filesystem access and will not match the repo's real Health-tab score -- so a user comparing `simulate_change`'s `healthBefore` against the dashboard sees why they differ, instead of silently wondering whether one of the two is wrong. The `whatif` CLI command prints the same caveat inline.

### Fixed — no fabricated edge for unresolvable member calls (#14, builtin/global misresolution)

`resolveLocalCallTarget` read only the `property` of a `member_expression`
callee (`obj.method()`) — the receiver (`obj`) was never inspected — and
**unconditionally constructed `${file}::propertyName` as the call target,
whether or not that symbol actually existed.** Existence was checked only
to choose immediate-vs-buffered resolution, never to reject the guess. The
result: every `.push()`, `.map()`, `new Error()`, `new Set()`, and every
third-party fluent-API/DSL call (`select()`, `where()`, `expect().toBe()`)
that happened to share a name with *any* symbol declared anywhere in the
same file produced a same-file `calls` edge to that unrelated symbol.
Measured on drizzle-orm: **23,446 wrong same-file `calls` edges**, feeding
directly into `calculateWorkspaceOrphansScore` (which is in-degree-based
and kind-agnostic) — this is why `eq`/`and`, drizzle's most-used exports,
still read as under-used after the 1.13.0 resolution fix: 551 wrong `calls`
edges on `eq` alone were pointing at the unrewritten barrel.

A stoplist was measured and rejected: 269 distinct names were needed for
95% coverage of the wrong edges, and 71% of wrong names were not builtins
at all — they were drizzle's own query-builder vocabulary and vitest
assertion names, which no stoplist could anticipate. Receiver-type
inference was also rejected for now: 48.6% of member-call receivers are
chain expressions unresolvable without a type checker.

**Fix: member-expression calls with an unresolvable receiver now produce NO
edge instead of a guess.** `this.method()` and `super.method()` are the one
exception — the receiver there is knowable (the enclosing instance) — and
still resolve via the existing scope-chain walk, but with the unconditional
flat-name fallback removed: only a real declared class member at some scope
level counts as resolved. (Known gap, reported rather than hidden:
`super.` does not follow `extends` to look up the base class, so
`super.method()` calls that only exist on a base class are recorded
unresolved rather than fabricated. This is a negligible population —
`super.` calls measured at ~0.1% of member calls.)

Bare-identifier calls (`foo()`) are **unaffected** — that is a structurally
different, generally legitimate call shape and was left untouched.

**New: `unresolvedCalls` instrument.** Rejected member calls are recorded,
not silently dropped, via a new `unresolvedCalls` field on `ParsedFile`
(mirroring `unresolvedImports` from 1.13.0) and an `aggregateUnresolvedCalls()`
SDK export, with two reasons: `'unresolvable-receiver'` (receiver is not
`this`/`super` — an identifier, chain expression, or call result) and
`'receiver-not-local'` (receiver is `this`/`super` but no declared class
member matched).

**Impact — real, but smaller than the raw-edge count suggests.** Raw
parsed `calls` edges drop sharply (drizzle-orm: 33,605 → 13,846, -19,759;
nest: 10,009 → 4,802, -52%). Graph-level (deduplicated) edge count moves
far less on both, because `buildGraph`'s `mergeEdge` already collapsed most
fabricated same-source→target duplicates onto a pair that also existed for
a legitimate reason (drizzle: 14,676 → 14,289, -387, -2.6%; nest: 10,049 →
9,630, -419, -4.2%). Practically, that means most of this fix's value is
in what it *prevents going forward* — every future call site that would
have generated one of these fabricated edges no longer can — rather than
in a large score movement today: on both drizzle-orm and nest only the
Orphans/dead-code dimension moved (drizzle 63/D → 62/D, nest 65/D → 64/D;
`graph.inDegree()` is a per-node count, so even a modest edge reduction can
flip individual nodes across the `inDegree === 0` threshold), and the
other five dimensions plus the overall score were unchanged on both
repos. code-graph itself (near-zero same-file name collisions) is
unaffected on every dimension, as a control. **Any repository with
member-expression calls may still see its dead-code count move** — this
is a `DIMENSIONS_V` boundary for downstream consumers (Cloud), not a
`SCORING_VERSION` change (dead-code exclusion semantics are unchanged;
what changed is which edges exist in the graph in the first place).

Exhaustively verified: sampled 50 of the removed edges at random — in
every case the previously-guessed target did not exist as a real symbol at
all (not merely "different receiver," genuinely fabricated). Sampled the
retained same-file `calls` edges — none was a member call with an
unresolvable receiver.

---

## 1.13.0

### Fixed — nested tsconfig paths, workspace package resolution, transitive re-export chains (#12, #14)

Two related resolution gaps that made monorepo import graphs systematically
incomplete, plus a third fix (barrel-chain following) needed to make the
first two useful rather than just less-empty.

**#12 — `loadTsConfig(projectRoot)` searched upward only, from one fixed
root, and never read `extends`.** Every file in a monorepo shared a single
tsconfig regardless of which package it belonged to, so a child package's
own `paths` aliases (e.g. drizzle-orm's `"~/*": ["src/*"]`) never applied.
Fixed by keying the tsconfig cache per directory (nearest ancestor with a
`tsconfig.json`, not past `projectRoot`), resolving `baseUrl` relative to
the config that declares it, and following `extends` to fill fields the
nearest config omits — matching TypeScript's own documented behavior that
`paths` is replaced, not deep-merged, by the nearest config.

**#14 — bare workspace-package specifiers (`import { eq } from 'drizzle-orm'`)
had no resolution path at all** and were indistinguishable from external
npm dependencies. Fixed by discovering internal packages (root
`package.json` `workspaces`, then `pnpm-workspace.yaml`, falling back to a
tree scan for `package.json` files with a `name` field) and mapping bare
specifiers to a source entry point by directory convention
(`src/index.ts`/`.tsx`) — **deliberately not** reading `exports` / `main` /
`module`, which point at build output that does not exist in an unbuilt
clone; resolving through them would create edges to files the parser never
parsed, which is worse than no edge.

**Barrel-chain following (needed for both to matter).** Most workspace
package and path-alias targets are pure re-export barrels
(`export * from './x'`) with zero symbols of their own — a naive directory
lookup lands on an empty file and produces nothing. Added a
post-parse pass (`resolveReExportChains`) that follows wildcard re-export
chains, with cycle protection and a depth cap, to the file that actually
declares the symbol. An import/call/extends/injects edge whose target name
is undeclared in a barrel-shaped file is rewritten to the real declaring
file; **any** edge kind is eligible, not just `imports` — the initial
version only rewrote `imports` edges, which meant `calls` edges (the
majority, and the ones dead-code detection's in-degree check actually
reads) stayed pointed at the unrewritten barrel, so the fix's own
motivating case (`eq`/`and` misread as dead) was not actually fixed for
the metric that mattered until this was corrected.

**Ambiguity is recorded, never guessed.** If a chain reaches more than one
file declaring the same name, the import is recorded unresolved with reason
`ambiguous-reexport` rather than picking one — a wrong edge is worse than a
missing one. New `unresolvedImports` field on `ParsedFile` (aggregated via
`aggregateUnresolvedImports`) classifies every import that didn't resolve
to a local edge: `alias-unresolved`, `workspace-package`, `external`,
`relative-not-found`, `chain-exceeded-depth`, `ambiguous-reexport`, `other`.
This metric is new in this release.

**Two bugs found by exhaustively verifying every edge the fix added** (not
sampling — a 30-edge import-only sample had passed 30/30 while missing
that `calls` edges, the majority, were still broken):
- `abstract_class_declaration` was a distinct tree-sitter node type never
  matched by the class-parsing switch, so abstract classes (e.g.
  drizzle-orm's `View`, `Relation`) produced **zero SymbolNodes** and were
  completely invisible to the graph — previously masked because imports of
  them were unresolved anyway. Fixed by handling
  `abstract_class_declaration` identically to `class_declaration` (same AST
  shape). **This is a parser-level change that raises symbol counts on
  every TypeScript repo, not just monorepos** — measured on code-graph's
  own self-scan (a single-package, non-monorepo repo with no path aliases
  or workspaces): 5,861 → 5,983 symbols (+122). Every health dimension and
  the overall score (71/C) were unaffected by this, because abstract
  classes add nodes without changing file-level edges — but that means the
  control validated *edge* correctness, not *node-count* invariance. A
  repo whose symbol count is compared before/after this release will show
  a rise attributable to this one change, independent of anything else in
  this release.
- Namespace imports (`import * as V1 from 'mod'`) were treated like named
  imports, creating an edge target `mod::V1` — a symbol name that almost
  never exists, since a namespace import binds the whole module object, not
  a symbol literally named after the alias. Fixed to target the file-level
  `__file__` pseudo-node instead, consistent with other whole-file
  reference edges.
- Aliased re-exports (`export { x as y } from './mod'`) used the first
  identifier in the AST for both the local symbol name and the resolution
  target, instead of the `name`/`alias` fields — mirroring a fix already
  present on the import side.

**Known remaining gap (5 cases in drizzle-orm, exhaustively enumerated, not
a "some remain" hand-wave):** re-exporting an anonymous `export default`
value (an array/object literal with no name to attach a SymbolNode to, e.g.
drizzle-seed's dataset files) or a field pulled from a non-code file
(`export { version as npmVersion } from '../package.json'`) has no
SymbolNode to target regardless of alias handling — a different, narrower
problem than either bug above, left unresolved rather than papered over
with a guess.

**Out-of-scope bug found by this same exhaustive check, filed separately:**
built-in/global method and constructor calls (`.push()`, `new Error()`,
`new Set()`, ...) misresolve as same-file local symbol references —
~2,640 occurrences on drizzle-orm, confirmed pre-existing (present before
this fix too, unrelated to #12/#14/#15). Not fixed here; filed as
[depwire/depwire#14](https://github.com/depwire/depwire/issues/14).

**Impact — graph edges change, and monorepo health scores move, mostly
down.** Measured on drizzle-orm (968 files): edges 5,355 → 14,676
(+9,321 real, correctly-declared cross-file connections instead of
dangling barrel targets), cross-directory edges 0% → 21.21% (the 0%
coupling anomaly open since Aug 12 is resolved: it was caused by these
exact missing edges, not a scoring bug), circular-dependency cycles 110 →
582 (Circular Deps stays 20/F — already the bottom bucket at either count),
Coupling 70/C → 30/F, Cohesion 80/B → 40/F, Orphans 46/F → 63/D, overall
health **57/F → 39/F**. `code-graph`'s own self-scan (no path aliases, no
workspaces, no nested tsconfigs) is the control and is unchanged at 71/C —
any movement there would mean the change leaked into single-package
resolution.

**A note on drizzle-orm's 39/F specifically, since it is a widely-used,
well-regarded project and this drop is large enough to read as "the tool
is broken" rather than "the tool got more accurate."** It is not a
judgment on drizzle-orm's engineering quality. Every dimension that moved
did so because edges that were previously silently missing (workspace
imports, path-alias imports) are now present — the *coupling* and *cross-
package cycles* were always there in the source code; this release is the
first time the tool could see them. `DIMENSIONS_V` suppresses the
before/after *delta* in the UI so it isn't read as a regression, but it
does not annotate the *absolute* number. Health scores for monorepos
computed before this release should not be compared, in either direction,
against health scores computed after it without this context — the
underlying methodology, not the codebase, changed.

New regression test (`test/workspace-resolution.test.ts`) with a minimal
two-package fixture monorepo covers the bare-specifier-through-a-barrel
case directly; verified as a real gate by running it against the pre-fix
parser and confirming it fails.

### Fixed — exponential longest-path search in the Dependency Depth dimension (#15)

`calculateDepthScore`'s longest-path search was exhaustive backtracking over
every simple path in the file-level dependency graph, with no memoization
(`visited.delete(node)` on return). That is exponential once the graph has
real cycles, and it could hang **indefinitely** — 40+ seconds without
completing on a graph with 380 file-level cycles, while every other health
dimension on the same graph completes in under 50ms. This was latent in
every published version; it only stayed unnoticed because most repos'
file-level graphs are near-acyclic and the cross-package edges that create
most real circular structure were, until recently, largely missing (see the
import-resolution work in progress on `fix/import-resolution`).

**What changed:** the dimension now computes the longest path in the DAG of
strongly connected components (Tarjan condensation), memoized over a single
topological pass — O(V+E), and it cannot hang. Longest simple path on a
cyclic graph is NP-hard and has no principled single answer (a cycle can be
entered or exited at any of its members), so the previous exhaustive search
wasn't computing a well-defined quantity on cyclic graphs to begin with —
it was finding *some* long simple path, dependent on iteration order. The
new number means "the longest chain of hops through the codebase's
dependency clusters, where each strongly-connected cluster counts as one
hop regardless of its internal size" — deterministic and reproducible run
to run.

**Compatibility:** on a graph with **zero file-level cycles**, every SCC is
a singleton, so the new algorithm is provably identical to the old one (both
compute the unique true longest simple path on a DAG) — not just similar,
identical. Verified exactly on `code-graph`'s own self-scan: 71/C overall,
Depth dimension unchanged at 40/F, "10 levels," before and after.

**On any graph with cycles, the score changes — even a handful of cycles is
enough.** Measured on drizzle-orm (pre-import-resolution-fix graph, 110
file-level cycles): maximum depth 19→9, Depth score 20/F→40/F. This is not a
bug: the old number for that graph was an arbitrary simple path threaded
through cycle members, which is exactly the kind of confidently-precise-but-
meaningless number this project has been eliminating all week. Because a
real repo's score can move from this fix alone, this ships as a minor
version bump (1.13.0) rather than a patch, even though the fix is
correctness-only and introduces no new resolution behavior.

## 1.12.0

### Fixed — dead-code exclusion path matching (#13, #10)

Two path-matching bugs in dead-code exclusion, moving the reported count
in **opposite directions**. Measured separately (see
`test/fixtures/dead-code-snapshot.manifest.json` and the PR description
for the full before/after table across multiple real repos) so one fix's
effect can't mask a compensating error in the other.

**#13 — `isTestFile()` required a leading slash, so root-level `tests/`
and `test/` directories never matched (count moved down after the fix).**
The check was `filePath.includes("/test/")` / `"/tests/"` — a substring
match that only fires when the directory is nested under something else.
A project-relative path for a root-level test directory is literally
`"tests/foo.py"`, with no leading slash, so the substring never matched.
This is the dominant convention in pure-Python repos (pytest) and common
in JS repos too: on a pure-Python target repo, 80.8% of symbols reported
dead were under `tests/`, and 73.9% of the total were `test_*` pytest
functions invoked by framework discovery — 68.7% "dead" overall, almost
entirely test code that isn't dead. Fixed by matching test-directory
names (`test`, `tests`, `__tests__`, `spec`) against normalized path
*segments* rather than substrings, so the check now fires regardless of
where in the path the directory sits — first segment, middle, or last.
Applied in both `src/dead-code/detector.ts` (`isTestFile`) and
`src/core/exclusions.ts` (`isTestFile`, the shared orphan-reporting
exclusion used by health scoring and other reporting paths).

**#10 — `isFrameworkAutoLoadedFile()` matched bare directory names
(`/app/`, `/api/`, `/config/`, `/routes/`, etc.) against any path,
regardless of whether the matching framework was actually in use (count
moved up after the fix).** `app/`, `api/`, `config/`, and `routes/` are
common, legitimate directory names with no framework association outside
Next.js/Rails/Spring/ASP.NET Core conventions — any repo with one of
these names permanently lost those symbols from dead-code and orphan
reporting, with no way to opt back in. Fixed by gating each
framework-specific directory group behind a real marker detected once
per scan (not per file): `next.config.*`/`nuxt.config.*` or a `next`/`nuxt`
dependency for `pages/`, `app/`, `api/`, `routes/`, `middleware/`;
`Gemfile`/`config/routes.rb` for Rails' `app/`, `routes/`,
`controller(s)/`; a root `.csproj`/`.sln` for ASP.NET Core's
`Controllers/`, `Hubs/`, `Migrations/`; `pom.xml`/`build.gradle(.kts)` for
Java/Spring's `controller(s)/`, `service/`, `repository/`,
`config(uration)/`; and known Node server/CLI dependencies (express,
koa, fastify, hapi, NestJS, commander, yargs, oclif) for `routes/`,
`middleware/`, `commands/`, `controller(s)/`. Absent the corresponding
marker, these are just directories — no exclusion is applied.

`test/fixtures/dead-code-snapshot.json` and its manifest were regenerated
against a clean tree to reflect the new counts; the language-specific
exclusions (C++, Kotlin, PHP, Swift, Mojo, Ruby, Dart, R) in
`shouldExclude()` were not touched by this change.

---

## 1.11.0

### Fixed — dead-code detection returned zero in production; Orphans health dimension was inflated

Two correctness bugs in dead-code detection, both silently in effect since
the checks were written. **Dead-code output changes materially for every
user, in both directions** — this is a correctness release, not a minor
patch, despite the version-number-looking scope.

**CWD/relative-path collision.** `shouldExclude()` and
`calculateWorkspaceOrphansScore()` called `path.relative(projectRoot, filePath)`
with a `filePath` that is project-relative by design. Node silently resolves
a relative second argument against `process.cwd()` instead of diffing
against `projectRoot`. On Railway (Nixpacks default container `WORKDIR` is
`/app`), every relative path picked up an `/app/` substring, which
`isFrameworkAutoLoadedFile()` treats as a framework-auto-loaded exclusion —
so every symbol in every repo was excluded, producing `deadSymbols: 0` in
every production parse, while local runs (whose cwd never collided with
`/app/`) returned correct, non-zero results. The same bug made
`isRealPackageEntryPoint()` compare a relative path against absolute
package entry points, which can never match by construction — a package's
own `main`/`module`/`exports` entry file (typically `inDegree === 0`, since
nothing internal imports it) was misclassified as dead in every
environment, not just Railway. Fixed by resolving `filePath` to absolute
before any `path.relative()` call or absolute-path comparison.

**`relevantKinds` was missing `"variable"`.** The detector's relevant-kind
allowlist included `"const"`, `"let"`, and `"var"` — TypeScript source
keywords that no parser ever emits as a `SymbolKind` value — but not
`"variable"`, which is what the TypeScript, JavaScript, C, and Go (for
`var`) parsers actually emit for non-const-like declarations. Every
exported `variable`-kind symbol was rejected before the exported/inDegree
checks ran at all. Fixed by adding `"variable"` to the allowlist; the
downstream exported-only gate already handled it correctly, unused since
day one.

Both are covered by `test/dead-code-cwd.test.ts` (asserts detector output
is independent of `process.cwd()`, and that a package entry point is
excluded as `"entry"` rather than reported dead) and by
`test/fixed-snapshot.test.ts`, a frozen graph snapshot (see
`test/fixtures/`) that gates future detector/scoring changes against a
fixed reference instead of the live, drifting repo tree.

`SCORING_VERSION` boundary: the scoring curves are unchanged; the inputs
to the Orphans dimension and dead-code counts are not comparable across
this release. A trend line crossing this boundary will show movement
that isn't a regression.

Two related issues investigated but deliberately not bundled into this
release, filed separately because they change the *graph* rather than the
dead-code interpretation of it:
- [#10](https://github.com/depwire/depwire/issues/10) — `isFrameworkAutoLoadedFile()`
  substring matching over-excludes legitimate `app/`/`api/`/`config/` directories.
- [#11](https://github.com/depwire/depwire/issues/11) — two divergent Orphans-score
  implementations (`simulate_change` vs. `calculateHealthScore`).
- [#12](https://github.com/depwire/depwire/issues/12) — nested `tsconfig.json` path
  aliases are invisible in monorepos (`loadTsConfig` scoped to `projectRoot`
  instead of the importing file's directory); also a candidate explanation
  for the open 0%-cross-directory-coupling anomaly on multi-package repos.

---

## 1.10.0

### Added — Workers-compatible graph entry point

Added `depwire-cli/graph`, a graph-only SDK surface for serialization, queries,
architecture simulation, and pure health dimensions. The entry point performs
no filesystem access and does not load parsers, tree-sitter, or native modules.

Added `depwire-cli/tools`, a Workers-compatible registry containing the ten
graph-only MCP tool definitions and handlers. Host surfaces provide repository
metadata and explicit available, unavailable, or stale precomputed results.

## 1.9.5

### Fixed — size-normalized health scoring

God files and circular dependencies are now scored as densities per 100 files
instead of absolute counts. Recommendations retain the absolute count and add
the normalized density for project-size context.

## 1.9.3

### Added — `depwire query --json`

Symbol-level impact analysis as structured JSON on stdout, for programmatic
consumers and deterministic oracle verification. Facts go to stdout; progress,
warnings and telemetry go to stderr.

`<directory>` is now optional and defaults to the current directory, so
`depwire query <symbol> --json` works from inside a project. The existing
`depwire query <directory> <symbol>` form is unchanged.

Exit codes:

- `0` success

- `1` symbol not found

- `2` no parseable files

- `3` ambiguous — a bare name matched multiple symbols; use `file.ts::symbol`

File-level `::__file__` pseudo-nodes are excluded by default so counts reflect
real symbols rather than import statements. `fileLevelDependents` and
`inDegreeRaw` report what was filtered, and `--include-file-nodes` restores the
unfiltered view. On this repository, `getImpact` reports 3 direct dependents
filtered versus 6 unfiltered.

Default (non-JSON) text output is unchanged.

### Fixed — documentation

Tool count corrected from 23 to 24 across README and `server.json`.
`affected_files` shipped in v1.8.4 and the count was never updated.

## 1.9.2

> 1.9.1 was tagged but never published to npm; superseded by 1.9.2.
> The two are functionally identical.

### Fixed — no more false green on empty projects

`depwire health` reported **100/100 Grade A** for directories it parsed nothing from —
an empty folder, an unsupported language, or a failed parse all produced "Excellent
architecture," and the CLI exited 0 so CI read it as a pass.

Depwire now refuses to score when there is no data: it names the directory, lists the
extensions it supports, and exits 2. The same refusal applies to `security` and
`dead-code`, and to the `get_health_score`, `find_dead_code` and `security_scan` MCP
tools, which previously returned success-shaped results an agent would read as a clean
bill of health.

Also: the SimulationEngine test suite now runs under vitest, so `npm test` exits 0.

---

## 1.9.0

### Fixed — parser correctness

Depwire was under-reporting its own dependency graph. Four parser bugs, all found by
running Depwire against itself:

- **Type-only imports produced no edges.** `import type { X } from './y'` was silently
  dropped — the `type` keyword shifts the import clause by one AST slot and the parser
  read the wrong node. On this repo that was 70 of 512 imports (13.7%) contributing
  nothing to the graph. Files consisting only of exported types were reported as
  orphans, and every type they declared was reported as dead code.
- **Aliased imports bound the wrong name.** `import { alpha as beta }` registered
  `alpha`, so calls to `beta()` never resolved across files.
- **Function and method bodies were walked twice** — once scoped, once unscoped. This
  inflated symbol counts and, worse, produced ids that collided with real top-level
  symbols. Fixed in the TypeScript, Python, C#, C++ and Java parsers.
- **Function-local declarations were marked as exported**, because the export check
  walked past enclosing scopes.

Also fixed: forward-referenced local calls now resolve correctly; Python symbol ids are
now scope-qualified (`file::Class.method`) instead of flat; test fixtures and static
HTML entry points are no longer counted as orphans, and all orphan-reporting paths now
share one definition.

### ⚠️ Your numbers will change

Health scores, symbol counts, orphan lists and dead-code results will differ from 1.8.x
on unchanged source. The previous numbers were wrong. If you gate CI on a health
threshold, re-baseline it.

### Known limitations

- Symbol ids are function-scoped, not block-scoped, so repeated names in sibling blocks
  within one function share an id.
- The Dart and R parsers still emit some call sites as declarations.
- Symbol extraction depth varies by language; C++ coverage is thin.

---

## [1.7.1] - 2026-06-11

### Bug Fixes
- **Fix cross-module Java/Kotlin import resolution** (#7) — Java and Kotlin imports between Maven modules and Gradle subprojects now resolve correctly. Previously, `resolveJavaImport` and `resolveKotlinImport` only checked hardcoded source roots relative to the project root, missing files in module subdirectories like `module-b/src/main/java/`. The parser now runs a pre-pass that discovers Maven modules from `<module>` entries in `pom.xml` and Gradle subprojects from `include()` entries in `settings.gradle` / `settings.gradle.kts`. Supports recursive nested modules and both standard and non-standard source layouts. Tested on google/guice (13 modules, 647 files): cross-file Java edges went from 0 to 2,247, with 759 cross-module edges and 124 dependents detected on the Injector class.

### Testing
- Added vitest test runner with `npm test` script
- Added unit tests for JVM module discovery (jvm-modules.test.ts)
- Added integration tests for cross-module Java and Kotlin import resolution
- Added cross-project isolation test (no state leaks between parseProject calls)

Thanks to @asaarela-bw for the detailed bug report.

---

## [1.7.0] - 2026-05-29

### Added
- **`depwire diff` CLI command** — Structural comparison between two git commits
  - Compare any two git refs (branches, tags, commit hashes, HEAD~N)
  - Shows added/removed/modified symbols, edge changes, blast radius
  - Health score delta and security findings diff
  - JSON output mode for scripting (`--json`)
  - Verbose mode showing every changed symbol by name (`--verbose`)
  - Safe: uncommitted changes are stashed and restored even on error (try/finally)
  - Exit codes: 0 (success), 1 (usage error), 2 (git error), 3 (parse error)
- Core logic in `src/core/diff.ts` — reusable for future MCP tool integration

---

## [0.9.0] - 2026-03-13

### Added
- **Rust language support** — Full parsing support for Rust `.rs` files
  - Functions (`fn`), structs, enums, traits, impl blocks (methods)
  - Constants, type aliases, use declarations (`use crate::`, `use super::`, `use self::`)
  - Module declarations (`mod`) with file resolution (`module.rs` and `module/mod.rs`)
  - Cross-file dependency tracking via imports
  - `Cargo.toml` as project root marker
- Tree-sitter Rust WASM grammar (v0.23.2)
- Comprehensive Rust test fixtures (`test/fixtures/rust-project/`)
- 5th supported language (TypeScript, JavaScript, Python, Go, Rust)

### Fixed
- **Graph builder bug**: Target `__file__` nodes were not being created, causing import edges to be silently dropped
  - Impact: Go fixture edges increased from 1 → 7, Rust fixture edges increased from 2 → 7
  - This fix benefits all languages by ensuring file-level import edges are properly added to the graph

### Changed
- Updated README, website, and server.json to reflect Rust support
- Bumped version from 0.8.0 → 0.9.0
- Updated supported languages documentation and roadmap

---

## [0.6.0] - 2026-03-06

### Added
- **Dependency Health Score** — `depwire health` command scores architecture 0-100 across 6 dimensions
  - **Coupling (25%):** How tightly connected are modules?
  - **Cohesion (20%):** Do files in directories relate to each other?
  - **Circular Dependencies (20%):** Files depending on each other in cycles
  - **God Files (15%):** Files with abnormally high connection counts
  - **Orphan Files (10%):** Files with zero connections
  - **Dependency Depth (10%):** How deep are dependency chains?
- Letter grades (A-F) per dimension and overall
- `--json` flag for CI/automation integration
- `--verbose` flag for detailed per-dimension breakdown
- Actionable recommendations based on detected issues
- Health history tracking in `.depwire/health-history.json` (last 50 checks)
- Score trend display (↑/↓ from previous check)
- `get_health_score` MCP tool (13 tools total, was 12)
- `HEALTH.md` document generator (12 documents total, was 11)

### Changed
- Updated README, website, and documentation to reflect 13 MCP tools
- Updated documentation count from 11 to 12

---

## [0.5.0] - 2026-03-05

### Added
- **7 new document generators (Phase B)** — Brings total to 11 comprehensive documentation files:
  - `FILES.md` — Complete file catalog with metrics, orphan files, hub files
  - `API_SURFACE.md` — All exported symbols (public API), most-used exports, unused exports
  - `ERRORS.md` — Error handling patterns, error-prone files, custom error classes
  - `TESTS.md` — Test file inventory, test-to-source mapping, untested files, coverage stats
  - `HISTORY.md` — Git history + graph analysis, file churn, feature timeline, contributors
  - `CURRENT.md` — Complete codebase snapshot (every file, symbol, and connection)
  - `STATUS.md` — TODO/FIXME/HACK inventory with priority matrix based on file connections
- Total generated documents: **11** (was 4 in v0.3.0)
- `HISTORY.md` gracefully handles projects without git (shows graph-based analysis only)
- `STATUS.md` scans source files for TODO/FIXME/HACK/XXX/NOTE/OPTIMIZE/DEPRECATED comments

### Changed
- Updated `depwire docs` command to support all 11 document types
- Updated README and website to reflect 11 generators
- Expanded `--include` flag values to include all 7 new document types

---

## [0.4.0] - 2026-03-05

### Changed
- **BREAKING (internal): Migrated from native tree-sitter to web-tree-sitter (WASM)**
  - Zero native compilation required — no Python, no node-gyp, no C++ build tools
  - Fixes installation failure on Windows (and any system without build prerequisites)
  - Works on all platforms: Windows, macOS, Linux (x64, ARM64)
  - Parser output is identical — no changes to analysis results
  - Slight performance difference (~10-30%) — negligible for all practical use cases (26-33ms vs 9-13ms on test fixtures)

### Fixed  
- Windows installation failure: `npm install -g depwire-cli` now works without Python or Visual Studio Build Tools
- Installation on systems without Xcode Command Line Tools (macOS)
- Installation on ARM64 systems (Apple Silicon, ARM Linux)
- Eliminates all native build dependencies

---

## [0.3.1] - 2026-02-28

### Fixed
- **Symbol disambiguation**: `impact_analysis`, `get_symbol_info`, `get_dependencies`, and `get_dependents` now return all matches when multiple symbols share a name, with file locations and dependent counts for disambiguation
- **Full ID matching**: All symbol tools now accept fully qualified IDs (e.g., `src/router.ts::Router`) for exact matching
- Tool descriptions updated to clarify full ID support and disambiguation behavior
- Improved error messages with fuzzy suggestions when symbols are not found

### Added
- New `findSymbols()` helper function in `queries.ts` for consistent symbol lookup across all tools
- `SymbolMatch` interface for standardized symbol metadata

---

## [0.3.0] - 2026-02-27

### Added
- **`depwire docs` command** — Auto-generate comprehensive codebase documentation from dependency graphs
- 4 document generators: `ARCHITECTURE.md`, `CONVENTIONS.md`, `DEPENDENCIES.md`, `ONBOARDING.md`
- 2 new MCP tools: `get_project_docs` and `update_project_docs` (12 tools total)
- `--output`, `--format`, `--include`, `--update`, `--only`, `--verbose`, `--stats`, `--gitignore` flags for docs command
- `.depwire/metadata.json` for tracking document freshness and generation stats
- Tested on Hono (352 files, 6,072 symbols) — generates all docs in <0.2s

### Fixed
- Onboarding reading order: Foundation/Core/Entry Points sections now properly populated with categorized files
- Key Concepts clustering: Detects module clusters (parser, graph, mcp, viz, docs) using directory-based grouping
- Dependency matrix: Filters to top-level src/ directories, shows clean 6×6 grid
- Absolute paths in generated docs: Now uses `.` instead of full project path in command examples

---

## [0.2.6] - 2026-02-26

### Fixed
- **npm bin field**: Corrected bin path format from `./dist/index.js` to `dist/index.js` to resolve npm publish warning "bin[depwire] script name was invalid and removed." Global CLI install (`npm install -g depwire-cli`) now works correctly for all users.

### Changed
- Updated MCP Registry server.json to v0.2.6

---

## [0.2.5] - 2026-02-25

### Added
- **Public launch** — First public release of Depwire
- **npm package** published as `depwire-cli` on npmjs.com
- **GitHub repository** at github.com/depwire/depwire (public)
- **Official MCP Registry** listing: `io.github.atef-ataya/depwire`
- **Glama** listing: approved and claimed
- **mcpservers.org** listing: submitted
- **Landing page** at depwire.dev (Cloudflare Pages)
- **CLA enforcement** via GitHub Action
- **Author information**: YouTube, book, LinkedIn links in README
- **Hero image** and 4 demo GIFs in README
- **glama.json** in repo root for Glama integration
- **server.json** in repo root for MCP Registry

### Changed
- **Rename**: CodeGraph → Depwire across entire codebase
- **License**: BSL 1.1 with ATEF ATAYA LLC as licensor (converts to Apache 2.0 on Feb 25, 2029)
- **README**: Complete rewrite with pain-first narrative, benchmarks, and comparison table

---

## [0.2.0] - 2026-02-24

### Added
- **Go language support** (Phase 8): `.go` file parsing with go.mod resolution, struct embedding, interface implementation, and package-level scoping. 6 fixture files, 21 symbols.
- **Security hardening** (Phase 9): All 8 security checks passed — read-only guarantee, path traversal protection, no code execution, file size limits, localhost-only server, safe git cloning, dependency audit, SECURITY.md published.

### Fixed
- **Large file parser failure**: Added `bufferSize: 1024 * 1024` to all 4 language parsers
- **File watcher not detecting changes**: Fixed chokidar patterns, added polling mode (1s interval), fixed ignore patterns for all 8 file extensions
- **Port collision crash**: Auto-increment port finder (3333-3343) with graceful error handling
- **Missing CLI flags**: Added `--exclude`, `--verbose`, `--port`, `--stats`, `--pretty`
- **Version hardcoded**: Now reads dynamically from package.json

---

## [0.1.0] - 2026-02-22

### Added
- **TypeScript parser** (Phase 1): tree-sitter parsing for `.ts` and `.tsx` files. Functions, classes, variables, imports, exports, interfaces, type aliases, enums, methods, and properties extraction.
- **Graph engine** (Phase 1): graphology DirectedGraph with symbol nodes and reference edges.
- **Arc diagram visualization** (Phase 2): D3.js interactive Harrison Bible-style arc diagram with dark theme, hover highlighting, search, filtering, and PNG export.
- **MCP server** (Phase 3): 10 tools for AI coding assistant integration via stdio transport — connect_repo, impact_analysis, get_file_context, get_dependencies, get_dependents, search_symbols, get_architecture_summary, list_files, get_symbol_info, visualize_graph.
- **File watching** (Phase 4): chokidar-based file watcher for live graph refresh on code changes.
- **GitHub repo cloning** (Phase 5): Clone any GitHub repository for analysis. MCPB packaging for bundled distribution.
- **Python language support** (Phase 6): `.py` file parsing with relative imports, decorators, class inheritance, and `__init__.py` resolution. 8 fixture files, 32 symbols, 11 edges.
- **JavaScript/JSX support** (Phase 7): `.js` and `.jsx` file parsing with CommonJS require() support, ES modules, and JSX component detection. 7 fixture files, 42 symbols, 14 edges.
- **CLI**: Commander.js-based CLI with `parse`, `viz`, and `mcp` subcommands.

---

## Links

- [GitHub Repository](https://github.com/depwire/depwire)
- [npm Package](https://www.npmjs.com/package/depwire-cli)
- [Website](https://depwire.dev)
- [MCP Registry](https://registry.modelcontextprotocol.io)

[1.7.1]: https://github.com/depwire/depwire/compare/v1.7.0...v1.7.1
[0.2.6]: https://github.com/depwire/depwire/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/depwire/depwire/compare/v0.2.0...v0.2.5
[0.2.0]: https://github.com/depwire/depwire/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/depwire/depwire/releases/tag/v0.1.0
