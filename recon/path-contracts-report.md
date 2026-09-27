# Canonical paths and parse contracts

Branch: `fix/path-normalization-and-parse-contracts`. Main comparison:
`9ffc2489db9e48f1c182eb4f03fd58456b7f164c`.
Based directly on PR #36, `b6e64ff4201d7d9946a8fe1ac5c0370d93a22756`.
No merge, release, deployment, package-version change, node/edge-kind change,
or graph-format change. Resolution cache version **4 → 5**.

## Reproduction and root cause — G1 PASS

`test/windows-path-contract.test.ts` constructs format-v2 JSON directly. It has
an interface in `src\\app\\model.ts`, two dependent symbols in the same physical
consumer file, and mixed `src\\app\\consumer.ts` / `src/app/consumer.ts` spellings.
Both dependent edges are `references-type`.

Before the fix, actual MCP `affected_files` returns `total_affected: 0`, while
`impact_analysis` finds both dependents and reports two spellings of one file.
`verifyChange` reports blast radius **3**: changed file plus duplicate consumer.
After the fix, affected and impact both report **1** dependent file, with both
symbol relationships retained. Verify-change reports **2** unique files,
including the changed file (its existing blast-radius contract).

The regression test was copied outside the tree, all changes were stashed with
`git stash push -u`, and the original three tests were run against PR #36.
All three failed on their actual assertions: affected 0 vs 1; radius 3 vs 2;
missing-path lookup did not throw. Stash was restored without loss.
[Actual red run](path-contract-evidence/windows-stashed-red.log).
The restored suite also tests absolute Windows queries, UNC input, dot segments,
case preservation, parser/resolver hints, whatif output, directory boundaries,
and both MCP adapters' resolved-empty/error distinction. The verify test also
mutates one consumer path after load to exercise the independent dedupe defense.

Root causes:

1. `scanDirectory` returned native `path.relative` spellings. Language resolvers
   returned native separators or stripped `projectRoot + '/'`, which fails on Windows.
2. Graph construction, cache records, and JSON restoration accepted inconsistent
   file paths and symbol-ID prefixes. Query-side normalization alone could not
   repair the stored keys.
3. `getAffectedFiles` used exact equality, then silently returned empty when no
   seed node matched. Impact traversed IDs instead, explaining the asymmetry.
4. Verify-change normalized comparison paths but accumulated raw dependent paths
   in a Set. Deduplication therefore counted spelling variants separately.
5. Watcher root stripping and MCP/Java/C# containment checks also assumed `/`.

## Boundary and output contract

`src/graph/paths.ts` owns spelling and lexical containment. The Workers-compatible
`src/graph/path-boundary.ts` applies it to records: file paths, node IDs, edge IDs,
original import targets, wildcard re-exports, pending resolver hints and diagnostic
source paths. Parser/cache ingress precedes project-wide resolution; graph build,
JSON import and incremental updates use the same boundary. Native resolver paths
are converted before entering symbol maps. Query arguments use the same helper.
Consumers then compare and emit canonical graph paths without replacement regexes
at comparison sites. Metadata `projectRoot` and IO destinations remain native.

Output source-file paths are project-relative POSIX on every platform, across
MCP/SDK tools, impact, affected, whatif, verify-change, security and dead-code.
Case is preserved. SDK callers supplying raw graphology graphs must honor the
canonical graph contract; legacy serialized JSON is repaired by deserialize.
Missing/excluded/node-less affected targets produce a lookup error, never a
false-clean empty result. Resolved files without dependents still return empty.

## Path-handling inventory — G2 PASS

[Complete source-site census, with file, line, status, rationale and source](path-contract-evidence/path-sites.csv).
This deliberately over-inclusive census includes declarations/comments as well as
operations, graph-ID keys, browser consumers, and filesystem fields. Comments and
HTTP route strings are distinguished from executable graph-path operations.
Statuses describe the reviewed boundary/consumer families below; they do not
claim that every native filesystem call should be rewritten as a graph path.
Census: **7,908 indexed lines across 128 files** (242 fixed, 5,423 already-correct, 2,243 deliberate).
Scope: all production `.ts`, `.js`, `.html` under `src`; tests/build/CI are listed
separately below. No other repositories were changed.

| Sites / family | Status | Evaluation |
| --- | --- | --- |
| `src/graph/paths.ts`, `path-boundary.ts` | fixed | One shared spelling policy, symbol-prefix handling and segment containment. |
| `src/utils/files.ts` scan/root discovery | fixed | Canonical scanner output; native root/basename APIs replace Unix-only root logic. |
| `src/parser/index.ts` scan/exclude/cache/JSON load | fixed | Canonical paths and exclusions before matching/finalization; loaded records normalized. |
| `src/parser/resolver.ts` tsconfig bounds, relative/alias/workspace results | fixed | Native resolution remains native; graph-facing results canonical; sibling prefixes no longer count as containment. |
| C, C++, C#, Dart, Go, Java, JavaScript, PHP, Python, R, Ruby, Rust resolvers | fixed | Native-relative and substring/root-strip results routed through shared helper; Java/C# Windows project-reference guard corrected. |
| Kotlin, Swift, Mojo, HTML parsers | already-correct | Output records pass ingress; native join/resolve/verified-root sets stay internally native. These do not independently strip native root separators. |
| JVM module discovery | fixed / deliberate | First Windows CI exposed native-separator roots in the discovery API. Roots now canonical at output; verified absolute directories remain native; existing `sep` containment was correct. |
| TypeScript IDs, imports, re-exports, namespace/super calls, template pairing | fixed / already-correct | Input filenames and resolver returns canonical before IDs/maps; pending records normalized before project finalizers. Resolver policies otherwise unchanged. |
| Parser cache | fixed / deliberate | Version 5 invalidates old records. SQLite location/mtime IO remains native; cache file keys now come from canonical scanner records. Cache fail-open policy unchanged. |
| `src/graph/index.ts`, `serializer.ts`, `updater.ts` | fixed | All supported graph entry paths canonicalize records. JSON node aliases merge under a single canonical ID. |
| `src/graph/queries.ts` | fixed | Canonical request paths and symbol IDs; explicit missing-file error; summaries/sets operate on canonical attributes. |
| `src/tools.ts`, `src/mcp/tools.ts` | fixed | Shared request normalizer, canonical emitted targets, payload error on failed lookup; suffix/directory filters now respect segment boundaries. |
| `src/mcp/connect.ts` | fixed | Native Windows subdirectories no longer fail the hard-coded `/` containment check. |
| `src/core/verify-change.ts` | fixed | Shared request normalization; explicit final canonical Set before counting/reporting. Changed file remains included. |
| `src/simulation/engine.ts` / whatif | fixed | Normalize action file arguments at entry; move/split/merge/rename destinations use same helper. Native join for rename is converted before node insertion. |
| `src/watcher.ts`, CLI watcher callbacks | fixed / already-correct | Watcher emits canonical relative paths; callbacks compare those against canonical graph attributes. |
| `src/commands/affected.ts` | fixed | Normalize/dedupe changed-file arguments, including absolute Windows paths; failed lookup propagates nonzero rather than printing empty. |
| `src/core/exclusions.ts`, dead-code detector/display, docs dead-code/files | fixed | Canonical exclusion inputs and output paths; remove cwd-sensitive relative conversion of graph-relative paths. |
| Health workspace exclusions | fixed | Canonical relative inputs; all other metric path maps consume the graph boundary. POSIX health is identical, including raws. |
| Security scanner | fixed | Canonical target input, segment-aware suffix selection. Findings inherit canonical ParsedFile paths. |
| Security checks, reachability, native-binding allowlist | already-correct / deliberate | Source findings use ParsedFile paths; reads use native joined paths; package.json/lockfile findings remain relative literals. Vulnerable-code examples describe analyzed source, not executable path handling. |
| Cross-language subprocess | fixed | Called-file ingress and containment use shared helper; existing recognition and ambiguity policy unchanged. |
| Cross-language REST | fixed / deliberate | File containment fixed; route URLs intentionally keep HTTP matching semantics. Source/target file identities originate in canonical ParsedFiles. |
| Docs metadata/status, health history, temporal snapshot IO, MCP docs reads | fixed / deliberate | Shared segment containment replaces unsafe string-prefix checks. Actual filesystem destinations remain native. Serialized graph payloads cross the graph boundary. |
| Documentation, visualization/browser, remaining command output | already-correct | Path-keyed maps and labels consume canonical graph fields. Directory/extname operations on those paths remain valid; native server/static asset locations are IO paths. |
| Git, repository clone paths, coordination/memory persistence | deliberate | Native workspace paths and Git's repository-relative paths are not graph node IDs. No account, storage or Git cleanup policy changed. |
| Filesystem IO joins/exists/read/stat; asset discovery | deliberate | Native absolute paths retained. WASM and security assets use `fileURLToPath`, not URL pathname slicing. |
| Package/workspace globs | fixed / deliberate | Shared separator normalization at pattern ingress; existing supported glob syntax/fallback policy retained. |
| CI/build/test paths | fixed | Node-based static copy and packed smoke replace Unix shell assumptions; EACCES injection replaces chmod assumptions without dropping assertions; junctions and `path.relative` make fixtures portable. |

No blanket normalization of arbitrary metadata, URLs, import specifiers, shell
commands, symbol names or code snippets: those are not filesystem path fields.
No basename-ambiguity or symlink-resolution policy redesign is included.

## POSIX graph invariance — G3 PASS

Main and branch cold-parsed the same frozen source trees (`useCache:false`).
Code-graph source is main `9ffc248`, Nest `4c751c50`, Drizzle `b7862528`.
Timestamp alone is removed before health comparison; **all other health fields,
dimensions, raw metrics, symbols and edge-kind counts are compared**.

| Corpus | Parsed files | Symbols, before = after | Edges, before = after | Health, before = after |
| --- | ---: | ---: | --- | ---: |
| code-graph | 263 | 6,980 | calls 1803; imports 719; references-type 1096; references 1; inherits 3; injects 1; rest-api 6 | 71 |
| Nest | 1,836 | 16,841 | calls 2843; imports 6361; references-type 5087; inherits 166; injects 502; rest-api 2 | 55 |
| Drizzle | 968 | 30,479 | calls 4472; imports 6122; references-type 12203; inherits 700; injects 684 | 34 |

```sh
diff -u recon/path-contract-evidence/g1-main.json recon/path-contract-evidence/g1-branch.json
# exit 0; empty output
```

[Main](path-contract-evidence/g1-main.json) / [branch](path-contract-evidence/g1-branch.json).
No POSIX movement found. Windows corrected keys/resolution are intentional.

## Parse outcomes and PR #36 reconciliation — G4 PASS

This branch **builds on PR #36 unchanged for the parse exit/output fix**, with
additional labels and portable tests. Explicit-subdirectory output had already
been fixed in `c696c89`; #36 locked it with monorepo tests and fixed omitted-path
cwd behavior. Precedence stays `--output` > `<path>` > cwd. Tests assert both
repo root and unrelated cwd remain untouched.

This is a missing guard, **not a regression**: #36 checked all 50 available
`src/index.ts` revisions and found no prior parse exit-2 guard. Exit 2 in
`4f0f29b` belonged to health/dead-code, not parse.

| Outcome | Main | PR #36 | This branch |
| --- | ---: | ---: | ---: |
| Successful graph | 0 | 0 | 0 |
| Partial parse | 0 | 0 + stderr warning + SDK errorFiles | 0 + stderr warning + SDK errorFiles |
| Empty directory | 0 | 2 | 2 |
| Unsupported files only | 0 | 2 | 2 |
| All excluded | 0 | 2 | 2 |
| All oversized | 0 | 2 | 2 |
| All file parses failed | 0 | 2 | 2 |
| Grammar initialization failed | 0 | 2 | 2 |
| Missing input directory | 0 | 1 | 1 |
| Input not a directory | 1 | 1 | 1 |
| Output write failure | 1 | 1 | 1 |
| Other thrown construction/serialization/IO error | 1 | 1 | 1 |
| Invalid option | 1 | 1 | 1 |
| Help | 0 | 0 | 0 |

[Measured CLI matrix](path-contract-evidence/exit-matrix.json); missing-grammar
exit is additionally exercised by the copied-install test. Error propagation
for arbitrary thrown errors is the command's catch contract, not fault injection
for every possible exception. Existing output is retained on failure: consumers
must check the exit code. Successfully parsed comment-only files remain successful
parses even if they introduce no graph nodes.

## File counts — G5 PASS

| Same source tree | Parse parsed files | Parse graph files | Architecture graph files | MCP totalFiles | MCP parsedFiles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Constructed 58-file fixture (3 comment-only) | 58 | 55 | 55 | 55 | 58 |
| Frozen code-graph main | 263 | 262 | 262 | 262 | 263 |

[Runtime code-graph evidence and src/graph/index.ts context](path-contract-evidence/counts-code-graph.json).
Both legacy MCP and pure SDK tool adapters are tested against the 58/55 fixture.
Graph JSON `metadata.fileCount` and `list_files.totalFiles` agree. Parsed count is
additive and optional for old graphs; never infer it from node count. A separate
bug where dead-code documentation used node count as file count is also fixed.

There is no standalone `architecture --stats` command in this repository. The
actual equivalent exercised is `docs --include architecture --stats`, plus
`parse --stats` and MCP `get_architecture_summary`.

## Build, tests, Windows CI — G6

Build precedes test, sequentially: **37 test files / 227 tests passed locally**.
[Build](path-contract-evidence/build.log) / [tests](path-contract-evidence/tests.log).
Hosted matrix status is recorded in the PR. No assertion removed or weakened. The cache-version assertion
is updated to the explicitly requested version 5; read failures are injected as
real fs errors so the same exit-code assertions run on Windows and POSIX.

Windows coverage is **included**, not deferred: Node 20/22 × Ubuntu/Windows,
including dependency install, build, tests, release metadata validation and packed
CLI/MCP smoke. Existing Ubuntu job names are preserved for required checks.
[Local packed smoke](path-contract-evidence/packed-smoke.log): version 1.20.1,
parse successful, MCP tools/list **24**. No publishing occurred; npm pack/install
used an isolated temporary directory which was removed afterward.

## Cache/version decision — G7 PASS

**RESOLUTION_VERSION 4 → 5** is required: Windows resolver targets, module
references, scanner keys and pending cross-file hints can now resolve where old
spellings missed. Old caches must not retain missing or mismatched edges.
`formatVersion` remains **2**, package version **1.20.1**, node/edge kinds unchanged.

First hosted Windows run found two JVM root-output assertions and a test-only
ESM import using a drive path rather than a file URL. The discovery output was
fixed with the shared helper; the ESM test uses `pathToFileURL`. All original
assertions remain. Windows path regression and count-contract tests passed on
that first run; the full matrix is rerun after these corrections.
