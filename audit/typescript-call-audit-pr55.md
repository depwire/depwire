# PR #55: TypeScript call evidence audit

Calibration snapshots: nest `35142c3eca8edaaf6abc5984d915da2fbd458aa2`, drizzle `48e5406027103a9fca6eb66417187c4a8b5c6aa3`, zod `004d800c9e3cd4c79930f55aa4ad080225b22efd`. All runs used `parseProject(..., { useCache: false })`. The 30 entries per repository are deterministic, reason-stratified samples from TypeScript `unresolvedCalls`: one per reason, with remaining slots allocated by reason frequency, then selected by a fixed FNV hash of file, callee, and position. Repeated expressions are distinct call sites. `unresolvedCalls` does not store source line numbers, so the table gives the source file and exact or abbreviated callee spelling rather than inventing a line.

## Syntax accounting

| Repository | Runtime call/new syntax | Call edges | `unresolvedCalls` | Unaccounted |
|---|---:|---:|---:|---:|
| nest | 61,105 | 10,535 | 50,570 | 0 |
| drizzle | 120,619 | 31,370 | 89,249 | 0 |
| zod | 54,035 | 14,012 | 40,023 | 0 |

The syntax count excludes `typeof import("pkg")` type queries. Each runtime call and constructor expression has exactly one call edge or one unresolved entry, per file. This checks cardinality, not target correctness; the edge audit below checks target samples.

The audited graph moves **2,206** TypeScript symbols from zero dependents to at least one: code-graph 46, nest 690, drizzle 455, hono 195, zod 820 (express, flask, fastapi 0). The first PR pass found 1,787; the namespace and static-member audit accounts for the additional 419.

## Reason totals and source mix

| Repository | TypeScript unresolved | Test | Sample/bench | Source | No local target | Unresolvable receiver | Unresolved import callee | Other reasons |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| nest | 50,570 | 41,614 | 2,385 | 6,571 | 17,319 | 29,256 | 3,070 | 925 |
| drizzle | 89,249 | 75,193 | 15 | 14,041 | 1,492 | 67,252 | 17,863 | 2,642 |
| zod | 40,023 | 33,487 | 2,126 | 4,410 | 1,341 | 27,057 | 11,196 | 429 |

All 90 sampled entries are syntactic runtime calls or constructors. `it`, `describe`, `expect`, `Set`, `Error`, `BigInt`, `console.log`, and Node or Vitest imports explain many recorded drops. Project methods on `db`, `this.applicationConfig`, `pathsExplorer`, and schema instances are real project calls, but their receiver types are not established by the tree-sitter parser. Zod v3 `z.string` and `ZodEnum.create` are exported callable aliases, not direct function declarations. These are remaining type-flow/alias resolution gaps, recorded with reasons; assigning their edges by name would violate the no-guessed-edges rule. The deterministic namespace-barrel and static-member cases found in the sample have been fixed on this branch.

## nest: 30 unresolved calls

| # | Reason | Callee | Source file | Classification |
|---:|---|---|---|---|
| 1 | no-local-target | `it` | `packages/common/test/utils/strip-proto-keys.util.spec.ts` | test global |
| 2 | unresolvable-receiver | `expect(result).toBeInstanceOf` | `packages/platform-express/test/multer/multer/multer.utils.spec.ts` | test assertion |
| 3 | unresolvable-receiver | `request(app!.getHttpServer()).get` | `integration/route-conflict/e2e/wildcard-resolution-strategy.spec.ts` | test HTTP chain |
| 4 | unresolvable-receiver | `Test.createTestingModule({ providers: [TestInjectable], }).compile` | `integration/hooks/e2e/lifecycle-hook-order.spec.ts` | project builder chain |
| 5 | unresolvable-receiver | `console.log` | `tools/benchmarks/src/main.ts` | builtin |
| 6 | unresolvable-receiver | `this.graphInspector.inspectModules` | `packages/core/injector/instance-loader.ts` | project typed receiver |
| 7 | unresolvable-receiver | `expect(wrapper.cloneStaticInstance({ id: 0 }).instance).toBeUndefined` | `packages/core/test/injector/instance-wrapper.spec.ts` | test assertion |
| 8 | no-local-target | `describe` | `packages/microservices/test/helpers/grpc-helpers.spec.ts` | test global |
| 9 | no-local-target | `describe` | `integration/hello-world/e2e/middleware-fastify.spec.ts` | test global |
| 10 | unresolvable-receiver | `expect( routeInfoPathExtractor.extractPathFrom({ path: '*', method: RequestMe…` | `packages/core/test/middleware/route-info-path-extractor.spec.ts` | test assertion |
| 11 | no-local-target | `Set` | `packages/core/test/nest-application-context.spec.ts` | builtin |
| 12 | no-local-target | `describe` | `integration/hello-world/e2e/middleware-fastify.spec.ts` | test global |
| 13 | no-local-target | `Set` | `packages/core/test/nest-application-context.spec.ts` | builtin |
| 14 | unresolved-import-callee | `EventEmitter` | `packages/microservices/client/client-rmq.ts` | external import |
| 15 | unresolvable-receiver | `this.applicationConfig.useGlobalFilters` | `packages/microservices/nest-microservice.ts` | project typed receiver |
| 16 | unresolvable-receiver | `(FileInterceptor('avatar', { fileFilter: (_req, _file, cb) => cb(null, false)…` | `packages/platform-fastify/test/multipart/interceptors/file.interceptor.spec.ts` | project factory result |
| 17 | unresolved-import-callee | `isNil` | `packages/microservices/serializers/kafka-request.serializer.ts` | external import |
| 18 | unresolvable-receiver | `app.listen` | `sample/08-webpack/src/main.ts` | external app instance |
| 19 | unresolvable-receiver | `pathsExplorer.exploreMethodMetadata` | `packages/core/test/router/paths-explorer.spec.ts` | project typed receiver |
| 20 | unresolvable-receiver | `expect(parseFilePipe.transform(requestFile)).resolves.toEqual` | `packages/common/test/pipes/file/parse-file.pipe.spec.ts` | test assertion |
| 21 | no-local-target | `beforeEach` | `sample/06-mongoose/src/cats/cats.service.spec.ts` | test global |
| 22 | unresolvable-receiver | `expect(untypedClient._producer).toBeNull` | `packages/microservices/test/client/client-kafka.spec.ts` | test assertion |
| 23 | unresolvable-receiver | `server.once` | `packages/microservices/test/json-socket/helpers.ts` | Node event emitter |
| 24 | no-local-target | `expect` | `packages/websockets/test/web-sockets-controller.spec.ts` | test global |
| 25 | no-local-target | `expect` | `packages/core/test/router/route-conflict-detector.spec.ts` | test global |
| 26 | unresolvable-receiver | `Object.create` | `packages/platform-fastify/multipart/multipart/append-field.util.ts` | builtin |
| 27 | no-local-target | `expect` | `packages/core/test/router/route-conflict-detector.spec.ts` | test global |
| 28 | local-binding-not-modeled | `handler` | `packages/microservices/test/server/server-tcp.spec.ts` | local shadow |
| 29 | unresolved-import-callee | `request` | `integration/versioning/e2e/custom-versioning.spec.ts` | external import |
| 30 | receiver-not-local | `this.getOptionsProp` | `packages/microservices/server/server-mqtt.ts` | inherited receiver |

## drizzle: 30 unresolved calls

| # | Reason | Callee | Source file | Classification |
|---:|---|---|---|---|
| 1 | unresolvable-receiver | `columnRenames.map` | `drizzle-kit/src/snapshotsDiffer.ts` | Array method |
| 2 | unresolvable-receiver | `db .with(intervals).select` | `integration-tests/tests/pg/pg-common.ts` | project fluent chain |
| 3 | unresolvable-receiver | `db.query.usersTable.findMany` | `integration-tests/tests/relational/turso.test.ts` | project typed receiver |
| 4 | unresolvable-receiver | `await db.query` | `drizzle-kit/src/serializer/sqliteSerializer.ts` | project typed receiver |
| 5 | unresolvable-receiver | `db.select({ id: cities.id, name: cities.name }).from(cities).where` | `drizzle-orm/type-tests/sqlite/set-operators.ts` | project fluent chain |
| 6 | unresolvable-receiver | `expectTypeOf(usersWithPosts).toEqualTypeOf` | `integration-tests/tests/relational/pg.postgresjs.test.ts` | test assertion |
| 7 | unresolvable-receiver | `stub.insertManyWithReturning` | `integration-tests/tests/sqlite/durable-objects/index.ts` | dynamic test stub |
| 8 | unresolvable-receiver | `expect(response[1]?.usersToGroups.length).toEqual` | `integration-tests/tests/relational/bettersqlite.test.ts` | test assertion |
| 9 | unresolvable-receiver | `db.insert` | `integration-tests/tests/gel/gel-custom.test.ts` | project typed receiver |
| 10 | unresolvable-receiver | `double('col31').primaryKey().autoincrement().default` | `drizzle-orm/type-tests/singlestore/1000columns.ts` | project fluent chain |
| 11 | unresolvable-receiver | `db.insert(groupsTable).values` | `integration-tests/tests/relational/turso.test.ts` | project fluent chain |
| 12 | unresolvable-receiver | `db .select({ id: users2Table.id, name: users2Table.name }).from` | `integration-tests/tests/pg/pg-common.ts` | project fluent chain |
| 13 | unresolved-import-callee | `expect` | `integration-tests/tests/relational/vercel.test.ts` | external import |
| 14 | no-local-target | `Error` | `drizzle-orm/src/mysql-proxy/session.ts` | builtin |
| 15 | unresolved-import-callee | `expect` | `integration-tests/tests/relational/bettersqlite.test.ts` | external import |
| 16 | unresolvable-receiver | `db.transaction` | `integration-tests/tests/relational/turso.test.ts` | project typed receiver |
| 17 | unresolvable-receiver | `expect(users3).toHaveLength` | `integration-tests/tests/bun/bun-sql.test.ts` | test assertion |
| 18 | unresolvable-receiver | `db.insert(postsTable).values` | `integration-tests/tests/relational/pg.test.ts` | project fluent chain |
| 19 | unresolvable-receiver | `double('col61').primaryKey().autoincrement().default` | `drizzle-orm/type-tests/singlestore/1000columns.ts` | project fluent chain |
| 20 | unresolvable-receiver | `db.execute` | `integration-tests/tests/pg/pg-common.ts` | project typed receiver |
| 21 | unresolvable-receiver | `expect(products.length).toBe` | `drizzle-seed/tests/pg/softRelationsTest/softRelations.test.ts` | test assertion |
| 22 | unresolvable-receiver | `db .select({ id: users2Table.id1, name: users2Table.name }) .from(users2Table…` | `integration-tests/tests/gel/gel.test.ts` | project fluent chain |
| 23 | unresolvable-receiver | `funcs.country` | `drizzle-seed/tests/pg/generatorsTest/generators.test.ts` | callback parameter |
| 24 | unresolved-import-callee | `expect` | `integration-tests/tests/replicas/postgres.test.ts` | external import |
| 25 | unresolved-import-callee | `expect` | `integration-tests/tests/relational/vercel.test.ts` | external import |
| 26 | unresolved-import-callee | `test` | `drizzle-kit/tests/rls/pg-policy.test.ts` | external import |
| 27 | unresolved-import-callee | `expect` | `integration-tests/tests/relational/mysql.test.ts` | external import |
| 28 | local-binding-not-modeled | `desc` | `integration-tests/tests/relational/pg.test.ts` | local shadow |
| 29 | receiver-not-local | `this.traverse` | `drizzle-arktype/scripts/fix-imports.ts` | inherited receiver |
| 30 | local-binding-not-modeled | `sql` | `drizzle-orm/type-tests/mysql/db-rel.ts` | local shadow |

## zod: 30 unresolved calls

| # | Reason | Callee | Source file | Classification |
|---:|---|---|---|---|
| 1 | unresolvable-receiver | `issue.maximum.toString` | `packages/zod/src/v4/locales/da.ts` | builtin method |
| 2 | unresolvable-receiver | `z.string().readonly` | `packages/zod/src/v3/tests/readonly.test.ts` | project fluent chain |
| 3 | unresolvable-receiver | `expect(bool._zod.pattern.source).toMatchInlineSnapshot` | `packages/zod/src/v4/classic/tests/template-literal.test.ts` | test assertion |
| 4 | unresolvable-receiver | `z.string` | `packages/zod/src/v3/tests/readonly.test.ts` | project callable alias |
| 5 | unresolvable-receiver | `z .object({ email: z.string().email(), password: z.string(), confirmPassword:…` | `packages/zod/src/v3/tests/refine.test.ts` | project fluent chain |
| 6 | unresolvable-receiver | `input.toLowerCase` | `packages/zod/src/v4/core/api.ts` | builtin method |
| 7 | unresolved-import-callee | `expect` | `packages/zod/src/v4/classic/tests/intersection.test.ts` | external import |
| 8 | unresolvable-receiver | `expect(badResult.success).toBe` | `packages/zod/src/v3/tests/async-parsing.test.ts` | test assertion |
| 9 | unresolvable-receiver | `maxTwo.parse` | `packages/zod/src/v4/classic/tests/map.test.ts` | project schema instance |
| 10 | unresolvable-receiver | `schemaA.merge` | `packages/zod/src/v3/tests/object.test.ts` | project schema instance |
| 11 | unresolvable-receiver | `expect(schema.safeParse("14:30:00").success).toBe` | `packages/zod/src/v4/classic/tests/from-json-schema.test.ts` | test assertion |
| 12 | unresolvable-receiver | `console.log` | `packages/bench/compile-endswith.ts` | builtin |
| 13 | unresolvable-receiver | `schema.parse` | `packages/bench/safeparse.ts` | project schema instance |
| 14 | unresolved-import-callee | `test` | `packages/zod/src/v4/classic/tests/validate.test.ts` | external import |
| 15 | unresolvable-receiver | `expect(JSON.parse(JSON.stringify(result))).toEqual` | `packages/zod/src/v3/tests/transformer.test.ts` | test assertion |
| 16 | unresolvable-receiver | `GreekEnum.parse` | `packages/zod/src/v3/tests/nativeEnum.test.ts` | project schema instance |
| 17 | unresolved-import-callee | `expect` | `packages/zod/src/v4/core/tests/locales/es.test.ts` | external import |
| 18 | unresolvable-receiver | `contributors[ch._zod.def.check]` | `packages/zod/src/v4/core/json-schema-processors.ts` | computed dispatch |
| 19 | unresolvable-receiver | `stringSchema.safeParse` | `packages/zod/src/v4/classic/tests/locales_ro.test.ts` | project schema instance |
| 20 | unresolvable-receiver | `expect(input.required).toEqual` | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts` | test assertion |
| 21 | unresolved-import-callee | `expect` | `packages/zod/src/v4/core/tests/locales/tr.test.ts` | external import |
| 22 | unresolved-import-callee | `expect` | `packages/zod/src/v4/classic/tests/codec.test.ts` | external import |
| 23 | unresolved-import-callee | `expect` | `packages/zod/src/v4/classic/tests/codec.test.ts` | external import |
| 24 | unresolved-import-callee | `expect` | `packages/zod/src/v4/mini/tests/index.test.ts` | external import |
| 25 | no-local-target | `BigInt` | `packages/zod/src/v4/classic/tests/bigint.test.ts` | builtin |
| 26 | unresolved-import-callee | `expect` | `packages/zod/src/v4/mini/tests/index.test.ts` | external import |
| 27 | no-local-target | `BigInt` | `packages/zod/src/v4/classic/tests/bigint.test.ts` | builtin |
| 28 | receiver-not-local | `this.check` | `packages/zod/src/v4/classic/schemas.ts` | inherited receiver |
| 29 | local-binding-not-modeled | `convert` | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts` | local shadow |
| 30 | receiver-required | `ZodEnum.create` | `packages/zod/src/v3/types.ts` | project callable alias |

## Graph contents, before PR #55 → audited branch

The baseline is the JS-fixed, pre-TypeScript parser; code-graph is frozen at `fc070df`. Counts are parsed-file edges, before graph pair collisions. Nest’s eight removed `inherits` edges pointed at expression text such as `Foo()` or `PartialType(CreateChatDto)`, which is not a class declaration; each now has an `unresolvedTypeRefs` reason and the factory call is recorded.

| Repository | Symbols | Exported | Calls | Imports | Inherits | Injects | References-type | Other edges | Unresolved calls | Dead candidates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| codegraph | 7,346→7,346 | 666→666 | 2,718→3,243 | 850→850 | 6→6 | 2→2 | 1,185→1,185 | 1→1 | 8,097→10,853 | 72→59 |
| nest | 20,156→20,156 | 2,219→2,219 | 3,698→10,544 | 7,035→7,035 | 239→231 | 682→682 | 6,743→6,743 | 0→0 | 8,484→50,609 | 3,263→3,112 |
| drizzle | 30,890→30,891 | 4,159→4,159 | 9,817→31,398 | 6,231→6,231 | 719→719 | 872→872 | 15,065→15,065 | 0→0 | 25,602→91,056 | 4,737→4,525 |
| hono | 9,616→9,616 | 804→804 | 1,282→4,894 | 1,090→1,090 | 32→32 | 50→50 | 3,543→3,543 | 0→0 | 3,959→28,757 | 331→328 |
| express | 1,658→1,658 | 63→63 | 449→449 | 142→142 | 0→0 | 0→0 | 0→0 | 0→0 | 10,178→10,178 | 50→50 |
| zod | 13,437→13,449 | 2,431→2,443 | 1,950→14,023 | 955→967 | 51→51 | 15→15 | 6,532→6,603 | 0→0 | 5,133→40,041 | 1,368→793 |
| flask | 1,778→1,778 | 728→728 | 421→421 | 176→176 | 34→34 | 0→0 | 0→0 | 54→54 | 0→0 | 337→337 |
| fastapi | 7,356→7,356 | 6,316→6,316 | 2,831→2,831 | 1,735→1,735 | 115→115 | 0→0 | 0→0 | 72→72 | 163→163 | 1,625→1,625 |

## Coupling provenance

The health scorer counts cross-file runtime graph edges. Same-file calls are excluded. It counts repeated source-to-target symbol edges separately, including tests and benches; the score drops by 20 at average-connection thresholds of 3, 6, and 10. The following counts are *added built-graph call edges* relative to the baseline; graph edge counts can be lower than parsed call counts because the graph is a simple directed graph and preserves higher-priority relationships on pair collisions.

| Repository | Added same-file | Added same-directory cross-file | Added cross-directory | Added cross-file from tests | Distinct added file pairs | Coupling avg/file | Coupling score |
|---|---:|---:|---:|---:|---:|---:|---:|
| codegraph | 172 | 9 | 203 | 178 | 87 | 5.28→6.01 | 70→50 |
| nest | 1,325 | 119 | 3,453 | 2,403 | 1,238 | 5.26→6.76 | 70→50 |
| drizzle | 650 | 541 | 10,846 | 11,288 | 1,791 | 15.15→27.89 | 10→10 |
| hono | 412 | 822 | 435 | 1,238 | 194 | 6.78→10.27 | 50→30 |
| zod | 764 | 318 | 5,954 | 5,024 | 478 | 2.33→14.66 | 90→30 |

Examples checked against source and target declarations: nest `integration/auto-mock/test/bar.service.spec.ts:10` calls `packages/testing/test.ts::Test.createTestingModule`; drizzle `drizzle-arktype/benchmarks/types.ts:6` calls `drizzle-orm/src/pg-core/table.ts::pgTable`; zod `packages/bench/compile-codec-direction.ts:12` calls `packages/zod/src/v4/classic/schemas.ts::string`. Same-file calls cannot cause these coupling changes.

Source-only diagnostic (test, sample, benchmark nodes removed from a copy of each graph; this is **not** the shipped score):

| Repository | Cross-file calls | Distinct connected file pairs | Coupling score |
|---|---:|---:|---:|
| nest | 1,030→1,516 | 3,104→3,112 | 70→70 |
| drizzle | 2,072→2,053 | 2,216→2,216 | 30→30 |
| zod | 212→1,042 | 221→261 | 90→50 |

Zod source-only coupling falls 90→50: 212→1,042 cross-file calls, but only 221→261 distinct file pairs. This is a real change under the existing edge-volume formula, and a methodology question if coupling is intended to measure only distinct module relationships. No health formula was changed to mask it.

## Health scores and raw inputs

| Repository | Overall | Coupling | Cohesion | Cyclic groups | God files | Orphans/dead | Depth |
|---|---:|---:|---:|---:|---:|---:|---:|
| codegraph | 71→66 | 70→50 | 60→60 | 100→100 | 60→60 | 89→89 | 40→40 |
| nest | 57→52 | 70→50 | 40→40 | 66→66 | 60→60 | 70→71 | 20→20 |
| drizzle | 34→31 | 10→10 | 40→20 | 20→20 | 60→60 | 69→70 | 40→40 |
| hono | 50→48 | 50→30 | 60→60 | 35→35 | 40→60 | 82→82 | 40→40 |
| express | 82→82 | 90→90 | 80→80 | 100→100 | 60→60 | 64→64 | 80→80 |
| zod | 64→49 | 90→30 | 40→40 | 88→88 | 60→60 | 45→50 | 20→20 |
| flask | 81→81 | 90→90 | 100→100 | 44→44 | 100→100 | 48→48 | 100→100 |
| fastapi | 69→69 | 90→90 | 40→40 | 84→84 | 80→80 | 41→41 | 60→60 |

Raw metric columns: `avgConnections/maxConnections/crossDirCoupling`; `avgInternalRatio`; `groupCount/cyclicFileCount/largestGroupSize`; `godFiles/threshold`; `orphans/deadSymbols`; `maxDepth`. All values are baseline→audited branch.

| Repository | Coupling raws | Cohesion % | Cycles | God files / threshold | Orphans / dead symbols | Max depth |
|---|---|---:|---|---|---:|
| codegraph | 5.28/221/9.1%→6.01/221/17.4% | 46.3→46.6 | 0/0/0→0/0/0 | 14/40.8→14/46.4 | 7/171→7/158 | 12→12 |
| nest | 5.26/1000/35.4%→6.76/1000/34.2% | 13.5→14.1 | 18/92/49→18/92/49 | 78/32.3→97/41.5 | 36/3533→36/3382 | 24→24 |
| drizzle | 15.15/1418/23.3%→27.89/2499/48.8% | 11.5→9.9 | 11/272/188→11/272/188 | 50/95.3→49/175.5 | 20/5240→20/5182 | 9→9 |
| hono | 6.78/275/9.4%→10.27/555/7.3% | 31.4→32.6 | 6/80/60→6/80/60 | 25/42.3→19/64.1 | 7/628→7/626 | 12→12 |
| express | 2.12/45/51.1%→2.12/45/51.1% | 50.2→50.2 | 0/0/0→0/0/0 | 7/24.2→7/24.2 | 13/50→13/50 | 5→5 |
| zod | 2.33/190/0.5%→14.66/4312/0.6% | 14.7→11.4 | 3/12/5→3/12/5 | 27/18.1→20/113 | 86/2254→85/1741 | 16→16 |
| flask | 2.36/46/0%→2.36/46/0% | 84.5→84.5 | 2/21/19→2/21/19 | 0/48.4→0/48.4 | 6/337→6/337 | 2→2 |
| fastapi | 0.78/147/33%→0.78/147/33% | 16.9→16.9 | 2/22/15→2/22/15 | 28/10.1→28/10.1 | 274/1625→274/1625 | 7→7 |

Remaining raw fields: `directories`; `cyclicFileRatio/graphFileCount`; `godFilesPer100`; `orphanPercentage/deadCodePercentage`. The cyclic edge view is `legacy-normalized-dependencies-v1` in both passes for every repository.

| Repository | Directories | Cyclic ratio / graph files | God files / 100 | Orphan % / dead % |
|---|---:|---|---:|---|
| codegraph | 39→39 | 0.00%/292→0.00%/292 | 4.8→4.8 | 5%/2.3%→5%/2.1% |
| nest | 504→504 | 4.87%/1889→4.87%/1889 | 4.1→5.1 | 2.6%/16.3%→2.6%/15.6% |
| drizzle | 148→148 | 30.73%/885→30.73%/885 | 5.6→5.5 | 3.2%/16.7%→3.2%/16.6% |
| hono | 80→80 | 22.28%/359→22.28%/359 | 7→5.3 | 3.2%/6.3%→3.2%/6.3% |
| express | 9→9 | 0.00%/147→0.00%/147 | 4.8→4.8 | 26.5%/2.8%→26.5%/2.8% |
| zod | 27→27 | 2.35%/510→2.35%/510 | 5.3→3.9 | 28.3%/16.9%→28%/13% |
| flask | 5→5 | 21.21%/99→21.21%/99 | 0→0 | 17.1%/21.8%→17.1%/21.8% |
| fastapi | 102→102 | 2.26%/974→2.26%/974 | 2.9→2.9 | 62.3%/20.2%→62.3%/20.2% |

## Pre-fix fixture check and gates

The new fixtures were run against the pre-audit PR commit `3d0cfdc` in a separate worktree, then against this branch. Before the audit changes, the decorator fixture recorded `target` calls on lines `[4, 8, 6, 4]`: the class decorator was duplicated, while method parameter, arrow default, and class heritage calls were absent. It emitted a guessed `inherits` edge to `mixin()` and an unresolved runtime call for the type query `typeof import(...)`. The audited parser records target lines `[4, 7, 7, 8, 6, 16]`, a call to `mixin`, no guessed inheritance edge, and no type-query call. Both static call fixtures had zero edges before; after, they resolve proven static methods and arrow fields through named and wildcard barrels. The namespace fixture had zero calls and treated `export * as alternate` as wildcard; after, it resolves `tools.helperFn` and `tools.alternate.helperFn` to different declarations, leaving both private-member calls unresolved.

The final local build and 320 tests passed sequentially. Three shuffled discovery runs each on code-graph, nest, and drizzle produced identical parsed-file and serialized-graph SHA-256 values within each corpus. Express matches PR #54 exactly: 449 parsed calls, 10,178 unresolved calls, and 17 high / 33 medium dead-code candidates. `RESOLUTION_VERSION` is 7 on this branch (main has 5; PR #54 raised it to 6), so cached parses invalidate. `GRAPH_FORMAT_VERSION` remains 2 and `formatVersion` does not change.

These are graph-content changes. Cloud graphs written before reparse are stale in content, although format v2 graphs still load. Regenerating SLM pairs against the new parser will make existing pairs stale. The same no-current-symbol return in twelve other language parsers remains a separate batch; no non-TypeScript parser was edited here.
