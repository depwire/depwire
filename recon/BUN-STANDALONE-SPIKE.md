# Bun standalone executable feasibility — issue #42

**Recommendation: viable with named changes, not viable as specified today.**
Q6 succeeds: a local wheel installs with uv in a clean Linux ARM64 container with
no Node, Bun or npm and runs the CLI/parsers. **Q4 fails**: graph insertion order
changes between Node and Bun, and the existing cycle-count algorithm depends on
that order. Nest health raw cycles change **59 → 86**, Drizzle **622 → 665**.
Same overall scores do not satisfy raw-metric parity. No production fix attempted.

Other limitations: better-sqlite3 is unsupported by Bun 1.4.2, so this prototype
explicitly disables cache; dependency auditing still requires external ecosystem
tools. Windows is build-only evidence, not runtime support certification.

Investigation only. Source baseline/tag: main/v1.21.2 **28ec599**.
Branch: spike/bun-standalone. No src/, package.json, lockfile, or release-process
changes. Only this report and `spike/build-bun.ts` are committed. No publishing,
merge, distribution infrastructure, optimization or PyPI channel was introduced.
Local Docker images are test artifacts, not uploaded images.

## Environment and evidence

macOS arm64; Node 25.2.1; npm 11.6.2; installed Bun 1.3.12; tested current Bun
1.4.2 downloaded from its GitHub release **only into /tmp**, without upgrading the
user's Bun installation. Docker Desktop Linux ARM64 became available after startup.

Requested repository connector tools are not available in this toolset. Read
package.json, SDK, parser registry, wasm-init, graph/health and process sites directly.
Architecture: CLI `src/index.ts` → command modules and SDK; `parseProject` →
per-language parsers → shared graph; health traverses graph; MCP reuses tools;
web-tree-sitter loads fourteen grammar assets. `/graph` and `/tools` are separate
npm exports. Native SQLite is optional cache acceleration.

npm comparison is a real registry install of **depwire-cli@1.21.2** under
`/tmp/depwire-bun-spike/node_modules`, not a source-tree alias. All evidence/scripts,
raw JSON, stdout/stderr, containers' build logs and binary artifacts remain under
`/tmp/depwire-bun-spike/` locally; these large/temp artifacts are not committed.
Primary evidence files: language-parity.json, command-parity.json,
corpora-parity.json, extra-initial.json, extra-parity.json, timings.json,
wheel-container-final.log, wheel-languages.log, order-node.log, order-bun.log.

## Q1 — compile and first execution

Exact initial command:

```sh
bun build --compile src/index.ts --outfile /tmp/depwire-bun-spike/raw
```

Bun 1.3.12: `[114ms] bundle 513 modules`, `[128ms] compile .../raw`.
Compiler succeeded, but executable terminated with exit 137 before CLI startup.
`file` identifies Mach-O arm64; codesign reports unsigned and ad-hoc signing fails
with `invalid or unsupported format for signature`. Explicit darwin-arm64 target
and compiling dist/index.js reproduced it. This is a toolchain/artifact finding,
not evidence that Depwire cannot compile.

Repeating with isolated Bun 1.4.2: `[209ms] bundle 513 modules`, `[222ms] compile`.
Executable starts, but `--version` fails with:

```
ENOENT: no such file or directory, open '/$bunfs/package.json'
Bun v1.4.2 (macOS arm64)
```

The version loader assumes a filesystem package.json next to dist. The small build
plugin embeds the package metadata at build time for CLI/MCP version lookup.
This is a prototype transform in the build script, not an edit to src/.

## Q2 — runtime assets

**Not found as-is.** After only the metadata substitution, a separate no-WASM build
fails parsing at the web-tree-sitter runtime WASM load (no successful graph).
Exact error: `ENOENT ... /$bunfs/root/web-tree-sitter.wasm`; CLI exits 2, zero files parsed, no graph exported.
The original loader resolves assets relative to import.meta.url, which now points
inside Bun's virtual executable filesystem rather than npm's installed directory.

Least-invasive tested prototype: explicit `with { type: 'file' }` imports for all
fourteen grammars and the web-tree-sitter runtime WASM. Build-time transforms wire
Parser.init locateFile and Language.load to those embedded file paths. No extraction,
external asset directory, first-run download, or Node/Bun runtime is required.

- Bundled grammar assets: **25,656,770 bytes (25.66 MB)**.
- web-tree-sitter runtime WASM: **196,721 bytes**.
- The ~65 MB npm dependency installation is a different measurement.
- Security native-binding allowlist is also embedded; otherwise scanner asset
  lookup can fail.
- Initial temporal UI requests returned HTTP 500 because static assets were
  missing. Embedded temporal.html/js/css in the final prototype: all return 200,
  matching npm response lengths **4,673 / 16,655 / 6,112 bytes**.

The prototype deliberately covers the requested command paths. Interactive viz/
whatif browser assets outside the tested paths are not certified. A production
asset-inventory pass would still be necessary.

Build reproduction (from repo root, using Bun 1.4.2):

```sh
bun spike/build-bun.ts bun-darwin-arm64 /tmp/depwire
# Other tested targets: bun-darwin-x64, bun-linux-x64,
# bun-linux-arm64, bun-windows-x64
```

Build API/file embedding references: https://bun.sh/docs/bundler/executables
The Windows compiler adds `.exe`; the first script's subsequent stat of the
extensionless name failed even though compilation succeeded. Script corrected to
measure the actual .exe; this was not a cross-compilation failure.

## Q3 — optional SQLite cache

Direct test under Bun 1.4.2, using installed better-sqlite3:

```js
const D = require('better-sqlite3');
const d = new D(':memory:');
```

Result:

```
Error [ERR_DLOPEN_FAILED]: 'better-sqlite3' is not yet supported in Bun.
Track the status in https://github.com/oven-sh/bun/issues/4290
```

**Without cache: works. With the existing native module: fails.**
The build transform forces that optional cache import down its existing unavailable
path and emits `[standalone spike] SQLite cache unavailable; full parsing enabled.`
on stderr. Parser also reports `Cache unavailable — full parse mode`.
No obscure error or false cache success. No bun:sqlite compatibility layer was
written; that would be production work requiring separate behavior tests.

## Q4 — parity results (the blocking gate)

All tests compare the exact same source files with npm 1.21.2. JSON comparisons
remove nondeterministic timestamps (`parsedAt`, health timestamp). Graph sets are
compared independently of array ordering, **and raw array-order differences are
reported rather than silently considered identical**. Command JSON comparisons
ignore timing fields; original stdout/stderr are retained.

### Every language — 17 supported languages plus TSX/JSX, 19 fixtures

One parsed file each, no parse failures, complete graph JSON matching after only
parsedAt removal. Linux wheel comparisons also normalize projectRoot because the
container mount uses /fixtures. No node/edge fields are discarded.

| Language/variant | Nodes | Edges | macOS binary vs npm | Linux ARM64 wheel vs npm |
| --- | ---: | ---: | --- | --- |
| c | 2 | 1 | identical | identical |
| cpp | 2 | 1 | identical | identical |
| csharp | 3 | 1 | identical | identical |
| dart | 2 | 1 | identical | identical |
| go | 2 | 1 | identical | identical |
| html | 1 | 0 | identical | identical |
| java | 3 | 1 | identical | identical |
| javascript | 2 | 1 | identical | identical |
| jsx | 1 | 0 | identical | identical |
| kotlin | 2 | 1 | identical | identical |
| mojo | 2 | 0 | identical | identical |
| php | 2 | 1 | identical | identical |
| python | 2 | 1 | identical | identical |
| r | 2 | 1 | identical | identical |
| ruby | 2 | 1 | identical | identical |
| rust | 2 | 1 | identical | identical |
| swift | 2 | 1 | identical | identical |
| tsx | 1 | 0 | identical | identical |
| typescript | 2 | 1 | identical | identical |

Fixtures come from scripts/language-smoke.mjs. Each contains actual named symbols;
HTML contains template references. Zero Mojo edges is npm's existing fixture result.

### Real repositories — node/edge sets identical, raw health not identical

| Corpus | Revision | Graph nodes | Edges | Overall health npm / binary | Graph sets |
| --- | --- | ---: | ---: | --- | --- |
| code-graph | 28ec599 frozen archive | 7,353 | 3,844 | 71 / 71 | identical |
| Nest | 4c751c50 | 18,328 | 14,961 | 55 / 55 | identical |
| Drizzle | b7862528 | 31,284 | 24,181 | 34 / 34 | identical |

Counts above are all graph nodes (including structural nodes). Countable symbols:
code-graph 7170, nest 16841, drizzle 30479; identical before/after.
All three retain formatVersion **2**. Source RESOLUTION_VERSION remains **5**;
it is an internal cache compatibility constant, not a field in exported graph JSON.
No graph kind/resolver change was made. Nest counts here reflect the actual fixture
checkout and current comparison, not the different counts in earlier reports.

Edges by kind:
- code-graph: calls 1,910; imports 818; references-type 1,105; rest-api 6;
  references 1; inherits 3; injects 1.
- Nest: calls 2,843; imports 6,361; references-type 5,087; inherits 166;
  injects 502; rest-api 2.
- Drizzle: calls 4,472; imports 6,122; references-type 12,203; inherits 700; injects 684.

All six dimension raws, with no omitted metric keys:

| Corpus | Dimension | npm raw metrics | Binary raw metrics |
| --- | --- | --- | --- |
| code-graph | Coupling | `{"avgConnections":5.43,"maxConnections":224,"crossDirCoupling":8.3}` | identical |
| code-graph | Cohesion | `{"avgInternalRatio":45.1,"directories":38}` | identical |
| code-graph | Circular Dependencies | `{"cycles":0,"cyclesPer100":0}` | identical |
| code-graph | God Files | `{"godFiles":12,"threshold":41,"godFilesPer100":4.3}` | identical |
| code-graph | Orphans & Dead Code | `{"orphans":6,"orphanPercentage":4.4,"deadSymbols":179,"deadCodePercentage":2.4}` | identical |
| code-graph | Dependency Depth | `{"maxDepth":12}` | identical |
| nest | Coupling | `{"avgConnections":5.06,"maxConnections":876,"crossDirCoupling":35}` | identical |
| nest | Cohesion | `{"avgInternalRatio":13.6,"directories":468}` | identical |
| nest | Circular Dependencies | `{"cycles":59,"cyclesPer100":3.4}` | `{"cycles":86,"cyclesPer100":4.9}` |
| nest | God Files | `{"godFiles":71,"threshold":31.1,"godFilesPer100":4.1}` | identical |
| nest | Orphans & Dead Code | `{"orphans":34,"orphanPercentage":2.7,"deadSymbols":3300,"deadCodePercentage":18}` | identical |
| nest | Dependency Depth | `{"maxDepth":22}` | identical |
| drizzle | Coupling | `{"avgConnections":15.15,"maxConnections":1418,"crossDirCoupling":23.3}` | identical |
| drizzle | Cohesion | `{"avgInternalRatio":11.5,"directories":148}` | identical |
| drizzle | Circular Dependencies | `{"cycles":622,"cyclesPer100":70.3}` | `{"cycles":665,"cyclesPer100":75.1}` |
| drizzle | God Files | `{"godFiles":50,"threshold":95.3,"godFilesPer100":5.6}` | identical |
| drizzle | Orphans & Dead Code | `{"orphans":20,"orphanPercentage":3.2,"deadSymbols":5239,"deadCodePercentage":16.7}` | identical |
| drizzle | Dependency Depth | `{"maxDepth":9}` | identical |

**Root cause evidence:** src/utils/files.ts uses unsorted readdirSync results.
For the exact same sample directory:

```
Node: [ '.depwire', 'index.ts', 'services', 'types.ts', 'utils' ]
Bun:  [ '.depwire', 'utils', 'types.ts', 'index.ts', 'services' ]
```

src/health/metrics.ts:225 uses a visited-set DFS over insertion-ordered file maps.
Consequently the discovered cycle count depends on traversal order. To separate
runtime math from graph ordering, deserialized each emitted JSON graph and called
calculateCircularDepsScore under BOTH Node and Bun: both gave **55/82** for npm/Bun
Nest graph orderings and **132/118** for Drizzle. These diagnostic numbers differ
from CLI health because that direct call omits health's filtering, but agreement
between runtimes for a fixed ordering identifies ordering as the cause.

No ordering/metric change was made: sorting discovery or changing cycle counting
could affect existing npm outputs and must be evaluated independently. Caches may
also preserve/reorder parsed records, so only sorting one output comparison is not
an adequate production fix.

### Full requested command table

| Item | Result | Evidence/limits |
| --- | --- | --- |
| parse | PARTIAL | 19 single-file fixtures identical; all 3 corpus graph sets identical; multi-file array ordering differs |
| affected | PASS on fixture | --json equal, exit 0; git remains required for --git-diff |
| health | **FAIL** | Nest/Drizzle circular-dependency raws differ; five other dimensions identical; small fixture and code-graph fully match |
| dead-code | **DIFF** | Same findings/counts, different symbol-array order; sorted full finding objects identical |
| security | PASS on source fixture; LIMITED without host tools | JSON matches for static-source fixture; npm audit unavailable without npm is explicitly reported |
| whatif | PASS on fixture | --simulate delete --target leaf.ts --json equal, exit 0; browser mode not certified |
| verify-change | PASS on fixture | --file leaf.ts --content replacement --json equal, exit 0 |
| diff | PASS on two-commit fixture | HEAD~1 HEAD --json equal; includes security/health; git available |
| temporal | **DIFF** | Both commit snapshots produced; API data differs only by file-array order; static routes initially 500, final embedded-assets prototype 200 |
| docs | **DIFF** | Markdown generation succeeds, 13 docs; ordering and tie selection differ (Most Connected caller.ts vs leaf.ts). Same starting .depwire state used for final comparison |
| MCP | PASS | initialize reports version 1.21.2, protocol 2025-06-18; tools/list = 24 for both |
| cache | Declared difference | Binary cold parse only, explicit stderr warning; npm optional cache works |

Initial docs --format json attempt exited 1 for BOTH with `JSON format not yet
supported`; reran supported Markdown generation successfully. First docs comparison
also accumulated health history between runs; reran with cleared fixture state.
Residual differences above persist and are not attributed to history accumulation.

## Q5 — remaining host requirements

| Feature | Host requirement |
| --- | --- |
| Local parse/graph queries/health/dead-code/JSON whatif/verify-change/MCP stdio | No Node or Bun; readable source, filesystem permissions, supported OS ABI |
| diff, temporal, affected --git-diff, docs Git history | git executable; repository/history access |
| MCP connect_repo remote clone | git, network, any required SSH/HTTPS credentials/transport helpers |
| JavaScript dependency audit | `npm audit --json`: npm plus its Node runtime, package metadata/lockfile and registry/network access |
| Python dependency audit | Source invokes `pip audit --format json`; requires that command to exist. Ordinary pip in the clean container says `ERROR: unknown command "audit"`; installing pip-audit usually exposes a different command. This existing integration needs separate review |
| Rust dependency audit | cargo plus cargo-audit (`cargo audit --json`), advisory data/network as required |
| Go dependency integrity check | Go (`go mod verify`) and module cache; integrity verification is not a general CVE audit |
| Shell-based audit invocations | OS shell (/bin/sh or Windows command processor), unchanged from npm CLI |
| Interactive visualizations | localhost sockets and optional browser/OS opener; not needed for headless JSON or MCP |
| Python wheel install/launcher | uv or pip/pipx plus Python; the wheel wrapper is Python-native, binary itself is not |

Clean-container JS security result is `npm audit unavailable` (info), not complete
vulnerability coverage. Its existing dependencyAudit.ran field still says true;
that records attempted execution, not a successful audit. No false full-functionality
claim: **no Node for core CLI** does not mean **no external tools for every command**.

## Q6 — real Python-native installation (PASS on Linux ARM64)

Built a local platform wheel `depwire_cli-1.21.2-py3-none-linux_aarch64.whl`:
minimal METADATA/WHEEL/RECORD, console_scripts entry `depwire`, bundled executable
with executable permissions. Python launcher simply os.execv's the adjacent binary
and forwards argv. No downloader, runtime installation, package registry upload,
Node, Bun or npm dependency. Wheel size: **39,570,923 bytes**.

Fresh Docker build based on python:3.12-slim; installed uv 0.12.21, then:

```dockerfile
RUN ! command -v node && ! command -v bun && ! command -v npm
RUN uv tool install --no-index /wheel/depwire_cli-1.21.2-py3-none-linux_aarch64.whl
ENV PATH="/root/.local/bin:${PATH}" DEPWIRE_NO_TELEMETRY=1
RUN depwire --version
RUN depwire parse /fixture --output /result
```

Output: installed `depwire-cli==1.21.2`; CLI `1.21.2`; graph format 2 and named
leaf symbol assertion pass (`WHEEL PARSE PASS 1`). Follow-up clean-container run
passes every one of the 19 language fixtures against npm expected JSON.
`command -v node/bun/npm/git` all absent. No host node_modules mounted for this
install test. Subsequent all-language comparison mounts only fixture/expected JSON
folders, not runtimes. Final image built locally as depwire-standalone-spike:local.

This proves **local wheel installation through uv**, not a published PyPI channel,
not pipx/pip compatibility tests, not all OS wheel tags, not manylinux compliance,
and not the unavailable external audits. Wheel is linux_aarch64, deliberately not
an unverified manylinux compatibility claim.

## Q7 — actual sizes, platform execution, and timings

Final embedded-assets prototype; no minification/size optimization:

| Platform | Bytes | Decimal MB | Execution evidence |
| --- | ---: | ---: | --- |
| macOS arm64 | 91,519,218 | 91.52 | Native: all CLI/parity checks |
| macOS x64 | 98,398,480 | 98.40 | Rosetta: version + sample parse |
| Linux x64 | 110,388,704 | 110.39 | Docker amd64 emulation: version + TS parse |
| Linux arm64 | 110,348,584 | 110.35 | Clean Docker: uv wheel install + parse; all 19 fixtures |
| Windows x64 | 115,161,088 | 115.16 | Built only; no Windows runtime available |

All five requested platforms built. Windows runtime verification is unavailable
on this host; cross-compilation success is not Windows parity. Linux x64 runs under
emulation, so no native x64 performance claim. No macOS signing/notarization or
Linux ABI compatibility certification attempted. Existing Bun 1.3.12 compile failure
was bypassed by testing a current compiler, not by changing production sources.

Cold-process wall times on macOS ARM64, five trials each, median. OS filesystem
caches were NOT flushed; this is process startup, not machine-cold disk timing.
DEPWIRE_NO_TELEMETRY=1. Parse uses sample-project (6 files, 31 nodes, 21 edges),
with .depwire removed before each trial so neither implementation gets a warm
parse cache. Output serialization is included.

| Operation | npm / Node median ms | Standalone median ms |
| --- | ---: | ---: |
| --version | 234.60 | 81.77 |
| parse sample-project | 310.50 | 141.38 |

No performance conclusion about large repositories or warm-cache workloads:
cache-disabled standalone may lose its startup advantage there.

## Q8 — version identity sketch (not implemented)

One source version from package.json: embed that value in binary CLI/MCP metadata;
use the same value in wheel metadata and npm manifest. Before manual publishing,
produce an expected-artifact manifest for the intentionally supported platforms,
with source commit, Bun version, hashes, platform tags and package version. Require:
all expected artifacts exist, wheel metadata == binary --version == npm version ==
tag; MCP initialize version matches; checksums match the tested artifacts. Fail on
missing artifacts, stale versions or unsupported platform tags. Do not build a
second version source or silently substitute the latest npm version at install time.
Publishing remains Atef-approved and manual; no workflow or publisher was created.

## Q9 — runtime maintenance

Observed GitHub stable releases: 1.3.12 Apr 10, 1.3.13 Apr 20, 1.3.14 May 13,
1.4.0 Aug 20, 1.4.1 Sep 4, 1.4.2 Sep 5 (2026). This is irregular: days to months,
not a fixed promised security cadence. The Bun 1.4 release notes explicitly include
security hardening and recommend upgrading. Current 1.4.2 also updates JavaScriptCore. Observed adjacent stable-release gaps in
this sample are 10, 23, 99, 15 and 1 days; there is no fixed cadence to budget against.

- https://github.com/oven-sh/bun/releases
- https://bun.sh/blog/bun-v1.4
- https://bun.sh/blog (release chronology)

A Bun/runtime CVE does NOT get fixed when a user upgrades a system Bun that the
binary never uses. Atef must select the patched compiler/runtime, rebuild every
supported target, repeat parity/security/wheel checks, and manually release a new
Depwire package version and matching artifacts. Existing users must upgrade that
binary/wheel. Track Bun/JSC advisories and record compiler provenance; no automatic
updater is proposed. A compiler upgrade itself can change Node API behavior—as this
spike's directory-order evidence demonstrates—so runtime bumps need parity gates.

## Decision

**Do not promise an identical standalone release yet.** The distribution mechanism
is feasible, and Q6 removes the original runtime-install objection with real proof.
But Q4 fails on health raws and several ordered/tie-selected outputs. Required next
work would be explicitly scoped: deterministic discovery/graph traversal and output
tie handling (validated against npm's contract), complete runtime asset enumeration,
accepted documented cache-disabled behavior or separately tested cache integration,
and platform execution/ABI/signing tests. Native audit tool requirements remain.

These are named compatibility changes, not PyPI/release infrastructure. No release
channel, dates, or support commitment follows from this spike.
