# Changelog

All notable changes to Depwire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
