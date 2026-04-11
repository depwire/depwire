## Plan Comparison

Three plans were generated. All agree on architecture, file structure, and the critical decision to call health metric functions directly (avoiding `saveHealthHistory()` side effect). Key differences:

- **Types location**: Plan 1 suggests a separate `types.ts` file; Plans 2-3 co-locate in `engine.ts`. I'll co-locate for simplicity — this is a single-module feature.
- **Health refactor**: Plan 2 suggests extracting a pure helper in `src/health/index.ts`. Deferred — too invasive for Phase A. We'll call metrics directly.
- **Merge collision handling**: Plan 2 suggests fail-fast on symbol name collisions. Adopted.
- **CLI split/merge options**: Plans 1-2 note the spec is missing `--new-file` and `--symbols`. Adopted — add them.
- **Test runner**: Plan 1 suggests `node:test` (built-in, no deps). Adopted since no test framework exists in the project.

---

## Step 1: Create `src/simulation/engine.ts`

**New file.** Contains all types + `SimulationEngine` class.

### Types exported:
- `SimulationAction` (union of move/delete/rename/split/merge)
- `SimulationResult`, `GraphSnapshot`, `GraphDiff`, `HealthDelta`, `DimensionChange`, `BrokenImport`, `EdgeInfo`

### `SimulationEngine` class:
- **`constructor(graph: DirectedGraph)`** — stores reference to original graph (never mutated)
- **`simulate(action: SimulationAction): SimulationResult`** — creates a fresh `.copy()` of the original each call, applies action, computes diff + health delta, returns result
- **`private applyMove(clone, target, destination)`** — finds all nodes where `attrs.filePath === target`, creates new nodes with updated filePath in ID and attrs, copies all edges to/from, drops old nodes. Records broken imports for any external node that had an edge to a moved node.
- **`private applyDelete(clone, target)`** — finds all nodes with `filePath === target`, records all incoming edges as broken imports, drops nodes + edges
- **`private applyRename(clone, target, newName)`** — delegates to `applyMove(clone, target, dirname(target) + '/' + newName)`
- **`private applySplit(clone, target, newFile, symbols)`** — moves only matching symbols to new file, leaves others in place
- **`private applyMerge(clone, target, source)`** — moves all source nodes into target file. Fail-fast error if symbol name collision detected.
- **`private computeDiff(original, simulated): GraphDiff`** — normalizes edge sets as `source|target|kind` strings, computes set differences. Computes `affectedNodes` as union of all endpoints in added/removed edges. Calls `detectCycles()` on both graphs, compares.
- **`private detectCycles(graph): string[][]`** — file-level DFS cycle detection (adapted from `calculateCircularDepsScore` logic in `src/health/metrics.ts:183-267`). Returns array of canonicalized cycle paths.
- **`private computeHealthScore(graph): { score: number; dimensions: HealthDimension[] }`** — calls the 6 metric functions from `src/health/metrics.ts` directly, computes weighted sum: `Math.round(dims.reduce((s, d) => s + d.score * d.weight, 0))`. No disk I/O.

### Key constraints:
- Node IDs follow `filePath::symbolName` format — graphology doesn't allow key mutation, so move/rename = add new + copy attrs + recreate edges + drop old
- Each `simulate()` call works on a fresh clone — results are independent across calls
- Zero file I/O anywhere in the engine

---

## Step 2: Create `src/commands/whatif.ts`

**New file.** Exports `async function whatif(dir: string, options: WhatIfOptions): Promise<void>`.

Flow:
1. `findProjectRoot()` or `resolve(dir)`
2. `parseProject(projectRoot)` → `buildGraph(parsedFiles)`
3. Build `SimulationAction` from CLI options (validate required fields per action type)
4. `new SimulationEngine(graph).simulate(action)`
5. Print formatted report using `chalk` (already in dependencies)

Formatted output:
```
What If Simulation
─────────────────────────────────────
Action:     MOVE src/router.ts → src/core/router.ts
─────────────────────────────────────
Health Score:    67 → 74  (+7 ✓ improved)
Affected Nodes:  12
Broken Imports:  2
  • src/app.ts imports Router (path would break)
  • src/middleware.ts imports Router (path would break)
Circular Deps:   0 introduced, 1 resolved
Added Edges:     8
Removed Edges:   6
─────────────────────────────────────
```

Validation: each action type requires specific options — error early with clear message if missing.

---

## Step 3: Register command in `src/index.ts`

**Modify.** Add before `program.parse()` (line 556):

```typescript
import { whatif } from './commands/whatif.js';

program
  .command('whatif [dir]')
  .description('Simulate architectural changes before touching code')
  .option('--simulate <action>', 'Action: move, delete, rename, split, merge')
  .option('--target <file>', 'File to apply action to')
  .option('--destination <file>', 'Destination path (for move)')
  .option('--new-name <name>', 'New name (for rename)')
  .option('--source <file>', 'Source file (for merge)')
  .option('--new-file <file>', 'New file path (for split)')
  .option('--symbols <symbols>', 'Comma-separated symbol names (for split)')
  .action(async (dir, options) => {
    trackCommand('whatif', packageJson.version);
    await whatif(dir || '.', options);
  });
```

---

## Step 4: MCP tool stub in `src/mcp/tools.ts`

**Modify two locations:**

1. **`getToolsList()`** — append tool definition:
```typescript
{
  name: 'simulate_change',
  description: 'Simulate an architectural change and see the impact before touching code.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['move', 'delete', 'rename', 'split', 'merge'] },
      target: { type: 'string', description: 'File path to apply the action to' },
      destination: { type: 'string', description: 'Destination path for move action' },
      newName: { type: 'string', description: 'New name for rename action' },
      source: { type: 'string', description: 'Source file for merge action' },
      symbols: { type: 'array', items: { type: 'string' }, description: 'Symbols to move for split action' }
    },
    required: ['action', 'target']
  }
}
```

2. **`handleToolCall()`** — add `else if` before the final `else` block (~line 335):
```typescript
} else if (name === "simulate_change") {
  result = { status: 'coming_soon', message: 'simulate_change will be fully available in v1.0.0' };
}
```

---

## Step 5: Tests — `src/simulation/engine.test.ts`

**New file.** Uses `node:test` + `node:assert` (built-in, Node 18+). Run with `npx tsx --test src/simulation/engine.test.ts`.

Test cases:
1. **Move action** — nodes relocated, edges rewired, broken imports detected for external dependents
2. **Delete action** — all nodes removed, all incoming edges flagged as broken imports
3. **Rename action** — delegates to move correctly
4. **Health delta** — before/after scores computed, `improved` flag correct
5. **Original graph immutability** — `graph.order` and `graph.size` unchanged after any simulation
6. **Engine reusability** — two calls on same engine produce independent results

Build synthetic `DirectedGraph` fixtures directly (no parser needed):
```typescript
const graph = new DirectedGraph();
graph.addNode('src/a.ts::Foo', { name: 'Foo', kind: 'class', filePath: 'src/a.ts', ... });
graph.addNode('src/b.ts::Bar', { name: 'Bar', kind: 'function', filePath: 'src/b.ts', ... });
graph.mergeEdge('src/b.ts::Bar', 'src/a.ts::Foo', { kind: 'import' });
```

---

## Step 6: Build & Smoke Test

```bash
cd /Users/atefataya/Developer/code-graph
npm run build
node dist/index.js whatif . --simulate move --target src/commands/viz.ts --destination src/commands/core/viz.ts
node dist/index.js whatif . --simulate delete --target src/commands/whatif.ts
```

Verify: clean output, no TypeScript errors, no writes to `.depwire/health-history.json`.

---

## Verification & DoD Traceability

| Step | Targets | Verification |
|------|---------|-------------|
| 1 | `src/simulation/engine.ts` | Types compile, `SimulationEngine` instantiates |
| 2 | `src/commands/whatif.ts` | CLI prints formatted output |
| 3 | `src/index.ts` | `depwire whatif --help` shows all options |
| 4 | `src/mcp/tools.ts` | `simulate_change` appears in tool list, returns coming_soon |
| 5 | `src/simulation/engine.test.ts` | All 6 test cases pass |
| 6 | Build + smoke test | `npm run build` succeeds, CLI output valid |
| DoD | All | Original graph never mutated, no disk writes during simulation, health delta correct |
