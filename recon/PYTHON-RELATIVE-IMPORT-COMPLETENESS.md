# Python relative-import completeness and `TYPE_CHECKING` split

Baseline is v1.26.0 main at `a166f14`. The eleven repository roots are pinned in `PYTHON-RELATIVE-IMPORT-MEASUREMENTS.jsonl`; all measurements use cache-disabled parses of the same source roots and compare the baseline SDK with this branch's SDK. The previous quick line-based count of 19 missing explicit-relative imports was an overestimate: it matched Python examples inside FastAPI docstrings at `fastapi/applications.py:365`, `:1538` and `fastapi/param_functions.py:2449`. A tree-sitter census is used here.

## Scope found before implementation

The Python parser resolves many relative module paths but emits `from .module import Name` as an import to a constructed `module.py::Name` symbol. Re-exported names often have no declaration in that module; the v1.25 builder records a missing-target drop, but the file relationship is absent. Among named relative imports in the pinned Python corpus, ten real FastAPI runtime sites across nine distinct file pairs lacked a built relationship. Examples include `fastapi/__init__.py:21-25` importing re-exported types from `.requests`, `.responses`, and `.websockets`, and `docs_src/bigger_applications/app_an_py310/main.py:4-5` importing local packages. The named Flask and Click file relationships generally already reached the graph through declared symbol imports; their important defect was classification.

Imports under `if t.TYPE_CHECKING:` in Flask `src/flask/app.py:61-63` and Click `src/click/termui.py:27-28` were treated as runtime imports. Across the Python syntax census there are 30 such relative sites in Flask, one in FastAPI, and 16 in Click. Runtime coupling must exclude them. The old builder already recorded invalid constructed targets, so this is not a new silent builder drop; the missing file-level relationship arises before a proven file edge is emitted.

## Implemented boundary

The parser now emits a file-level edge for a proven **relative** Python module: `imports` at runtime, `references-type` with `typeOnlyImport` under a proven `TYPE_CHECKING` guard. It recognizes `import typing as t; if t.TYPE_CHECKING`, direct `from typing import TYPE_CHECKING`, and an alias such as `TYPE_CHECKING as TC`. `if not TYPE_CHECKING` remains runtime. A `from . import module` statement resolves the named submodule when its `.py` file exists, with package `__init__.py` as the fallback. A plain `import pkg.module` with a proven project-local path now also targets the file declaration, and is type-only under the same guard; this changes four FastAPI imports that previously ended as recorded missing-target drops. Missing relative modules get `relative-not-found`; a present `.py` excluded from the parse gets `target-not-parsed`. Neither gets a guessed edge. The project-wide validator proves the new Python file targets, leaving the pre-existing Python named symbol-target builder accounting unchanged.

Absolute `from package import Name` resolution and named symbol capture remain at their v1.26 boundary. In particular, this branch does not treat every such import as proof of a local target and does not expand symbol capture from parenthesized lists; that would require its own target-accuracy audit. The parser's known no-current-symbol silent call path is also untouched. The four recovered FastAPI plain-import edges expose a broader plain-import coverage limit, which the separate coverage audit records.

`RESOLUTION_VERSION` moves **9→10** because parsed edges, edge kinds and diagnostics change, invalidating parse caches. `formatVersion` remains **2**; stored graphs load but must be reparsed to gain the corrected relationships and type-only classification.

## Eleven-repository graph and health movement

Runtime production pairs exclude `references-type` edges. A decrease can therefore be correct when a former runtime relationship is proven type-only: Flask **89→77** and Click **57→56**. FastAPI gains **112→123** runtime production pairs. The current coupling score still uses edge volume from tests and examples, so Flask coupling falls **90→70** even as its *runtime production pair count declines*; this reinforces the pending coupling-contract problem and is reported without suppressing it.

| Repository | Symbols | Built imports | Built type references | Built calls | Other built edges | Runtime production pairs | Overall |
|---|---:|---:|---:|---:|---:|---:|---:|
| code-graph | 7,647→7,647 | 905→908 | 1,168→1,168 | 2,451→2,451 | 11→11 | 397→397 | 70→70 |
| nest | 20,156→20,156 | 7,027→7,027 | 5,766→5,766 | 7,534→7,534 | 751→751 | 3,071→3,071 | 52→52 |
| drizzle | 30,891→30,891 | 6,144→6,144 | 12,664→12,664 | 16,027→16,027 | 1,387→1,387 | 2,773→2,773 | 35→35 |
| hono | 9,616→9,616 | 1,009→1,009 | 3,044→3,044 | 2,587→2,587 | 438→438 | 297→297 | 48→48 |
| express | 1,658→1,658 | 178→178 | 0→0 | 98→98 | 285→285 | 7→7 | 65→65 |
| zod | 13,449→13,449 | 827→827 | 5,687→5,687 | 8,199→8,199 | 50→50 | 255→255 | 49→49 |
| flask | 1,778→1,778 | 158→210 | 0→51 | 269→269 | 88→88 | 89→77 | 81→77 |
| fastapi | 7,356→7,356 | 472→633 | 0→2 | 1,065→1,065 | 174→174 | 112→123 | 69→66 |
| click | 2,213→2,213 | 190→230 | 0→19 | 554→554 | 58→58 | 57→56 | 77→77 |
| ripgrep | 3,659→3,659 | 87→87 | 0→0 | 2,513→2,513 | 0→0 | 73→73 | 82→82 |
| pinia | 1,555→1,555 | 314→314 | 300→300 | 713→713 | 0→0 | 93→93 | 62→62 |

| Repository | Coupling | Cohesion | Cycles | God files | Orphans/dead | Depth |
|---|---:|---:|---:|---:|---:|---:|
| code-graph | 70→70 | 60→60 | 97→97 | 60→60 | 81→81 | 40→40 |
| nest | 50→50 | 40→40 | 66→66 | 60→60 | 71→71 | 20→20 |
| drizzle | 10→10 | 40→40 | 20→20 | 60→60 | 70→70 | 40→40 |
| hono | 30→30 | 60→60 | 35→35 | 60→60 | 82→82 | 40→40 |
| express | 70→70 | 40→40 | 87→87 | 60→60 | 88→88 | 40→40 |
| zod | 30→30 | 40→40 | 88→88 | 60→60 | 50→50 | 20→20 |
| flask | 90→70 | 100→100 | 44→42 | 100→100 | 48→56 | 100→100 |
| fastapi | 90→90 | 40→40 | 84→82 | 80→60 | 41→41 | 60→60 |
| click | 70→70 | 100→100 | 54→54 | 100→100 | 38→38 | 100→100 |
| ripgrep | 90→90 | 100→100 | 100→100 | 40→40 | 32→32 | 100→100 |
| pinia | 50→50 | 60→60 | 92→92 | 60→60 | 57→57 | 40→40 |

| Repository | Parsed | Built parser edges | Recorded drops | Cross-language built |
|---|---:|---:|---|---:|
| code-graph | 5,535 | 4,532 | pair-replaced 890, pair-preserved 113 | 6 |
| nest | 25,051 | 21,076 | pair-preserved 2,187, pair-replaced 1,788 | 2 |
| drizzle | 53,817 | 36,222 | pair-replaced 11,994, pair-preserved 5,601 | 0 |
| hono | 9,245 | 6,680 | pair-replaced 1,633, pair-preserved 932 | 398 |
| express | 622 | 276 | pair-replaced 346 | 285 |
| zod | 21,434 | 14,763 | pair-preserved 435, pair-replaced 6,236 | 0 |
| flask | 860 | 618 | missing-target 16, pair-replaced 175, pair-preserved 1, missing-source 50 | 0 |
| fastapi | 4,963 | 1,874 | pair-replaced 334, missing-target 2,608, missing-source 95, missing-both 52 | 0 |
| click | 1,248 | 861 | pair-replaced 313, missing-target 6, missing-source 66, pair-preserved 2 | 0 |
| ripgrep | 4,089 | 2,600 | pair-replaced 1,479, missing-source 10 | 0 |
| pinia | 1,639 | 1,327 | pair-replaced 288, pair-preserved 24 | 0 |

| Repository | Changed raw values (before → after) |
|---|---|
| code-graph | God Files godFiles 17→16; God Files threshold 41.9→42; God Files godFilesPer100 5→4.7 |
| nest | none |
| drizzle | none |
| hono | none |
| express | none |
| zod | none |
| flask | Coupling avgConnections 2.36→3.4; Coupling maxConnections 46→61; Cohesion avgInternalRatio 84.5→83.7; Cohesion directories 5→6; Cyclic Dependency Groups cyclicFileCount 21→22; Cyclic Dependency Groups cyclicFileRatio 0.21212121212121213→0.2222222222222222; Cyclic Dependency Groups largestGroupSize 19→20; God Files threshold 48.4→61.3; Orphans & Dead Code orphans 6→2; Orphans & Dead Code orphanPercentage 17.1→5.7; Orphans & Dead Code deadSymbols 337→338 |
| fastapi | Coupling avgConnections 0.78→0.95; Coupling maxConnections 147→232; Coupling crossDirCoupling 33→27.5; Cohesion avgInternalRatio 16.9→18.9; Cohesion directories 102→105; Cyclic Dependency Groups groupCount 2→3; cyclicFileCount 22→25; cyclicFileRatio 0.022587268993839837→0.02556237218813906; largestGroupSize 15→15; graphFileCount 974→978; God Files godFiles 28→30; threshold 10.1→12; godFilesPer100 2.9→3.1; Orphans & Dead Code orphans 274→270; orphanPercentage 62.3→60.8; Dependency Depth maxDepth 7→7 |
| click | Coupling avgConnections 3.54→4.24; Coupling maxConnections 98→116; God Files threshold 106.2→127.1; Orphans & Dead Code deadSymbols 453→455; Orphans & Dead Code deadCodePercentage 25→25.1 |
| ripgrep | none |
| pinia | none |

All built call, inheritance, decoration, injection, reference, and cross-language edge counts are unchanged; the table groups them in “other built edges.” No symbol count changed. The reconciliation table excludes cross-language edges from parser-built counts. Each row satisfies parsed = built parser edges + itemized recorded drops. Python's pre-existing constructed symbol targets remain recorded as builder drops. The full raw data and pinned SHAs are in the JSONL companion.

## Verification and release boundary

The five fixtures in `test/python-relative-imports.test.ts` all fail with the parser changes stashed and pass after restoration. They cover runtime imports, re-exports, `from . import module`, three positive `TYPE_CHECKING` forms, a guarded plain import, a negated runtime guard, missing modules and a present but excluded target. Build and the full test suite pass locally. Three shuffled-discovery runs with seeds `11`, `29`, `47` on Flask, FastAPI and Click produced byte-identical parsed output and serialized graphs; the final small plain-import correction is checked separately below.

This is a graph-contents change for a **future** release, separate from v1.26.0. No merge, publication or deployment is part of this branch. Coupling coefficients and grades remain unapproved. The coverage-boundary audit and fresh holdout preregistration are the next gates before any refit.
