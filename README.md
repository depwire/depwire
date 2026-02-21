# CodeGraph

**See how your code connects. Give AI tools full codebase context.**

CodeGraph analyzes TypeScript codebases to build a cross-reference graph showing how every file, function, and import connects. It provides:

- 🎨 **Beautiful arc diagram visualization** — Harrison Bible-style interactive graphic showing cross-file dependencies
- 🤖 **MCP server for AI tools** — Cursor, Claude Desktop, Claude Code get full dependency context  
- 🔍 **Impact analysis** — "What breaks if I rename this function?" answered precisely
- 👀 **Live updates** — Graph stays current as you edit code
- 🔗 **GitHub integration** — Clone and analyze any TypeScript repo with one command

## Quick Start

### Install via npm

```bash
npm install -g codegraph
```

### Claude Desktop (one-click install)

1. Download `codegraph.mcpb` from releases
2. Double-click to install
3. Open Claude Desktop → new chat
4. Say: "Connect to /path/to/my/project and show me the architecture"

### Command Line

```bash
# Open interactive visualization
codegraph viz ./my-project

# Export dependency graph to JSON
codegraph parse ./my-project --output graph.json --pretty

# Start MCP server for AI tools
codegraph mcp ./my-project

# Or start empty and connect later via connect_repo tool
codegraph mcp
```

## MCP Integration

CodeGraph exposes 9 powerful tools to AI coding assistants through the Model Context Protocol (MCP).

### Claude Desktop

**Option 1: MCPB Bundle (easiest)**
1. Download `codegraph.mcpb`
2. Double-click to install
3. Restart Claude Desktop
4. Use in any chat!

**Option 2: Manual config**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "npx",
      "args": ["-y", "codegraph", "mcp"]
    }
  }
}
```

Restart Claude Desktop, then in any chat:
- "Connect to https://github.com/t3-oss/create-t3-app and show me the architecture"
- "What would break if I renamed the getUserPkgManager function?"
- "Which files import from src/utils/logger.ts?"

### Cursor

1. Open Settings → Features → MCP
2. Add new server:
   - **Command**: `npx`
   - **Args**: `-y codegraph mcp /path/to/your/project`
3. Save and restart Cursor

Now your AI assistant has full codebase context for every suggestion.

## Available MCP Tools

| Tool | What It Does |
|------|-------------|
| `connect_repo` | Connect to any local project or GitHub repo (e.g., `https://github.com/vercel/next.js`) |
| `impact_analysis` | Analyze what breaks if you change a symbol — shows direct and transitive dependents |
| `get_file_context` | Full context about a file: all symbols, imports, exports, and dependents |
| `get_dependencies` | What does this symbol depend on? |
| `get_dependents` | What depends on this symbol? |
| `search_symbols` | Find symbols by name across the codebase |
| `get_architecture_summary` | High-level project overview: file count, most connected files, orphans |
| `list_files` | List all files with stats |
| `get_symbol_info` | Look up any symbol's definition, location, and metadata |

### Example Queries

Ask your AI assistant:

- **Impact analysis**: "What would break if I renamed the `UserService` class?"
- **Architecture exploration**: "Show me the 5 most connected files in this project"
- **Cross-references**: "Which files import from `src/types.ts`?"
- **Symbol lookup**: "Where is `handleAuth` defined and what does it do?"
- **GitHub repos**: "Connect to https://github.com/t3-oss/create-t3-app and analyze the CLI structure"

## Visualization

Launch an interactive arc diagram showing how files connect:

```bash
codegraph viz ./my-project
```

Opens in your browser at `http://localhost:3333` with:

- **Rainbow arcs** connecting files based on imports and calls
- **Interactive exploration** — hover to see connections, click to filter
- **Search** — find files by name
- **Export** — save as SVG or PNG for documentation/presentations
- **Live updates** — graph refreshes as you edit code

The visualization uses D3.js to render an arc diagram inspired by the "Harrison Bible" visualization style — beautiful, shareable graphics perfect for understanding complex codebases at a glance.

### Visualization Features

- **Hover on file**: Highlights all connected files and shows import/export stats
- **Hover on arc**: Shows detailed connection info between two files
- **Click file**: Filters to show only connections for that file
- **Search box**: Type filename to highlight matches
- **Zoom & pan**: Navigate large codebases easily
- **Export buttons**: Download as SVG (vector) or PNG (raster)

## How It Works

### 1. Parser
Uses Tree-sitter to parse TypeScript/TSX files and extract:
- All symbol definitions (functions, classes, types, interfaces, variables)
- Import/export statements
- Function calls
- Type references
- Scope information

Handles:
- Path aliases from `tsconfig.json` (e.g., `~/utils` → `./src/utils`)
- `.js` extensions in imports (TypeScript's `moduleResolution: node16` behavior)
- Both regular imports and type-only imports

### 2. Graph
Builds an in-memory dependency graph using Graphology:
- Nodes: Every symbol in the codebase
- Edges: Imports, calls, type references, exports

Supports:
- Cross-file relationship queries
- Transitive dependency analysis
- Impact analysis (what breaks if X changes)
- File-level and symbol-level views

### 3. MCP Server
Exposes the graph to AI tools via the Model Context Protocol:
- Communicates over stdin/stdout using JSON-RPC
- Provides 9 tools for querying the graph
- Dynamically switch projects with `connect_repo`
- File watching keeps graph current

### 4. Visualization
Renders the graph as an interactive arc diagram:
- D3.js for rendering
- Express server for API + static files
- WebSocket for live updates
- Rainbow color scheme for visual appeal

## Command Reference

### `codegraph parse`

Parse a project and export the dependency graph to JSON.

```bash
codegraph parse <directory> [options]
```

**Options:**
- `-o, --output <path>` — Output file path (default: `codegraph-output.json`)
- `--pretty` — Pretty-print JSON output
- `--stats` — Print summary statistics

**Example:**
```bash
codegraph parse ./my-project --output graph.json --pretty --stats
```

### `codegraph query`

Query a previously generated graph file.

```bash
codegraph query <graph-file> [options]
```

**Options:**
- `--impact <symbol>` — Analyze impact of changing a symbol
- `--search <query>` — Search for symbols by name
- `--summary` — Show architecture summary

**Example:**
```bash
codegraph query graph.json --impact UserService
codegraph query graph.json --search "Auth"
codegraph query graph.json --summary
```

### `codegraph viz`

Start the visualization server.

```bash
codegraph viz <directory> [options]
```

**Options:**
- `-p, --port <number>` — Server port (default: 3333)
- `--no-open` — Don't auto-open browser

**Example:**
```bash
codegraph viz ./my-project --port 8080
```

### `codegraph mcp`

Start the MCP server for AI tools.

```bash
codegraph mcp [directory]
```

If no directory is provided, starts empty — use the `connect_repo` tool to connect later.

**Example:**
```bash
# Pre-load a project
codegraph mcp ./my-project

# Start empty, connect via AI chat
codegraph mcp
```

## Configuration

### TypeScript Config

CodeGraph reads your `tsconfig.json` to resolve:
- **Path aliases**: `"~/*": ["./src/*"]` → automatically mapped
- **Base URL**: Used for module resolution

Supports JSONC (comments and trailing commas).

### File Watching

File changes are automatically detected and the graph is updated incrementally. Watches:
- `**/*.ts` and `**/*.tsx` files
- Ignores: `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, hidden directories

## Limitations & Roadmap

### Current Limitations
- TypeScript/TSX only (JavaScript support coming soon)
- Symbol-level analysis only (no dataflow or control flow yet)
- Requires valid syntax (parsing stops on syntax errors)

### Roadmap
- [ ] JavaScript support (ES6 modules)
- [ ] Python support (imports, function calls)
- [ ] VSCode extension with inline visualization
- [ ] GitHub Action for PR impact reports
- [ ] Multi-language support (Rust, Go, Java)
- [ ] Control flow analysis
- [ ] Dataflow tracking
- [ ] Call graph visualization (in addition to arc diagram)

## Contributing

Contributions welcome! Areas that need help:
- Additional language parsers (JavaScript, Python, Rust, Go)
- Performance optimizations for large codebases (10k+ files)
- Alternative visualization styles
- GitHub Action for automated impact analysis
- VSCode extension

## License

MIT

---

## FAQ

**Q: Does this work with JavaScript?**  
A: Not yet. TypeScript/TSX only for now. JavaScript support is on the roadmap.

**Q: Can it analyze monorepos?**  
A: Yes! Use subdirectory filtering: `codegraph viz ./monorepo/packages/core` or use `connect_repo` with the `subdirectory` parameter in the AI chat.

**Q: How big of a project can it handle?**  
A: Tested on projects up to ~500 files / 50k LOC. Performance degrades beyond that — optimization is on the roadmap.

**Q: Does it work with path aliases like `@/components`?**  
A: Yes! It reads your `tsconfig.json` and resolves path aliases automatically.

**Q: Can I use this in CI/CD?**  
A: Yes! Use `codegraph parse` to export the graph, then query it in scripts. GitHub Action integration is planned.

**Q: Does it understand TypeScript type-only imports?**  
A: Yes! Both regular and type-only imports are tracked.

**Q: What about dynamic imports?**  
A: Dynamic imports (`import('...')`) are tracked, but conditional imports based on runtime values are not analyzed (static analysis limitation).
