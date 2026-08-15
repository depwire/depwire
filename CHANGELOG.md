# Changelog

All notable changes to Depwire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## 1.14.0

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
