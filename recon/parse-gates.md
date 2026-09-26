# Parse fixes: gates and history

Baseline: `main` / `origin/main` at `9ffc248` (v1.20.1). Work is on
`fix/parse-exit-codes-and-output-path`; no merge, release, deploy or version bump.

## Findings from history and repository context

`src/commands/parse.ts` does not exist. The command is implemented in
`src/index.ts`. Requested connect_repo, get_architecture_summary and
get_file_context calls were performed using the local main CLI's MCP stdio
server. The missing path returned a file-not-found error; actual context was
retrieved for src/index.ts. Architecture: parser adapters → ParsedFile/errorFiles
→ graph construction → CLI/MCP/SDK, health, security and documentation consumers.

The checkout is not shallow. Reviewed all 50 revisions touching src/index.ts
across all local refs (418 reachable commits); none had exit 2 in the parse
command. `4f0f29b` introduced exit 2 for empty **health** and **dead-code** analyses,
not parse. `6f9751c` subsequently guarded query. No evidence of a deliberate
parse exit-code removal exists in available history; this change adds the
requested contract, rather than attributing a regression to an unverified commit.

`c696c89` already changed explicit-path output to that path (including nested
monorepo directories). The remaining mismatch was omitted directory walking up
to an ancestor project. That now uses cwd. Tests lock explicit relative
packages/backend, unrelated cwd, omitted directory, and explicit output precedence.

## G1 — PASS: graph-shape invariance

Both main and branch SDKs cold-parse the **same source trees** (useCache=false).
code-graph is frozen at main 9ffc248 in a detached worktree; comparing main source
against edited source would confound implementation changes with corpus changes.
Nest and Drizzle HEADs were verified as requested. No parser resolution or graph
serialization version was changed. Complete health objects (only timestamp
removed), including every dimension, weight, grade, detail and raw metric, are
identical. Full before/after evidence: [parse-g1-results.json](parse-g1-results.json).

| Corpus | Parsed files | Symbols, before = after | Health, before = after | Edges by kind, before = after |
| --- | ---: | ---: | ---: | --- |
| code-graph @ 9ffc248 | 263 | 6980 | 71 | calls: 1803, imports: 719, inherits: 3, injects: 1, references: 1, references-type: 1096, rest-api: 6 |
| Nest @ 4c751c50 | 1836 | 16841 | 55 | calls: 2843, imports: 6361, inherits: 166, injects: 502, references-type: 5087, rest-api: 2 |
| Drizzle @ b7862528 | 968 | 30479 | 34 | calls: 4472, imports: 6122, inherits: 700, injects: 684, references-type: 12203 |

## G2 — PASS: exit-code matrix

Each row below was exercised against both built CLIs in isolated temporary
fixtures, including a copied installation missing grammar assets. Raw matrix:
[parse-exit-matrix.json](parse-exit-matrix.json).

| Parse outcome | Main before | Branch after |
| --- | ---: | ---: |
| Successful parse | 0 | 0 |
| Some files failed; partial graph | 0 | 0 |
| Empty directory | 0 | 2 |
| Unsupported files only | 0 | 2 |
| All source files excluded | 0 | 2 |
| Only oversized source files | 0 | 2 |
| Every source read/parse failed | 0 | 2 |
| Missing input directory | 0 | 1 |
| Input is a file, not a directory | 1 | 1 |
| Output path cannot be written | 1 | 1 |
| Invalid CLI option | 1 | 1 |
| Help requested | 0 | 0 |
| Grammar initialization failed | 0 | 2 |

Other thrown errors (graph construction, serialization, IO) retain exit 1 via the
outer CLI catch. Unreadable traversal now throws rather than returning a partial
listing. A supported source file successfully parsed with no extracted symbols
is still a parsed file; exit 2 tests file-parse success, not symbol count.
Partial parses retain SDK errorFiles and emit a non-fatal warning on stderr.
No graph format change: errorFiles is not serialized. On failure no new output
is exported; existing output is left untouched and must not be consumed without
checking exit status. Optional cache/tip/AGENTS generation recovery stays non-fatal.

## G3 — PASS: inventory; decisions remain reported

Full file/line inventory: [parse-silent-failure-inventory.md](parse-silent-failure-inventory.md).
176 catch sites plus non-catch defaults and result/consumer contracts reviewed.
Clearly accidental findings fixed: directory traversal; watcher parse success
and premature old-graph removal; truncated stdin; stash restoration; JVM
read-error metadata; missing verify-change security warning; empty/failed scan
input; misleading empty health/dead-code documents; malformed npm audit results.
Ambiguous and shape-changing entries are explicitly reported, unchanged, for
Atef's decision. This is not a claim that those existing fail-open policies are
resolved. No changes to external VSCode/Cloud/Action repositories.

## G4 — PASS: build then tests

`npm run build` succeeded, followed sequentially by `npm test`.
**35 test files and 211 tests passed.** Regression coverage asserts real CLI exit codes
for success, partial and empty outcomes, missing grammar assets, path precedence,
monorepo output isolation, IO propagation, security parse coverage, document
unscored output, and invalid audit payloads. Existing assertions were not weakened;
partial-warning assertion moved from stdout to the required stderr stream.
`git diff --check` passed. package.json/package-lock.json, formatVersion and
RESOLUTION_VERSION are unchanged.
