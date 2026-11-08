# Security Policy

## What Depwire Accesses

Depwire analyzes supported source files and project manifests locally. Parsing does not execute those source files. The local visualization servers bind to 127.0.0.1. Local commands can write derived artifacts, including graph output, parse caches, generated documentation, health history, and coordination state. The Depwire CLI analyzes supported source files locally and collects no usage telemetry. It makes network requests only when you ask it to: connecting a GitHub URL clones or pulls that repository; dependency checks, which run by default in security scans and security-enabled structural diffs, invoke external audit tools and may send dependency metadata to package registries and advisory services (npm advisory enrichment also contacts GitHub); and the visualization, What If, and temporal browser pages download D3 from external hosts. The CLI never sends your source code or analysis to Depwire. MCP returns requested graph context and generated documentation to your MCP client; what that client forwards is governed by that client. Depwire Cloud is a separate hosted service that clones the repositories you connect.

To skip dependency checks and their network requests in repository-wide security scans, use depwire security --no-dependency-audit. The security_scan MCP tool and scanSecurity SDK function accept dependencyAudit: false. Targeted scans and --class secrets also skip dependency checks. Structural diff runs security scans by default; --no-security skips those scans. These controls do not disable Git connections, external browser assets, installation traffic, or onward sharing by an MCP client.

The local visualization servers listen on 127.0.0.1. The visualization, What If, and temporal browser pages still download external D3 scripts. Loopback binding does not make these pages offline.

## Security Features

- **Path validation**: `connect_repo` rejects listed sensitive paths, including .ssh, .aws, and /etc
- **File size limits**: Skips files larger than 1MB to prevent resource exhaustion
- **Localhost-only server**: Visualization server binds to 127.0.0.1, not accessible from network
- **Safe git cloning**: Uses --depth 1 --no-recurse-submodules to avoid malicious submodules
- **Read-only parsing**: Parsing reads source files; commands may write derived output as described above

## Dependencies

Depwire uses tree-sitter grammars for parsing, graphology for graph operations, and Express for the local visualization server. Dependency versions are declared in `package.json` and locked for repository builds by `package-lock.json`; some declared versions use ranges.

### Per-advisory disposition

The following table records security fixes, including the October 2026 v1.28.1 dependency update and the November 2026 v1.28.3 path-validation fix. npm audit groups the argument-parser finding under both the parser and its parent `simple-git` package.

| Advisory | Affected component | Disposition |
| --- | --- | --- |
| [GHSA-h5xc-3hqf-qqm2](https://github.com/depwire/depwire/security/advisories/GHSA-h5xc-3hqf-qqm2) — protected-directory symlink bypass (November 2026) | `connect_repo` protected-directory validation through v1.28.2 | **Fixed in v1.28.3:** canonicalize the supplied path and protected targets, compare with directory boundaries, and return clean errors for missing paths. Preserve the narrowly scoped macOS managed-temp allowance. An MCP client could previously supply a permitted-looking symlink into a protected directory and cause its source files to be analyzed. Impact also includes writes under `<project>/.depwire/` (claims, decisions, health history, temporal data, and project docs); with a symlinked root, these writes land inside the protected directory. The advisory states that existing files are not overwritten and no code is executed. |
| [CVE-2026-102828](https://github.com/advisories/GHSA-x6jw-m9v5-85vh) | `simple-git` 3.36.0 | **Fixed in v1.28.1:** `simple-git` 4.0.2. |
| [CVE-2026-102829](https://github.com/advisories/GHSA-v5rq-49vh-5v5c) | `simple-git` 3.36.0 → `@simple-git/argv-parser` 1.1.1 | **Fixed in v1.28.1:** `simple-git` 4.0.2 brings parser 2.0.1. |
| [CVE-2026-102826](https://github.com/advisories/GHSA-g4wm-2vf7-vfgr) | `simple-git` 3.36.0 | **Fixed in v1.28.1:** `simple-git` 4.0.2. |
| [CVE-2026-102827](https://github.com/advisories/GHSA-858h-whjf-mvg5) | `simple-git` 3.36.0 | **Fixed in v1.28.1:** `simple-git` 4.0.2. |
| [CVE-2026-104850](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | `@modelcontextprotocol/sdk` 1.30.1 | **Not applicable to Depwire's runtime:** it runs an MCP server over stdio, with no OAuth client or HTTP transport. v1.28.1 also updates the SDK to 1.32.1, removing the vulnerable version from the dependency tree. |

The v4 `simple-git` release removed the default export; `connect_repo` now uses its named export for clone and pull. An additional production advisory for `proxy-addr` 2.0.7 is addressed by the lockfile update to 2.0.8. The development updates move `sharp` to 0.35.5 and `source-map-js` to 1.2.2; `esbuild` remains at 0.27.3 because its upstream `tsup` 8.5.1 dependency is limited to `^0.27.0` while the fix is 0.28.1.

## Security Acknowledgements

Yusif Mammadzada, reported privately, symlink bypass of protected-directory validation, November 2026.

## Reporting Vulnerabilities

If you discover a security vulnerability, please email: atef@depwire.dev

Do NOT open a public GitHub issue for security vulnerabilities.
