# TypeScript re-export module-load contract — approved implementation

Status: **approved emit policy implemented on draft PR #64**. This branch restores the re-export file-relationship addition from the earlier combined PR. The pre-contract source-AST census (`TYPESCRIPT-REEXPORT-CENSUS.jsonl`) identified 1,172 candidate site relationships in Nest, Zod, Drizzle, TanStack Query and code-graph. That is a diagnostic population, not the final built-edge delta after emit classification and graph coalescing; the earlier draft measurements are retained as `REEXPORT-PRE-CONTRACT-MEASUREMENTS.jsonl`. Only eight explicit mixed and one inline-only type statement occur in those corpora. Construct fixtures therefore cover forms the corpus cannot supply.

## Compiler oracle (TypeScript 5.9.3)

Ten real fixture modules under `test/fixtures/reexport-emit/` were compiled as a full `tsc` program, not by source inspection or `transpileModule`. The target `x.ts` exports a value, interface and default value and has a top-level side effect. Configurations: (A) `--module esnext --target es2022`; (B) `--module commonjs --target es2022`; (C) `--module esnext --target es2022 --verbatimModuleSyntax true`. All use `--skipLibCheck`. Complete emitted JavaScript is in `REEXPORT-EMIT-OUTPUT.json`; `test/reexport-emit-oracle.test.ts` re-runs the three compiles and asserts all ten outputs.

| Source form | A: default ESNext emitted JS | B: CommonJS emitted JS | C: ESNext + verbatim emitted JS | Loads `./x` in A/B/C? |
|---|---|---|---|---|
| `export * from './x'` | `export * from './x'` | `__exportStar(require('./x'), exports)` | `export * from './x'` | yes / yes / yes |
| `export * as ns from './x'` | `export * as ns from './x'` | `exports.ns = require('./x')` | `export * as ns from './x'` | yes / yes / yes |
| `export { a } from './x'` | `export { a } from './x'` | `require('./x')` plus getter | `export { a } from './x'` | yes / yes / yes |
| `export { type A } from './x'` | `export {}` | module marker only; no `require('./x')` | `export {} from './x'` | **no / no / yes** |
| `export { a, type A } from './x'` | `export { a } from './x'` | `require('./x')` plus getter | `export { a } from './x'` | yes / yes / yes |
| `export type { A } from './x'` | `export {}` | module marker only; no `require('./x')` | `export {}` | no / no / no |
| `export type * from './x'` | `export {}` | module marker only; no `require('./x')` | `export {}` | no / no / no |
| `export type * as ns from './x'` | `export {}` | module marker only; no `require('./x')` | `export {}` | no / no / no |
| `export { default } from './x'` | `export { default } from './x'` | `require('./x')` plus getter | `export { default } from './x'` | yes / yes / yes |
| `import './x'` | `import './x'` | `require('./x')` | `import './x'` | yes / yes / yes |

`export *` is a module load even if the target has no runtime export. A rule that inspects target declarations for values would remove correct relationships. The earlier WRONG verdict on Drizzle and Zod's type-only target modules was retracted in PR #63's history; the decisive evidence is the emitted `export *` / `require` above.

## Earlier draft behavior

The pre-approval draft counted all resolved `export … from` statements except `export type` and inline-only type clauses. Its fixture target exported a runtime value, so it did not expose plain named clauses that refer only to interfaces. The implemented policy below replaces that rule; the two implicit-type compiler fixtures are the counterexamples.

## Decision and consumer contract

1. **Follow the project's emit configuration.** Accurate for one proven compilation, including `verbatimModuleSyntax`. Cost: identify the governing `tsconfig` for each file, resolve `extends` and references, and account for builds that use a different Babel/esbuild/tsdown configuration or emit both ESM and CJS. A monorepo can have multiple legitimate outputs, so there may be no single answer. Nested-tsconfig handling already exists for paths, but it is not a complete build-emission model.
2. **Choose and name one default.** The earlier syntax rule matches the original eight fixture outputs except the verbatim inline-only case. It is deterministic and cheap, but knowingly misses a real module load in projects using verbatim emit and misses type-only named clauses without a modifier. A trend crossing the assumption boundary would need a caveat.
3. **Count every syntactic re-export.** Captures all possible module loads, but `export type { A }` has no load in any checked output; counting it would fabricate relationships. This option is not recommended.

**Approved:** record every `export … from` source site in `ParsedFile.reExportSites`, carry those sites on the graph as `reExportSites`, and serialize them in `ProjectGraph.reExportSites`. Each record contains source location and statement, specifier, resolved target where proven, classification and reason. A definite module load gets a runtime file-level `imports` edge. Explicit `export type` is erased and gets no runtime edge. Inline-only `export { type A }` is `emit-dependent` and gets no runtime edge unless the actual build emit can be proved uniquely. Unresolved targets remain recorded with an import reason. `formatVersion` stays 2 because the new serialized site array is optional and older graphs remain readable; graphs without it have **unknown site coverage**, not zero sites. `RESOLUTION_VERSION` moves 12 → 13 so cached parsed files are regenerated with the site ledger.

The parser does not infer a unique build emit from a nearby `tsconfig.json`: project references, test builds and non-`tsc` emitters can produce another legitimate output. Until an explicit, uniquely proven emit is available, inline-only sites stay emit-dependent. Named clauses without inline `type` are also emit-dependent until project-wide symbol evidence proves at least one runtime value in the target module. A plain `export { A }` can be erased when `A` is only an interface; the same holds for `export { default }` when the default is only an interface. New compiler fixtures prove both cases under default ESNext, CommonJS and verbatim emit. Direct values and proven named or wildcard re-export chains can promote the site to a runtime edge. Type-only symbol relationships are retained as `references-type`, excluded from runtime coupling; unproven plain bindings have no edge and an `unproven-symbol` reason. Unknown module-load behavior stays visible as `value-unproven` on the site. This is a deliberate conservative boundary, not an assertion that such statements are erased in the user's build.

**Consumer defaults:** coupling and health count only the built runtime edge, never an emit-dependent site. Dead-code and affected-files likewise use built edges; the site ledger supplies a visible qualification, not a guessed dependency. SDK graph JSON exposes all sites for downstream consumers. Documentation may show emit-dependent sites in a separate section with their source and target, but must not label them runtime dependencies. A graph loaded from an older format-2 file without `reExportSites` cannot make a site-level coverage claim.

## Draft-branch graph movement (relative to split PR #63)

The branch adds the site ledger, resolves definite re-export module loads, and marks declarations exported by local `export { Value }` clauses so a later re-export can prove the value. All parsed/built/drop reconciliation identities pass on the measured roots. The pre-contract census of 1,172 site relationships is retained as input evidence; the table below reports **built** imports after the approved classification. Six affected roots were remeasured in `REEXPORT-CURRENT-MEASUREMENTS.jsonl`; the other five are unchanged from the split PR #63 measurements because this feature parses TypeScript re-exports only.

| Repository | Built imports | Production file pairs | Overall health |
|---|---:|---:|---:|
| code-graph | 908→920 | 397→395 | 70→70 |
| nest | 7031→7398 | 3075→3425 | 52→52 |
| drizzle | 6151→6509 | 2780→3130 | 35→35 |
| hono | 1014→1008 | 300→288 | 48→46 |
| express | 178→178 | 7→7 | 65→65 |
| zod | 829→931 | 256→349 | 49→49 |
| flask | 282→282 | 77→77 | 56→56 |
| fastapi | 2156→2156 | 577→577 | 63→63 |
| fastify | 501→501 | 108→108 | 58→58 |
| werkzeug | 806→806 | 207→207 | 52→52 |
| tanstack-query | 3031→3011 | 782→802 | 45→50 |

The import decreases in Hono and TanStack Query are deliberate: the prior graph counted type-only **symbol** re-export edges as runtime `imports`. Retagging these as `references-type` or recording an unproven binding removes them from runtime file relationships while retaining proved type references. Relative to the pre-contract draft, built imports fall by 33 in code-graph, 106 in Nest, 58 in Hono, 15 in Zod and 186 in TanStack Query; Drizzle is unchanged. The approved contract therefore adds definite file loads and corrects pre-existing type-only symbol edges in the same branch. Code-graph's production pairs fall 397→395 and Hono's 300→288 because removed type-only relationships outnumber added runtime file pairs there. TanStack Query's coupling score rises 10→30 and overall 45→50; Hono's dependency-depth score falls 40→20 and overall 48→46. These are measured consequences, not score adjustments.

| Repository | Overall | Coupling | Cohesion | Cyclic groups | God files | Orphans/dead | Depth |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 70→70 | 70→70 | 60→60 | 97→97 | 60→60 | 81→81 | 40→40 |
| Nest | 52→52 | 50→50 | 40→40 | 66→65 | 60→60 | 71→71 | 20→20 |
| Drizzle | 35→35 | 10→10 | 40→40 | 20→22 | 60→60 | 70→70 | 40→40 |
| Hono | 48→46 | 30→30 | 60→60 | 34→35 | 60→60 | 82→82 | 40→20 |
| Zod | 49→49 | 30→30 | 40→40 | 88→88 | 60→60 | 50→49 | 20→20 |
| TanStack Query | 45→50 | 10→30 | 40→40 | 86→86 | 60→60 | 66→66 | 20→20 |

Express, Flask, FastAPI, Fastify and Werkzeug are unchanged against split PR #63. Full current raws for the six affected roots are in `REEXPORT-CURRENT-MEASUREMENTS.jsonl`; the split raws are in `IMPORT-COVERAGE-AFTER.jsonl`.

## Boundary and target audit

`RESOLUTION_VERSION` is **13** on top of split PR #63's **11**: version 12 was the unmerged draft that emitted re-export edges but had no site ledger or named-value proof. The cache bump forces previously cached parsed files to acquire these records and correct edge classification. `formatVersion` remains **2**: `reExportSites` is an optional additive field and stored format-2 graphs still load. An older graph without the field has unknown site coverage.

The eight original forms and both `export type *` forms are checked against real `tsc` output; additional compiler fixtures prove implicit type-only named and default exports. Depwire construct fixtures assert every site's classification, the built edge or its absence, an unresolved target, private value rejection, and both hops of a local named re-export chain. The 130-site seeded target audit and 21 supplemental non-runtime sites are in `REEXPORT-TARGET-AUDIT.md`. The five corpora cannot supply 15 mixed and 15 inline-only examples (they contain eight and one), so construct fixtures fill the absent syntax space.

## Validation on the draft branch

`npm run build` then `npm test` passed sequentially: 50 files, 393 tests. The 23 Depwire construct assertions fail against the earlier draft (which had no site ledger) and pass here. The compiler-oracle fixtures test `tsc` independently, so they correctly pass with or without the parser change; they are not claimed as pre-fix failures. Seeds 11, 29 and 47 gave one byte-identical parsed digest and one graph digest per root for code-graph, Nest and Drizzle; all nine full digests are in `REEXPORT-DETERMINISM.jsonl`. Ubuntu and Windows CI run on the pushed draft head.
