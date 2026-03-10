# Depwire

![Depwire - Arc diagram visualization of the Hono framework](./assets/depwire-hero.png)

**See how your code connects. Give AI tools full codebase context.**

⭐ **If Depwire helps you, please [star the repo](https://github.com/depwire/depwire)** — it helps this open-source project grow into an enterprise tool.

Depwire analyzes codebases to build a cross-reference graph showing how every file, function, and import connects. It provides:

- 🎨 **Beautiful arc diagram visualization** — Interactive Harrison Bible-style graphic
- 🤖 **MCP server for AI tools** — Cursor, Claude Desktop get full dependency context
- 📊 **Dependency health score** — 0-100 score across 6 dimensions (coupling, cohesion, circular deps, god files, orphans, depth)
- 📄 **Auto-generated documentation** — 12 comprehensive documents: architecture, conventions, dependencies, onboarding, file catalog, API surface, error patterns, test coverage, git history, full snapshot, TODO/FIXME inventory, and health report
- 🔍 **Impact analysis** — "What breaks if I rename this function?" answered precisely
- 👀 **Live updates** — Graph stays current as you edit code
- 🌍 **Multi-language** — TypeScript, JavaScript, Python, and Go

## Why Depwire?

AI coding tools are flying blind. Every time Claude, Cursor, or Copilot touches your code, it's guessing about dependencies, imports, and impact. The result: broken refactors, hallucinated imports, and wasted tokens re-scanning files it already saw.

**Lost context = lost money + lost time + bad code.**

**Depwire parsed the entire Hono framework — 305 files, 5,636 symbols, 1,565 dependency edges — in 2.3 seconds.**

Depwire fixes this by giving AI tools a complete dependency graph of your codebase — not a fuzzy embedding, not a keyword search, but a deterministic, tree-sitter-parsed map of every symbol and connection.

### Stop Losing Context
- **No more "start from scratch" chats** — Depwire is the shared knowledge layer that every AI session inherits. New chat? Your AI already knows the architecture.
- **Stop burning tokens** — AI tools query the graph instead of scanning hundreds of files blindly
- **One command, every AI tool** — Claude Desktop, Cursor, VS Code, any MCP-compatible tool gets the same complete picture

### Ship Better Code
- **Impact analysis for any change** — renaming a function, moving a file, upgrading a dependency, deleting a module — know the full blast radius before you touch anything
- **Refactor with confidence** — see every downstream consumer, every transitive dependency, 2-3 levels deep
- **Catch dead code** — find symbols nobody references anymore

### Stay in Flow
- **Live graph, always current** — edit a file and the dependency map updates in real-time. No re-indexing, no waiting.
- **Works locally, stays private** — zero cloud accounts, zero data leaving your machine. Just `npm install` and go.

### 14 MCP Tools, Not Just Visualization
Depwire isn't just a pretty graph. It's a full context engine with 14 tools that AI assistants call autonomously — architecture summaries, dependency tracing, symbol search, file context, health scores, temporal evolution, and more. The AI decides which tool to use based on your question.

## Installation

![Installation](./assets/installation.gif)

```bash
npm install -g depwire-cli
```

Or use directly with `npx`:
```bash
npx depwire-cli --help
```

## Quick Start

### CLI Usage

```bash
# Auto-detects project root from current directory
depwire viz
depwire parse
depwire docs
depwire health
depwire temporal

# Or specify a directory explicitly
npx depwire-cli viz ./my-project
npx depwire-cli parse ./my-project
npx depwire-cli temporal ./my-project

# Temporal visualization options
npx depwire-cli temporal --commits 20 --strategy monthly --verbose --stats

# Exclude test files and node_modules
npx depwire-cli parse --exclude "**/*.test.*" "**/node_modules/**"

# Show detailed parsing progress
npx depwire-cli parse --verbose

# Export with pretty-printed JSON and statistics
npx depwire-cli parse --pretty --stats

# Generate codebase documentation
npx depwire-cli docs --verbose --stats

# Custom output file
npx depwire-cli parse -o my-graph.json
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "depwire": {
      "command": "npx",
      "args": ["-y", "depwire-cli", "mcp"]
    }
  }
}
```

**Depwire auto-detects your project root. No path configuration needed.**

Then in chat:
```
Show me the architecture.
```

### Cursor

Settings → Features → Experimental → Enable MCP → Add Server:
- Command: `npx`
- Args: `-y depwire-cli mcp`

**Depwire auto-detects your project root from the current working directory.**

## Available MCP Tools

| Tool | What It Does |
|------|-------------|
| `connect_repo` | Connect to any local project or GitHub repo |
| `impact_analysis` | What breaks if you change a symbol? |
| `get_file_context` | Full context — imports, exports, dependents |
| `get_dependencies` | What does a symbol depend on? |
| `get_dependents` | What depends on this symbol? |
| `search_symbols` | Find symbols by name |
| `get_architecture_summary` | High-level project overview |
| `list_files` | List all files with stats |
| `get_symbol_info` | Look up any symbol's details |
| `visualize_graph` | Generate interactive arc diagram visualization |
| `get_project_docs` | Retrieve auto-generated codebase documentation |
| `update_project_docs` | Regenerate documentation on demand |
| `get_health_score` | Get 0-100 dependency health score with recommendations |
| `get_temporal_graph` | Show how the graph evolved over git history |

## Supported Languages

| Language | Extensions | Features |
|----------|-----------|----------|
| TypeScript | `.ts`, `.tsx` | Full support — imports, classes, interfaces, types |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | ES modules, CommonJS require(), JSX components |
| Python | `.py` | Imports, classes, decorators, inheritance |
| Go | `.go` | go.mod resolution, structs, interfaces, methods |

## Visualization

![Depwire CLI](./assets/viz-command.gif)

![Interactive Arc Diagram](./assets/graph.gif)

```bash
# Auto-detects project root (run from anywhere in your project)
depwire viz

# Or specify a directory explicitly
depwire viz ./my-project

# Custom port
depwire viz --port 8080

# Exclude test files from visualization
depwire viz --exclude "**/*.test.*"

# Verbose mode with detailed parsing logs
depwire viz --verbose

# Don't auto-open browser
depwire viz --no-open
```

Opens an interactive arc diagram in your browser:
- Rainbow-colored arcs showing cross-file dependencies
- Hover to explore connections
- Click to filter by file
- Search by filename
- **Live refresh when files change** — Edit code and see the graph update in real-time
- Export as SVG or PNG
- **Port collision handling** — Automatically finds an available port if default is in use

## Temporal Graph

Visualize how your codebase architecture evolved over git history. Scrub through time with an interactive timeline slider.

![Depwire Temporal Graph](assets/depwire-temporal-hono.gif)

```bash
# Auto-detects project root
depwire temporal

# Sample 20 commits with monthly snapshots
depwire temporal --commits 20 --strategy monthly

# Verbose mode with detailed progress
depwire temporal --verbose --stats

# Custom port
depwire temporal --port 3335
```

**Options:**
- `--commits <number>` — Number of commits to sample (default: 20)
- `--strategy <type>` — Sampling strategy: `even`, `weekly`, `monthly` (default: `even`)
- `-p, --port <number>` — Server port (default: 3334)
- `--output <path>` — Save snapshots to custom path (default: `.depwire/temporal/`)
- `--verbose` — Show progress for each commit being parsed
- `--stats` — Show summary statistics at end

Opens an interactive temporal visualization in your browser:
- Timeline slider showing all sampled commits
- Arc diagram morphing between snapshots
- Play/pause animation with speed controls (0.5×, 1×, 2×)
- Statistics panel with growth deltas
- Evolution chart tracking files/symbols/edges over time
- Auto-zoom to fit all arcs on snapshot change
- Search to highlight specific files across time

## How It Works

1. **Parser** — tree-sitter extracts every symbol and reference
2. **Graph** — graphology builds an in-memory dependency graph
3. **MCP** — AI tools query the graph for context-aware answers
4. **Viz** — D3.js renders the graph as an interactive arc diagram

## CLI Reference

### `depwire parse [directory]`

Parse a project and export the dependency graph as JSON.

**Directory argument is optional** — Depwire auto-detects your project root by looking for `package.json`, `tsconfig.json`, `go.mod`, `pyproject.toml`, `setup.py`, or `.git`.

**Options:**
- `-o, --output <path>` — Output file path (default: `depwire-output.json`)
- `--exclude <patterns...>` — Glob patterns to exclude (e.g., `"**/*.test.*" "dist/**"`)
- `--verbose` — Show detailed parsing progress (logs each file as it's parsed)
- `--pretty` — Pretty-print JSON output with indentation
- `--stats` — Print summary statistics (file count, symbol count, edges, timing)

**Examples:**
```bash
# Auto-detect project root
depwire parse

# Explicit directory
depwire parse ./src

# Exclude test files and build outputs
depwire parse --exclude "**/*.test.*" "**/*.spec.*" "dist/**" "build/**"

# Full verbosity with stats
depwire parse --verbose --stats --pretty -o graph.json
```

### `depwire viz [directory]`

Start visualization server and open arc diagram in browser.

**Directory argument is optional** — Auto-detects project root.

**Options:**
- `--port <number>` — Port number (default: 3456, auto-increments if in use)
- `--exclude <patterns...>` — Glob patterns to exclude
- `--verbose` — Show detailed parsing progress
- `--no-open` — Don't automatically open browser

**Examples:**
```bash
# Auto-detect and visualize
depwire viz

# Explicit directory
depwire viz ./src

# Custom port without auto-open
depwire viz --port 8080 --no-open

# Exclude test files with verbose logging
depwire viz --exclude "**/*.test.*" --verbose
```

### `depwire mcp [directory]`

Start MCP server for AI tool integration (Cursor, Claude Desktop).

**Directory argument is optional** — Auto-detects project root and connects automatically.

**Examples:**
```bash
# Auto-detect and connect (recommended)
depwire mcp

# Explicit directory
depwire mcp /path/to/project
```

### `depwire docs [directory]`

Generate comprehensive codebase documentation from your dependency graph.

**Directory argument is optional** — Auto-detects project root.

**Options:**
- `--output <path>` — Output directory (default: `.depwire/` inside project)
- `--format <type>` — Output format: `markdown` or `json` (default: `markdown`)
- `--include <docs...>` — Comma-separated list of docs to generate (default: `all`)
  - Values: `architecture`, `conventions`, `dependencies`, `onboarding`, `files`, `api_surface`, `errors`, `tests`, `history`, `current`, `status`, `health`, `all`
- `--update` — Regenerate existing documentation
- `--only <docs...>` — Used with `--update`, regenerate only specific docs
- `--verbose` — Show generation progress
- `--stats` — Show generation statistics
- `--gitignore` — Add `.depwire/` to `.gitignore` automatically
- `--no-gitignore` — Don't modify `.gitignore`

**Examples:**
```bash
# Auto-detect and generate all docs
depwire docs

# Explicit directory
depwire docs ./my-project

# Show generation progress and stats
depwire docs --verbose --stats

# Regenerate existing docs
depwire docs --update

# Generate specific docs only
depwire docs --include architecture,dependencies

# Custom output directory
depwire docs --output ./docs

# Regenerate only conventions doc
depwire docs --update --only conventions
```

**Generated Documents (12 total):**

| Document | What It Contains |
|----------|------------------|
| `ARCHITECTURE.md` | Module structure, entry points, hub files, layer analysis, circular dependencies |
| `CONVENTIONS.md` | Naming patterns, import/export style, detected design patterns |
| `DEPENDENCIES.md` | Module dependency matrix, high-impact symbols, longest dependency chains |
| `ONBOARDING.md` | Reading order (Foundation/Core/Entry Points), module map, key concepts, high-impact file warnings |
| `FILES.md` | Complete file catalog with stats, orphan files, hub files |
| `API_SURFACE.md` | All exported symbols (public API), most-used exports, unused exports |
| `ERRORS.md` | Error handling patterns, error-prone files, custom error classes |
| `TESTS.md` | Test file inventory, test-to-source mapping, untested files |
| `HISTORY.md` | Git history + graph analysis, file churn, feature timeline |
| `CURRENT.md` | Complete codebase snapshot (every file, symbol, connection) |
| `STATUS.md` | TODO/FIXME/HACK inventory with priority matrix |
| `HEALTH.md` | Dependency health score (0-100) across 6 dimensions with recommendations |

Documents are stored in `.depwire/` with `metadata.json` tracking generation timestamps for staleness detection.

### `depwire health [directory]`

Analyze dependency architecture health and get a 0-100 score across 6 quality dimensions.

**Directory argument is optional** — Auto-detects project root.

**Options:**
- `--json` — Output as JSON (for CI/automation)
- `--verbose` — Show detailed per-dimension breakdown

**Dimensions Measured:**
1. **Coupling (25%)** — How tightly connected are modules? Lower coupling = easier changes
2. **Cohesion (20%)** — Do files in the same directory relate? Higher cohesion = better organization
3. **Circular Dependencies (20%)** — Files depending on each other in cycles
4. **God Files (15%)** — Files with abnormally high connection counts
5. **Orphan Files (10%)** — Files with zero connections (dead code?)
6. **Dependency Depth (10%)** — How deep are the dependency chains?

**Examples:**
```bash
# Auto-detect and analyze
depwire health

# Explicit directory
depwire health ./my-project

# Detailed breakdown
depwire health --verbose

# JSON output for CI
depwire health --json
```

**Output:**
- Overall score (0-100) with letter grade (A-F)
- Per-dimension scores and grades
- Actionable recommendations
- Trend indicator (↑/↓ from last check)

Health history is stored in `.depwire/health-history.json` (last 50 checks).

### `depwire temporal [directory]`

Visualize how the dependency graph evolved over git history.

**Directory argument is optional** — Auto-detects project root.

**Options:**
- `--commits <number>` — Number of commits to sample (default: 20)
- `--strategy <type>` — Sampling strategy: `even` (every Nth), `weekly`, `monthly` (default: `even`)
- `-p, --port <number>` — Server port (default: 3334)
- `--output <path>` — Save snapshots to custom path (default: `.depwire/temporal/`)
- `--verbose` — Show progress for each commit being parsed
- `--stats` — Show summary statistics at end

**Examples:**
```bash
# Auto-detect and analyze 20 commits
depwire temporal

# Sample 50 commits with monthly snapshots
depwire temporal --commits 50 --strategy monthly

# Verbose mode with stats
depwire temporal --verbose --stats

# Custom output directory
depwire temporal --output ./temp-snapshots
```

**Output:**
- Interactive browser visualization at `http://127.0.0.1:3334`
- Timeline slider to scrub through git history
- Arc diagram morphing between snapshots
- Growth statistics showing files/symbols/edges evolution
- Auto-zoom to fit full diagram on each snapshot change

Snapshots are cached in `.depwire/temporal/` for fast re-rendering.

### Error Handling

Depwire gracefully handles parse errors:
- **Malformed files** — Skipped with warning, parsing continues
- **Large files** — Files over 1MB are automatically skipped
- **Port collisions** — Auto-increments to next available port (3456 → 3457 → 3458...)
- **Protected paths** — Blocks access to sensitive directories (.ssh, .aws, /etc)


## Example Workflows

### Refactoring with AI

![Claude Desktop with Depwire MCP](./assets/claude.gif)

```
# In Claude Desktop or Cursor with Depwire MCP:

"Analyze the impact of renaming UserService to UserRepository"

# Depwire responds with:
# - All files that import UserService
# - All call sites
# - All type references
# - Suggested find-and-replace strategy
```

### Understanding a New Codebase

```
"Show me the architecture summary"

# Depwire responds with:
# - Language breakdown
# - Module/package structure
# - Most-connected files (architectural hubs)
# - Entry points
```

### Pre-Commit Impact Check

```bash
# Check what your changes affect before committing
depwire viz
# Review the arc diagram — red arcs show files you touched
```

## Security

Depwire is **read-only** — it never writes to, modifies, or executes your code.

- Parses source files with tree-sitter (the same parser used by VS Code and Zed)
- Visualization server binds to localhost only
- No data leaves your machine — everything runs locally
- Blocks access to sensitive system directories (.ssh, .aws, /etc)
- npm packages published with provenance verification

See [SECURITY.md](SECURITY.md) for full details.

## Roadmap

- [ ] PR Impact Visualization (GitHub Action)
- [ ] Temporal Graph — watch your architecture evolve over git history
- [ ] Cross-language edge detection (API routes ↔ frontend calls)
- [ ] Dependency health scoring
- [ ] VSCode extension

## Contributing

Contributions welcome! Please note:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request
5. Sign the CLA (handled automatically on your first PR)

All contributors must sign the Contributor License Agreement before their PR can be merged.

## Author

**Atef Ataya** — AI architect, author, and creator of Depwire.

- 🎥 [YouTube](https://www.youtube.com/@atefataya) — 600K+ subscribers covering AI agents, MCP, and LLMs
- 📖 [The Architect's Playbook: 5 Pillars](https://www.amazon.com/dp/B0GCHNW2W8) — Best practices for AI agent architecture
- 💼 [LinkedIn](https://www.linkedin.com/in/atefataya/)

## License

Depwire is licensed under the [Business Source License 1.1](LICENSE).

- **Use it freely** for personal projects, internal company use, and development
- **Cannot** be offered as a hosted/managed service to third parties
- **Converts** to Apache 2.0 on February 25, 2029

For commercial licensing inquiries: atef@depwire.dev

## Credits

Built by [ATEF ATAYA LLC](https://depwire.dev)

Powered by:
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/) — Fast, reliable parsing
- [graphology](https://graphology.github.io/) — Powerful graph data structure
- [D3.js](https://d3js.org/) — Data visualization
- [Model Context Protocol](https://modelcontextprotocol.io/) — AI tool integration
