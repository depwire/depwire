# PR #55 target-accuracy sample

Seed: `pr55-target-accuracy-2026-10-03-v2`. Baseline parser: `fc070df`; corpus commits and full, unshortened call expressions are in [the machine-readable manifest](TYPESCRIPT-CALL-TARGET-SAMPLE.json). Each selected edge is a TypeScript parsed `calls` record absent from that baseline by `(source,target,filePath,line,kind)`. Selection sorts SHA-256 of `seed\0repo\0source\0target\0file\0line`, takes available rare syntax strata first (heritage, decorators, parameter defaults, IIFEs, class-property arrows, object-literal methods, callbacks), then constructors, static and namespace targets, overloads, shared-method/same-name targets, and fills the remainder by hash. A category is the selection stratum; nested call expressions can have additional shapes. Source and declaration references are relative to the named corpus. Full exact call text is in the JSON manifest; long expressions below are shortened for legibility.

The call expression and declaration were checked at the listed source revisions. For the Zod mini alias at row 19, `z.endsWith` is explicitly re-exported as `_endsWith as endsWith` from `packages/zod/src/v4/mini/checks.ts:24`. All 150 sampled targets have a declaration; no selected edge chose among multiple plausible declarations. Local callable variable bindings are classified by the actual binding invoked, without claiming to identify a dynamic function value returned into that binding.

| Repo | CORRECT | WRONG | AMBIGUOUS |
|---|---:|---:|---:|
| nest | 40 | 0 | 0 |
| drizzle | 40 | 0 | 0 |
| zod | 40 | 0 | 0 |
| code-graph | 15 | 0 | 0 |
| hono | 15 | 0 | 0 |

## nest

| # | Stratum | Source | Call as written | Target declaration | Verdict |
|---:|---|---|---|---|---|
| 1 | heritage | `integration/injector/e2e/inherited-optional.spec.ts:46` | `Foo()` | `integration/injector/e2e/inherited-optional.spec.ts:20` | CORRECT |
| 2 | heritage | `integration/injector/e2e/inherited-optional.spec.ts:28` | `Foo()` | `integration/injector/e2e/inherited-optional.spec.ts:20` | CORRECT |
| 3 | decorator | `integration/hello-world/e2e/schema-in-pipes.spec.ts:80` | `Body('name', { schema: testSchema, pipes: [SchemaCaptorPipe] })` | `packages/common/decorators/http/route-params.decorator.ts:648` | CORRECT |
| 4 | decorator | `integration/hello-world/e2e/middleware-fastify.spec.ts:605` | `Req()` | `packages/common/decorators/http/route-params.decorator.ts:1117` | CORRECT |
| 5 | parameterDefault | `packages/core/scanner.ts:81` | `new ApplicationConfig()` | `packages/core/application-config.ts:17` | CORRECT |
| 6 | parameterDefault | `packages/core/discovery/discovery-service.ts:86` | `this.getModules(options)` | `packages/core/discovery/discovery-service.ts:151` | CORRECT |
| 7 | iife | `integration/websockets/e2e/gateway.spec.ts:115` | `Test.createTestingModule({ providers: [ServerGateway], controllers: [LongConnectionController], })` | `packages/testing/test.ts:11` | CORRECT |
| 8 | objectMethod | `packages/microservices/test/client/client-redis.spec.ts:87` | `onSpy()` | `packages/microservices/test/client/client-redis.spec.ts:71` | CORRECT |
| 9 | objectMethod | `integration/file-upload/src/upload.module.ts:217` | `engineDir(uploadDir)` | `integration/file-upload/src/upload.module.ts:60` | CORRECT |
| 10 | callback | `packages/common/test/services/logger.service.spec.ts:136` | `Logger.error(message, stacktrace, context)` | `packages/common/services/logger.service.ts:221` | CORRECT |
| 11 | callback | `packages/common/test/exceptions/bad-gateway.exception.spec.ts:38` | `new BadGatewayException()` | `packages/common/exceptions/bad-gateway.exception.ts:11` | CORRECT |
| 12 | constructor | `packages/core/test/injector/instance-wrapper.spec.ts:446` | `new InstanceWrapper()` | `packages/core/injector/instance-wrapper.ts:75` | CORRECT |
| 13 | constructor | `integration/nest-application/listen/e2e/fastify.spec.ts:18` | `new FastifyAdapter()` | `packages/platform-fastify/adapters/fastify-adapter.ts:175` | CORRECT |
| 14 | staticMember | `packages/microservices/test/module/clients.module.spec.ts:96` | `ClientsModule.registerAsync([ asyncOptions as any, ])` | `packages/microservices/module/clients.module.ts:35` | CORRECT |
| 15 | staticMember | `packages/platform-fastify/test/multipart/multipart.module.spec.ts:25` | `MultipartModule.registerAsync(asyncOptions)` | `packages/platform-fastify/multipart/multipart.module.ts:37` | CORRECT |
| 16 | namespace | `integration/nest-application/observable-response/e2e/express.spec.ts:57` | `getJson(port, '/final-intercepted')` | `integration/nest-application/observable-response/e2e/utils.ts:63` | CORRECT |
| 17 | namespace | `packages/microservices/test/json-socket/connection.spec.ts:13` | `helpers.createServerAndClient( (error, server, clientSocket, serverSocket) => { if (error) { return done(error); …` | `packages/microservices/test/json-socket/helpers.ts:52` | CORRECT |
| 18 | overload | `integration/inspector/src/external-svc/external-svc.controller.ts:11` | `MessagePattern('createExternalSvc')` | `packages/microservices/decorators/message-pattern.decorator.ts:27` | CORRECT |
| 19 | sharedMethod | `integration/microservices/src/tcp-tls/app.module.ts:62` | `ClientsModule.registerAsync([ { imports: [ConfigModule], name: 'USE_FACTORY_CLIENT', useFactory: (configService: Conf…` | `packages/microservices/module/clients.module.ts:35` | CORRECT |
| 20 | sharedMethod | `packages/core/test/router/route-conflict-detector.spec.ts:415` | `RouteConflictDetector.handle( [], { duplicate: 'error', shadow: 'error' }, logger, )` | `packages/core/router/route-conflict-detector.ts:178` | CORRECT |
| 21 | sameName | `packages/microservices/test/client/client-kafka.spec.ts:643` | `subscription(payload)` | `packages/microservices/test/client/client-kafka.spec.ts:636` | CORRECT |
| 22 | sameName | `sample/29-file-upload/src/app.controller.ts:14` | `Controller()` | `packages/common/decorators/core/controller.decorator.ts:151` | CORRECT |
| 23 | seededRemainder | `packages/microservices/test/helpers/json-socket.spec.ts:333` | `makeSocketStub()` | `packages/microservices/test/helpers/json-socket.spec.ts:8` | CORRECT |
| 24 | seededRemainder | `packages/microservices/test/client/client-nats.spec.ts:304` | `createHandler()` | `packages/microservices/test/client/client-nats.spec.ts:293` | CORRECT |
| 25 | seededRemainder | `packages/core/test/injector/instance-wrapper.spec.ts:283` | `new InstanceWrapper({ scope: Scope.REQUEST, durable: false, })` | `packages/core/injector/instance-wrapper.ts:75` | CORRECT |
| 26 | seededRemainder | `packages/microservices/test/json-socket/max-buffer-size.spec.ts:82` | `new JsonSocket(new Socket(), { maxBufferSize: customSize, })` | `packages/microservices/helpers/json-socket.ts:20` | CORRECT |
| 27 | seededRemainder | `packages/common/test/pipes/file/parse-file.pipe.spec.ts:136` | `new ParseFilePipe({ validators: [], fileIsRequired: false, })` | `packages/common/pipes/file/parse-file.pipe.ts:20` | CORRECT |
| 28 | seededRemainder | `packages/microservices/test/client/client-kafka.spec.ts:659` | `subscription(payloadDisposed)` | `packages/microservices/test/client/client-kafka.spec.ts:636` | CORRECT |
| 29 | seededRemainder | `integration/scopes/src/transient/hello.service.ts:5` | `Inject('META')` | `packages/common/decorators/core/inject.decorator.ts:38` | CORRECT |
| 30 | seededRemainder | `sample/19-auth-jwt/src/app.module.ts:5` | `Module({ imports: [AuthModule, UsersModule], controllers: [], providers: [], })` | `packages/common/decorators/modules/module.decorator.ts:18` | CORRECT |
| 31 | seededRemainder | `packages/core/test/helpers/context-utils.spec.ts:162` | `factory(['arg1', 'arg2'])` | `packages/core/test/helpers/context-utils.spec.ts:157` | CORRECT |
| 32 | seededRemainder | `packages/core/test/router/route-conflict-detector.spec.ts:260` | `makeResolvedRoute({ path: '/users/me', host: 'api.example.com', methodName: 'meOnApi', })` | `packages/core/test/router/route-conflict-detector.spec.ts:13` | CORRECT |
| 33 | seededRemainder | `packages/microservices/test/client/client-mqtt.spec.ts:801` | `connectWith(mqtt, firstClient)` | `packages/microservices/test/client/client-mqtt.spec.ts:764` | CORRECT |
| 34 | seededRemainder | `packages/core/test/errors/test/messages.spec.ts:359` | `stringCleaner( UNKNOWN_EXPORT_MESSAGE('TestService', 'TestModule'), )` | `packages/core/test/utils/string.cleaner.ts:1` | CORRECT |
| 35 | seededRemainder | `packages/common/test/pipes/parse-uuid.pipe.spec.ts:271` | `new ParseUUIDPipe({ version: '7', exceptionFactory })` | `packages/common/pipes/parse-uuid.pipe.ts:70` | CORRECT |
| 36 | seededRemainder | `sample/10-fastify/src/cats/cats.controller.ts:20` | `Get()` | `packages/common/decorators/http/request-mapping.decorator.ts:57` | CORRECT |
| 37 | seededRemainder | `integration/nest-application/observable-response/e2e/express.spec.ts:25` | `resetState()` | `integration/nest-application/observable-response/src/app.controller.ts:23` | CORRECT |
| 38 | seededRemainder | `packages/microservices/test/context/rpc-context-creator.spec.ts:594` | `new RpcContextCreator( localRpcProxy, new ExceptionFiltersContext(container, new ApplicationConfig() as any), new PipesCont…` | `packages/microservices/context/rpc-context-creator.ts:44` | CORRECT |
| 39 | seededRemainder | `packages/core/test/injector/instance-wrapper.spec.ts:321` | `new InstanceWrapper({ scope: Scope.REQUEST })` | `packages/core/injector/instance-wrapper.ts:75` | CORRECT |
| 40 | seededRemainder | `integration/microservices/src/kafka/kafka.controller.ts:165` | `HttpCode(200)` | `packages/common/decorators/http/http-code.decorator.ts:13` | CORRECT |

## drizzle

| # | Stratum | Source | Call as written | Target declaration | Verdict |
|---:|---|---|---|---|---|
| 1 | iife | `integration-tests/tests/bun/bun-sql.test.ts:3532` | `eq(users2Table.id, 1)` | `drizzle-orm/src/sql/expressions/conditions.ts:62` | CORRECT |
| 2 | iife | `integration-tests/tests/bun/bun-sql.test.ts:3126` | `asc(sql\`name\`)` | `drizzle-orm/src/sql/expressions/select.ts:23` | CORRECT |
| 3 | classPropertyArrow | `drizzle-kit/imports-checker/checker.ts:75` | `this.isCustomLocal(importTarget)` | `drizzle-kit/imports-checker/checker.ts:67` | CORRECT |
| 4 | objectMethod | `drizzle-kit/tests/push/mysql.test.ts:509` | `text('gen_name1')` | `drizzle-orm/src/mysql-core/columns/text.ts:67` | CORRECT |
| 5 | objectMethod | `drizzle-arktype/scripts/fix-imports.ts:94` | `fixImportPath(path.value.argument.arguments[0].value, file, '.js')` | `drizzle-arktype/scripts/fix-imports.ts:17` | CORRECT |
| 6 | callback | `integration-tests/tests/relational/mysql.test.ts:3779` | `eq(usersTable.id, 3)` | `drizzle-orm/src/sql/expressions/conditions.ts:62` | CORRECT |
| 7 | callback | `integration-tests/tests/singlestore/singlestore-prefixed.test.ts:314` | `asc(usersTable.id)` | `drizzle-orm/src/sql/expressions/select.ts:23` | CORRECT |
| 8 | constructor | `drizzle-kit/src/sqlgenerator.ts:3974` | `new MySqlAlterViewConvertor()` | `drizzle-kit/src/sqlgenerator.ts:865` | CORRECT |
| 9 | constructor | `drizzle-kit/src/sqlgenerator.ts:3966` | `new PgAlterViewAddWithOptionConvertor()` | `drizzle-kit/src/sqlgenerator.ts:927` | CORRECT |
| 10 | staticMember | `drizzle-orm/src/gel-core/query-builders/count.ts:37` | `GelCountBuilder.buildEmbeddedCount(params.source, params.filters)` | `drizzle-orm/src/gel-core/query-builders/count.ts:16` | CORRECT |
| 11 | staticMember | `drizzle-orm/src/gel-core/query-builders/count.ts:43` | `GelCountBuilder.buildCount( params.source, params.filters, )` | `drizzle-orm/src/gel-core/query-builders/count.ts:23` | CORRECT |
| 12 | namespace | `integration-tests/tests/bun/bun-sql.test.ts:3703` | `asc(usersOnUpdate.id)` | `drizzle-orm/src/sql/expressions/select.ts:23` | CORRECT |
| 13 | namespace | `integration-tests/tests/bun/bun-sql.test.ts:4337` | `sql\`drop materialized view ${newYorkers1}\`` | `drizzle-orm/src/sql/sql.ts:485` | CORRECT |
| 14 | sharedMethod | `drizzle-orm/src/mysql-core/query-builders/select.ts:440` | `this.createJoin('right', false)` | `drizzle-orm/src/mysql-core/query-builders/select.ts:235` | CORRECT |
| 15 | sharedMethod | `drizzle-orm/src/singlestore-core/query-builders/select.ts:408` | `this.createJoin('inner', true)` | `drizzle-orm/src/singlestore-core/query-builders/select.ts:208` | CORRECT |
| 16 | sameName | `integration-tests/tests/bun/bun-sql.test.ts:195` | `text('name')` | `drizzle-orm/src/pg-core/columns/text.ts:64` | CORRECT |
| 17 | sameName | `drizzle-seed/tests/pg/softRelationsTest/pgSchema.ts:113` | `integer('quantity')` | `drizzle-orm/src/pg-core/columns/integer.ts:51` | CORRECT |
| 18 | seededRemainder | `drizzle-orm/type-tests/mysql/1000columns.ts:458` | `double('col5')` | `drizzle-orm/src/mysql-core/columns/double.ts:73` | CORRECT |
| 19 | seededRemainder | `drizzle-orm/type-tests/mysql/select.ts:396` | `eq(c.id, users.class)` | `drizzle-orm/src/sql/expressions/conditions.ts:62` | CORRECT |
| 20 | seededRemainder | `integration-tests/tests/pg/pg-common.ts:235` | `timestamp('arrtimestamp_tz', { mode: 'date', withTimezone: true, })` | `drizzle-orm/src/pg-core/columns/timestamp.ts:157` | CORRECT |
| 21 | seededRemainder | `integration-tests/tests/bun/bun-sql.test.ts:4285` | `integer('city_id')` | `drizzle-orm/src/pg-core/columns/integer.ts:51` | CORRECT |
| 22 | seededRemainder | `drizzle-orm/type-tests/singlestore/1000columns.ts:203` | `double('col21')` | `drizzle-orm/src/singlestore-core/columns/double.ts:77` | CORRECT |
| 23 | seededRemainder | `drizzle-seed/tests/pg/softRelationsTest/pgSchema.ts:12` | `text('city')` | `drizzle-orm/src/pg-core/columns/text.ts:64` | CORRECT |
| 24 | seededRemainder | `drizzle-orm/type-tests/singlestore/1000columns.ts:635` | `double('col7')` | `drizzle-orm/src/singlestore-core/columns/double.ts:77` | CORRECT |
| 25 | seededRemainder | `drizzle-orm/src/neon/neon-auth.ts:3` | `pgSchema('neon_auth')` | `drizzle-orm/src/pg-core/schema.ts:64` | CORRECT |
| 26 | seededRemainder | `integration-tests/tests/relational/vercel.test.ts:1296` | `eq(usersTable.id, 1)` | `drizzle-orm/src/sql/expressions/conditions.ts:62` | CORRECT |
| 27 | seededRemainder | `integration-tests/tests/sqlite/d1-batch.test.ts:19` | `relations(usersTable, ({ one, many }) => ({ invitee: one(usersTable, { fields: [usersTable.invitedBy], references: [usersTable.id], }), user…` | `drizzle-orm/src/relations.ts:502` | CORRECT |
| 28 | seededRemainder | `drizzle-seed/tests/pg/softRelationsTest/pgSchema.ts:53` | `timestamp('shipped_date')` | `drizzle-orm/src/pg-core/columns/timestamp.ts:157` | CORRECT |
| 29 | seededRemainder | `drizzle-orm/type-tests/pg/tables.ts:1166` | `pgEnum('test', ['a', 'b', 'c'] as const)` | `drizzle-orm/src/pg-core/columns/enum.ts:154` | CORRECT |
| 30 | seededRemainder | `drizzle-orm/type-tests/singlestore/1000columns.ts:94` | `double('col1')` | `drizzle-orm/src/singlestore-core/columns/double.ts:77` | CORRECT |
| 31 | seededRemainder | `integration-tests/tests/sqlite/libsql-batch.test.ts:68` | `integer('created_at', { mode: 'timestamp_ms' })` | `drizzle-orm/src/sqlite-core/columns/integer.ts:226` | CORRECT |
| 32 | seededRemainder | `integration-tests/tests/seeder/pgSchema.ts:155` | `timestamp('timestamp_date', { mode: 'date' })` | `drizzle-orm/src/pg-core/columns/timestamp.ts:157` | CORRECT |
| 33 | seededRemainder | `drizzle-orm/type-tests/singlestore/tables.ts:879` | `int('intdef')` | `drizzle-orm/src/singlestore-core/columns/int.ts:68` | CORRECT |
| 34 | seededRemainder | `integration-tests/tests/bun/bun-sql.test.ts:4772` | `pgTable('users1', { id: serial('id').primaryKey(), name: text('name').notNull(), })` | `drizzle-orm/src/pg-core/table.ts:244` | CORRECT |
| 35 | seededRemainder | `drizzle-seed/tests/northwind/mysqlSchema.ts:46` | `float('freight')` | `drizzle-orm/src/mysql-core/columns/float.ts:73` | CORRECT |
| 36 | seededRemainder | `drizzle-typebox/tests/sqlite.test.ts:16` | `int()` | `drizzle-orm/src/sqlite-core/columns/integer.ts:237` | CORRECT |
| 37 | seededRemainder | `integration-tests/tests/bun/bun-sql.test.ts:3708` | `asc(usersOnUpdate.id)` | `drizzle-orm/src/sql/expressions/select.ts:23` | CORRECT |
| 38 | seededRemainder | `integration-tests/tests/singlestore/singlestore-prefixed.test.ts:1493` | `sql\`drop table if exists ${users}\`` | `drizzle-orm/src/sql/sql.ts:485` | CORRECT |
| 39 | seededRemainder | `drizzle-arktype/tests/mysql.test.ts:231` | `mysqlTable('test', { c1: int(), c2: int().notNull(), c3: int().notNull(), c4: int().generatedAlwaysAs(1), })` | `drizzle-orm/src/mysql-core/table.ts:221` | CORRECT |
| 40 | seededRemainder | `drizzle-kit/tests/pg-checks.test.ts:164` | `serial('id')` | `drizzle-orm/src/pg-core/columns/serial.ts:53` | CORRECT |

## zod

| # | Stratum | Source | Call as written | Target declaration | Verdict |
|---:|---|---|---|---|---|
| 1 | iife | `packages/bench/compile-vs-arktype.ts:207` | `zcore.compile(zodXor)` | `packages/zod/src/v4/core/compile.ts:126` | CORRECT |
| 2 | iife | `packages/bench/memory/schema-footprint.ts:41` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 3 | classPropertyArrow | `packages/zod/src/v3/types.ts:2906` | `ZodNever.create()` | `packages/zod/src/v3/types.ts:2173` | CORRECT |
| 4 | classPropertyArrow | `packages/zod/src/v3/types.ts:2919` | `ZodNever.create()` | `packages/zod/src/v3/types.ts:2173` | CORRECT |
| 5 | objectMethod | `packages/bench/memory/leaks.ts:39` | `z.object({ a: z.string(), b: z.number() })` | `packages/zod/src/v4/classic/schemas.ts:1731` | CORRECT |
| 6 | objectMethod | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts:3169` | `z.array(Post)` | `packages/zod/src/v4/classic/schemas.ts:1556` | CORRECT |
| 7 | callback | `packages/zod/src/v4/classic/tests/string.test.ts:1035` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 8 | callback | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts:4487` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 9 | constructor | `packages/bench/object-creation.ts:14` | `new ZodFail("this is a test")` | `packages/bench/object-creation.ts:3` | CORRECT |
| 10 | constructor | `packages/zod/src/v3/tests/instanceof.test.ts:23` | `new Bar("asdf")` | `packages/zod/src/v3/tests/instanceof.test.ts:13` | CORRECT |
| 11 | staticMember | `packages/zod/src/v3/types.ts:3547` | `ParseStatus.mergeObjectSync(status, pairs as any)` | `packages/zod/src/v3/helpers/parseUtil.ts:128` | CORRECT |
| 12 | staticMember | `packages/zod/src/v3/tests/preprocess.test.ts:72` | `z.ZodError.assert(err)` | `packages/zod/src/v3/ZodError.ts:281` | CORRECT |
| 13 | namespace | `packages/zod/src/v4/classic/tests/discriminated-unions.test.ts:818` | `z.object({ [key]: z.literal("b"), value: z.number() })` | `packages/zod/src/v4/classic/schemas.ts:1731` | CORRECT |
| 14 | namespace | `packages/zod/src/v4/classic/tests/number.test.ts:93` | `z.number()` | `packages/zod/src/v4/classic/schemas.ts:1222` | CORRECT |
| 15 | sharedMethod | `packages/zod/src/v3/tests/preprocess.test.ts:56` | `z.ZodError.assert(err)` | `packages/zod/src/v3/ZodError.ts:281` | CORRECT |
| 16 | sameName | `packages/zod/src/v4/core/tests/compile.test.ts:635` | `valid(aot, 42)` | `packages/zod/src/v4/core/tests/compile.test.ts:29` | CORRECT |
| 17 | sameName | `packages/zod/src/v4/classic/tests/string.test.ts:959` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 18 | seededRemainder | `packages/zod/src/v4/classic/tests/codec-examples.test.ts:187` | `epochMillisToDate()` | `packages/zod/src/v4/classic/tests/codec-examples.test.ts:180` | CORRECT |
| 19 | seededRemainder | `packages/zod/src/v4/mini/tests/checks.test.ts:109` | `z.endsWith("asdf")` | `packages/zod/src/v4/core/api.ts:1118` | CORRECT |
| 20 | seededRemainder | `packages/zod/src/v4/core/tests/compile.test.ts:85` | `valid(aot, sym)` | `packages/zod/src/v4/core/tests/compile.test.ts:29` | CORRECT |
| 21 | seededRemainder | `packages/zod/src/v4/classic/tests/from-json-schema.test.ts:988` | `fromJSONSchema( { id: "legacy-id", type: "string", }, { registry: customRegistry } )` | `packages/zod/src/v4/classic/from-json-schema.ts:917` | CORRECT |
| 22 | seededRemainder | `packages/zod/src/v4/classic/tests/object.test.ts:759` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 23 | seededRemainder | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts:4688` | `z.object({ q: z.string() })` | `packages/zod/src/v4/classic/schemas.ts:1731` | CORRECT |
| 24 | seededRemainder | `packages/zod/src/v4/classic/tests/cyclic-data.test.ts:159` | `z.lazy(() => S)` | `packages/zod/src/v4/classic/schemas.ts:2691` | CORRECT |
| 25 | seededRemainder | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts:2424` | `z.toJSONSchema(a, { override(ctx) { if (ctx.zodSchema._zod.def.type === "string") { ctx.jsonSchema.type = "STRING" as "string"; …` | `packages/zod/src/v4/core/json-schema-processors.ts:886` | CORRECT |
| 26 | seededRemainder | `packages/zod/src/v4/classic/tests/partial.test.ts:383` | `z.object({ password: z.string(), confirmPassword: z.string(), })` | `packages/zod/src/v4/classic/schemas.ts:1731` | CORRECT |
| 27 | seededRemainder | `packages/zod/src/v4/core/tests/compile.test.ts:1155` | `invalid(aot, [1, "x", undefined])` | `packages/zod/src/v4/core/tests/compile.test.ts:38` | CORRECT |
| 28 | seededRemainder | `packages/zod/src/v4/classic/tests/partial.test.ts:10` | `z.array(z.object({ asdf: z.string() }))` | `packages/zod/src/v4/classic/schemas.ts:1556` | CORRECT |
| 29 | seededRemainder | `packages/zod/src/v4/classic/tests/validations.test.ts:67` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 30 | seededRemainder | `packages/zod/src/v4/classic/tests/to-json-schema.test.ts:4657` | `z.object({ b: z.string() })` | `packages/zod/src/v4/classic/schemas.ts:1731` | CORRECT |
| 31 | seededRemainder | `packages/zod/src/v4/core/tests/locales/tk.test.ts:30` | `z.number()` | `packages/zod/src/v4/classic/schemas.ts:1222` | CORRECT |
| 32 | seededRemainder | `packages/zod/src/v4/classic/schemas.ts:1511` | `core._date(ZodDate, params)` | `packages/zod/src/v4/core/api.ts:854` | CORRECT |
| 33 | seededRemainder | `packages/zod/src/v4/core/tests/compile.test.ts:160` | `valid(aot, "hello")` | `packages/zod/src/v4/core/tests/compile.test.ts:29` | CORRECT |
| 34 | seededRemainder | `packages/bench/memory/breakdown.ts:33` | `fmtBytes(r.bytesEach)` | `packages/bench/memory/harness.ts:65` | CORRECT |
| 35 | seededRemainder | `packages/zod/src/v4/classic/tests/instanceof.test.ts:94` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 36 | seededRemainder | `packages/zod/src/v4/classic/tests/assignability.test.ts:326` | `z.object({ a: z.number() })` | `packages/zod/src/v4/classic/schemas.ts:1731` | CORRECT |
| 37 | seededRemainder | `packages/zod/src/v4/classic/tests/readonly.test.ts:21` | `z.string()` | `packages/zod/src/v4/classic/schemas.ts:619` | CORRECT |
| 38 | seededRemainder | `packages/zod/src/v4/mini/tests/checks.test.ts:62` | `z.array(z.string())` | `packages/zod/src/v4/mini/schemas.ts:889` | CORRECT |
| 39 | seededRemainder | `packages/zod/src/v4/core/tests/compile.test.ts:1142` | `valid(aot, [])` | `packages/zod/src/v4/core/tests/compile.test.ts:29` | CORRECT |
| 40 | seededRemainder | `packages/zod/src/v4/classic/schemas.ts:1767` | `util.normalizeParams(params)` | `packages/zod/src/v4/core/util.ts:669` | CORRECT |

## codegraph

| # | Stratum | Source | Call as written | Target declaration | Verdict |
|---:|---|---|---|---|---|
| 1 | objectMethod | `src/tools.ts:777` | `runHandler( () => handleListFiles(normalizePath(args.directory), ctx.graph), )` | `src/tools.ts:51` | CORRECT |
| 2 | callback | `test/security-npm-command.test.ts:23` | `checkDependencies([], root)` | `src/security/checks/dependencies.ts:15` | CORRECT |
| 3 | constructor | `src/simulation/engine.test.ts:54` | `new SimulationEngine(graph)` | `src/simulation/engine.ts:107` | CORRECT |
| 4 | namespace | `test/silent-failures.test.ts:41` | `temp()` | `test/silent-failures.test.ts:20` | CORRECT |
| 5 | sameName | `src/tools.ts:134` | `getDependencies(graph, target.id)` | `src/graph/queries.ts:92` | CORRECT |
| 6 | seededRemainder | `test/windows-path-contract.test.ts:34` | `importFromJSON(fixture())` | `src/graph/serializer.ts:80` | CORRECT |
| 7 | seededRemainder | `test/silent-failures.test.ts:60` | `temp()` | `test/silent-failures.test.ts:20` | CORRECT |
| 8 | seededRemainder | `test/workspace-resolution.test.ts:41` | `parseProject(fixtureDir, { useCache: false } as any)` | `src/parser/index.ts:58` | CORRECT |
| 9 | seededRemainder | `test/kotlin-multimodule.test.ts:10` | `resetModuleSourceRoots()` | `src/parser/kotlin.ts:27` | CORRECT |
| 10 | seededRemainder | `src/index.ts:800` | `trackCommand('dead-code', packageJson.version)` | `src/telemetry.ts:22` | CORRECT |
| 11 | seededRemainder | `test/dead-code-confidence.test.ts:118` | `classify(makeSymbol({ name: 'constructor', kind: 'method', file: 'src/controllers/user.ts' }))` | `test/dead-code-confidence.test.ts:25` | CORRECT |
| 12 | seededRemainder | `test/inheritance-kind-compatibility.test.ts:16` | `exportToJSON(freshGraph, fixtureDir)` | `src/graph/serializer.ts:28` | CORRECT |
| 13 | seededRemainder | `test/type-reference-consumers.test.ts:56` | `calculateOrphansScore(typeReferenceGraph(false))` | `src/health/metrics.ts:324` | CORRECT |
| 14 | seededRemainder | `test/cyclic-groups.test.ts:77` | `analyzeCyclicGroups(new DirectedGraph())` | `src/graph/cyclic-groups.ts:121` | CORRECT |
| 15 | seededRemainder | `test/windows-path-contract.test.ts:103` | `isWithinRoot('C:\\repo\\packages\\backend', 'C:\\repo')` | `src/graph/paths.ts:44` | CORRECT |

## hono

| # | Stratum | Source | Call as written | Target declaration | Verdict |
|---:|---|---|---|---|---|
| 1 | iife | `src/helper/cookie/index.test.ts:20` | `getCookie(c, 'tasty_cookie')` | `src/helper/cookie/index.ts:27` | CORRECT |
| 2 | classPropertyArrow | `src/context.ts:668` | `this.#newResponse(data, arg, headers)` | `src/context.ts:604` | CORRECT |
| 3 | objectMethod | `src/router/smart-router/router.test.ts:10` | `new TrieRouter()` | `src/router/trie-router/router.ts:5` | CORRECT |
| 4 | callback | `src/utils/buffer.test.ts:88` | `timingSafeEqual([1, 2], [1, 2, 3])` | `src/utils/buffer.ts:76` | CORRECT |
| 5 | constructor | `src/types.test.ts:2585` | `new Hono()` | `src/hono.ts:16` | CORRECT |
| 6 | namespace | `src/utils/jwt/jwt.test.ts:1562` | `JWT.sign({ message: 'hello' }, secret, AlgorithmTypes.HS256)` | `src/utils/jwt/jwt.ts:56` | CORRECT |
| 7 | sameName | `src/helper/ssg/ssg.test.tsx:79` | `ssgParams(() => postParams)` | `src/helper/ssg/middleware.ts:43` | CORRECT |
| 8 | seededRemainder | `perf-measures/type-check/scripts/generate-app.ts:20` | `generateRoutes(count)` | `perf-measures/type-check/scripts/generate-app.ts:6` | CORRECT |
| 9 | seededRemainder | `src/client/utils.test.ts:136` | `removeIndexString(url)` | `src/client/utils.ts:55` | CORRECT |
| 10 | seededRemainder | `src/jsx/dom/index.test.tsx:535` | `render(<App />, root)` | `src/jsx/dom/render.ts:763` | CORRECT |
| 11 | seededRemainder | `src/client/client.test.ts:170` | `hc<AppType>('http://localhost')` | `src/client/client.ts:133` | CORRECT |
| 12 | seededRemainder | `src/adapter/cloudflare-pages/handler.test.ts:229` | `handleMiddleware(() => Promise.reject('Something went wrong'))` | `src/adapter/cloudflare-pages/handler.ts:49` | CORRECT |
| 13 | seededRemainder | `src/middleware/compress/index.test.ts:180` | `testCompression('/stream', 'gzip', 'gzip')` | `src/middleware/compress/index.test.ts:89` | CORRECT |
| 14 | seededRemainder | `src/adapter/bun/server.test.ts:11` | `getBunServer(new Context(new Request('http://localhost/'), { env: { server } }))` | `src/adapter/bun/server.ts:13` | CORRECT |
| 15 | seededRemainder | `src/validator/validator.test.ts:1359` | `validator('json', (data) => data)` | `src/validator/validator.ts:46` | CORRECT |
