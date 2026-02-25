# Depwire

**See how your code connects. Give AI tools full codebase context.**

Depwire analyzes codebases to build a cross-reference graph showing how every file, function, and import connects. It provides:

- 🎨 **Beautiful arc diagram visualization** — Interactive Harrison Bible-style graphic
- 🤖 **MCP server for AI tools** — Cursor, Claude Desktop get full dependency context
- 🔍 **Impact analysis** — "What breaks if I rename this function?" answered precisely
- 👀 **Live updates** — Graph stays current as you edit code
- 🌍 **Multi-language** — TypeScript, JavaScript, Python, and Go

## Quick Start

### CLI Usage

```bash
npx depwire-cli viz ./my-project          # Open visualization
npx depwire-cli parse ./my-project        # Export graph as JSON
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

Then in chat:
```
Connect to /path/to/my/project and show me the architecture.
```

### Cursor

Settings → Features → Experimental → Enable MCP → Add Server:
- Command: `npx`
- Args: `-y depwire-cli mcp /path/to/project`

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

## Supported Languages

| Language | Extensions | Features |
|----------|-----------|----------|
| TypeScript | `.ts`, `.tsx` | Full support — imports, classes, interfaces, types |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | ES modules, CommonJS require(), JSX components |
| Python | `.py` | Imports, classes, decorators, inheritance |
| Go | `.go` | go.mod resolution, structs, interfaces, methods |

## Visualization

```bash
depwire viz ./my-project
```

Opens an interactive arc diagram in your browser:
- Rainbow-colored arcs showing cross-file dependencies
- Hover to explore connections
- Click to filter by file
- Search by filename
- Live refresh when files change
- Export as SVG or PNG

## How It Works

1. **Parser** — tree-sitter extracts every symbol and reference
2. **Graph** — graphology builds an in-memory dependency graph
3. **MCP** — AI tools query the graph for context-aware answers
4. **Viz** — D3.js renders the graph as an interactive arc diagram

## Installation

```bash
npm install -g depwire-cli
```

Or use directly with `npx`:
```bash
npx depwire-cli --help
```

## Example Workflows

### Refactoring with AI

```
# In Claude Desktop or Cursor with Depwire MCP:

"Connect to /Users/me/my-app and analyze the impact of renaming UserService to UserRepository"

# Depwire responds with:
# - All files that import UserService
# - All call sites
# - All type references
# - Suggested find-and-replace strategy
```

### Understanding a New Codebase

```
"Connect to https://github.com/t3-oss/create-t3-app and give me an architecture summary"

# Depwire responds with:
# - Language breakdown
# - Module/package structure
# - Most-connected files (architectural hubs)
# - Entry points
```

### Pre-Commit Impact Check

```bash
# Check what your changes affect before committing
depwire viz . --open
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
