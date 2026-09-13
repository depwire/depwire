# P1 external-root containment recon (bug #16)

Date: 2026-09-13  
Scope: recon only. This document does not implement containment or change graph behavior.

## Result

All five measured repositories produce **0 parsed files, 0 symbols, and 0
edges from outside the selected project root**. Enforcing canonical containment
at every site listed below would therefore change the measured graph shape by
zero on every repository. One real upward-looking input exists in cxxopts
(`add_subdirectory(../.. ...)`), but it canonically resolves from the nested
test directory back to the repository root, not outside it.

Measurements used cold parses (`useCache: false`). A path was counted outside
when `resolve(projectRoot, filePath)` was neither the canonical root nor prefixed
by `root + path.sep`. Edge endpoints were checked through their actual graph
node `filePath` attributes; parser outputs were also audited for `..` and
absolute external paths. Source configurations/imports containing parent
segments were separately inspected so an endpoint dropped by `buildGraph`
would not be mistaken for proof that no filesystem probe occurred.

| Repository | Commit | Parsed files | Graph symbols | Graph edges | Outside files | Outside symbols | Outside edges | Shape delta if contained now |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| nest | `4c751c503bc753095f4b4f052e106f95218cc33f` | 1,836 | 16,841 | 14,961 | 0 | 0 | 0 | 0 / 0 / 0 |
| drizzle | `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10` | 968 | 30,479 | 24,181 | 0 | 0 | 0 | 0 / 0 / 0 |
| cxxopts | `ac6d4702b6d28fe662ea537eb92f7286aa088e21` | 15 | 2,480 | 746 | 0 | 0 | 0 | 0 / 0 / 0 |
| dart-samples | `eeb85290e96486c1ccd30390adb7c4078b874b02` | 89 | 701 | 72 | 0 | 0 | 0 | 0 / 0 / 0 |
| glue | `da9c73f7a3de6a27f3103cb5bb2355820a4c3a6a` | 25 | 95 | 22 | 0 | 0 | 0 | 0 / 0 / 0 |

`cxxopts/test/add-subdirectory-test/CMakeLists.txt:5` is the only measured
configuration at these sites that uses parent segments:
`add_subdirectory(../.. cxxopts EXCLUDE_FROM_ALL)`. From that file's directory,
the resulting target is `<cxxopts-root>/CMakeLists.txt`, so it is valid under a
canonical containment policy.

## Exact site inventory

The unsafe class is consistent: repository-controlled text is combined with a
trusted root/current-file directory, then an existence/read/directory operation
is attempted before a canonical containment decision. Returned `../...` paths
can also become edge endpoints, although such edges normally disappear today
because the external source was not part of the root scan.

| File and function | Escaping input | Filesystem access and observable result |
|---|---|---|
| `src/parser/workspace.ts:102`, `expandGlobPattern` | `workspaces` from `package.json`, or `packages` from `pnpm-workspace.yaml`; literal `../pkg` and trailing glob `../*` escape | Literal form calls `fileExists(<candidate>/package.json)`. Glob form calls `readdirSync(parentDir)`, `statSync(child)`, and `fileExists(child/package.json)`. `addPackageIfNamed` at line 132 then `readFileSync`s that package file. The external directory can feed `resolveWorkspacePackageImport` in `resolver.ts`, which probes its `src` entries and can return a `../...` target. |
| `src/parser/cpp.ts:710`, `parseCMakeLists` (`add_subdirectory` branch at 764) | First unquoted/non-space argument of `add_subdirectory(...)` | Builds a path relative to the current CMake file and calls `existsSync`. On success it emits an `imports` edge to that possibly external `CMakeLists.txt`. |
| `src/parser/java.ts:778`, `parseGradleBuild` | Module token captured from `project('...')`; `../sibling` escapes | Calls `existsSync` for `build.gradle` and `build.gradle.kts` under the joined module path, then emits an `imports` edge to the matching build file. |
| `src/parser/kotlin.ts:614`, `parseGradleBuild` | Same `project('...')` token | Same probe/edge behavior, with Kotlin/Groovy build-file preference reversed. |
| `src/parser/kotlin.ts:687`, `parseSettingsGradle` | Colon-prefixed quoted module captured from `include(...)`; parent segments survive | Calls `existsSync` for both Gradle build-file names and emits an `imports` edge on success. JVM module discovery in `jvm-modules.ts` is a different path and is already canonically contained. |
| `src/parser/c.ts:317`, `resolveIncludePath` | Raw path between `#include` delimiters | Calls `existsSync` on candidates relative to the current file and project root; returns `relative(projectRoot, candidate)`, which may begin `..`, for import-edge creation. |
| `src/parser/cpp.ts:877`, `resolveIncludePath` | Raw C/C++ include path | Calls `existsSync` relative to current file, root, `include/`, and `src/`; returns possibly external relative targets used by import edges. |
| `src/parser/csharp.ts:580`, `parseCsproj` | `<ProjectReference Include="...">` | Resolves against the `.csproj` directory. This path already short-circuits before `existsSync` unless a string-prefix containment check passes, but it is not the canonical `resolve + root + sep` helper used by the JVM fix and is platform-specific. |
| `src/parser/csharp.ts:650`, `resolveCSharpNamespace` | Text of a `using` namespace, converted from dots to slashes | Calls `existsSync`, `statSync`, and `readdirSync` for root and `src` candidates, returning the first `.cs` path. Grammar-valid namespaces substantially constrain exploitation, but the filesystem helper itself has no containment invariant. |
| `src/parser/php.ts:582`, `resolvePhpImport` | Namespace text from `use`, split on backslashes | Calls `existsSync` across seven source roots, including a lowercased-first-segment variant, and returns the candidate for an import edge. |
| `src/parser/php.ts:623`, `resolvePhpInclude` | Quoted path in `include`, `include_once`, `require`, or `require_once` | Calls `existsSync` relative to the current file and project root; returns a possibly `../` path used by an import edge. |
| `src/parser/javascript.ts:578`, `resolveJavaScriptImport` | Relative ESM/CommonJS specifier beginning with `.` | Calls `existsSync` on the exact path, extension candidates, and index candidates. Successful external results are converted with `substring(projectRoot.length + 1)`, which is not a containment check. |
| `src/parser/ruby.ts:585`, `resolveRubyRequire` | String passed to `require_relative`; also unrestricted parent segments in `require` search roots | Calls `existsSync` with `.rb` and extensionless candidates. Successful results use string replacement to form an edge target, so external paths can survive as absolute/parent-bearing values. |
| `src/parser/dart.ts:764`, `resolveDartImport` | Quoted `import`, `export`, or `part` path other than `package:`/`dart:` | Calls `existsSync` relative to the current file and `lib/`; string replacement can return an external target for a file-level import edge. |
| `src/parser/swift.ts:608`, `resolveSwiftImport` | Full text after `import` (including selective-import suffixes) | Derives `moduleName`, then calls `existsSync`; directory candidates also reach `statSync` and `readdirSync`. A crafted parent-bearing module reaches outside before a path is returned. |

The established `resolveWithinProject` implementation in
`src/parser/jvm-modules.ts:52` is the reusable model: canonical `resolve`, exact
root-or-`root + sep` comparison, and a recorded rejection reason. A production
fix should additionally use `realpath` for existing targets so a symlink inside
the root cannot redirect the probe outside.

## Policy options and costs

### Recommended: contained by default, explicit recorded external roots

Every filesystem candidate should be canonicalized before the first
`existsSync`, read, stat, or directory listing. Accept the project root by
default. `--allow-external-roots` should enable only roots explicitly recorded
in project configuration, for example:

```json
{
  "externalRoots": [
    { "path": "../shared", "reason": "workspace package @acme/shared" }
  ]
}
```

Resolve each configured root relative to the project root, canonicalize it,
require a non-empty reason, and report every accepted/rejected external access
in parse metadata. The flag should not mean "allow anywhere"; it should opt in
to that recorded set. This preserves a safe default and makes CI/reviews able
to explain why code outside the selected repository entered a graph.

Costs:

- one shared canonical containment helper used before all filesystem calls;
- a configuration/API/CLI surface and propagation through MCP parse options;
- `realpath`/symlink handling and platform-safe comparisons;
- cache keys that include the canonical allowed-root set;
- a stable serialization rule for external file paths (prefer a named-root
  prefix rather than host-absolute paths); and
- intentional graph-shape changes for repositories that truly import external
  source, requiring a format/release classification decision at implementation
  time.

For the five measured repositories, enforcing containment today has no graph
cost: every file/symbol/edge delta is zero.

### Alternatives

1. **Automatically trust workspace/build declarations.** Lower friction for
   monorepos split across siblings, but those declarations are attacker-
   controlled inputs, so this preserves the security problem and makes the
   trusted boundary implicit.
2. **Always reject external paths with no opt-in.** Simplest and safest, but it
   cannot represent legitimate sibling-package or generated-source layouts.
3. **Keep probing externally but drop external endpoints.** No migration cost,
   but retains information disclosure/timing probes and silently hides why an
   edge was lost; this is not recommended.
4. **Copy/clamp paths back under the root.** Changes their meaning and can bind
   to the wrong file. It violates the established rule to reject with a reason
   rather than silently fabricate a target.

## Decision required before implementation

Confirm the recommended policy and its external-path serialization. The
implementation should be a separately gated graph-shape change: add crafted
tests for every site above, record rejection reasons, measure allowed-root
opt-in graphs, and decide whether that release also requires a format-version
bump. No such implementation is included here.
