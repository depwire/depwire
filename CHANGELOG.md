# Changelog

All notable changes to Depwire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
