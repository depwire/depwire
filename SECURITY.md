# Security Policy

## What CodeGraph Accesses

CodeGraph is a **read-only** code analysis tool. It:

- ✅ Reads source code files (.ts, .tsx, .py, .js, .jsx, .mjs, .cjs, .go)
- ✅ Parses files using tree-sitter (the same parser used by VS Code, Neovim, Zed, and Helix)
- ✅ Runs a local visualization server bound to localhost (127.0.0.1) only
- ✅ Clones GitHub repos to a temporary directory when using connect_repo

CodeGraph **never**:

- ❌ Writes to, modifies, or deletes any file in your project
- ❌ Executes any code from your project
- ❌ Sends your code to any external server
- ❌ Accesses files outside the specified project directory
- ❌ Opens network ports accessible from other machines

## Security Features

- **Path validation**: Blocks access to sensitive system directories (.ssh, .aws, /etc, etc.)
- **File size limits**: Skips files larger than 1MB to prevent resource exhaustion
- **Localhost-only server**: Visualization server binds to 127.0.0.1, not accessible from network
- **Safe git cloning**: Uses --depth 1 --no-recurse-submodules to avoid malicious submodules
- **Read-only operations**: All parser operations are explicitly read-only

## Dependencies

CodeGraph uses tree-sitter grammars for parsing, graphology for graph operations, and Express for the local visualization server. All dependencies are pinned to exact versions to prevent supply chain attacks.

## Reporting Vulnerabilities

If you discover a security vulnerability, please email: atef@verdent.ai

Do NOT open a public GitHub issue for security vulnerabilities.

We will acknowledge receipt within 48 hours and provide a fix or mitigation within 7 days for critical issues.

## npm Package Provenance

CodeGraph npm packages are published with provenance verification, linking each published version to the specific GitHub Actions build that created it. You can verify this on npmjs.com.
