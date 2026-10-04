# PR #63 TypeScript re-export target-accuracy preflight — STOP

Status: **BLOCKED, do not merge PR #63 as-is.** This is the required G1 stop after finding a WRONG relationship. No parser code was changed, and no replacement sample was drawn in this pass.

Baseline: PR #62 head `e5e1adb`; candidate: PR #63 head before this report `c1897ea`. Both SDKs were built in separate checkouts and parsed with caches disabled. The five pinned corpus roots and SHAs are in `IMPORT-COVERAGE-BEFORE.jsonl`. `TYPESCRIPT-REEXPORT-PREFLIGHT.jsonl` records the source-AST census of `export … from` sites, their source text, resolved file target, current parsed/built file edge, whether that file-level edge was absent at the baseline, and a SHA-256 ordering key. Seed: `pr63-reexport-2026-10-04-v1`. The seed was reserved for the planned draw; the 130 selections were **not** made because G1 required a stop on the first WRONG class.

## Classifier rule (G4)

At `src/parser/typescript.ts:1332–1338`, the classifier excludes a re-export if its statement starts `export type` **or** every named `export_specifier` has a direct `type` token; every other resolved `export … from` statement gets a file-level runtime `imports` edge. Thus it does inspect inline modifiers, but a wildcard `export *` is treated as runtime without checking whether the target exports a runtime value.

## Blocking evidence (G1)

| Repo | Source and statement | Resolved target and declarations | PR #62 built relationship | PR #63 built relationship | Verdict |
|---|---|---|---|---|---|
| Drizzle | `drizzle-arktype/src/index.ts:4` — `export * from './schema.types.internal.ts';` | `drizzle-arktype/src/schema.types.internal.ts`: exported `Conditions` interface at line 6 and `BuildRefine`, `BuildSchema`, `NoUnknownKeys` type aliases at lines 16, 43, 65; no runtime export | absent | `imports` from source file to target file | **WRONG** |
| Zod | `packages/zod/src/v3/external.ts:3` — `export * from "./helpers/typeAliases.js";` | `packages/zod/src/v3/helpers/typeAliases.ts`: only `Primitive` and `Scalars` type aliases at lines 1–2; no runtime export | absent | `imports` from source file to target file | **WRONG** |

For both pairs, the built graph itself was checked before and after, not merely the parser's emitted record. The target file exists, so endpoint proof and parsed/built reconciliation pass while the **runtime classification is false**. The mechanism is general: a wildcard forwards a type-only module, but the syntax-only rule emits a runtime relationship. The same risk may exist for named exports of type declarations lacking an explicit `type` modifier. That possibility has not been measured in this stopped pass. These two examples do not establish a total wrong-edge count.

## Corpus availability and requested strata

The AST census covers all 1,294 resolved-source re-export statements in the five requested pinned roots. An `added` file-level relationship means a current built file-level `imports` edge whose file-level pair did not exist at the PR #62 baseline; the two WRONG examples were also verified to have **no built relationship of any kind** at baseline.

| Repo | Re-export sites | Added built file-level relationships | Explicit mixed | Inline-only type | `export type` | Requested draw |
|---|---:|---:|---:|---:|---:|---:|
| Nest | 488 | 473 | 1 | 0 | 15 | 40 |
| Zod | 138 | 122 | 2 | 0 | 7 | 40 |
| Drizzle | 359 | 358 | 0 | 0 | 0 | 20 |
| TanStack Query | 247 | 169 | 3 | 0 | 74 | 20 |
| code-graph | 62 | 50 | 2 | 1 | 11 | 10 |
| **Total** | **1,294** | **1,172** | **8** | **1** | **107** | **130** |

The requested minimum of 15 explicit mixed and 15 inline-only cases cannot be drawn from these corpora: only eight and one exist, respectively. The inline-only case, `src/dead-code/index.ts:76`, correctly has no file-level runtime edge. All 107 `export type` statements likewise have no file-level runtime edge. This is a census observation, **not** a completed G2 sample or a substitute for the unavailable 15/15 strata.

## Gate disposition

- **G1: FAIL.** Two verified WRONG relationships, same mechanism; stop invoked before the 130-edge sample.
- **G2: not completed as a sampled gate.** The preflight census found 108 explicit type-only sites with no file-level runtime edge, including the sole inline-only site. The sample was stopped.
- **G3: not run.** Seed recorded, but no 130 selections or redraw can honestly be claimed.
- **G4: answered** above: keyword **and binding-modifier** checks, with no semantic check for wildcard targets.
- **G5: not run.** No chain was sampled after the blocker.

**Recommendation:** separate the re-export file-relationship addition from PR #63's side-effect-import and Python work, or repair its value proof in a new pass and then draw a fresh seeded sample. Per the requested stop, this pass does neither. PR #63 is not ready for merge with the current re-export change.
