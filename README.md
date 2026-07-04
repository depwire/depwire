# Depwire

> Give your AI coding agent a map of your codebase.

[![npm version](https://img.shields.io/npm/v/depwire-cli?color=00d4aa&label=npm)](https://www.npmjs.com/package/depwire-cli)
[![License](https://img.shields.io/badge/license-BUSL--1.1-00d4aa)](https://github.com/depwire/depwire/blob/main/LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/depwire.depwire-vscode?label=VSCode&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=depwire.depwire-vscode)

Depwire builds a deterministic dependency graph of your codebase and exposes it through 23 MCP tools — so AI agents navigate instead of explore.

---

## The Problem

AI coding agents re-explore your codebase from scratch every session. They burn tokens grepping and reading files just to rediscover structure they saw yesterday, then make changes without seeing what depends on the code they touch. The fix is a map: a precomputed graph of every symbol and every dependency, served to the agent on demand.

---

## Install

### CLI + MCP Server

```bash
npm install -g depwire-cli
```

### VSCode Extension

Search "Depwire" in the VSCode Extensions panel, or:

```
ext install depwire.depwire-vscode
```

Or install directly from the marketplace: [https://marketplace.visualstudio.com/items?itemName=depwire.depwire-vscode](https://marketplace.visualstudio.com/items?itemName=depwire.depwire-vscode)

### Cloud App

[app.depwire.dev](https://app.depwire.dev) — connect a GitHub repo and get a hosted MCP endpoint in about 60 seconds.

---

## Quick Start

### Claude Desktop / Cursor / any MCP client

```json
{
  "mcpServers": {
    "depwire": {
      "command": "npx",
      "args": ["-y", "depwire-cli", "mcp", "."]
    }
  }
}
```

### For large projects (instant startup)

```bash
depwire parse .        # parse once, writes depwire-output.json
depwire mcp .          # loads from the JSON instantly (<100ms)
```

On startup `depwire mcp` looks for `depwire-output.json` (or `.depwire/depwire-output.json`) and loads the prebuilt graph directly, skipping the parse entirely. Use `--no-cache` to force a full re-parse or `--from-cache` to require the cached graph.

---

## What Depwire Gives Your AI Agent

All 23 MCP tools, grouped by purpose.

### Graph & Architecture

| Tool | What it does |
|------|--------------|
| `connect_repo` | Connect Depwire to a local directory or a GitHub URL (clones automatically). Replaces the currently loaded project. |
| `get_architecture_summary` | High-level overview — file count, symbol count, most-connected files, dependency hotspots, and orphan files. |
| `list_files` | List all files in the project with basic stats, optionally filtered to a subdirectory. |
| `visualize_graph` | Render an interactive arc diagram of the codebase's cross-reference graph inline. |

### File & Symbol Navigation

| Tool | What it does |
|------|--------------|
| `get_file_context` | Full context for a file — its symbols, imports, exports, and importers. Includes cross-language connections. |
| `search_symbols` | Search symbols by name across the codebase (case-insensitive substring match). |
| `get_symbol_info` | Look up details for a symbol by name or fully qualified ID; returns all matches when names collide. |
| `get_dependencies` | What a given symbol depends on (what it uses, imports, or calls). |
| `get_dependents` | What depends on a given symbol (what would be affected if it changed). |

### Impact Analysis

| Tool | What it does |
|------|--------------|
| `impact_analysis` | What breaks if a symbol changes — direct dependents, transitive chain, and affected files. Cross-language edges included. |
| `simulate_change` | Simulate delete / move / rename / split / merge before touching code. Returns health delta, broken imports, and affected nodes. Zero file I/O. |
| `verify_change` | Deterministic safety report for a proposed change — broken imports, new circular deps, health impact, and a targeted security scan on changed files. |

### Health & Quality

| Tool | What it does |
|------|--------------|
| `get_health_score` | 0-100 architecture health score across coupling, cohesion, circular deps, god files, orphans, and dependency depth, with recommendations. |
| `find_dead_code` | Symbols defined but never referenced, categorized by confidence (high / medium / low). |
| `security_scan` | Deterministic vulnerability scan with graph-aware severity elevation. No API key required. |

### History & Documentation

| Tool | What it does |
|------|--------------|
| `get_temporal_graph` | How the dependency graph evolved over git history — sampled snapshots of file, symbol, and edge counts. |
| `get_project_docs` | Retrieve auto-generated docs — architecture, conventions, dependencies, onboarding. |
| `update_project_docs` | Regenerate (or first-time generate) codebase documentation. |

### Multi-Agent Coordination

| Tool | What it does |
|------|--------------|
| `claim_files` | Declare intent to modify files so other MCP clients avoid conflicts. Claims expire after a TTL. |
| `release_files` | Release a previously made file claim (recorded as an append-only event). |
| `get_active_claims` | Query who is currently working on what — useful for orchestrator agents. |
| `record_decision` | Save a structured decision (context, options, choice, reasoning) for future sessions to reference. |
| `get_decisions` | Retrieve past decisions by query, session, file, or tag. |

---

## Supported Languages

17 languages parsed, with cross-language edge detection between them:

TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, C#, C++, C, Ruby, PHP, Swift, Dart, R, Mojo, and HTML/Angular.

**HTML/Angular** — Angular template parsing pairs `*.component.html` with its `*.component.ts` and extracts component selectors, pipes, and directives as `uses` edges.

Edges are captured at the granularity that fits each relationship: import edges are file-level (resolved to the imported file), while call, inheritance, and dependency-injection edges are symbol-level. The graph is deterministic — parsed with tree-sitter (with pattern-based parsers for languages lacking a tree-sitter grammar, such as R, Dart, and Mojo), producing the same result on every run.

---

## Performance

Self-parse of this repository (`depwire-cli`):

| Project | Files | Symbols | Edges | Parse time |
|---------|-------|---------|-------|------------|
| depwire-cli | 175 | 7,964 | 2,085 | ~0.7s |

Additional runs on public repositories (last validated v1.7.1):

| Project | Language | Files | Symbols | Edges |
|---------|----------|-------|---------|-------|
| [google/guice](https://github.com/google/guice) | Java (13 modules) | 647 | 30,592 | 10,081 |
| [honojs/hono](https://github.com/honojs/hono) | TypeScript | 352 | 6,462 | 2,194 |
| [pallets/flask](https://github.com/pallets/flask) | Python | 79 | 2,005 | 851 |
| [dart-lang/shelf](https://github.com/dart-lang/shelf) | Dart | 108 | 1,639 | 219 |

MCP startup:

- **Cold parse** — roughly 4ms per file (a full parse from source).
- **Warm cache** — under 100ms regardless of project size, when `depwire-output.json` is present. The prebuilt graph is loaded directly with no parsing and no disk re-scan.

---

## Pro Features — $9.99/month

Available through the VSCode extension and [app.depwire.dev](https://app.depwire.dev):

- Health dimension breakdown (6 metrics)
- Security scanner with graph-aware severity
- Dead code detection
- What If simulation — blast radius before you touch code
- Verify Change — safety checks before committing
- Structural diff between git commits
- File context and dependency mapping
- Temporal graph (architectural history)
- Multi-agent coordination
- Decision log
- Cloud MCP endpoint (23 tools, hosted)
- Private repo support

Subscribe at [app.depwire.dev/subscribe](https://app.depwire.dev/subscribe).

---

## MCP Configuration Examples

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "depwire": {
      "command": "npx",
      "args": ["-y", "depwire-cli", "mcp", "."]
    }
  }
}
```

**Cursor** — Settings → Features → MCP → Add Server:

- Command: `npx`
- Args: `-y depwire-cli mcp .`

**Large projects** — parse once, then start the server against the cached graph:

```json
{
  "mcpServers": {
    "depwire": {
      "command": "depwire",
      "args": ["mcp", ".", "--from-cache"]
    }
  }
}
```

Run `depwire parse .` first (or on a schedule / in CI) so `depwire-output.json` exists; startup then stays under 100ms at any scale.

---

## GitHub Action

```yaml
- uses: depwire/depwire-action@v1
```

Posts a PR comment with dependency impact, an arc diagram diff, and a risk badge on every pull request, so reviewers see the architectural blast radius before merging.

Marketplace: [github.com/marketplace/actions/depwire-pr-impact](https://github.com/marketplace/actions/depwire-pr-impact)

---

## CLI Commands

```bash
depwire parse <dir>              # Parse and write depwire-output.json
depwire mcp <dir>                # Start the MCP server
depwire mcp <dir> --from-cache   # Load from depwire-output.json, error if missing
depwire mcp <dir> --no-cache     # Force a full re-parse
depwire viz <dir>                # Open the arc diagram in the browser
```

---

## License

[Business Source License 1.1](LICENSE) — converts to Apache 2.0 on February 25, 2029. Free for individual developers and non-competing commercial use; commercial use for competing services requires a license.

---

## Built by

**Atef Ataya** — Software Architect, YouTube [@atefataya](https://www.youtube.com/@atefataya) (650K+ subscribers), author of *The Architect's Playbook*.
