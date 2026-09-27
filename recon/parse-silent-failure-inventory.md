# Silent-failure sweep — baseline main 9ffc248

All locations below refer to **main 9ffc248**, so references remain stable after edits.
Scope: all tracked first-party runtime TS/JS in src, scripts (including mts/mjs),
and inline website code; tests/fixtures, generated dist, dependencies and the
external docs symlink are not product implementations. VSCode, Cloud and Action
repositories are not in this checkout and are not claimed audited.

Method: TypeScript AST enumeration of every catch clause and Promise.catch,
plus searches for empty/default returns, optional/default result fields,
process.exit / exitCode assignments, and consumers of parse/error results.
No `exitCode = 0` assignment exists. Explicit exit(0) calls are server shutdown,
simulation completion or timeout paths, not error branches. Natural CLI fallthrough
was the parse defect. Each catch is listed, including screened non-defects.

**fixed** = addressed without changing graph format or successful graph construction.
**reported** = ambiguous policy or shape-sensitive change; stopped at diagnosis for
Atef. **deliberate** = documented fail-open/recovery, explicit diagnostic/error, or
screened non-defect; this label is not an endorsement of risky fail-open policies.

## Catch inventory

| Main location | Disposition | What it hides / why retained or fixed |
| --- | --- | --- |
| `scripts/issue12-recon.mts:69` | reported | Recon-only tool skips unreadable/unparseable source, understating totals. Diagnostic-script completeness policy not documented; held for decision. |
| `scripts/issue12-recon.mts:77` | reported | Recon-only tool skips unreadable/unparseable source, understating totals. Diagnostic-script completeness policy not documented; held for decision. |
| `src/commands/affected.ts:40` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/commands/agents-md.ts:155` | deliberate | Documented optional generation; warning on stderr, graph export remains valid. |
| `src/commands/diff.ts:44` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/commands/security.ts:25` | deliberate | Best-effort CLI version discovery uses 0.0.0 fallback for telemetry; scan result unaffected. |
| `src/commands/security.ts:28` | deliberate | Best-effort CLI version discovery uses 0.0.0 fallback for telemetry; scan result unaffected. |
| `src/commands/verify-change.ts:102` | fixed | Accidental: treated read exceptions as EOF and verified truncated content. Now throws; EOF remains zero bytes. |
| `src/commands/whatif.ts:219` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/core/diff.ts:93` | deliberate | Capability predicate (git available/repo) returns false; caller reports unavailable/non-repository rather than clean analysis. |
| `src/core/diff.ts:101` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/core/diff.ts:137` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/core/diff.ts:148` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/core/diff.ts:221` | reported | Documented fail-open (security scan may fail): failed baseline becomes empty findings; can fabricate new/fixed vulnerabilities. Atef: reject whole diff or add availability per side. |
| `src/core/diff.ts:277` | reported | Same documented fail-open for comparison side; empty findings can falsely mark vulnerabilities fixed. Await same policy decision. |
| `src/core/diff.ts:285` | reported | Explicit restoration retry includes forced checkout. Recovery policy is outside this patch; warning-only failure can still return a successful diff. |
| `src/core/diff.ts:289` | reported | Restoration failure only warns, then returns successful comparison. Atef decides cleanup-failure contract. |
| `src/core/diff.ts:297` | reported | Stash restoration failure warns but successful diff still returned. Same cleanup-failure policy decision. |
| `src/core/verify-change.ts:151` | reported | Simulation failure returns null; some callers warn, but low-risk/safe can still result. Changing safety verdict or result status needs Atef. |
| `src/core/verify-change.ts:277` | deliberate | Documented conservative full-delete fallback with explicit warning; not an empty-success fallback. Failure of fallback is reported separately at 151. |
| `src/core/verify-change.ts:354` | fixed | Intentional non-fatal informational scan, accidental missing diagnostic. Now adds warning using existing warnings/relevant_warnings contract. |
| `src/cross-language/detectors/rest-api.ts:954` | reported | Unreadable source silently loses cross-language edges. Adding failure metadata or changing graph-construction policy needs decision; G1-sensitive. |
| `src/cross-language/detectors/subprocess.ts:153` | reported | Unreadable source silently loses cross-language edges. Adding failure metadata or changing graph-construction policy needs decision; G1-sensitive. |
| `src/dead-code/detector.ts:300` | reported | Missing/unreadable/invalid package metadata all lose entry-point evidence. Optional-file versus IO-failure policy is ambiguous; can affect health/raws. |
| `src/dead-code/detector.ts:491` | reported | Directory read failure becomes no root-extension evidence; can affect classification and health. Await diagnostic/strictness policy. |
| `src/dead-code/detector.ts:506` | deliberate | Explicit malformed-package policy: no dependency evidence. May increase false dead-code positives; policy retained and disclosed. |
| `src/docs/generator.ts:98` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:110` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:122` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:134` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:146` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:158` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:170` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:182` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:194` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:206` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:218` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:230` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:242` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/generator.ts:272` | deliberate | Errors collected in explicit errors array and success=false; CLI checks them and fails. Not indistinguishable from success. |
| `src/docs/history.ts:87` | deliberate | Capability predicate (git available/repo) returns false; caller reports unavailable/non-repository rather than clean analysis. |
| `src/docs/history.ts:100` | deliberate | Git command failure returns empty string, callers render Unable to retrieve data; report remains graph-based. |
| `src/docs/metadata.ts:33` | deliberate | Logged optional metadata load failure returns null; generated documents are not a successful read of that file. |
| `src/docs/status.ts:115` | deliberate | Explicit skip-unreadable-files policy in TODO extraction; can look like no TODOs. Kept pending broader document completeness policy. |
| `src/graph/updater.ts:21` | reported | Documented ignore for missing/duplicate graph entities catches all exceptions. Narrowing checks can change incremental graph behavior; held for graph-update policy decision. |
| `src/graph/updater.ts:42` | reported | Documented ignore for missing/duplicate graph entities catches all exceptions. Narrowing checks can change incremental graph behavior; held for graph-update policy decision. |
| `src/graph/updater.ts:55` | reported | Documented ignore for missing/duplicate graph entities catches all exceptions. Narrowing checks can change incremental graph behavior; held for graph-update policy decision. |
| `src/graph/updater.ts:78` | fixed | Accidental: read/parse failure resolved successfully and callers logged Graph updated. Now rejects and reads/parses before deleting old nodes. |
| `src/health/index.ts:227` | deliberate | Explicit history reset on corrupt JSON; current score is freshly computed. Can overwrite bad history; retained policy. |
| `src/health/index.ts:261` | reported | Corrupt/unreadable history indistinguishable from no history; trend null. Availability contract needs decision. |
| `src/index.ts:115` | deliberate | Optional tip/AGENTS/gitignore/cache freshness work, or cache-to-source recovery. Not the core parse success condition; AGENTS writer already warns. |
| `src/index.ts:120` | deliberate | Optional tip/AGENTS/gitignore/cache freshness work, or cache-to-source recovery. Not the core parse success condition; AGENTS writer already warns. |
| `src/index.ts:144` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:181` | deliberate | Optional tip/AGENTS/gitignore/cache freshness work, or cache-to-source recovery. Not the core parse success condition; AGENTS writer already warns. |
| `src/index.ts:324` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:365` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:394` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:459` | deliberate | Optional tip/AGENTS/gitignore/cache freshness work, or cache-to-source recovery. Not the core parse success condition; AGENTS writer already warns. |
| `src/index.ts:474` | deliberate | Optional tip/AGENTS/gitignore/cache freshness work, or cache-to-source recovery. Not the core parse success condition; AGENTS writer already warns. |
| `src/index.ts:536` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/index.ts:545` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/index.ts:557` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/index.ts:566` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:679` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:718` | deliberate | Optional tip/AGENTS/gitignore/cache freshness work, or cache-to-source recovery. Not the core parse success condition; AGENTS writer already warns. |
| `src/index.ts:772` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:826` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:855` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:874` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:898` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:920` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/index.ts:939` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/mcp/connect.ts:79` | deliberate | Explicit logged fallback to existing clone after failed pull; result may be stale. Freshness metadata would be a shape change. |
| `src/mcp/connect.ts:86` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/mcp/connect.ts:198` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcp/connect.ts:207` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcp/connect.ts:220` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcp/connect.ts:268` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/mcp/tools.ts:802` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/mcp/tools.ts:1640` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/mcp/tools.ts:1692` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/mcp/tools.ts:1809` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/mcp/tools/claim-files.ts:69` | deliberate | Explicit skip-malformed-JSONL policy for append-only coordination records. Corrupt claims can disappear; stricter corruption/status policy requires Atef. |
| `src/mcp/tools/get-active-claims.ts:61` | deliberate | Explicit skip-malformed-JSONL policy for append-only coordination records. Corrupt claims can disappear; stricter corruption/status policy requires Atef. |
| `src/mcp/tools/get-decisions.ts:55` | deliberate | Explicit skip-malformed-JSONL policy for append-only coordination records. Corrupt claims can disappear; stricter corruption/status policy requires Atef. |
| `src/mcp/tools/release-files.ts:53` | deliberate | Explicit skip-malformed-JSONL policy for append-only coordination records. Corrupt claims can disappear; stricter corruption/status policy requires Atef. |
| `src/mcpb-entry.ts:53` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcpb-entry.ts:62` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcpb-entry.ts:74` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcpb-entry.ts:79` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/mcpb-entry.ts:89` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/parser/cache.ts:42` | deliberate | Derived cache only: disabled cache or read/write miss falls back to real source parsing; no analysis success manufactured. |
| `src/parser/cache.ts:162` | deliberate | Derived cache only: disabled cache or read/write miss falls back to real source parsing; no analysis success manufactured. |
| `src/parser/cache.ts:175` | deliberate | Derived cache only: disabled cache or read/write miss falls back to real source parsing; no analysis success manufactured. |
| `src/parser/cache.ts:183` | deliberate | Derived cache only: disabled cache or read/write miss falls back to real source parsing; no analysis success manufactured. |
| `src/parser/cache.ts:222` | deliberate | Derived cache only: disabled cache or read/write miss falls back to real source parsing; no analysis success manufactured. |
| `src/parser/cache.ts:228` | deliberate | Derived cache only: disabled cache or read/write miss falls back to real source parsing; no analysis success manufactured. |
| `src/parser/cache.ts:255` | reported | Cache-size stat error becomes size zero; diagnostic metadata cannot distinguish unavailable. Shape/status decision needed. |
| `src/parser/cpp.ts:868` | deliberate | Explicit invalid-vcpkg-JSON ignore policy: returns file with no dependency evidence. Retained, not claimed correct input. |
| `src/parser/csharp.ts:675` | reported | Import/module candidate discovery tolerates failed reads/listings (Go logs). Cannot distinguish not found from inaccessible; graph/resolution diagnostic policy decision needed. |
| `src/parser/go.ts:419` | reported | Import/module candidate discovery tolerates failed reads/listings (Go logs). Cannot distinguish not found from inaccessible; graph/resolution diagnostic policy decision needed. |
| `src/parser/go.ts:476` | reported | Import/module candidate discovery tolerates failed reads/listings (Go logs). Cannot distinguish not found from inaccessible; graph/resolution diagnostic policy decision needed. |
| `src/parser/index.ts:66` | reported | Grammar failure carries errorFiles for discovered files (deliberate partial-result contract); zero discovered files leaves errorFiles empty. Global initialization status needs shape decision. CLI now rejects all zero-length results. |
| `src/parser/index.ts:109` | deliberate | Derived cache open/update/close/load fallback; logs failures where relevant and parses source instead. |
| `src/parser/index.ts:177` | deliberate | Per-file parse failure is logged and stored in errorFiles; partial success contract. CLI now warns and refuses zero parsed files. |
| `src/parser/index.ts:188` | deliberate | Derived cache open/update/close/load fallback; logs failures where relevant and parses source instead. |
| `src/parser/index.ts:191` | deliberate | Derived cache open/update/close/load fallback; logs failures where relevant and parses source instead. |
| `src/parser/index.ts:401` | deliberate | Derived cache open/update/close/load fallback; logs failures where relevant and parses source instead. |
| `src/parser/java.ts:906` | reported | Import/module candidate discovery tolerates failed reads/listings (Go logs). Cannot distinguish not found from inaccessible; graph/resolution diagnostic policy decision needed. |
| `src/parser/jvm-modules.ts:86` | fixed | Accidental: unreadable Maven declaration looked empty. Now records existing errors metadata. |
| `src/parser/jvm-modules.ts:139` | fixed | Accidental: unreadable Gradle settings looked absent. Now records existing errors metadata. |
| `src/parser/kotlin.ts:802` | reported | Import/module candidate discovery tolerates failed reads/listings (Go logs). Cannot distinguish not found from inaccessible; graph/resolution diagnostic policy decision needed. |
| `src/parser/resolver.ts:35` | reported | Missing/invalid/unreadable tsconfig all become null, then empty compiler options. Could change alias resolution and health; distinguish absence from error before changing policy. |
| `src/parser/swift.ts:646` | reported | Import/module candidate discovery tolerates failed reads/listings (Go logs). Cannot distinguish not found from inaccessible; graph/resolution diagnostic policy decision needed. |
| `src/parser/workspace.ts:51` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/parser/workspace.ts:60` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/parser/workspace.ts:115` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/parser/workspace.ts:125` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/parser/workspace.ts:139` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/parser/workspace.ts:156` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/parser/workspace.ts:168` | reported | Optional workspace/package probe also swallows invalid/unreadable inputs, losing package evidence. Explicit skip comments at some sites; absence vs error policy unresolved and G1-sensitive. |
| `src/security/checks/architecture.ts:42` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/auth.ts:30` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/auth.ts:127` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/cryptography.ts:32` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/cryptography.ts:740` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/dependencies.ts:40` | deliberate | Failure is represented as dependency audit unavailable/error finding (info); no silent empty result. Consumers filtering info may miss unavailability (reported below). |
| `src/security/checks/dependencies.ts:63` | deliberate | npm nonzero status can carry valid vulnerability JSON; consumes stdout, validates next, emits unavailable finding if invalid. |
| `src/security/checks/dependencies.ts:73` | deliberate | Explicit optional lockfile fallback retains advisory ranges; does not erase findings. |
| `src/security/checks/dependencies.ts:75` | deliberate | Failure is represented as dependency audit unavailable/error finding (info); no silent empty result. Consumers filtering info may miss unavailability (reported below). |
| `src/security/checks/dependencies.ts:107` | deliberate | Explicit ignore policy for package metadata/lifecycle-script inspection; missing checks are not represented. Retained; broader scan-completeness contract needs Atef. |
| `src/security/checks/dependencies.ts:146` | deliberate | Explicit ignore policy for package metadata/lifecycle-script inspection; missing checks are not represented. Retained; broader scan-completeness contract needs Atef. |
| `src/security/checks/dependencies.ts:150` | deliberate | Explicit ignore policy for package metadata/lifecycle-script inspection; missing checks are not represented. Retained; broader scan-completeness contract needs Atef. |
| `src/security/checks/dependencies.ts:181` | deliberate | Failure is represented as dependency audit unavailable/error finding (info); no silent empty result. Consumers filtering info may miss unavailability (reported below). |
| `src/security/checks/dependencies.ts:222` | deliberate | Failure is represented as dependency audit unavailable/error finding (info); no silent empty result. Consumers filtering info may miss unavailability (reported below). |
| `src/security/checks/dependencies.ts:248` | deliberate | Failure is represented as dependency audit unavailable/error finding (info); no silent empty result. Consumers filtering info may miss unavailability (reported below). |
| `src/security/checks/frontend.ts:30` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/frontend.ts:120` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/information-disclosure.ts:25` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/information-disclosure.ts:102` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/injection.ts:677` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/injection.ts:715` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/input-validation.ts:25` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/input-validation.ts:106` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/path-traversal.ts:72` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/path-traversal.ts:123` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/secrets.ts:56` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/checks/secrets.ts:87` | reported | Documented outer fail-open (do not crash entire scan); inner unreadable files skip too. Failed check looks clean/partial. Atef must choose strict rejection vs explicit per-check availability; no policy override here. |
| `src/security/graph-aware.ts:149` | reported | Elevation failure returns original finding, indistinguishable from no reachable route. Availability/strictness decision required. |
| `src/security/native-bindings.ts:31` | deliberate | Tries alternate asset locations, then throws if all fail; never returns empty allowlist. |
| `src/security/npm-audit.ts:35` | deliberate | Optional advisory enrichment returns null on network/HTTP error; base npm advisory remains and patch availability can be unknown. |
| `src/telemetry.ts:14` | deliberate | Optional telemetry must not block CLI work; best-effort network send. No analysis result depends on it. |
| `src/temporal/git.ts:29` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/temporal/git.ts:40` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/temporal/git.ts:54` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/temporal/git.ts:71` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/temporal/git.ts:91` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/temporal/git.ts:109` | fixed | Accidental despite explicit silent comment: failed stash restoration looked complete. Now rejects with manual recovery guidance. |
| `src/temporal/git.ts:118` | deliberate | Capability predicate (git available/repo) returns false; caller reports unavailable/non-repository rather than clean analysis. |
| `src/temporal/index.ts:113` | deliberate | Error propagates or produces nonzero exit; screened, not a silent-success defect. |
| `src/temporal/snapshots.ts:39` | deliberate | Snapshot cache miss/corruption returns null; callers rebuild snapshot from source. |
| `src/temporal/snapshots.ts:58` | reported | Unreadable/corrupt snapshots silently omitted from timeline. Need partial-timeline status or fail-fast policy. |
| `src/tools.ts:59` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/tools.ts:634` | deliberate | Explicit error payload distinguishes failure; MCP transport isError flag omission discussed below. |
| `src/utils/files.ts:33` | fixed | Accidental: unreadable directory entry disappeared from the listing. Now throws with path/cause. |
| `src/utils/files.ts:71` | fixed | Accidental: traversal error returned an empty/partial listing. Now throws; CLI exits 1. |
| `src/utils/files.ts:81` | reported | Existence predicate maps stat failures to false; used by resolution. Distinguishing inaccessible from absent could change graph behavior; held for decision. |
| `src/viz/public/arc.js:214` | deliberate | UI displays load/refresh error, or logs optional viewport-fit warning; no clean-analysis claim. |
| `src/viz/public/arc.js:253` | deliberate | UI displays load/refresh error, or logs optional viewport-fit warning; no clean-analysis claim. |
| `src/viz/public/temporal.js:33` | deliberate | UI displays load/refresh error, or logs optional viewport-fit warning; no clean-analysis claim. |
| `src/viz/public/temporal.js:423` | deliberate | UI displays load/refresh error, or logs optional viewport-fit warning; no clean-analysis claim. |
| `src/viz/server.ts:147` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/viz/server.ts:174` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/viz/server.ts:201` | deliberate | Long-lived watcher/server logs failure and continues serving; no success log in this catch. Machine-readable freshness would require new status. |
| `src/viz/temporal-server.ts:80` | deliberate | Browser-open failure reported; running server and printed URL remain usable. |
| `website/index.html:1991` | deliberate | Subscription network failure displays Failed to subscribe and restores controls. No success shown. |

## Non-catch defaults and result contracts

| Main location | Disposition | Finding / decision |
| --- | --- | --- |
| `src/index.ts:74–97` | fixed | Empty parse exported an empty graph and exited 0; now exits 2 before graph export. Partial parse now warns on stderr, exit 0. |
| `src/index.ts:69,94` | fixed | Explicit path already worked; omitted path walked to ancestor root. Now cwd is parse/output default; explicit output still wins. |
| `src/security/scanner.ts:29–34` | fixed | Ignored errorFiles and empty/unmatched selection, returning clean scan. Rejects failed parses and zero analyzed files using existing exception channel. |
| `src/docs/dead-code.ts:18,40` | fixed | Empty graph rendered No dead code detected. Now explicitly says nothing was analyzed, no report available. |
| `src/security/scanner.ts:104–121` | reported | dependencyAudit.ran derives from finding count, so successful clean audit looks not run; failed audit info-finding looks run. Needs audit execution status, not a count-based rename. |
| `src/security/checks/dependencies.ts:75,181,222,248`; `src/commands/security.ts:66–102` | reported | Unavailable dependency audit is an info finding; severity thresholds can exit 0. Decide whether incomplete scans fail CI independently of severity. |
| `src/security/checks/dependencies.ts:68–69` | fixed | Syntactically valid JSON without a vulnerabilities map (e.g. {}) became a clean audit. Now invalid reports become the existing audit-unavailable finding; valid empty maps remain clean. |
| `src/security/npm-audit.ts:23,58–59` | deliberate | Undefined patch metadata means unavailable; null means no patch. Empty vulnerabilities is a valid clean input after checkNpmAudit validation. SDK helper assumes a validated NpmAudit. |
| `src/core/verify-change.ts:195–227,242–301,365–396` | reported | Empty/unrecognized unified diff, missing graph file, or failed conservative simulation may yield low-risk/safe. Existing warning/fallback policies need verdict decision; no new safety contract invented. |
| `src/index.ts:190,516,737,796`; `src/mcp/connect.ts:169`; `src/commands/security.ts:54` | deliberate | Query/MCP-connect/health/dead-code/security have explicit empty guards. Partial parse coverage remains an issue below. |
| `src/index.ts:346,635,737,796`; `src/commands/verify-change.ts:38`; `src/commands/affected.ts:58`; `src/commands/whatif.ts:53,92`; `src/core/diff.ts:170,228`; `src/mcp/tools.ts:1468`; `src/mcpb-entry.ts:30`; `src/temporal/index.ts:82`; `src/viz/server.ts:127,155,182` | reported | Consumers build analyses from ParseProjectResult without consistently checking errorFiles; some accept zero files. Decide a shared completeness/status policy per command/API. SDK array remains explicitly partial by design. |
| `src/graph/serializer.ts:68`; `src/parser/index.ts:40` | reported | Exported graph JSON has no errorFiles/completeness status. SDK array has it, CLI warning surfaces it, but downstream cached-graph consumers cannot recover it. Adding metadata needs Atef's format/result decision. |
| `src/parser/index.ts:124–168` | deliberate | Explicit exclusion, oversize, unsupported parser and containment skips are not exceptions. CLI treats zero remaining parsed files as exit 2. |
| `src/parser/detect.ts` parser selection; `src/parser/*` syntax/type/scope recognizers and import resolvers | deliberate | null/false/empty denotes unsupported syntax, external/unknown target, or no match; no thrown failure is being relabeled. Failed filesystem probes are separately inventoried above. |
| `src/parser/resolver.ts:56,79,83,239`; `src/parser/namespace-calls.ts:30–37`; `src/parser/super-calls.ts:91`; `src/parser/jvm-modules.ts:70,78,80` | deliberate | Unsupported extends, cycle/depth guards, no package/target evidence stop resolution without guessing. JVM traversal rejection has errors metadata. These are bounded-resolution policies, not successful proof of absence. |
| `src/graph/queries.ts:92,115` | reported | Missing symbol returns same [] as real symbol with zero dependencies/dependents. Public query API contract decision required (callers often validate first). |
| `src/mcp/connect.ts:249–267` | reported | Uses obsolete totalFiles/totalSymbols/totalEdges/crossFileEdges and incomingCount/outgoingCount against current ArchitectureSummary. Observed undefined counts/null connections in real connect_repo response. Correcting exposed stats fields needs response-contract review. |
| `src/tools.ts:37,59`; `src/mcp/tools.ts:802`; `src/mcp/server.ts:32` | reported | Explicit error JSON exists, but MCP transport result lacks isError. Clients looking only at protocol flag can treat failure as success. Adding flag/type is a shape change. |
| `src/mcp/connect.ts:158–179`; watcher handlers in `src/index.ts`, `src/mcpb-entry.ts`, `src/viz/server.ts` | reported | Failed reconnect can retain previous graph after stopping its watcher; failed updates leave stale data without structured freshness. Existing logs are visible, but freshness contract needs decision. |
| `src/dead-code/detector.ts:100`; `src/dead-code/types.ts`; `src/dead-code/display.ts:127–135`; `src/docs/templates.ts:61` | reported | SDK dead-code analysis has no unscored/failed status; formatting nullish counts as zero can hide malformed input. CLI empty guard and document fix cover their paths, not SDK status design. |
| `src/docs/health.ts:18,108` | fixed | Unscored report rendered NaN and No critical issues detected from empty recommendations. Now renders only the explicit unscored explanation. |
| `src/health/index.ts:24–45`; `src/health/display.ts:13` | deliberate | Empty health graph carries no_parseable_files, N/A, empty dimensions, and NaN placeholders. Consumers must inspect status; no score of 100 manufactured. |
| `src/temporal/sampler.ts:9`; map/count defaults throughout graph metrics, docs, parsers | deliberate | Empty input/no adjacency/no prior count uses empty collection or zero as mathematical identity, without an error branch. Screened 376 default-return/default-field search hits. |
| `src/docs/generator.ts:263–277`; `src/tools.ts:19–22` | deliberate | Generation success/errors and precomputed available/unavailable/stale are distinguishable existing result contracts. |
| `src/commands/whatif.ts:24–25,137,179,216`; `src/viz/server.ts:214`; `src/viz/temporal-server.ts:92` | deliberate | Exit 0 is normal simulation success or explicit server shutdown/timeout. No error branch assigns exitCode=0. |

## Decisions left with Atef

No reported entry was silently patched into a new result shape. Principal decisions:
strict vs partial security scans at check/audit level; completeness metadata for
SDK/serialized graphs and derived analyses; verify-change's unavailable-analysis
verdict; git cleanup failure semantics; optional discovery failures vs absence;
MCP protocol/freshness/stats contracts; corruption handling for coordination,
health history, and temporal snapshots. Existing documented fail-open behavior
is recorded rather than presumed safe. This inventory is complete for the scoped
search and consumer review, not a claim that other repositories were audited.
