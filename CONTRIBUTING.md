# Contributing to Depwire

Thank you for your interest in contributing to Depwire! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Contributor License Agreement](#contributor-license-agreement)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Adding Language Support](#adding-language-support)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please be respectful, constructive, and professional in all interactions. Harassment, discrimination, and disrespectful behavior will not be tolerated.

## Contributor License Agreement

**All contributors must sign the CLA before their first PR can be merged.** This is enforced automatically via a GitHub Action. When you open your first PR, the CLA bot will comment with instructions. You only need to sign once.

The CLA ensures that ATEF ATAYA LLC can maintain licensing flexibility for the project while protecting contributor rights. Your contributions remain attributed to you.

## Getting Started

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **npm** (comes with Node.js)
- **Git**

### Fork & Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR-USERNAME/depwire.git
cd depwire
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Verify Everything Works

```bash
# Parse a test project
node dist/index.js parse ./test/fixtures/typescript --stats

# Start visualization
node dist/index.js viz ./test/fixtures/typescript

# Start MCP server
node dist/index.js mcp
```

## Development Setup

### Project Structure

```
depwire/
├── src/
│   ├── index.ts              # CLI entry point (Commander.js)
│   ├── parser/
│   │   ├── types.ts           # Shared types (SymbolNode, Edge, SymbolKind)
│   │   ├── index.ts           # Main parse orchestrator
│   │   ├── typescript.ts      # TypeScript/TSX parser
│   │   ├── javascript.ts      # JavaScript/JSX parser
│   │   ├── python.ts          # Python parser
│   │   └── go.ts              # Go parser
│   ├── graph/
│   │   ├── index.ts           # Graph builder (graphology DirectedGraph)
│   │   ├── queries.ts         # Query functions (impact, dependencies, etc.)
│   │   └── serializer.ts      # JSON export/import
│   ├── viz/
│   │   ├── server.ts          # Express HTTP server for visualization
│   │   └── public/
│   │       ├── index.html     # Arc diagram page
│   │       ├── arc.js         # D3.js arc diagram renderer
│   │       └── style.css      # Dark theme styling
│   ├── mcp/
│   │   ├── server.ts          # MCP server (stdio transport)
│   │   └── tools.ts           # MCP tool definitions
│   └── watcher.ts             # File watcher (chokidar)
├── test/
│   └── fixtures/              # Test fixtures per language
│       ├── typescript/
│       ├── javascript/
│       ├── python/
│       └── go/
├── dist/                      # Build output (tsup)
├── package.json
├── tsconfig.json
├── LICENSE                    # BSL 1.1
├── SECURITY.md
└── README.md
```

### Key Technologies

| Component | Technology | Docs |
|-----------|-----------|------|
| Parser | tree-sitter | [tree-sitter.github.io](https://tree-sitter.github.io/) |
| Graph | graphology | [graphology.github.io](https://graphology.github.io/) |
| Visualization | D3.js | [d3js.org](https://d3js.org/) |
| MCP | @modelcontextprotocol/sdk | [modelcontextprotocol.io](https://modelcontextprotocol.io/) |
| CLI | Commander.js | [github.com/tj/commander.js](https://github.com/tj/commander.js/) |
| Build | tsup | [tsup.egoist.dev](https://tsup.egoist.dev/) |

## Making Changes

### Branch Naming

```
feature/short-description    # New features
fix/short-description        # Bug fixes
docs/short-description       # Documentation
refactor/short-description   # Code refactoring
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Ruby language support
fix: resolve port collision on macOS
docs: update MCP configuration guide
refactor: simplify graph traversal logic
test: add fixtures for Python decorators
chore: bump tree-sitter to v0.22
```

## Coding Standards

### TypeScript

- **Strict mode** (`strict: true` in tsconfig.json)
- **No `any` types** unless absolutely necessary (document why)
- **No `console.log`** in MCP server code (use `console.error` for debugging)
- **No `eval()`** or `Function()` — ever (security requirement)
- **No writes to user project directories** — Depwire is read-only

### Parser Guidelines

- Use tree-sitter's built-in traversal methods (`tree.rootNode.descendantsOfType()`)
- Always set `bufferSize: 1024 * 1024` when creating parsers
- Handle parse errors gracefully — skip unparseable files, don't crash
- Test with real-world open-source projects, not just synthetic fixtures

### Graph Guidelines

- Use graphology's `DirectedGraph` — never create custom graph implementations
- Node IDs use the format `filePath::symbolName`
- Keep the graph in memory — no disk persistence in the free tier
- All graph mutations must go through the graph builder module

### Security Rules

These are non-negotiable:

1. **Zero writes** to user project directories
2. **Block path traversal** (/etc, .ssh, .aws, .gnupg, etc.)
3. **No code execution** (no eval, no Function, no dynamic imports of user code)
4. **1MB file size limit** enforced in all parsers
5. **Localhost only** for HTTP servers (127.0.0.1, never 0.0.0.0)
6. **Safe git cloning** (depth 1, no submodules, single branch)

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --verbose
```

### Test Fixtures

Each language has a `test/fixtures/<language>/` directory with small, focused test files. When adding new parser features, add corresponding fixture files that demonstrate the feature.

### Testing on Real Projects

Before submitting a PR that changes parsing logic, test on at least one real-world project:

```bash
# Good test targets:
node dist/index.js parse ~/path-to/hono --stats         # TypeScript (305 files)
node dist/index.js parse ~/path-to/fastapi --stats       # Python (47 files)
node dist/index.js parse ~/path-to/express --stats       # JavaScript (6 files)
node dist/index.js parse ~/path-to/cobra --stats         # Go (19 files)
```

Ensure zero parse errors on all tested projects.

## Submitting a Pull Request

1. **Fork & branch** from `main`
2. **Make changes** following coding standards
3. **Test** locally (both unit tests and real-world projects)
4. **Build** successfully: `npm run build`
5. **Commit** with conventional commit messages
6. **Push** to your fork
7. **Open PR** against `depwire/depwire:main`
8. **Sign CLA** when prompted by the bot
9. **Respond to review** comments promptly

### PR Checklist

- [ ] Code follows project coding standards
- [ ] Tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No security violations (zero eval, zero writes, localhost only)
- [ ] Tested on at least one real-world project (for parser changes)
- [ ] Documentation updated (if applicable)
- [ ] CLA signed

## Adding Language Support

Want to add support for a new language? Here's the pattern:

### 1. Install the tree-sitter grammar

```bash
npm install tree-sitter-<language>
```

### 2. Create a parser module

Create `src/parser/<language>.ts` following the pattern of existing parsers. Key functions:

- `parseFile(filePath, content)` → returns `SymbolNode[]` and edges
- Extract: functions, classes, variables, imports, exports
- Resolve: import paths to actual files

### 3. Register in the orchestrator

Add the new language to `src/parser/index.ts`:
- Map file extensions to the new parser
- Add to the language detection logic

### 4. Add test fixtures

Create `test/fixtures/<language>/` with at least 5 test files covering:
- Basic function/class definitions
- Import/export patterns
- Cross-file references
- Language-specific features (decorators, generics, etc.)

### 5. Update the file watcher

Add the new file extensions to the chokidar watch patterns in `src/watcher.ts`.

### 6. Test on a real project

Parse a real open-source project written in the target language. Document the project name, file count, parse time, and any errors.

## Reporting Bugs

Open a GitHub issue with:

1. **Description** of the bug
2. **Steps to reproduce** (exact commands)
3. **Expected behavior** vs. actual behavior
4. **Environment** (OS, Node.js version, Depwire version)
5. **Sample code** that triggers the bug (if possible)

## Feature Requests

Open a GitHub issue tagged `enhancement` with:

1. **Problem** you're trying to solve
2. **Proposed solution**
3. **Alternatives considered**
4. **Impact** on existing users

---

## Questions?

- **Email:** atef@depwire.dev
- **GitHub Issues:** [github.com/depwire/depwire/issues](https://github.com/depwire/depwire/issues)
- **Author:** Atef Ataya — [YouTube](https://youtube.com/@atefataya) | [LinkedIn](https://linkedin.com/in/atefataya)

Thank you for helping make Depwire better!
