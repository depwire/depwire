# Security Policy

## What Depwire Accesses

Depwire analyzes supported source files and project manifests locally. It:

- Reads supported source files without executing them during parsing
- Uses tree-sitter and language-specific parsers to extract relationships
- Binds the visualization server to localhost (127.0.0.1)
- Clones a GitHub repository to a temporary directory when given its URL to `connect_repo`

Local commands can write derived artifacts, including graph output, parse caches, generated documentation, health history, and coordination state. The CLI does not upload source code, file names, graph data or analysis, and collects no usage telemetry. Applicable `security` scans run dependency vulnerability and supply-chain checks by default; these may contact package registries and public advisory databases. `connect_repo` clones or pulls when given a GitHub URL. The What If browser page loads D3 from a CDN. Cloud is a separate service.

To skip dependency checks and their network requests, use `depwire security --no-dependency-audit`; the other security checks still run. `--class secrets` also skips dependency checks. The `security_scan` MCP tool and SDK accept `dependencyAudit: false` for the same behavior.

Depwire does not expose its visualization server to other machines.

## Security Features

- **Path validation**: `connect_repo` rejects listed sensitive paths, including .ssh, .aws, and /etc
- **File size limits**: Skips files larger than 1MB to prevent resource exhaustion
- **Localhost-only server**: Visualization server binds to 127.0.0.1, not accessible from network
- **Safe git cloning**: Uses --depth 1 --no-recurse-submodules to avoid malicious submodules
- **Read-only parsing**: Parsing reads source files; commands may write derived output as described above

## Dependencies

Depwire uses tree-sitter grammars for parsing, graphology for graph operations, and Express for the local visualization server. Dependency versions are declared in `package.json` and locked for repository builds by `package-lock.json`; some declared versions use ranges.

## Reporting Vulnerabilities

If you discover a security vulnerability, please email: atef@depwire.dev

Do NOT open a public GitHub issue for security vulnerabilities.
