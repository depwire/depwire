# PR #55 TypeScript call-target audit — structural preflight and completed repair

The material below preserves the original preflight and its hard-stop decision at the time. The follow-up repair, eight-repository conservation tables, health movement, and completed 150-edge sample are in [the edge-contract report](TYPESCRIPT-EDGE-CONTRACT.md) and [target-accuracy sample](TYPESCRIPT-CALL-TARGET-SAMPLE.md). The original `Client` edge was invalid in parsed output but **did not survive into the built graph**: no placeholder target node existed. The later repair removes that parsed edge and records the ambiguity.

## Parser-to-graph contract, C1–C3 (measured before repair)

**C1.** A TypeScript named import is assigned `${bindingPath}::${importedName}` at `src/parser/typescript.ts:1182` before its declaration is proved; a subsequent call can be emitted to that ID at `src/parser/typescript.ts:1435-1443`. `resolveReExportChains` tries to rewrite wildcard-barrel targets, but on zero or multiple candidates it records an unresolved import and retains the original edge (`src/parser/reexport-chains.ts:73-96`). `buildGraph` adds declaration nodes and `::__file__` pseudo-nodes, then accepts an edge only if both endpoints exist (`src/graph/index.ts:67-70`). It silently omits failed endpoints and coalesces multiple parsed relationships sharing one symbol pair. A parsed edge therefore has no current guarantee of a built edge or a proved target.

**C2.** This optimistic named-symbol target construction is present in TypeScript (`src/parser/typescript.ts:1182,1359`), JavaScript CommonJS and ESM imports (`src/parser/javascript.ts:362,392,436,460`), and Python `from … import …` (`src/parser/python.ts:317`). Python's module sentinel (`:255`) and the twelve other parsers' resolved `::__file__` targets are a different file-pseudo-node mechanism. R constructs package-qualified `pkg::fn` call targets (`src/parser/r.ts:330`) without local declaration proof. The prior no-current-symbol return inventory answers a different question and does not identify this target construction pattern.

**C3.** The mismatch predates PR #55. The table is a cache-disabled parse and build at the PR #54 baseline `fc070df` for the same eight calibration snapshots. `missing endpoint` counts parsed edges whose source or target is absent from the built graph. Parsed minus built is not solely missing endpoints: the graph is simple and coalesces same-pair relationships, while cross-language detection adds built edges. The figures below are separate parsed and built facts, not an additive reconciliation.

| Repository | Parsed all | Built all | Parsed calls | Built calls | Missing endpoint |
|---|---:|---:|---:|---:|---:|
| code-graph (`fc070df` frozen) | 4,762 | 3,965 | 2,718 | 1,968 | 4 |
| nest | 18,397 | 16,890 | 3,698 | 3,391 | 198 |
| drizzle | 32,704 | 24,184 | 9,817 | 4,475 | 379 |
| hono | 5,997 | 5,374 | 1,282 | 892 | 169 |
| express | 591 | 409 | 449 | 98 | 127 |
| zod | 9,503 | 7,658 | 1,950 | 1,276 | 165 |
| flask | 685 | 515 | 421 | 269 | 66 |
| fastapi | 4,753 | 1,711 | 2,831 | 1,065 | 2,759 |

Thus earlier release notes and PR #55 tables that label parsed-edge counts as graph-edge counts need qualification. In particular, Drizzle's 9,817 baseline parsed calls represented 4,475 built `calls` relationships. Cross-language built edges are included in `Built all` (not in the `Built calls` column).

**Verdict: FAIL / hard stop.** A new resolved `calls` edge points to a nonexistent symbol, while the source call has a unique real project declaration. This is a WRONG target, not an acceptable ambiguous resolution. The requested 40/40/40/15/15 seeded target sample was **not drawn**: the mandatory stop applied during the new-edge target-existence preflight. No accuracy rate or zero-WRONG claim can be inferred from this partial audit. Phase B has not started.

## Follow-up F2: structural dangling-target finding (2026-10-03)

The follow-up task explicitly required a stop if declaration-less targets were structural. They are. **No parser repair or new target sample was attempted in this follow-up.** The graph builder does not create a placeholder `packages/microservices/index.ts::Client` node: `src/graph/index.ts` adds declaration nodes in its first pass, adds only `::__file__` pseudo-nodes in its second pass, and silently skips edges lacking either endpoint in its third pass (`graph.hasNode(edge.source) && graph.hasNode(edge.target)`). Thus the `Client` relationship is present in `parseProject` output but absent from the built graph.

The TypeScript parser constructs named-import target IDs as `${resolvedPath}::${importedName}` in `src/parser/typescript.ts` before proving that a declaration exists. It can then emit a `calls` edge to that ID. The wildcard re-export finalizer is one attempted proof step, but on ambiguity it records a reason without removing the edge. Other import/re-export shapes also leave unproven IDs in parsed edges. This is a **general parser-to-graph validation gap**, not a graph placeholder node and not confined to `@Client`.

Cache-disabled parses of the five TypeScript calibration corpora at the same snapshots used for PR #55 show the following parsed edges whose target ID has no `SymbolNode` and is not a `::__file__` pseudo-node. These are a structural inventory, not a claim that every missing target has the same cause; external injection/type names may be expected unresolved evidence. The missing-target `calls` records are particularly relevant to Phase A.

| Repository | All declaration-less targets | Calls | Imports | Inherits | Injects |
|---|---:|---:|---:|---:|---:|
| code-graph (frozen `fc070df`) | 4 | 0 | 0 | 3 | 1 |
| nest | 190 | 12 | 14 | 47 | 117 |
| drizzle | 490 | 188 | 105 | 12 | 185 |
| hono | 364 | 242 | 80 | 24 | 18 |
| zod | 187 | 31 | 140 | 7 | 9 |

For example, Hono's `benchmarks/deno/hono.ts:4` has a parsed `calls` target `src/index.ts::Hono` without a matching symbol; Zod's `packages/bench/compile-matrix.ts:374` similarly targets undeclared `packages/zod/src/v4/core/index.ts::compile`. These examples show that the absence is not limited to the Nest `Client` wildcard collision. The mechanism and proper treatment of each non-Nest record require a separate audit before any global validation change.

**Follow-up gate:** F2 triggered the instructed structural stop. F1, F3's exhaustive emit-and-record audit, F4, the seeded 150-edge sample, and the edge-count delta were not performed. The earlier one-edge WRONG verdict still stands. No fix commit was created; this section records why work stopped instead of representing the requested fix as complete.

## Reproduction boundary

- Parser before TypeScript fix: `fc070df` (the JS-fixed baseline). Audited PR head: `a75cfcc`.
- Corpus: Nest `35142c3eca8edaaf6abc5984d915da2fbd458aa2`, parsed with `useCache: false` in both versions.
- A new parsed call edge is one with `(source, target, filePath, line, kind)` absent from the baseline. The TypeScript call population has 3,689 baseline and 10,535 audited parsed call edges. The new-edge preflight found 7,580 such records; 12 have no target `SymbolNode` in the audited parse. All 12 point to the same nonexistent `packages/microservices/index.ts::Client` target from `@Client(...)` decorator sites in Nest integration sources.
- The preflight inspected declaration existence across the new-edge population. It was not the requested seeded semantic sample. There is no sample seed because sampling stopped before selection; inventing one after finding the blocker would make the result non-reproducible.

## First WRONG edge and actual declaration

| Classification | Source call | Parsed call-edge source | Parsed target | Actual invoked declaration |
|---|---|---|---|---|
| **WRONG** | `integration/microservices/src/app.controller.ts:29` — `@Client({ transport: Transport.TCP })` | `integration/microservices/src/app.controller.ts::AppController.client` | `packages/microservices/index.ts::Client` — **no declaration** | `packages/microservices/decorators/client.decorator.ts:15` — exported `function Client(metadata?: ClientOptions)` |

The source imports `Client` from `@nestjs/microservices` at `integration/microservices/src/app.controller.ts:10-17`. `packages/microservices/index.ts:11` wildcard-exports `decorators/index.ts`, which wildcard-exports `client.decorator.ts` at line 1. The decorator function is the only **exported value** named `Client` found on this path.

The parsed file also records `packages/microservices/index.ts::Client` twice in `unresolvedImports` with `ambiguous-reexport`. The built graph has no node for that target, so it drops this call edge. Recording ambiguity does not make the retained parsed edge correct.

## Mechanism and scope established before stopping

`processImportStatement` in `src/parser/typescript.ts` initially binds a named import to `${resolvedPath}::${importedName}`; `processCallExpression` emits the decorator call to that binding. `resolveReExportChains` in `src/parser/reexport-chains.ts` searches wildcard targets using `declaredNames`, which includes **all** declarations regardless of `exported` or value/type position. Along this Nest barrel it finds:

| Reachable declaration | Kind | Exported | Callable target for `@Client(...)`? |
|---|---|---|---|
| `packages/microservices/client/client-nats.ts:33` | private type alias `Client` | no | no |
| `packages/microservices/decorators/client.decorator.ts:15` | function `Client` | yes | yes |
| `packages/microservices/server/server-nats.ts:33` | private type alias `Client` | no | no |

The search reports multiple candidates. The re-export pass increments its unresolved counter and records `ambiguous-reexport`, but **does not remove the original call edge**. The dangling target is therefore present in parsed graph contents and absent from the built graph. The mechanism can also affect other same-name wildcard chains; their extent has not been assessed because the Phase A stop was triggered.

The other 11 preflight hits are `@Client` call sites at `integration/microservices/src/grpc/grpc.controller.ts:32,41`, `grpc-advanced/advanced.grpc.controller.ts:19`, `kafka/kafka.controller.ts:21`, `kafka-concurrent/kafka-concurrent.controller.ts:30`, `mqtt/mqtt-broadcast.controller.ts:13`, `mqtt/mqtt.controller.ts:24`, `nats/nats-broadcast.controller.ts:13`, `redis/redis-broadcast.controller.ts:13`, `redis/redis.controller.ts:16`, and `tcp-tls/app.controller.ts:31` (all paths under `integration/microservices/src/`). They were counted by target-existence preflight, not individually adjudicated for semantic accuracy.

## Gate status and next pass

| Phase A requirement | Status |
|---|---|
| A1 seeded 40/40/40/15/15 sample with call and declaration lines | **Not started** after mandatory WRONG-edge stop |
| A2 CORRECT / WRONG / AMBIGUOUS classification | 1 verified **WRONG**; no sample-wide counts |
| A3 shape stratification | Not started |
| A4 same-name, shared-method, overload, inferred-receiver checks | Same-name/private-alias failure identified; remainder not started |
| Gate A: zero WRONG | **Failed** |

A later repair pass should make the wildcard search respect exported value declarations and ensure unresolved targets do not remain as call edges. After that change, rerun the full new-edge comparison and draw a **new, seeded, predeclared** stratified sample across all five repositories. Do not reuse this partial preflight as the 150-edge accuracy audit. No parser, graph, or health computation was changed in this Phase A pass.
