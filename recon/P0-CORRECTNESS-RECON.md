# P0 correctness recon — August 28, 2026

## Reproduction pins and method

- Depwire source: branch `fix/p0-correctness-recon`, based on `b2ae3a5` (`v1.16.0`). The current CLI was built with `npm run build` before recon.
- Nest: `nestjs/nest` tag `v12.0.1`, SHA `4c751c503bc753095f4b4f052e106f95218cc33f`, cloned at `/tmp/nest-repro`.
- Drizzle: default-branch SHA `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10`, cloned at `/tmp/drizzle-repro`. Parsing only; no install was run.
- Benchmark oracle: `~/Developer/depwire-benchmark-v2/TASK_D_CANDIDATES.md`, read only.
- All before/after target parses used `useCache: false` (or an empty parse cache). This matters because the cache keys source files, not parser implementation changes.

## Bug 1 — type relationships invisible to blast radius

### Result and classification

**Classification: (c) — no edge kind for type references in the runtime graph (graph-shape gap).** Interface `extends`, parameter types, and return types are all unmodeled. TypeScript's static `EdgeKind` union reserves the string `type_references`, but the TypeScript parser never emits that relationship, so no such edge kind exists in a produced graph. Fixing this changes graph shape, so no implementation was attempted.

The failing locations are `processTypeAliasDeclaration` and `processInterfaceDeclaration` in `src/parser/typescript.ts` (pre-fix lines 583–625). Both create a symbol and stop. In particular, `processInterfaceDeclaration` never walks `extends_type_clause` or the member type annotations. The same omission occurs for parameter and return annotations: `processFunctionDeclaration` and `processMethodDefinition` walk executable bodies/defaults but emit no type-reference relationship.

`getAffectedFiles`/`getImpact` in `src/graph/queries.ts` is not the failure. Execution and source inspection agree: it reverse-walks `graph.inNeighbors` with no edge-kind filter. If the semantic edge existed in the correct direction, affected traversal would consume it.

### Executed graph evidence

Parsing Nest produced 1,745 graph files, 13,345 symbols, and 9,663 edges before the Bug 3 change.

For `packages/common/interfaces/modules/module-metadata.interface.ts`:

- The graph contains `ModuleMetadata` (`kind: interface`, lines 14–45) and the file pseudo-node.
- The file pseudo-node has five outgoing `imports` edges: `Abstract`, `Type`, `DynamicModule`, `ForwardReference`, and `Provider`.
- `ModuleMetadata` has five incoming `imports` edges, from `module.decorator.ts`, `common/index.ts`, `dynamic-module.interface.ts`, `common/internal.ts`, and `configurable-module-async-options.interface.ts`.
- A syntactic type-only import is not dropped. `packages/testing/test.ts:5`, `import type { ModuleMetadata } from '@nestjs/common'`, produces `packages/testing/test.ts::__file__ -> packages/common/index.ts::ModuleMetadata` (`imports`). This rules out classification (b).
- Type-only imports originate at consumer `__file__` pseudo-nodes. They can reach the imported/barrel symbol, but terminate there as file-level import evidence: there is no edge from the consuming symbol's type annotation to the imported type. Reverse traversal therefore cannot continue to the consuming symbol level, which is the missing semantic hop in the oracle paths.
- `depwire affected packages/common/interfaces/modules/module-metadata.interface.ts --depth 10 --json` found none of the six oracle files.

The six oracle files are:

1. `packages/common/module-utils/configurable-module.builder.ts`
2. `packages/core/discovery/discovery-module.ts`
3. `packages/core/injector/internal-core-module/internal-core-module.ts`
4. `packages/core/router/router-module.ts`
5. `packages/microservices/module/clients.module.ts`
6. `packages/platform-express/multer/multer.module.ts`

For every oracle file, an exhaustive BFS over all nodes found no directed dependency path to the definition and no reverse affected path from the definition. Edge kind and depth are therefore not explanations. An undirected path exists only by reversing the edge at the missing type relationship:

| Oracle file | Directed path | Reverse affected path | Shortest weak path | Missing relationship |
|---|---:|---:|---:|---|
| configurable module builder | none | none | 2 | `DynamicModule extends ModuleMetadata` |
| discovery module | none | none | 4 | decorator parameter `metadata: ModuleMetadata` |
| internal core module | none | none | 3 | `DynamicModule extends ModuleMetadata` |
| router module | none | none | 3 | `DynamicModule extends ModuleMetadata` |
| clients module | none | none | 3 | `DynamicModule extends ModuleMetadata` |
| multer module | none | none | 3 | `DynamicModule extends ModuleMetadata` |

The known five-hop source path is:

```text
module-metadata.interface.ts::ModuleMetadata
-> dynamic-module.interface.ts::DynamicModule (missing type edge: extends)
-> packages/common/interfaces/modules/index.ts (barrel)
-> packages/common/interfaces/index.ts (barrel)
-> packages/common/index.ts (package barrel)
-> packages/microservices/module/clients.module.ts (workspace import)
```

The graph sees the barrel/import portion, but it has no first hop from `DynamicModule` to `ModuleMetadata` for affected traversal.

### Breadth estimate

On Nest, the graph has 631 interface/type-alias nodes. Of those, 308 have in-degree 0. A word-boundary search across tracked TypeScript sources found 60 of the 308 names in at least one other file.

The deterministic sample used seed `0x16`. Manual reading verified 2/20 as references to the sampled declaration; 18/20 were same-name declarations, unrelated imports/properties, comments, or prose. Thus **60 is the requested lexical count, not a claim that all 60 are semantically connected**. The sample shows the lexical estimate is noisy and suggests roughly six genuine invisible types if the 10% validation rate generalized.

| # | Sampled zero-in-degree symbol | Other-file match | Manual result |
|---:|---|---|---|
| 1 | `MqttClient` | server-mqtt.ts | comment/local alias collision |
| 2 | `Channel` | grpc-options.interface.ts | prose collision |
| 3 | `ResolutionContext` | core/injector.ts | separate local interface |
| 4 | `OnErrorCallback` | mqtt.events.ts | separate local alias |
| 5 | `CapturedLogger` | conflict-policy-fastify.spec.ts | separate local interface |
| 6 | `EnhancerSubtype` | core/constants.ts | **verified import/type use** |
| 7 | `Last` | serve-static-options.interface.ts | prose collision |
| 8 | `Express` | cors express.spec.ts | test-description collision |
| 9 | `AmqpConnectionManager` | client-rmq.ts | comment collision |
| 10 | `Handler` | http.exception.ts | prose collision |
| 11 | `Channel` | client-rmq.ts | separate local alias/comment |
| 12 | `VersionedRoute` | fastify-adapter.ts | separate local alias |
| 13 | `CustomVersioningOptions` | middleware-with-versioning.spec.ts | **verified import/type use** |
| 14 | `VersionedRoute` | express-adapter.ts | separate local alias |
| 15 | `CapturedLogger` | conflict-policy.spec.ts | separate local interface |
| 16 | `ChannelWrapper` | client-rmq.ts | comment/local alias collision |
| 17 | `Transform` | sse-stream.ts | Node `stream.Transform`, not sampled alias |
| 18 | `logCreator` | client-kafka.ts | object-property collision |
| 19 | `Framework` | console-logger.service.ts | prose collision |
| 20 | `ResolutionContext` | testing-injector.ts | separate local interface |

### Design scope, not implemented

The TypeScript parser would need to emit references for at least interface heritage, type-alias RHS nodes, function/method parameters and returns, typed properties/variables, generic constraints/arguments, and indexed/conditional/mapped types. JavaScript needs no general type-reference pass; other typed language parsers would need separate design review if the edge's cross-language meaning is intended to be uniform. Existing symbol nodes can be reused, but adding relationships is still a graph-shape change.

A syntax-only sizing pass found:

| Repository | Type-reference syntax sites | Sites whose name matches a project type | Unique file/name pairs matching a project type |
|---|---:|---:|---:|
| code-graph | 1,724 | 960 | 336 |
| Nest | 10,849 | 6,578 | 3,425 |

The expected graph movement is therefore on the order of **336–960 edges on code-graph** and **3,425–6,578 on Nest**, before source-symbol granularity and graph deduplication are specified. The syntax-site totals are upper bounds.

All graph-wide consumers read these relationships unless a design explicitly filters them: all six health dimensions, dead-code/orphan detection (`inDegree()`), impact/dependents/affected traversal, graph docs, visualization, diff, and serialized graph output. Re-export-chain resolution already operates without a kind filter.

## Bug 2 — `FactoryProvider.inject` miss

### Result

**Same necessary root cause as Bug 1; deferred.** Current `affected` reproduces 3/4 oracle files and misses `packages/core/injector/internal-core-module/internal-core-module-factory.ts`.

The missed file has no directed path to `provider.interface.ts`. Its only short weak path is:

```text
internal-core-module-factory.ts::InternalCoreModuleFactory
<- packages/core/scanner.ts::__file__ (edge traversed backwards)
-> packages/common/index.ts::Provider
-> provider.interface.ts::Provider
```

The intended source route is `InternalCoreModuleFactory.create` -> `InternalCoreModule.register([...])` -> parameter type `Array<ValueProvider | FactoryProvider | ExistingProvider>` -> `FactoryProvider`. The final method-parameter type hop is exactly Bug 1's missing graph shape, so a contained resolver-only change cannot make the candidate visible.

There is also an earlier, distinct missing call edge: `InternalCoreModule.register(...)` is a static imported-member call and is recorded as `unresolvable-receiver`. Implementing that edge alone still leaves no route from `register` to `FactoryProvider`. Per the stop condition, Bug 2 received no implementation.

## Bug 3 — builtin/global and name-only call misresolution

### Reproduction and corrected count

On Drizzle SHA `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10`, the current parser produced 13,846 raw `calls` edges. Comparing exact raw edge occurrences before and after the evidence-gated resolver removed **4,955** old edges and added **516** differently-targeted, import-supported edges, leaving 9,407 raw calls (net -4,439).

At graph level, calls moved 3,829 -> 4,228 and total edges moved 14,289 -> 14,688. There are 70 removed and 469 added unique source/target call relationships (line-aware serialized comparison is 75 removed/474 added because deduplication can retain a different occurrence line). The positive net comes from constructors now targeting their known imported class instead of a nonexistent same-file id.

### The “558” figure does not reproduce

The v1.13.0-era **558** figure does not reproduce on the current ref. The exhaustive comparison on Drizzle SHA `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10` finds **4,955 removed raw occurrences**, **516 retargeted additions**, and **70 unique wrong source/target relationships removed at graph level**. The original 558 was measured on a different Drizzle state, so these figures are not directly comparable and the current result must not be normalized back to the historical count.

The top 20 removed raw target names were:

| Rank | Name | Count |
|---:|---|---:|
| 1 | `expect` | 1,446 |
| 2 | `test` | 717 |
| 3 | `Error` | 355 |
| 4 | `Set` | 137 |
| 5 | `Number` | 119 |
| 6 | `Date` | 111 |
| 7 | `Proxy` | 107 |
| 8 | `casing` | 85 |
| 9 | `SelectionProxyHandler` | 81 |
| 10 | `render` | 65 |
| 11 | `Promise` | 54 |
| 12 | `BigInt` | 44 |
| 13 | `transaction` | 43 |
| 14 | `progressCallback` | 40 |
| 15 | `resolve` | 36 |
| 16 | `Docker` | 31 |
| 17 | `getPort` | 31 |
| 18 | `reject` | 31 |
| 19 | `customResultMapper` | 31 |
| 20 | `DefaultLogger` | 30 |

This contradicts the old count but confirms the old framing problem: many names are globals, while many others are parameters, external test functions, or imported/local constructors. A builtin stoplist would be both incomplete and harmful.

### Root cause and fix

The v1.14.0 change gated only `member_expression` calls. Three name-only paths survived:

1. `processCallExpression` buffered an unimported bare name and `resolveUnresolvedCallEdges` always emitted the result, even when the target id did not exist.
2. `resolveLocalCallTarget` considered enclosing class methods/properties valid candidates for a bare identifier. For example, the parameter call `transaction(tx)` resolved to the enclosing `transaction` method.
3. `processNewExpression` never consulted `context.imports`; `new SelectionProxyHandler()` was targeted at a same-file id instead of its imported declaration, while `new Error()` fabricated a same-file target.

The fix is evidence-gated and contains no name list:

- parameters, catch bindings, and destructured locals are recognized as lexical bindings; calls to unmodeled bindings are recorded as `local-binding-not-modeled`;
- resolved local imports win, and imported constructors target the imported declaration;
- unresolved/external import calls are recorded as `unresolved-import-callee`;
- after forward-reference resolution, a local edge is emitted only when a declared value-kind supports the call; otherwise it is recorded as `no-local-target` or `receiver-required`;
- methods/properties cannot satisfy a bare call or constructor without a receiver.

Regression tests cover a parameter/method collision, a destructured binding/method collision, `new Error()` colliding with a class method, a correctly resolved imported constructor, and an unresolved external callee.

### Removed-edge correctness sample (seed `0x16`)

Both audit tables are deterministically seeded and re-drawable. A single LCG stream is initialized with seed **`0x16`**; the removed table draws the first 30 uniform samples without replacement, and the retained table draws the next 30 from its own pool. All 30 sampled removed raw edges target ids absent from the full pre-fix parsed symbol set. They are therefore fabricated targets, independent of subjective call interpretation.

| # | Location | Call | Old target |
|---:|---|---|---|
| 1 | `gel-core/query-builders/select.ts:842` | `new SelectionProxyHandler(...)` | same-file `SelectionProxyHandler` |
| 2 | `mysql-core/query-builders/insert.ts:109` | `new Error(...)` | same-file `Error` |
| 3 | `durable-objects/index.ts:718` | `expect(...)` | same-file `expect` |
| 4 | `softRelations.test.ts:157` | `new Set(...)` | same-file `Set` |
| 5 | `cli/commands/push.ts:248` | `render(...)` | same-file `render` |
| 6 | `cli/connections.ts:299` | `migrate(...)` | same-file `migrate` |
| 7 | `singlestore-common.ts:3194` | `expect(...)` | same-file `expect` |
| 8 | `singlestore-common.ts:970` | `test(...)` | same-file `test` |
| 9 | `pg-common.ts:3717` | `expect(...)` | same-file `expect` |
| 10 | `singlestore-common.ts:4116` | `test(...)` | same-file `test` |
| 11 | `singlestore-common.ts:4655` | `new Date(...)` | same-file `Date` |
| 12 | `singlestore-common.ts:1376` | `test(...)` | same-file `test` |
| 13 | `gelSerializer.ts:998` | `new Set(...)` | same-file `Set` |
| 14 | `singlestore-common.ts:3099` | `expect(...)` | same-file `expect` |
| 15 | `cli/commands/migrate.ts:1241` | `new ResolveSelect(...)` | same-file `ResolveSelect` |
| 16 | `singlestore-cache.ts:251` | `test(...)` | same-file `test` |
| 17 | `cli/connections.ts:1301` | `migrate(...)` | same-file `migrate` |
| 18 | `pg-common.ts:649` | `expect(...)` | same-file `expect` |
| 19 | `sqlite-common.ts:669` | `expect(...)` | same-file `expect` |
| 20 | `tests/indexes/common.ts:15` | `beforeAll(...)` | same-file `beforeAll` |
| 21 | `pg-common.ts:4917` | `expect(...)` | same-file `expect` |
| 22 | `sqlite-common.ts:1146` | `new Name(...)` | same-file `Name` |
| 23 | `snapshotsDiffer.ts:3363` | `diffSchemasOrTables(...)` | same-file `diffSchemasOrTables` |
| 24 | `singlestore-common.ts:3072` | `test(...)` | same-file `test` |
| 25 | `mysql-common.ts:4787` | `expect(...)` | same-file `expect` |
| 26 | `sqlite-common.ts:2799` | `expect(...)` | same-file `expect` |
| 27 | `singlestore-push.test.ts:37` | `new Promise(...)` | same-file `Promise` |
| 28 | `drizzle-valibot/tests/utils.ts:26` | `expect(...)` | same-file `expect` |
| 29 | `mysql-core/db.ts:512` | `getReplica(...)` | same-file `getReplica` |
| 30 | `pg-common.ts:4336` | `expect(...)` | same-file `expect` |

### Retained-edge correctness sample (seed `0x16`, stream continues after removed sample)

All 30 uniformly sampled retained graph edges have explicit import, local declaration, or `this` receiver evidence. None is a name-only misresolution of the fixed class.

| # | Location | Call | Retained target/evidence |
|---:|---|---|---|
| 1 | `durable-sqlite/driver.ts:34` | `new SQLiteSyncDialect(...)` | imported class |
| 2 | `mysql-core/view.ts:102` | `getTableColumns(...)` | imported function |
| 3 | `pg-core/view.ts:405` | `new MaterializedViewBuilder(...)` | local class |
| 4 | `sqlite-core/dialect.ts:146` | `this.buildWithCTE(...)` | declared receiver method |
| 5 | `query-builders/query-builder.ts:42` | `new SelectionProxyHandler(...)` | imported class |
| 6 | `durable-objects/index.ts:1789` | `eq(...)` | imported function |
| 7 | `neon-serverless/driver.ts:36` | `new NeonSession(...)` | imported class |
| 8 | `bun-sql/session.ts:175` | `new BunSQLSession(...)` | local class |
| 9 | `sqlite select.ts:571` | `this.createSetOperator(...)` | declared receiver method |
| 10 | `drizzle-seed/index.ts:690` | `getTableName(...)` | imported function |
| 11 | `gel update.ts:84` | `new GelUpdateBase(...)` | local class (also interface-merged under same id) |
| 12 | `singlestore-core/schema.ts:23` | `is(...)` | imported function |
| 13 | `durable-objects/index.ts:222` | ``sql`...` `` | imported tagged function |
| 14 | `cli/commands/utils.ts:98` | `assertES5()` | local function |
| 15 | `mysql char.ts:83` | `getColumnNameAndConfig(...)` | imported function |
| 16 | `sqliteSerializer.ts:280` | `getColumnCasing(...)` | imported function |
| 17 | `drizzle-typebox/schema.ts:30` | `isView(...)` | imported function |
| 18 | `sqlite-core/view.ts:163` | `new ViewBuilder(...)` | local class |
| 19 | `drizzle-zod/schema.ts:118` | `handleColumns(...)` | local function |
| 20 | `gel-core/dialect.ts:1187` | `getOperators()` | imported function |
| 21 | `mysql unique-constraint.ts:114` | `uniqueKeyName(...)` | imported function |
| 22 | `cli/connections.ts:823` | `checkPackage(...)` | imported function |
| 23 | `drizzle-kit/api.ts:209` | `pgTableConfig(...)` | aliased imported function |
| 24 | `singlestore query-builder.ts:104` | `new SingleStoreSelectBuilder(...)` | imported class |
| 25 | `pg cidr.ts:42` | `new PgCidrBuilder(...)` | local class |
| 26 | `singlestore unique-constraint.ts:46` | `new UniqueConstraintBuilder(...)` | local class |
| 27 | `singlestore select.ts:929` | `new SelectionProxyHandler(...)` | imported class |
| 28 | `singlestore-common.ts:3550` | `avgDistinct(...)` | imported function |
| 29 | `tidb-serverless/driver.ts:44` | `extractTablesRelationalConfig(...)` | imported function |
| 30 | `sql/functions/aggregate.ts:128` | ``sql`...` `` | imported tagged function |

### Regression gates

| Repository | Graph edges before | Graph edges after | Delta | Calls before | Calls after |
|---|---:|---:|---:|---:|---:|
| Drizzle | 14,289 | 14,688 | +399 | 3,829 | 4,228 |
| Nest | 9,663 | 10,036 | +373 | 2,427 | 2,800 |

The increases are correct imported-constructor edges. Nest lost three old call edges and added 376; Drizzle lost 70 and added 469 unique source/target call relationships.

Code-graph self-parse health scores are unchanged:

| Health measure | main | fix |
|---|---:|---:|
| Overall | 71 / C | 71 / C |
| Coupling | 70 / C | 70 / C |
| Cohesion | 60 / D | 60 / D |
| Circular Dependencies | 100 / A | 100 / A |
| God Files | 60 / D | 60 / D |
| Orphans & Dead Code | 88 / B | 88 / B |
| Dependency Depth | 40 / F | 40 / F |

The exact metric details move because the branch contains new parser/test/report files and correct constructor edges, but every required score and grade is unchanged. The final `npm run build` and sequential `npm test` results are recorded in the commit/PR handoff.

## Surprises and instruction contradictions

1. The roadmap's “558” is not reproducible at the permitted current Drizzle ref. The exhaustive current raw-edge delta is 4,955 removed/516 retargeted additions; the retained graph had 70 unique wrong source/target relationships removed. The discrepancy is reported rather than normalized back to 558.
2. `type_references` exists in the TypeScript `EdgeKind` type union, but the TypeScript parser never emits it. Classification remains (c) because the runtime graph lacks the relationship and implementing it changes graph shape.
3. Graph serialization exposes declaration-merging id collisions (for example `GelUpdateBase` may display as `interface` even though a same-id class declaration is also parsed). The retained-edge audit checked the raw declarations and confirmed the constructable class exists; this is separate from the P0 call bug.
4. Parser implementation changes do not invalidate the on-disk source-file cache. All measurements were therefore repeated with the cache disabled/emptied.
