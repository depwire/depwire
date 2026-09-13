# Block-scoped symbol IDs implementation report

Date: 2026-09-13  
Release class: F  
Target release: v1.20.0 (package version intentionally not bumped here)  
Comparison parser: main `80e21f0` (v1.19.0)  
Fixed source trees: code-graph `80e21f0`; drizzle `b7862528fd8fc39bc2653a6c18dad7c1f4e68d10`

## Item 0: telemetry opt-out

An opt-out already existed in `src/telemetry.ts`. `DO_NOT_TRACK=1`,
`DEPWIRE_NO_TELEMETRY=1`, or `DEPWIRE_NO_TELEMETRY=true` returns from both
`trackCommand` and `trackCloudCta` before `sendEvent`, so no `fetch` is
attempted. The behavior is fail-silent. A three-case network-boundary test and
README telemetry section were added in independent commit `01700ad`.

## G1: ID correctness

The strict population is an old-ID group with two or more distinct source
spans where every declaration is a variable. Recovery is the sum of
`distinct new IDs - 1` over those same baseline groups.

| Repository | Recon expectation | Current-main collapsed | Recovered | Remaining strict collisions | Difference from recon |
|---|---:|---:|---:|---:|---:|
| code-graph | 512 | 537 | **537** | 0 | +25 (+4.88%) |
| drizzle | 10,808 | 10,808 | **10,808** | 0 | 0 (0%) |

The stated tolerance for the moving self-repository is 5%; its +4.88% gap is
source growth between recon commit `4a15771` and current main `80e21f0`, not a
missed split. The pinned drizzle tree is unchanged and matches exactly.

The scheme is deterministic: `$bN` is the source-order index among lexical
scope nodes directly beneath the current named/block scope. Non-block
statements do not consume an index. IDs contain neither line numbers nor byte
offsets. Therefore unchanged ASTs produce identical IDs, and edits in another
file cannot affect a file's IDs. Adding/reordering a sibling lexical block can
renumber later sibling blocks; that is the structural locality tradeoff
approved in the recon.

### Seeded 20-group sample

Seed: **12009** (xorshift32); ten strict groups per repository. Each row shows
two source-distinct declarations; the final column records the complete split
count where the sampled group had more than two declarations. In compact cells,
`...::` expands exactly to the file-path portion before `::` in that row's Old
ID; the suffix following it is verbatim.

| Repo | Old ID | First declaration → new ID | Second declaration → new ID | Split IDs |
|---|---|---|---|---:|
| code-graph | `src/viz/public/arc.js::container` | L36 `const container = document.getElementById(...)` → `src/viz/public/arc.js::$b0.render.container` | L294 `const container = document.querySelector(...)` → `src/viz/public/arc.js::renderArcDiagram.container` | 2 |
| code-graph | `src/parser/swift.ts::processClassDeclaration.name` | L165 ``const name = `${extName}+ext`;`` → `src/parser/swift.ts::processClassDeclaration.$b1.name` | L195 `const name = nodeText(...)` → `src/parser/swift.ts::processClassDeclaration.name` | 2 |
| code-graph | `src/viz/public/temporal.js::progress` | L72 `const progress = x / rect.width` → `...::setupTimeline.$b2.progress` | L87 same declaration in a different callback → `...::setupTimeline.$b4.progress` | 3 |
| code-graph | `src/parser/csharp.ts::hasModifier.i` | L705 `for (let i = 0; ...)` → `...::hasModifier.$b0.i` | L714 `for (let i = 0; ...)` → `...::hasModifier.$b1.$b0.$b0.i` | 2 |
| code-graph | `test/type-reference-consumers.test.ts::graph` | L29 `const graph = buildGraph(...)` → `...::$b0.$b0.graph` | L44 `const graph = typeReferenceGraph()` → `...::$b0.$b1.graph` | 3 |
| code-graph | `src/index.ts::startTime` | L66 `const startTime = Date.now()` → `src/index.ts::$b0.startTime` | L586 same declaration in another command → `src/index.ts::$b5.startTime` | 4 |
| code-graph | `src/parser/typescript.ts::processClassDeclaration.i` | L539 `for (let i = 0; ...)` → `...::processClassDeclaration.$b0.i` | L614 `for (let i = 0; ...)` → `...::processClassDeclaration.$b1.$b0.i` | 5 |
| code-graph | `src/viz/public/temporal.js::x` | L71 `const x = Math.max(...)` → `...::setupTimeline.$b2.x` | L86 `const x = e.clientX - rect.left` → `...::setupTimeline.$b4.x` | 6 |
| code-graph | `src/docs/generator.ts::generateDocs.content` | L94 `const content = generateArchitecture(...)` → `...::generateDocs.$b0.$b4.$b0.$b0.content` | L106 `const content = generateConventions(...)` → `...::generateDocs.$b0.$b4.$b1.$b0.content` | 13 |
| code-graph | `src/viz/public/arc.js::x1` | L89 `const x1 = s.x` → `...::$b0.render.$b3.x1` | L371 `const x1 = sourcePos.x` → `...::renderArcDiagram.$b3.x1` | 2 |
| drizzle | `drizzle-kit/src/serializer/pgSerializer.ts::identityStart` | L1394 `const identityStart = columnResponse.identity_start` → `...::$b6.$b0.$b0.$b6.$b0.identityStart` | L1707 `const identityStart = viewResponse.identity_start` → `...::$b7.$b0.$b0.$b0.$b0.identityStart` | 2 |
| drizzle | `integration-tests/tests/seeder/mysql.test.ts::employees` | L294 `const employees = await db.select(...)` → `...::$b3.employees` | L312 same name in another test → `...::$b4.employees` | 6 |
| drizzle | `integration-tests/tests/pg/pg-common.ts::tests.{ id: cityId }` | L1639 `const { id: cityId } = await db` → `...::tests.$b0.$b58.{ id: cityId }` | L1666 same binding in another test → `...::tests.$b0.$b59.{ id: cityId }` | 3 |
| drizzle | `integration-tests/tests/bun/bun-sql.test.ts::sq2` | L1634 `const sq2 = db` → `...::$b64.sq2` | L5211 `const sq2 = db.$with(...)` → `...::$b173.sq2` | 5 |
| drizzle | `integration-tests/tests/singlestore/singlestore-common.ts::tests.iterator` | L4209 `let iterator = 0` → `...::tests.$b0.$b125.iterator` | L4251 `let iterator = 0` → `...::tests.$b0.$b126.iterator` | 2 |
| drizzle | `drizzle-kit/tests/libsql-checks.test.ts::from` | L62 `const from = {` → `...::$b1.from` | L113 `const from = {` → `...::$b2.from` | 4 |
| drizzle | `integration-tests/tests/singlestore/singlestore-common.ts::tests.users` | L668 `const users = await db` → `...::tests.$b0.$b8.users` | L681 same name in another test → `...::tests.$b0.$b9.users` | 33 |
| drizzle | `drizzle-kit/src/serializer/pgSerializer.ts::columnDimensions` | L1384 `const columnDimensions = columnResponse.array_dimensions` → `...::$b6.$b0.$b0.$b6.$b0.columnDimensions` | L1697 `const columnDimensions = viewResponse.array_dimensions` → `...::$b7.$b0.$b0.$b0.$b0.columnDimensions` | 2 |
| drizzle | `drizzle-kit/tests/introspect/sqlite.test.ts::sqlite` | L13 `const sqlite = new Database(...)` → `...::$b1.sqlite` | L36 same setup in another test → `...::$b2.sqlite` | 5 |
| drizzle | `drizzle-kit/src/snapshotsDiffer.ts::applyLibSQLSnapshotsDiff.deleted` | L4092 `const deleted: Record<string, string> = {}` → `...::applyLibSQLSnapshotsDiff.$b14.$b3.deleted` | L4115 same declaration in the sibling branch → `...::applyLibSQLSnapshotsDiff.$b14.$b4.deleted` | 2 |

## G2: ID stability

| Check | Files compared | IDs compared | Changed IDs in untouched files |
|---|---:|---:|---:|
| Same unchanged code-graph tree, two cold parses | 255 | 6,879 | 0 |
| Add a comment to `src/telemetry.ts`, compare every other file | 254 | 6,879 overall | 0 |

The edited file also retained the same IDs because the change added no lexical
block, but only the 254 untouched files are part of the cross-file assertion.

## G3: health movement

### code-graph

| Dimension | Main score/grade | Branch score/grade | Main raw metrics | Branch raw metrics |
|---|---|---|---|---|
| Overall | 71 / C | 71 / C | 6,353 symbols; 3,509 edges | 6,879 symbols; 3,556 edges |
| Coupling | 70 / C | 70 / C | avg 4.94; max 224; cross-dir 5.3 | avg 4.93; max 224; cross-dir 5.4 |
| Cohesion | 60 / D | 60 / D | internal 46%; dirs 36 | internal 46%; dirs 36 |
| Circular dependencies | 100 / A | 100 / A | cycles 0; per100 0 | cycles 0; per100 0 |
| God files | 60 / D | 60 / D | 12; threshold 37.3; per100 4.7 | 12; threshold 37.2; per100 4.7 |
| Orphans & dead code | 88 / B | 89 / B | orphans 4; 3.1%; dead 180; 2.8% | orphans 4; 3.1%; dead 154; 2.2% |
| Dependency depth | 40 / F | 40 / F | max depth 11 | max depth 11 |

### drizzle

| Dimension | Main score/grade | Branch score/grade | Main raw metrics | Branch raw metrics |
|---|---|---|---|---|
| Overall | 34 / F | 34 / F | 19,594 symbols; 24,095 edges | 30,479 symbols; 24,181 edges |
| Coupling | 10 / F | 10 / F | avg 15.13; max 1,409; cross-dir 23.3 | avg 15.15; max 1,418; cross-dir 23.3 |
| Cohesion | 40 / F | 40 / F | internal 11.5%; dirs 148 | internal 11.5%; dirs 148 |
| Circular dependencies | 20 / F | 20 / F | cycles 622; per100 70.3 | cycles 622; per100 70.3 |
| God files | 60 / D | 60 / D | 50; threshold 95.2; per100 5.6 | 50; threshold 95.3; per100 5.6 |
| Orphans & dead code | 62 / D | 69 / D | orphans 20; 3.2%; dead 5,241; 25.7% | orphans 20; 3.2%; dead 5,239; 16.7% |
| Dependency depth | 40 / F | 40 / F | max depth 9 | max depth 9 |

Attribution: symbol denominators rise because formerly collapsed declarations
now exist independently. Edge fan-out can also split across those nodes. That
directly changes dead-code percentages, degree aggregates, and percentile-based
god-file thresholds. No scoring normalization or invariance shim was added.

## G4: edge integrity

### code-graph

| Kind | Main | Branch | Delta |
|---|---:|---:|---:|
| calls | 1,739 | 1,781 | +42 |
| imports | 689 | 689 | 0 |
| references-type | 1,070 | 1,075 | +5 |
| references | 1 | 1 | 0 |
| inherits | 3 | 3 | 0 |
| injects | 1 | 1 | 0 |
| rest-api | 6 | 6 | 0 |
| **Total** | **3,509** | **3,556** | **+47** |

### drizzle

| Kind | Main | Branch | Delta |
|---|---:|---:|---:|
| imports | 6,122 | 6,122 | 0 |
| calls | 4,442 | 4,472 | +30 |
| references-type | 12,147 | 12,203 | +56 |
| injects | 684 | 684 | 0 |
| inherits | 700 | 700 | 0 |
| **Total** | **24,095** | **24,181** | **+86** |

No per-kind or total count decreased. Fixture assertions prove three sibling
calls in each TypeScript and JavaScript fixture target their corresponding
split declaration. The JavaScript walker also stopped its former second pass;
four duplicated/wrong source aliases in the old fixture graph now retarget to
the actual `UserService.create`/`createAdmin` method IDs rather than preserving
phantom flat-method/class call edges.

## G5: v1 graph handling

Main exported a real fixture graph with `formatVersion: 1`, 33 nodes, and 30
edges. Loading it through the branch public graph API produced:

```text
UnsupportedGraphFormatError: Cannot load v1 Depwire graph with graph format v2. Block-scoped symbol ids cannot be reconstructed from stored v1 data; reparse the source with Depwire v1.20.0 or newer.
```

`importFromJSON` and the public SDK/graph exports share this check. Query and
default MCP startup detect this error and reparse when source is available;
MCP `--from-cache` reports the actionable error. Unversioned raw `ParsedFile`
containers are not accepted because their ID scheme cannot be proven.

## G6: cache invalidation

`RESOLUTION_VERSION` is 4. The permanent test writes a valid cache row marked
version 3, reopens it through version 4, and observes `totalFiles: 0` plus
`cache_meta.resolution_version: "4"`. A pre-bump row is not reused.

## G7: build and tests

Final gate ran sequentially: `npm run build` completed successfully (both ESM
and declaration builds), then `npm test` completed with **31 test files passed,
172 tests passed, 0 failed**.

Modified assertions were not weakened:

- parser duplication now rejects duplicate IDs on any line, replacing the old
  allowance for different-line collisions;
- serialization fixtures now require v2 and permanently reject v1/unversioned
  graphs;
- the old pre-v1 `import`-to-structural-file compatibility case was replaced
  with a valid v2 `file` node because silent legacy loading is forbidden; and
- inheritance alias compatibility remains covered inside a valid v2 payload.

## G8: resolution version

Yes, `RESOLUTION_VERSION` must bump from 3 to 4 in addition to
`formatVersion: 2`. The SQLite cache stores serialized `ParsedFile` objects,
including declaration IDs and edge endpoints, before graph serialization.
Changing only `formatVersion` would leave those v1 parser results reusable and
silently mix ID schemes.

## Downstream impact (out of scope here)

- **Cloud:** require `formatVersion: 2` at ingestion/read, keep IDs opaque,
  reparse/backfill every v1 R2 `latest.json`, and mark the historical health
  methodology boundary. Without this, v1 objects either fail the new loader or
  join edges against missing/collapsed IDs.
- **VSCode:** consume the v2 CLI/parser, invalidate cached `ParsedFile[]` and
  exact-symbol selections, and refresh fixtures. File panels that split at the
  first `::` remain compatible. Without cache invalidation, exact selections
  and updates refer to stale IDs and sibling declarations remain collapsed.
- **SLM:** regenerate graph snapshots, dependency pairs, hotspots, train/
  validation JSONL, holdouts, and evaluations from one v2 parser commit.
  Without regeneration, ID-keyed joins create false negatives and mixed-v1/v2
  prompts describe different symbols as though they were identical.

## Fixtures

Added (not regenerated):

- `test/fixtures/block-scope-ids/scopes.ts` — TypeScript sibling-block and loop
  identity/call-retarget contract.
- `test/fixtures/block-scope-ids/scopes.js` — JavaScript equivalent and
  duplicate-walk regression contract.

No frozen fixture was regenerated. `dead-code-snapshot.json` is deliberately a
Graphology detector fixture loaded without ProjectGraph deserialization; its
purpose is scorer invariance on frozen data, not current parser output.

## Surprises and scope notes

- The requested `src/graph/serialization.ts` path does not exist; the mapped
  implementation is `src/graph/serializer.ts`.
- Drizzle retains 411 collapsed non-variable declarations across 193 IDs.
  These are overload/declaration-merging groups explicitly excluded from the
  strict block-scope population; variable collisions are zero.
- Fixing JavaScript block identity exposed and removed its duplicate recursive
  walk. Parser-emission totals fall by 13 on code-graph and 17 on drizzle even
  while graph symbol totals rise by 526 and 10,885 respectively.
- The external-root recon is separate in `P1-EXTERNAL-ROOTS-RECON.md`; no
  containment behavior was implemented.
