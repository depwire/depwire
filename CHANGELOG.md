# Changelog

All notable changes to Depwire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.6]: https://github.com/depwire/depwire/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/depwire/depwire/compare/v0.2.0...v0.2.5
[0.2.0]: https://github.com/depwire/depwire/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/depwire/depwire/releases/tag/v0.1.0
