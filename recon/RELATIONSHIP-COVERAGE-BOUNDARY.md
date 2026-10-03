# File relationship coverage boundary for coupling calibration

Status: audit, not a completeness certificate. Baseline is v1.26.0 plus the proposed Python corrections in PR #61 (`081b5a7`). The eight calibration roots and three previously used blind roots are pinned in `PYTHON-RELATIVE-IMPORT-MEASUREMENTS.jsonl`. This document identifies what the current parsers attempt, what has fixture or corpus evidence, and what remains unverified. It changes no score.

## What the graph invariant does and does not prove

`buildGraph` asserts parsed edges = built parser edges + itemized drops; cross-language edges have separate accounting (`src/graph/index.ts`). This catches an emitted edge with a missing endpoint and records simple-graph pair coalescing. It cannot see source syntax that never became a parsed edge or diagnostic. Express's `require('./utils').methods` was such a capture miss before v1.26.0. A passing invariant is evidence of **edge accounting**, not import-site completeness or target accuracy.

The independently seeded 150-edge TypeScript call sample in `TYPESCRIPT-CALL-TARGET-SAMPLE.md` tests target accuracy for those selected calls; it is not an import coverage census. A syntax reconciliation for TypeScript calls exists in `TYPESCRIPT-CALL-AUDIT.md`; it should not be reused as an import coverage claim.

## Named language and construct boundary

| Language | Checked and evidenced | Known unchecked or incomplete | What coupling may claim |
|---|---|---|---|
| JavaScript (`.js/.jsx/.mjs/.cjs`) | Literal local `require` directly or nested in a member expression, function, conditional and try/catch; literal `import()`; ESM named and side-effect imports/re-exports; exact, extension and directory-index resolution; known local JSON/native/assets separated from code edges. The 15 built-edge cases and missing/computed diagnostics are in `test/javascript-import-completeness.test.ts`, with Express source evidence in `JAVASCRIPT-IMPORT-COMPLETENESS.md`. | Computed specifiers have no provable target; package `exports`, aliases, custom loaders and bundler-specific resolution have not received an independent syntax-to-graph census. The checked fixture set is not proof that every use of `require` is captured. | A local, literal source-visible dependency in those checked forms can be used as observed evidence. Do not call the entire JavaScript graph complete. |
| TypeScript (`.ts/.tsx`) | ESM named/default/namespace bindings, type-only bindings, re-exports and `import x = require(...)` have parser handlers; fixtures in `test/typescript-capture.test.ts` and the v1.25 target audit cover important forms. Project-wide target proof and the builder-drop ledger are active. | **Side-effect-only `import './x'` returns before an edge or diagnostic** at `src/parser/typescript.ts:1112-1113` when `import_clause` is absent. An AST census found 11 existing local side-effect import sites in the eleven roots with no built import pair: Drizzle 6, Hono 5. One Zod CSS import is non-code and should be reported separately. Dynamic imports, `require(...)` in `.ts`, path aliases and package exports are not independently reconciled against source syntax. | TS imported *bindings* have targeted fixtures and edge proof. TS module-load relationship coverage is known incomplete; Drizzle and Hono production pair totals are lower bounds. |
| Python (`.py`) | Proven explicit relative `from .module import Name`, re-export module paths and `from . import module` produce file-level edges in PR #61; positive and negative `TYPE_CHECKING` guards have fixtures in `test/python-relative-imports.test.ts`. Proven plain `import package.module` targets a file and is type-only under a recognized guard. The health projection now excludes Python `TYPE_CHECKING` imports instead of restoring them as runtime edges. | Absolute `from package import Name` is not a proven file relationship in general. Named symbol targets can still be constructed and then recorded as builder drops: FastAPI has 2,608 `missing-target` drops after PR #61, not 2,608 distinct missing pairs. Parenthesized named-symbol capture, star imports, multi-module plain imports, arbitrary guard expressions, namespace packages, editable installs and runtime `sys.path` changes are not validated. The Python parser's no-current-symbol call path is still silent. | The explicitly checked relative path forms are usable relationship evidence. Flask and FastAPI pair totals are **observed lower bounds**, not fully enumerated Python dependency counts. `TYPE_CHECKING` edges stay outside runtime coupling. |

These are code-level boundaries, not assertions that all variants of a listed construct have been enumerated in every repository. Imports from third-party packages may be correctly external; a local-looking name alone is not proof of a project file. Non-code dependencies belong in a separate report rather than a fabricated code edge.

## Independent source-to-graph check and new finding

The audit parsed `.ts/.tsx` source with tree-sitter and selected `import_statement` nodes with a literal relative `source` and no `import_clause`. It resolved only existing local code files by exact path, common JS/TS extension or `index` and compared the source and target file pair to built `imports` edges. This is independent of the parser's emitted edge list. It is deliberately narrow: it does not certify other TS import forms, and a pair can already exist through a different site without proving this site's capture. All eleven listed sites lack even a built pair.

| Root | Existing local code side-effect sites with no built pair | Representative source |
|---|---:|---|
| code-graph | 0 | — |
| nest | 0 | — |
| drizzle | 6 | `drizzle-kit/src/cli/schema.ts:7 → drizzle-kit/src/@types/utils.ts` |
| hono | 5 | `src/middleware/jwt/jwt.ts:12 → src/context.ts`; two other middleware sources and two runtime tests |
| express | 0 | — |
| zod | 0 code; 1 CSS asset | `packages/docs/app/layout.tsx:4 → ./global.css` |
| flask, fastapi, click, ripgrep, pinia | 0 | Their sampled source roots contain no matching TS code site. |

The Drizzle `@types/utils.ts` import may be intentionally used for type augmentation; syntax alone does not establish a runtime dependency after transpilation. A subsequent fix must inspect emitted semantics and represent type-only augmentation appropriately. The Hono middleware imports need the same check. This audit does **not** add eleven runtime relationships by assumption.

## Eligibility and next evidence gate

The eight calibration repositories remain useful as a **diagnostic distribution**, but they are not equally covered anchors. JavaScript's checked local-literal forms support Express as an anchor within that boundary. The TS corpus has at least the eleven side-effect gaps above; Python's absolute and named import relationships remain unquantified. Any coupling refit must show the observed pair counts, a known missing-pair lower bound where one exists, and a coverage status next to each score. A numeric curve cannot be described as language-neutral or complete on this evidence.

The repeatable gate for expanding this boundary is an AST census per relevant parser and pinned repository: enumerate syntactic import/module-load sites independent of parser output; classify each as proven built runtime pair, proven type-only pair, external, non-code, unresolved with reason, or unsupported capture; record source and target evidence; then reconcile those site classes. A builder-only assertion cannot substitute for this census. Scope classification (production/test/fixture/benchmark/generated) must be checked separately, because relationship coverage and score scope are different questions.

The current coupling contract's **structure** remains approved for discussion: distinct production file relationships as scored evidence; volume, fan-in, directory crossings and excluded relationships reported separately. Its 6/2 coefficients and grades remain rejected. The next numerical refit is diagnostic only until the known TS and Python gaps are bounded or corrected, fresh holdouts are preregistered, and the three previously measured holdouts (Click, ripgrep, Pinia) are excluded from blind validation.
