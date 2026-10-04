# PR #63 TypeScript re-export preflight: semantic correction and pending sample

**Correction to commit `d29e05e`: the two relationships called WRONG there are not disproved.** That verdict used the false premise that `export * from './types'` loads its target only when the target exports a runtime value. TypeScript 5.9.3 preserves `export *` in ESNext output and emits `__exportStar(require('./types'), exports)` in CommonJS output even when the target declares only interfaces/types. The target module is evaluated in either output. Both Drizzle and Zod edges are therefore valid **module-load relationships** under those emits. This document supersedes the earlier blocker claim; the 130-site target audit is still incomplete, so it does not certify PR #63 for merge.

## Evidence and contract distinction

A two-file `tsc` check used `index.ts` containing `export * from './types'` and `types.ts` containing only an exported interface plus `console.log('types module evaluated')`. CommonJS output included `__exportStar(require("./types"), exports)`, proving target evaluation; ESNext output preserved `export * from './types'`. `ts.transpileModule` independently preserved the star statement with `verbatimModuleSyntax` both false and true. TypeScript's [verbatimModuleSyntax documentation](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html) says imports and exports without a `type` modifier are retained under that mode.

The checked branch pairs are:

| Repo | Source | Target | PR #62 built pair | PR #63 built pair | Corrected interpretation |
|---|---|---|---|---|---|
| Drizzle | `drizzle-arktype/src/index.ts:4`, `export * from './schema.types.internal.ts'` | `schema.types.internal.ts` exports only interfaces/types | absent | file-level `imports` | Valid source-visible module load; no value export required |
| Zod | `packages/zod/src/v3/external.ts:3`, `export * from "./helpers/typeAliases.js"` | `typeAliases.ts` exports only type aliases | absent | file-level `imports` | Valid source-visible module load; no value export required |

The earlier claim that these were fabricated runtime relationships is **retracted**. Whether a coupling score should count re-export module loads is a separate metric-contract question. The graph's `imports` edge currently represents a source-visible module dependency, not a guarantee that a runtime value is forwarded.

## Classifier rule and an actual configuration boundary

At `src/parser/typescript.ts:1332–1338`, a re-export is excluded when the statement starts `export type` or every named specifier has a direct inline `type` token. Other resolved re-exports get a file-level `imports` edge. This is a syntax rule using both keyword and per-binding modifiers; it does **not** inspect the target's declarations. Target-value inspection would incorrectly remove valid `export *` module loads.

TypeScript emit also shows a configuration-sensitive edge case: `export { type A } from './types'` emits no target load under the default ESNext transpile settings, but with `verbatimModuleSyntax: true` emits `export {} from './types'`, which can evaluate the target. `export type { A }` is erased under both settings. The parser currently excludes inline-only statements without reading build configuration. This was not evaluated against the five pinned corpus builds and is **not** labelled a confirmed wrong edge in this preflight.

## Census and unmet sample gate

Baseline: PR #62 head `e5e1adb`; candidate: PR #63 before this report `c1897ea`. Both SDKs were built separately and parsed without cache. `TYPESCRIPT-REEXPORT-PREFLIGHT.jsonl` is the source-AST census of 1,294 `export … from` sites in the five pinned roots (SHAs in `IMPORT-COVERAGE-BEFORE.jsonl`). It records source text, resolved target, current parsed/built file edge and whether that file-level edge was absent at baseline. The reserved seed was `pr63-reexport-2026-10-04-v1`; it was used for stable site hashes, **not** for a completed 130-selection draw.

| Repo | Sites | Added built file-level relationships | Explicit mixed | Inline-only type | `export type` | Requested sample |
|---|---:|---:|---:|---:|---:|---:|
| Nest | 488 | 473 | 1 | 0 | 15 | 40 |
| Zod | 138 | 122 | 2 | 0 | 7 | 40 |
| Drizzle | 359 | 358 | 0 | 0 | 0 | 20 |
| TanStack Query | 247 | 169 | 3 | 0 | 74 | 20 |
| code-graph | 62 | 50 | 2 | 1 | 11 | 10 |
| **Total** | **1,294** | **1,172** | **8** | **1** | **107** | **130** |

All 107 explicit `export type` statements and the one inline-only statement have no file-level edge in the current parsed output. The requested minimum of 15 mixed and 15 inline-only corpus examples is impossible in these five roots: only eight and one exist. Construct fixtures are needed to exercise the absent forms; they cannot be counted as corpus samples.

## Gate status

- **G1:** no confirmed WRONG in this preflight after correcting the module-load semantics; the required 130-site accuracy audit has not been run.
- **G2:** 108 explicitly type-marked statements have no file-level edge in the census. The single inline-only statement is configuration-sensitive; this is not a completed sampled gate.
- **G3:** seed recorded, but no 130 selections or redraw exist.
- **G4:** answered above: keyword and binding-modifier syntax rule.
- **G5:** re-export chains were not sampled.

**Disposition:** the previous WRONG-edge stop was based on an invalid criterion and is withdrawn. PR #63 still lacks the requested generality audit. The next audit must define whether it validates source-visible module loads or a particular emitted build, then draw the sample and supplement the missing rare strata with construct fixtures. Do not implement a rule that suppresses `export *` merely because its target exports only types.
