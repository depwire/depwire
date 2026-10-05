# Import-site capture gate on draft PR #64

The parsed/built edge invariant accounts for edges the parser emitted. This CI gate checks the earlier step: whether source import syntax received any parser outcome. It is a **pinned construct corpus gate**, not an all-repository coverage certificate.

## Independent census and matching

`test/import-site-ledger.test.ts` enumerates TypeScript and JavaScript import declarations, re-exports, `import x = require(...)`, `require(...)`, and dynamic `import(...)` with the TypeScript compiler AST. `scripts/import-site-ast.py` enumerates Python `import` and `from … import` statements with CPython `ast`. Neither enumerator reads Depwire's tree-sitter nodes or parser symbol table. The test independently walks the fixture source tree, including files with no parser result, then requires each site to have one of: an `imports` or `references-type` parsed edge at the source line, a non-code dependency, an unresolved edge or import, or a `reExportSites` outcome (including `type-only` and `emit-dependent`). A CommonJS `require` diagnosed as an unresolved export also counts. An absent outcome fails with the file, line, form and specifier.

Unresolved import diagnostics currently lack source lines. The gate consumes them by `(file, specifier)` multiplicity and rejects fixtures with more than one import site on a source line. This is adequate for the pinned fixtures but does not prove line-level attribution for repeated unresolved specifiers in arbitrary repositories. Adding source locations to all parser diagnostics is the next hardening step before using this as an all-repository census.

| Pinned fixture root | Independent sites | Forms exercised |
|---|---:|---|
| `reexport-emit` | 23 | TS star, named, namespace, default, type-only, mixed, implicit type, unresolved re-exports; side-effect import |
| `typescript-side-effect` | 6 | Local, alias, external, missing, asset TS side-effect imports; JS side-effect import |
| `typescript-capture` | 9 | TS binding and `import = require`, named and wildcard barrels |
| `reexport-type-chain` | 8 | Three-hop named type and value barrels and consumer imports |
| `javascript-import-completeness` | 20 | Literal and computed require, nested require, dynamic import, ESM import/re-export, extension and non-code targets |
| `import-site-ledger/python` | 5 | First-party absolute `import`, absolute `from`, `from pkg import`, and explicit relative forms under `src/` |
| **Total** | **71** | TypeScript/JavaScript/Python only |

The single ledger test file completed in **1.00 seconds** locally (259 ms test execution) with all seven tests passing. It runs inside the ordinary `npm test` CI job on Ubuntu and Windows; CI installs Python 3.12 for the independent Python AST pass.

## Deliberate misses and barrel proof

After temporarily returning before the TypeScript side-effect import handler, the ledger failed at `side_effect.ts:1 import ./x` and `alias.ts:1 import @local/polyfill`. Restoring the parser made all seven ledger tests pass. The committed test also removes a parsed `local.ts:1` edge in memory and asserts the gate raises `Never-attempted import site`.

The three-named-barrel fixture (`first → second → third → origin`) resolves `Shape` to `origin.ts::Shape`; `getImpact` from that declaration includes `consumer.ts`. The mirror `area` value chain retains runtime file-level imports at each barrel hop and a call to `origin.ts::area`. Both tests pass on #64. Temporarily removing only `references-type` from `finalizeTypeReferences`' named-forwarding map fails the type test and leaves the value control green, as expected. Temporarily disabling #64's re-export finalizer fails **both** tests. Both temporary changes were restored.

## Boundary

This gate does not cover Go, Java, Rust or the other parsers. It checks import and re-export capture, not calls, inheritance, decorators or other relationships. It checks these pinned forms on every CI run; it does not enumerate every import in Nest, Drizzle or another arbitrary repository. The Python corpus deliberately uses first-party imports: the Python parser currently ignores standard-library and third-party imports without a site-level outcome, so a broad all-site gate over arbitrary Python projects would need explicit external-site records. This gate cannot establish target accuracy or emitted-JavaScript behavior beyond the separate compiler and target audits. The graph reconciliation invariant remains a separate accounting check.

## Graph invariance

This PR addition changes only CI, independent audit tooling, fixtures and assertions. No `src/` file is changed. On the pinned code-graph, Nest and Drizzle roots, the post-change parsed and serialized graph SHA-256 digests match `REEXPORT-DETERMINISM.jsonl` seed 11 byte-for-byte. Therefore the symbols and each edge kind have zero before/after delta:

| Root | Symbols | Calls | Imports | References-type | References | Injects | Inherits | REST API | Total edges |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 7,647 | 2,451 | 920 | 1,201 | 1 | 1 | 3 | 6 | 4,583 |
| Nest | 20,156 | 7,534 | 7,398 | 5,866 | 0 | 565 | 184 | 2 | 21,549 |
| Drizzle | 30,891 | 16,027 | 6,509 | 12,664 | 0 | 687 | 700 | 0 | 36,587 |

The per-kind values are from `REEXPORT-CURRENT-MEASUREMENTS.jsonl`; matching full serialized graph digests prove the post-change values are identical.
