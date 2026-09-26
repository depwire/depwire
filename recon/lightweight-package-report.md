# Bug #13: package payload investigation and compatible safeguards

Main baseline: `9ffc248` (v1.20.1). Branch: `feat/lightweight-package`, independently
based on main (does not include unmerged parse-fix PR #36). No publication,
deployment, merge, version bump, parser/resolution change, or format bump.

**Outcome: runtime graph imports remain lightweight; npm installation does not.**
This PR preserves the existing published surface, makes its file allowlist explicit,
and adds a recursive static import-closure regression gate. It does not claim to
resolve the structural install-size barrier. The material package/dependency
changes below await Atef's explicit decision, per the task's package-shape rule.

## I1 — exact measured payload

Measurements: macOS arm64, Node v25.2.1, npm 11.6.2. MB below means decimal
1,000,000 bytes. Logical totals sum regular-file sizes beneath node_modules;
`du -sk` measures allocated KiB and can vary between installs despite identical
logical payloads (filesystem allocation/native install artifacts). No npm caches,
consumer source, root lockfile, or dev tooling included. Dependency install scripts
were enabled. Native/optional install success verified; this is not an
`--ignore-scripts` underestimate. Other platforms/Node versions may differ.

Every candidate was built as a **local npm tarball**, installed into a fresh
consumer directory, and measured. Experiments are not published packages and do
not alter the repository manifest except the explicitly described safeguards.

| Measurement | Before | After |
| --- | ---: | ---: |
| Packed .tgz bytes | 2,425,990 | 2,426,380 |
| Unpacked own-package bytes | 26,956,201 | 26,957,112 |
| Full CLI node_modules logical bytes | 251,969,162 | 251,970,078 |
| Full CLI du KiB | 265,072 | 264,060 |
| Graph-only consumer node_modules logical bytes | 251,969,163 | 251,970,079 |
| Graph-only consumer du KiB | 264,432 | 266,028 |

The after logical increase is documentation/manifest metadata, **not a size
reduction**. Importing only `/graph` does not alter what npm installs. Differences
of one byte between consumer totals come from generated installation metadata.
Full per-dependency/per-directory numbers for all candidates:
[sizes.json](lightweight-package-evidence/sizes.json).

| Baseline category (disjoint file extensions) | Bytes | Fraction |
| --- | ---: | ---: |
| other | 10,909,862 | 4.33% |
| js | 10,978,505 | 4.36% |
| source-map | 7,324,398 | 2.91% |
| wasm | 40,651,383 | 16.13% |
| native-source | 93,631,910 | 37.16% |
| native-binary | 88,473,104 | 35.11% |

Native binaries include .node/.a/.o/.so/.dylib/.dll/.lib; native source includes
.c/.cc/.cpp/.h/.hpp. JS and source maps are separate; other includes declarations,
JSON, docs and build metadata. These are file categories, not disjoint npm
package families: native grammar packages contain source, binaries, and WASM.

| Largest installed dependency directories | Logical bytes | du KiB |
| --- | ---: | ---: |
| tree-sitter-c-sharp | 68,022,151 | 67,304 |
| tree-sitter-cpp | 42,392,814 | 42,820 |
| tree-sitter-ruby | 30,832,828 | 30,684 |
| tree-sitter-php | 29,836,331 | 30,120 |
| depwire-cli | 26,956,201 | 27,424 |
| better-sqlite3 | 12,321,465 | 13,160 |
| tree-sitter-c | 8,967,502 | 9,192 |
| tree-sitter-java | 6,223,115 | 6,756 |
| web-tree-sitter | 4,523,037 | 4,460 |
| @modelcontextprotocol/sdk | 4,343,917 | 6,112 |
| zod | 4,343,491 | 6,152 |
| graphology | 2,729,833 | 2,724 |
| hono | 1,396,425 | 2,848 |
| ajv | 1,033,496 | 2,364 |
| simple-git | 951,189 | 1,316 |

| Own-package directory (nested totals) | Logical bytes | du KiB |
| --- | ---: | ---: |
| . | 26,956,201 | 27,424 |
| dist | 26,865,398 | 27,328 |
| dist/parser/grammars | 25,656,770 | 26,100 |
| dist/viz | 60,846 | 76 |
| dist/security | 1,651 | 4 |

The five direct native grammar packages plus transitive tree-sitter-c occupy
**186,274,741 bytes (73.93%)**. Their native entry points are
not imported by Depwire. `src/parser/wasm-init.ts` loads the checked-in WASM assets
via web-tree-sitter. The package's 14 bundled grammars occupy 25,656,770 bytes
(95.18% of its own payload). better-sqlite3 remains an optional
cache accelerator (12,321,465 installed bytes on this platform).

## I2 / G3 — actual runtime import closure

Inspection uses esbuild to follow **all local and npm imports** for source and
built entry points; only Node built-ins are externalized. TypeScript AST inspection
rejects indeterminate dynamic module loads. It checks bundled output imports,
not erased TS type references in esbuild input metadata. Full metadata:
[import-closures.json](lightweight-package-evidence/import-closures.json).

| Built entry | Entry bytes | Complete input bytes | Bundled ESM bytes | Runtime externals |
| --- | ---: | ---: | ---: | --- |
| dist/graph.js | 47,902 | 226,052 | 183,925 | events, path |
| dist/tools.js | 71,981 | 250,131 | 208,005 | events, path |

Closure: graph serializer/counts/queries, core exclusions, dependency-path
analysis, pure health metrics, simulation engine, graph entry, and (for tools)
tool registry; plus Graphology's real 178,150-byte ESM implementation. No parser,
SQLite, fs, child_process, WASM loader, workspace health, or native grammar package.
Graphology's graphology-types peer is installed for types, not loaded at runtime.
The v1.10.0 split still holds: new serialization/counting/type-reference support
has not pulled a Node workspace/parser dependency into these closures.

`path` and `events` require the supported Node compatibility surface; this is not
a claim of arbitrary browser compatibility. Cloud's existing API config uses
compatibility_date 2024-09-23 plus nodejs_compat. See
[Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).
The new regression test follows a deliberately tiny re-export into a hidden fs
import and rejects it; it also rejects computed dynamic imports. It cannot pass
merely by checking a 726-byte stub.

Requested MCP connect_repo and get_architecture_summary were run via local stdio:
262 graph files, 6,980 symbols, 3,629 edges. get_file_context(package.json) returned
file-not-found because package.json is not a source node; package.json was read
directly. Existing connect_repo summary uses obsolete count names (already
reported in PR #36's inventory); not changed by this packaging task.

## I3 — measured options and consumer impact

These are concrete local prototypes, not promises of an unpublished design's
exact eventual byte count. Optional/peer prototypes retain all current files and
move every non-graph dependency (including existing optional SQLite) to the
specified category. Separate-package prototype contains graph/tools JS and
declarations, README/LICENSE, graphology and graphology-types only. Its temporary
measurement name is not a proposed public package name.

| Option | Graph-consumer logical install | du KiB | CLI / Cloud parser / VSCode / Action effect | Decision |
| --- | ---: | ---: | --- | --- |
| (a) Optional parser dependencies, explicit --omit=optional | 29,829,294 B | 29,368 | Omitting required parser dependencies breaks CLI/parser/extension; default optional installs still install them. Bundled grammar bytes remain. | Not selected |
| (a) Optional peers (peerDependenciesMeta) | 29,831,300 B | 29,372 | Normal install no longer provisions parser dependencies; CLI, Cloud parser, extension and Action installation contracts change. Ordinary required peers auto-install and do not solve size. | Requires Atef |
| (b) Separate additive graph/tools package | 3,051,810 B | 3,144 | Existing depwire-cli and parser/extension/Action stay unchanged; graph-only consumers and Cloud Worker may opt into a new package/import name. Two package releases/types/versioning need ownership. | Recommended durable solution; requires Atef |
| (c) Preserve public surface; explicit files allowlist | 251,970,079 B | 266,028 | All current paths/assets/APIs preserved. Exports already enumerate exactly four entry points, so further removal breaks consumers. No material size reduction. | Implemented safeguards only |
| (d) Lazy grammar loading | Same retained payload as baseline: 251,969,163 B | Baseline 264,432 | WASM loading already happens in initParser at parse time, not when graph/tools are imported. Further dynamic loading changes memory/startup, not npm-installed files. Per-language loading changes error timing and synchronous getParser assumptions. | No install benefit; not implemented |
| Additional: unused native grammars moved to devDependencies | 65,255,512 B | 75,692 | Local prototype retains all exported assets/APIs and passes CLI parse/MCP 24-tool smoke. Removes five unused native build packages and their transitive baggage; parser still uses identical WASM. | Recommended first reduction, but dependency layout decision explicitly left to Atef |

Optional-omitted and optional-peer prototypes both actually fail CLI --version and /sdk import with exit 1 (missing required modules); see [prototype compatibility evidence](lightweight-package-evidence/prototype-compatibility.json). All graph/tools prototype imports succeed.

Separate package pack: 44,959 compressed bytes / 179,347 own unpacked bytes.
Optional prototype pack: 2,425,993 / 26,956,201 bytes. Optional-peer prototype:
2,426,193 / 26,957,101 bytes. Unused-native prototype: 2,425,992 / 26,956,201 bytes.
This explains why package tarball size alone does not describe consumer cost.
For (d), no imaginary asynchronous-parser implementation was measured: the
existing first-parse loader is the measured baseline, and retaining the same
files/dependencies cannot remove install bytes.

npm has no import-subpath-dependent installation or install-on-first-parse
mechanism. Optional dependencies install by default unless omitted; optional peers
are not auto-installed. `files` controls own-package contents, not dependency
installation. Sources: [npm package.json](https://docs.npmjs.com/cli/v10/configuring-npm/package-json/)
and [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/).

Local consumer evidence (read-only inspection; no consumer repos modified):

- Cloud API: `api/src/mcp/context.ts`, `api/src/mcp/server.ts` import /graph and /tools.
- Cloud parser: `parser/src/parse.ts` and chat.ts import /sdk; version detection also resolves the root entry. Removing root exports breaks that path.
- VSCode: `src/providers/DepwireProvider.ts` eagerly bundles /sdk; webpack copies `node_modules/depwire-cli/dist/parser/grammars` and `dist/security/native-binding-allowlist.json`; SQLite is externalized. Neither path can be trimmed.
- Action: `src/depwire.ts` runs `npm install -g depwire-cli@version`, then invokes CLI. Optional peers would require an Action installation change.

## Implemented versus held

Implemented: explicit files allowlist with the exact same 37-file payload set;
README clarifies runtime-vs-install weight; `scripts/check-sdk-closure.mjs` and
six closure regression cases; direct dev-only esbuild declaration (already
installed transitively through tsup). All production and optional dependencies,
export-map keys and targets, package version, WASM paths, formatVersion and
RESOLUTION_VERSION remain unchanged. Every runtime file and asset is byte-identical
([SHA-256 comparison](lightweight-package-evidence/payload-comparison.json)).

Held for decision: unused-native dependency relocation; a separate published
package; optional-peer/parser-payload redesign; deleting or moving any existing
asset/export. An asynchronous clarification requested the unused-native move;
without approval it is not part of this branch. No option selected by silence.

## G1–G5

- **G1 PASS:** main and packed branch SDK cold-parse identical frozen source trees:
  code-graph @9ffc248, Nest @4c751c503bc753095f4b4f052e106f95218cc33f,
  Drizzle @b7862528fd8fc39bc2653a6c18dad7c1f4e68d10. Complete health (only timestamp
  excluded), every dimension/raw metric, symbols, and edges by kind identical.
  [Before](lightweight-package-evidence/g1-before.json), [after](lightweight-package-evidence/g1-after.json).
  Frozen code-graph input avoids confusing added verification code with a parser
  behavior change. Runtime payload identity independently proves implementation preservation.
- **G2 PASS as measurement, not a reduction:** table above gives real npm pack,
  clean npm install and du results for full CLI and graph-only consumers. Structural
  lightweight adoption remains blocked on the reported package decision.
- **G3 PASS:** full source/built/npm runtime closures inspected. Allowed externals
  are events/path only. Six regression cases pass, including hidden fs and dynamic loaders.
- **G4 PASS:** installs packed tarball; --version = 1.20.1; real parse produces two
  symbols/one edge; MCP tools/list = 24; public graph/tools imports succeed.
  [Smoke evidence](lightweight-package-evidence/smoke-after.json).
- **G5 PASS:** `npm run build` then `npm test`, sequentially: **34 files, 191 tests**.
  No existing assertions weakened. `git diff --check` clean.

Reproduction: build; run `node scripts/check-sdk-closure.mjs`; `npm pack --json
--pack-destination <outside-repo-dir>`; in a fresh empty consumer `npm install
<absolute-tarball> --no-audit --no-fund`; measure `du -sk node_modules` and logical
file lengths. Do not substitute a source symlink or ignore-scripts install.
The normal CI packed-CLI/MCP smoke workflow is retained unchanged.
