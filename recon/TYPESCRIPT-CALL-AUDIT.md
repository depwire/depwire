# PR #55 TypeScript call-target audit — Phase A blocked

**Verdict: FAIL / hard stop.** A new resolved `calls` edge points to a nonexistent symbol, while the source call has a unique real project declaration. This is a WRONG target, not an acceptable ambiguous resolution. The requested 40/40/40/15/15 seeded target sample was **not drawn**: the mandatory stop applied during the new-edge target-existence preflight. No accuracy rate or zero-WRONG claim can be inferred from this partial audit. Phase B has not started.

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
