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

### October 2026 advisory disposition

The following table describes the dependency changes proposed after v1.28.0. This branch is not a released security fix: the four `simple-git` advisories remain until its v4 API is migrated and tested. npm audit groups the argument-parser finding under both the parser and its parent `simple-git` package.

| Advisory | v1.28.0 dependency | Disposition |
| --- | --- | --- |
| [CVE-2026-102828](https://github.com/advisories/GHSA-x6jw-m9v5-85vh) | `simple-git` 3.36.0 | **Open.** Trailer-command configuration bypass; requires `simple-git` 4.0.1 or later. |
| [CVE-2026-102829](https://github.com/advisories/GHSA-v5rq-49vh-5v5c) | `simple-git` 3.36.0 → `@simple-git/argv-parser` 1.1.1 | **Open.** `VISUAL` editor bypass; requires parser 2.0.1, provided by `simple-git` 4.0.2. |
| [CVE-2026-102826](https://github.com/advisories/GHSA-g4wm-2vf7-vfgr) | `simple-git` 3.36.0 | **Open.** Git configuration include bypass; requires `simple-git` 4.0.0 or later. |
| [CVE-2026-102827](https://github.com/advisories/GHSA-858h-whjf-mvg5) | `simple-git` 3.36.0 | **Open.** Long-option abbreviation bypass; requires `simple-git` 4.0.0 or later. |
| [CVE-2026-104850](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | `@modelcontextprotocol/sdk` 1.30.1 | **Not applicable to Depwire's runtime:** it runs an MCP server over stdio, with no OAuth client or HTTP transport. The proposed nonmajor update to SDK 1.32.1 also removes the vulnerable version from the dependency tree. |

The v4 `simple-git` release removes the default export used by `connect_repo` for clone and pull. It cannot be treated as a manifest-only patch update. An additional production advisory for `proxy-addr` 2.0.7 is addressed by the proposed lockfile update to 2.0.8. The proposed development updates move `sharp` to 0.35.5 and `source-map-js` to 1.2.2; `esbuild` remains at 0.27.3 because its upstream `tsup` 8.5.1 dependency is limited to `^0.27.0` while the fix is 0.28.1.

## Reporting Vulnerabilities

If you discover a security vulnerability, please email: atef@depwire.dev

Do NOT open a public GitHub issue for security vulnerabilities.
