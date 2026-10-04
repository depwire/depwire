# TypeScript re-export module-load contract — decision requested

Status: **draft, no emit-policy implementation**. This branch is stacked on split PR #63 and restores only the re-export file-relationship addition from the earlier combined PR. The broad population sample is deferred until Atef approves an emit rule. The source-AST census (`TYPESCRIPT-REEXPORT-CENSUS.jsonl`) found 1,172 added built file-level relationships in Nest, Zod, Drizzle, TanStack Query and code-graph relative to PR #62; only eight explicit mixed and one inline-only type statement occur in those corpora. Construct fixtures are therefore required independently of corpus sampling.

## Compiler oracle (TypeScript 5.9.3)

Eight real fixture modules under `test/fixtures/reexport-emit/` were compiled as a full `tsc` program, not by source inspection or `transpileModule`. The target `x.ts` exports a value, interface and default value and has a top-level side effect. Configurations: (A) `--module esnext --target es2022`; (B) `--module commonjs --target es2022`; (C) `--module esnext --target es2022 --verbatimModuleSyntax true`. All use `--skipLibCheck`. Complete emitted JavaScript is in `REEXPORT-EMIT-OUTPUT.json`; `test/reexport-emit-oracle.test.ts` re-runs the three compiles and asserts all eight outputs.

| Source form | A: default ESNext emitted JS | B: CommonJS emitted JS | C: ESNext + verbatim emitted JS | Loads `./x` in A/B/C? |
|---|---|---|---|---|
| `export * from './x'` | `export * from './x'` | `__exportStar(require('./x'), exports)` | `export * from './x'` | yes / yes / yes |
| `export * as ns from './x'` | `export * as ns from './x'` | `exports.ns = require('./x')` | `export * as ns from './x'` | yes / yes / yes |
| `export { a } from './x'` | `export { a } from './x'` | `require('./x')` plus getter | `export { a } from './x'` | yes / yes / yes |
| `export { type A } from './x'` | `export {}` | module marker only; no `require('./x')` | `export {} from './x'` | **no / no / yes** |
| `export { a, type A } from './x'` | `export { a } from './x'` | `require('./x')` plus getter | `export { a } from './x'` | yes / yes / yes |
| `export type { A } from './x'` | `export {}` | module marker only; no `require('./x')` | `export {}` | no / no / no |
| `export { default } from './x'` | `export { default } from './x'` | `require('./x')` plus getter | `export { default } from './x'` | yes / yes / yes |
| `import './x'` | `import './x'` | `require('./x')` | `import './x'` | yes / yes / yes |

`export *` is a module load even if the target has no runtime export. A rule that inspects target declarations for values would remove correct relationships. The earlier WRONG verdict on Drizzle and Zod's type-only target modules was retracted in PR #63's history; the decisive evidence is the emitted `export *` / `require` above.

## Current parser behavior

At `src/parser/typescript.ts`, the new file edge is excluded when a statement begins `export type` or all named specifiers carry an inline `type` modifier; all other resolved `export … from` statements get `imports` file edges. This matches the checked default emits for these fixtures. It does **not** match configuration C for inline-only `export { type A }`, which retains a module load as `export {} from './x'`. No project-specific emit choice is read by this addition.

## Options and recommendation for Atef

1. **Follow the project's emit configuration.** Accurate for one proven compilation, including `verbatimModuleSyntax`. Cost: identify the governing `tsconfig` for each file, resolve `extends` and references, and account for builds that use a different Babel/esbuild/tsdown configuration or emit both ESM and CJS. A monorepo can have multiple legitimate outputs, so there may be no single answer. Nested-tsconfig handling already exists for paths, but it is not a complete build-emission model.
2. **Choose and name one default.** The current syntax rule matches the three checked default outputs except the verbatim inline-only case. It is deterministic and cheap, but knowingly misses a real module load in projects using verbatim emit. A trend crossing the assumption boundary would need a caveat.
3. **Count every syntactic re-export.** Captures all possible module loads, but `export type { A }` has no load in any checked output; counting it would fabricate relationships. This option is not recommended.

**Recommendation:** use a two-level contract. Record source-visible re-export syntax at the site level; score a runtime file relationship only when emit is *definite* across supported modes or when a uniquely identifiable project configuration proves it. Mark `export { type A }` **emit-dependent** when the build configuration is unavailable or multiple outputs disagree, and report it separately rather than guessing a runtime coupling pair. This is more work than a default and requires a design for the site/edge representation; it is not implemented here. If Atef prefers a simpler first release, choose option 2 explicitly and disclose its known verbatim miss. The choice determines fixture expectations and the 130-site sample's verdicts; no sample has been drawn on this branch.

## Draft-branch graph movement (relative to split PR #63)

The re-export addition is the only parser-content difference. All eleven parsed/built/drop reconciliation identities pass. The source site census records 1,172 added built file-level import relationships across the five audited roots; the graph table below includes other affected roots as well. The corpus movement is diagnostic until the emit contract is approved.

| Repository | Built imports | Production file pairs | Overall health |
|---|---:|---:|---:|
| code-graph | 908→953 | 397→399 | 70→74 |
| nest | 7031→7504 | 3075→3492 | 52→52 |
| drizzle | 6151→6509 | 2780→3130 | 35→35 |
| hono | 1014→1066 | 300→303 | 48→46 |
| express | 178→178 | 7→7 | 65→65 |
| zod | 829→946 | 256→351 | 49→49 |
| flask | 282→282 | 77→77 | 56→56 |
| fastapi | 2156→2156 | 577→577 | 63→63 |
| fastify | 501→501 | 108→108 | 58→58 |
| werkzeug | 806→806 | 207→207 | 52→52 |
| tanstack-query | 3031→3197 | 782→811 | 45→45 |

## Boundary and next gate

This draft branch's current `RESOLUTION_VERSION` is **12** on top of split PR #63's **11**, because re-export file edges change graph contents; `formatVersion` remains **2**. The eight fixture forms are asserted against real `tsc` output, and local build/test pass. They are **compiler-oracle tests**: they do not assert Depwire's final policy and are not expected to fail when parser code is stashed. After Atef selects the contract, implement the chosen behavior, make Depwire fixtures fail against the previous parser where behavior changes, then draw a fresh seeded 130-site sample supplemented by construct fixtures for rare forms. The five corpora cannot supply 15 mixed and 15 inline-only examples (they contain eight and one).

## Validation on the draft branch

`npm run build` then `npm test` passed sequentially: 49 files, 368 tests. The configuration-invariant Depwire fixture failed against split PR #63's parser (`star.ts::__file__ → x.ts::__file__` absent) in an isolated worktree, then passed on this draft branch. The compiler-oracle fixtures correctly pass regardless of the parser feature, because they test `tsc`, not Depwire; claiming they fail on a code stash would be false. The eleven-repository parse/build/drop identity holds on this branch, with per-root measurements in `REEXPORT-RELATIONSHIP-MEASUREMENTS.jsonl`.

Shuffled discovery with seeds 11, 29 and 47 produced one parsed SHA-256 and one serialized-graph SHA-256 across all three runs per root: code-graph `04b97ddc8ec9f04b38a055862eab7ddbeed96fd25e03c0c8c7f44ecac7e4bd23` / `01975bbfc8621ca5f9d6cdccac815bb65dbc65c8fea645769201979110dc339b`; Nest `367c0fcc52197f3d7bcf7c3c15bbf632bf7affb90905b83830ccdb13e1e70b42` / `80906a03f76fc32b90bd2d172cc63c4e061544c9f223dc46e090194891b9887b`; Drizzle `f04056cb93e24440d1d2b3499d254de428ee88945caf8ef13e5b221e61a8b9e4` / `66d069a187494bcb045b9d73ab46011603673ec968d6669a98437b87a313e40a`. Ubuntu and Windows CI are pending.
