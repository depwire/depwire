# Native grammar dependency move and sharp remediation

Baseline: main `6b997cd` (1.20.2). Branch: `feat/lightweight-grammars`.
Intended release: 1.21.0, but package version remains 1.20.2 as requested.
No merge, publishing, deployment, runtime code change, format or resolution bump.

Read PR #37 and its investigation on `feat/lightweight-package` first. This
implements only the approved dependency move, not that PR's independent allowlist
or SDK closure changes. Its 251.97 → 65.26 MB prototype motivated the option;
measurements below are fresh gate measurements on current main, not a new option study.

## Architecture and runtime proof (A1 / G1)

The requested connector tools are not exposed in this session. Read package.json
and parser sources directly and used the built SDK architecture query: frozen main
has 273 parsed files, 271 graph files, 7,110 symbols and 3,808 edges. package.json is
configuration, not a source graph node.

`src/parser/detect.ts` registers 17 languages. `src/parser/wasm-init.ts:67` maps
14 bundled WASM files (including TSX) and loads them with `web-tree-sitter`'s
`Language.load`; no native grammar package entry is imported. Mojo, Dart, R and
HTML use their existing non-WASM parsers. JSX uses the JavaScript grammar.

Proof used real `npm pack` + fresh install (scripts enabled), parsed every fixture,
then physically moved ALL installed native grammar directories outside node_modules:
`tree-sitter-c-sharp`, `tree-sitter-cpp`, `tree-sitter-java`, `tree-sitter-php`,
`tree-sitter-ruby`, and transitive `tree-sitter-c`. A fresh Node process cold-parsed
the same files with useCache:false. Full JSON-visible ParsedFile records, graph node
keys/attributes, and edge endpoints/attributes were byte-identical before/absent.
Generated Graphology edge keys are excluded; all actual edge data is included.
No errorFiles; each fixture must produce a file and real symbols.

An initial in-memory comparison against JSON failed solely because JSON omits
undefined properties; comparing the actual serialized outputs with `cmp` is empty.
No parse-data differences were discarded. `language-smoke.expected.json` preserves
the baseline; the permanent smoke compares the entire JSON-visible result against it.

The final changed tarball, freshly installed without any native grammar packages,
also matches that baseline for all 19 cases:

| Language / variant | Files | Nodes | Edges | Before / absent / after |
| --- | ---: | ---: | ---: | --- |
| typescript | 1 | 2 | 1 | identical |
| tsx | 1 | 1 | 0 | identical |
| javascript | 1 | 2 | 1 | identical |
| jsx | 1 | 1 | 0 | identical |
| python | 1 | 2 | 1 | identical |
| go | 1 | 2 | 1 | identical |
| rust | 1 | 2 | 1 | identical |
| c | 1 | 2 | 1 | identical |
| csharp | 1 | 3 | 1 | identical |
| java | 1 | 3 | 1 | identical |
| cpp | 1 | 2 | 1 | identical |
| kotlin | 1 | 2 | 1 | identical |
| php | 1 | 2 | 1 | identical |
| swift | 1 | 2 | 1 | identical |
| mojo | 1 | 2 | 0 | identical |
| ruby | 1 | 2 | 1 | identical |
| dart | 1 | 2 | 1 | identical |
| r | 1 | 2 | 1 | identical |
| html | 1 | 1 | 0 | identical |

Mojo's zero call edges and HTML/JSX zero edges are existing fixture results, not
missing parses: expected named symbols/template metadata are included in the exact
baseline comparison. No parser behavior was changed to improve these numbers.

## Dependencies retained / moved (A2)

Only the five direct native packages above moved to devDependencies, at the same
versions. tree-sitter-c follows transitively and is dev-only in the lockfile.
`web-tree-sitter` stays required: it supplies the actual WASM parser runtime.
All 14 grammar WASM assets remain in the same published paths. All other production
dependencies stay unchanged because the CLI/SDK uses them; graphology and its types
remain for graph consumers. better-sqlite3 stays optional for the existing cache.
This does not create a new package or remove any public export or asset path.

## G2 — graph and health invariance

Cold parses of identical frozen inputs using main's built SDK and the changed,
installed-tarball SDK. Complete health objects compared after removing only timestamp:
all dimensions, all raw values, all summaries identical. All 33 dist runtime files
and assets are independently SHA-256 identical (runtime-payload.json).

| Source | Revision | Parsed | Symbols | Edges | Health before → after |
| --- | --- | ---: | ---: | ---: | --- |
| code-graph | 6b997cd | 273 | 7,110 | 3,808 | 71 → 71 |
| Nest | 4c751c50 | 1,836 | 16,841 | 14,961 | 55 → 55 |
| Drizzle | b7862528 | 968 | 30,479 | 24,181 | 34 → 34 |

Edges by kind (before = after):
- code-graph: calls 1,891; imports 802; references-type 1,104; references 1;
  inherits 3; injects 1; rest-api 6.
- Nest: calls 2,843; imports 6,361; references-type 5,087; inherits 166;
  injects 502; rest-api 2.
- Drizzle: calls 4,472; imports 6,122; references-type 12,203; inherits 700; injects 684.

`cmp g2-before.json g2-after.json` exited 0 with no output.
No node/edge kinds, resolution behavior, GRAPH_FORMAT_VERSION (2), or
RESOLUTION_VERSION (5) change. Frozen input avoids counting the newly added gate
scripts as an implementation shape change.

## G3 — actual installed payload

macOS arm64, Node 25.2.1, npm 11.6.2. Fresh independent CLI and graph consumer
installs, install scripts enabled, normal optional dependencies included. Graph
consumer executes an import of depwire-cli/graph; CLI executes installed --version.
Logical bytes sum regular files under node_modules, excluding symlinks;
du -sk reports allocated KiB. Consumer lockfiles and npm cache excluded.

| Measurement | Before | After |
| --- | ---: | ---: |
| CLI logical bytes | 251,878,687 | 65,165,008 |
| Graph-only logical bytes | 251,878,689 | 65,165,010 |
| CLI allocated KiB | 258,592 | 75,736 |
| Graph-only allocated KiB | 258,592 | 75,736 |
| Tarball compressed bytes | 2,430,361 | 2,430,355 |
| Own-package unpacked bytes | 26,972,219 | 26,972,219 |

Reduction: 186,713,679 bytes (74.13%) per consumer. The package payload is unchanged;
its dependency installation shrinks. Minor differences from PR #37 reflect its older
baseline and install-time dependency/artifact state. This still leaves a ~65 MB
SDK install: #13's separate-package question remains open, not implemented here.

Reproduce: build, npm pack --json --pack-destination <temp>, then in each empty
consumer npm init -y and npm install <tarball> --no-audit --no-fund. Do not use source
symlinks or --ignore-scripts. Evidence includes pack manifests and measured totals.

## G4 — packed smoke

Existing installed command shim --version, sample-project CLI parse and stdio MCP
initialize/tools/list=24 assertions retained. New smoke checks all six native grammar
package directories are absent; cold-parses all 17 languages plus TSX/JSX against
full main baseline output; additionally runs CLI parse for C#, C++, Java, PHP, Ruby
and Python. It runs in every existing Ubuntu/Windows × Node 20/22 CI job.

## B1 / B2 / G5 — sharp

sharp 0.34.5 → exact 0.35.4, dev-only. Lockfile version changes are restricted to
sharp and its dependencies (@img packages and semver; sharp now requires ^7.8.5).
No production version upgrades were introduced deliberately. No build/test/script
imports sharp; it is installed tooling, not a parser/runtime dependency.
Verified actual native operation: icon.png decoded, resized to 32×32, encoded to
PNG, decoded metadata asserted; sharp 0.35.4, libvips 8.18.6, output 2,004 bytes.
No breakage or workaround. New dev-tool engine minimum is Node 20.9.0; supported
CI Node 20/22 satisfy it. Published CLI's engine contract is unchanged.

Audit before: high 1 vulnerable package (sharp, two high advisories), low 1.
Audit after: high 0, low 1 (esbuild, unrelated existing development finding).
Both advisory ranges (<0.35.0 and <0.35.4) are resolved. npm audit still exits 1
because of the low residual; this is not a claim of zero advisories.
Full before/after audit JSON is retained alongside this report.

## G6 — build and tests

Build then test ran sequentially: 37 files / 227 tests passed. Release metadata
validation passes at unchanged 1.20.2. Packed smoke passed locally with full fixture
parity, native absence, actual CLI parses and 24 MCP tools. No weakened assertions.
Hosted Ubuntu/Windows × Node 20/22 results are recorded in the PR's final status;
this report does not pre-claim a pending hosted run. No CI platform was removed.
