import { compareCyclicGroups, DIMENSIONS_VERSION, type CyclicGroupChanges } from '../graph/cyclic-groups.js';
import { canonicalPath as normalizePath } from '../graph/paths.js';
import { DirectedGraph } from 'graphology';
import { dirname, join } from 'path';
import {
  calculateCouplingScore,
  calculateCohesionScore,
  calculateCyclicGroupsScore,
  calculateGodFilesScore,
  calculateOrphansScore,
  calculateDepthScore,
} from '../health/metrics.js';
import type { HealthDimension } from '../health/types.js';

// ── Types ──────────────────────────────────────────────────────────

export type SimulationAction =
  | { type: 'move'; target: string; destination: string }
  | { type: 'delete'; target: string }
  | { type: 'rename'; target: string; newName: string }
  | { type: 'split'; target: string; newFile: string; symbols: string[] }
  | { type: 'merge'; target: string; source: string };

export interface SimulationResult {
  action: SimulationAction;
  originalGraph: GraphSnapshot;
  simulatedGraph: GraphSnapshot;
  diff: GraphDiff;
  healthDelta: HealthDelta;
  /** The cloned graph with the simulation applied — available for viz data generation */
  simulatedGraphInstance?: DirectedGraph;
}

export interface GraphSnapshot {
  nodeCount: number;
  edgeCount: number;
  healthScore: number;
}

export interface GraphDiff {
  addedEdges: EdgeInfo[];
  removedEdges: EdgeInfo[];
  affectedNodes: string[];
  brokenImports: BrokenImport[];
  cyclicGroupChanges: CyclicGroupChanges;
}

export interface HealthDelta {
  dimensions_v: string;
  before: number;
  after: number;
  delta: number;
  improved: boolean;
  dimensionChanges: DimensionChange[];
}

export interface DimensionChange {
  name: string;
  before: number;
  after: number;
  delta: number;
  /**
   * Present only on dimensions whose simulation-time computation is known
   * to differ from the real per-repo score shown elsewhere (e.g. the
   * Health tab). Currently only 'Orphans & Dead Code' (#11): simulate_change
   * has no filesystem access, so it can't apply test/framework/entry-point
   * exclusions and deliberately scopes to architecture-level symbols
   * (excludes class methods/properties). Measured gap: 15-19 points on
   * real repos. This is a documented, by-design difference, not a bug --
   * see calculateOrphansScore in src/health/metrics.ts.
   */
  note?: string;
}

const ORPHANS_DIMENSION_NAME = 'Orphans & Dead Code';
const ORPHANS_SIMULATION_NOTE =
  "Computed without filesystem access: excludes test/framework/entry-point " +
  "file exclusions and class methods/properties that the repo's real Health " +
  "score (Health tab) accounts for. Expect this component -- and the overall " +
  "before/after scores -- to differ from the repo's actual score by design; " +
  "compare only the before/after delta shown here, not the absolute values " +
  "against the Health tab.";

export interface BrokenImport {
  file: string;
  importedSymbol: string;
  reason: string;
}

export interface EdgeInfo {
  source: string;
  target: string;
  kind?: string;
}

// ── SimulationEngine ───────────────────────────────────────────────

// Normalize file paths: strip ./ prefix, trailing slashes


function fileMatch(nodeFilePath: string, target: string): boolean {
  const a = normalizePath(nodeFilePath);
  const b = normalizePath(target);
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
}

export class SimulationEngine {
  private readonly original: DirectedGraph;

  constructor(graph: DirectedGraph) {
    this.original = graph;
  }

  simulate(action: SimulationAction): SimulationResult {
    action = { ...action };
    for (const key of ['target', 'destination', 'source', 'newFile'] as const) {
      if (key in action) {
        const paths = action as unknown as Record<string, string>;
        paths[key] = normalizePath(paths[key], this.original.getAttribute('projectRoot'));
      }
    }
    const clone = this.original.copy();

    const brokenImports: BrokenImport[] = [];

    switch (action.type) {
      case 'move':
        this.applyMove(clone, action.target, action.destination, brokenImports);
        break;
      case 'delete':
        this.applyDelete(clone, action.target, brokenImports);
        break;
      case 'rename':
        this.applyRename(clone, action.target, action.newName, brokenImports);
        break;
      case 'split':
        this.applySplit(clone, action.target, action.newFile, action.symbols, brokenImports);
        break;
      case 'merge':
        this.applyMerge(clone, action.target, action.source, brokenImports);
        break;
    }

    const renames: Record<string,string> = {};
    if (action.type === 'move' || action.type === 'rename') {
      const destination = action.type === 'move' ? action.destination : normalizePath(join(dirname(action.target), action.newName));
      this.original.forEachNode((_id, attrs) => {if (fileMatch(attrs.filePath, action.target)) renames[attrs.filePath] = destination;});
    }
    const diff = this.computeDiff(this.original, clone, brokenImports, renames);
    const beforeHealth = this.computeHealthScore(this.original);
    const afterHealth = this.computeHealthScore(clone);

    const dimensionChanges: DimensionChange[] = beforeHealth.dimensions.map((bd, i) => {
      const ad = afterHealth.dimensions[i];
      return {
        name: bd.name,
        before: bd.score,
        after: ad ? ad.score : bd.score,
        delta: (ad ? ad.score : bd.score) - bd.score,
        note: bd.name === ORPHANS_DIMENSION_NAME ? ORPHANS_SIMULATION_NOTE : undefined,
      };
    });

    const healthDelta: HealthDelta = {
      dimensions_v: DIMENSIONS_VERSION,
      before: beforeHealth.score,
      after: afterHealth.score,
      delta: afterHealth.score - beforeHealth.score,
      improved: afterHealth.score > beforeHealth.score,
      dimensionChanges,
    };

    return {
      action,
      originalGraph: {
        nodeCount: this.original.order,
        edgeCount: this.original.size,
        healthScore: beforeHealth.score,
      },
      simulatedGraph: {
        nodeCount: clone.order,
        edgeCount: clone.size,
        healthScore: afterHealth.score,
      },
      diff,
      healthDelta,
      simulatedGraphInstance: clone,
    };
  }

  // ── Action implementations ─────────────────────────────────────

  private applyMove(
    clone: DirectedGraph,
    target: string,
    destination: string,
    brokenImports: BrokenImport[]
  ): void {
    const normalizedTarget = normalizePath(target);
    const normalizedDest = normalizePath(destination);
    const nodesToMove = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, target)
    );

    if (nodesToMove.length === 0) return;

    for (const oldId of nodesToMove) {
      const attrs = clone.getNodeAttributes(oldId);
      const symbolName = oldId.includes('::') ? oldId.split('::').slice(1).join('::') : attrs.name;
      const newId = `${normalizedDest}::${symbolName}`;

      // Record broken imports: external nodes that depend on the moved node
      clone.forEachInEdge(oldId, (edge, edgeAttrs, source) => {
        const sourceAttrs = clone.getNodeAttributes(source);
        if (!fileMatch(sourceAttrs.filePath, target)) {
          brokenImports.push({
            file: sourceAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${target} (path would break)`,
          });
        }
      });

      // Add new node
      if (!clone.hasNode(newId)) {
        clone.addNode(newId, { ...attrs, filePath: normalizedDest });
      }

      // Rewire edges
      clone.forEachInEdge(oldId, (edge, edgeAttrs, source) => {
        const newSource = nodesToMove.includes(source)
          ? `${normalizedDest}::${source.includes('::') ? source.split('::').slice(1).join('::') : clone.getNodeAttributes(source).name}`
          : source;
        if (clone.hasNode(newSource) && clone.hasNode(newId)) {
          clone.mergeEdge(newSource, newId, edgeAttrs);
        }
      });

      clone.forEachOutEdge(oldId, (edge, edgeAttrs, _source, outTarget) => {
        const newTarget = nodesToMove.includes(outTarget)
          ? `${normalizedDest}::${outTarget.includes('::') ? outTarget.split('::').slice(1).join('::') : clone.getNodeAttributes(outTarget).name}`
          : outTarget;
        if (clone.hasNode(newId) && clone.hasNode(newTarget)) {
          clone.mergeEdge(newId, newTarget, edgeAttrs);
        }
      });

      // Drop old node (and all its edges)
      clone.dropNode(oldId);
    }
  }

  private applyDelete(
    clone: DirectedGraph,
    target: string,
    brokenImports: BrokenImport[]
  ): void {
    const nodesToDelete = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, target)
    );

    // Record broken imports before deleting
    for (const nodeId of nodesToDelete) {
      const attrs = clone.getNodeAttributes(nodeId);
      clone.forEachInEdge(nodeId, (_edge, _edgeAttrs, source) => {
        const sourceAttrs = clone.getNodeAttributes(source);
        if (!fileMatch(sourceAttrs.filePath, target)) {
          brokenImports.push({
            file: sourceAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${target} (file deleted)`,
          });
        }
      });
    }

    // Drop all nodes (edges removed automatically)
    for (const nodeId of nodesToDelete) {
      clone.dropNode(nodeId);
    }
  }

  private applyRename(
    clone: DirectedGraph,
    target: string,
    newName: string,
    brokenImports: BrokenImport[]
  ): void {
    const destination = join(dirname(target), newName);
    this.applyMove(clone, target, destination, brokenImports);
  }

  private applySplit(
    clone: DirectedGraph,
    target: string,
    newFile: string,
    symbols: string[],
    brokenImports: BrokenImport[]
  ): void {
    const normalizedNewFile = normalizePath(newFile);
    const nodesToSplit = clone.filterNodes((_node, attrs) => {
      return fileMatch(attrs.filePath, target) && symbols.includes(attrs.name);
    });

    if (nodesToSplit.length === 0) return;

    for (const oldId of nodesToSplit) {
      const attrs = clone.getNodeAttributes(oldId);
      const symbolName = oldId.includes('::') ? oldId.split('::').slice(1).join('::') : attrs.name;
      const newId = `${normalizedNewFile}::${symbolName}`;

      // Record broken imports for external dependents
      clone.forEachInEdge(oldId, (_edge, _edgeAttrs, source) => {
        const sourceAttrs = clone.getNodeAttributes(source);
        if (!fileMatch(sourceAttrs.filePath, target) && !fileMatch(sourceAttrs.filePath, newFile)) {
          brokenImports.push({
            file: sourceAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${target} (symbol moved to ${newFile})`,
          });
        }
      });

      // Add new node
      if (!clone.hasNode(newId)) {
        clone.addNode(newId, { ...attrs, filePath: normalizedNewFile });
      }

      // Rewire edges
      clone.forEachInEdge(oldId, (_edge, edgeAttrs, source) => {
        if (clone.hasNode(source) && clone.hasNode(newId)) {
          clone.mergeEdge(source, newId, edgeAttrs);
        }
      });

      clone.forEachOutEdge(oldId, (_edge, edgeAttrs, _source, outTarget) => {
        if (clone.hasNode(newId) && clone.hasNode(outTarget)) {
          clone.mergeEdge(newId, outTarget, edgeAttrs);
        }
      });

      clone.dropNode(oldId);
    }
  }

  private applyMerge(
    clone: DirectedGraph,
    target: string,
    source: string,
    brokenImports: BrokenImport[]
  ): void {
    const normalizedTarget = normalizePath(target);
    const sourceNodes = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, source)
    );
    const targetNodes = clone.filterNodes(
      (_node, attrs) => fileMatch(attrs.filePath, target)
    );

    // Check for symbol name collisions
    const targetSymbols = new Set(
      targetNodes.map((n) => clone.getNodeAttributes(n).name)
    );
    for (const nodeId of sourceNodes) {
      const name = clone.getNodeAttributes(nodeId).name;
      if (name !== '__file__' && targetSymbols.has(name)) {
        throw new Error(
          `Merge conflict: symbol "${name}" exists in both ${target} and ${source}`
        );
      }
    }

    // Move source nodes into target file
    for (const oldId of sourceNodes) {
      const attrs = clone.getNodeAttributes(oldId);
      const symbolName = oldId.includes('::') ? oldId.split('::').slice(1).join('::') : attrs.name;
      const newId = `${normalizedTarget}::${symbolName}`;

      // Record broken imports for external dependents
      clone.forEachInEdge(oldId, (_edge, _edgeAttrs, inSource) => {
        const srcAttrs = clone.getNodeAttributes(inSource);
        if (!fileMatch(srcAttrs.filePath, source) && !fileMatch(srcAttrs.filePath, target)) {
          brokenImports.push({
            file: srcAttrs.filePath,
            importedSymbol: attrs.name,
            reason: `imports ${attrs.name} from ${source} (merged into ${target})`,
          });
        }
      });

      if (!clone.hasNode(newId)) {
        clone.addNode(newId, { ...attrs, filePath: normalizedTarget });
      }

      // Rewire edges
      clone.forEachInEdge(oldId, (_edge, edgeAttrs, inSource) => {
        const resolvedSource = sourceNodes.includes(inSource)
          ? `${normalizedTarget}::${inSource.includes('::') ? inSource.split('::').slice(1).join('::') : clone.getNodeAttributes(inSource).name}`
          : inSource;
        if (clone.hasNode(resolvedSource) && clone.hasNode(newId)) {
          clone.mergeEdge(resolvedSource, newId, edgeAttrs);
        }
      });

      clone.forEachOutEdge(oldId, (_edge, edgeAttrs, _s, outTarget) => {
        const resolvedTarget = sourceNodes.includes(outTarget)
          ? `${normalizedTarget}::${outTarget.includes('::') ? outTarget.split('::').slice(1).join('::') : clone.getNodeAttributes(outTarget).name}`
          : outTarget;
        if (clone.hasNode(newId) && clone.hasNode(resolvedTarget)) {
          clone.mergeEdge(newId, resolvedTarget, edgeAttrs);
        }
      });

      clone.dropNode(oldId);
    }
  }

  // ── Diff computation ───────────────────────────────────────────

  private computeDiff(
    original: DirectedGraph,
    simulated: DirectedGraph,
    brokenImports: BrokenImport[],
    renames: Record<string,string>
  ): GraphDiff {
    const originalEdges = this.collectEdges(original);
    const simulatedEdges = this.collectEdges(simulated);

    const originalKeys = new Set(originalEdges.map((e) => this.edgeKey(e)));
    const simulatedKeys = new Set(simulatedEdges.map((e) => this.edgeKey(e)));

    const addedEdges = simulatedEdges.filter((e) => !originalKeys.has(this.edgeKey(e)));
    const removedEdges = originalEdges.filter((e) => !simulatedKeys.has(this.edgeKey(e)));

    const affectedNodeSet = new Set<string>();
    for (const e of [...addedEdges, ...removedEdges]) {
      affectedNodeSet.add(e.source);
      affectedNodeSet.add(e.target);
    }

    return {
      addedEdges,
      removedEdges,
      affectedNodes: Array.from(affectedNodeSet),
      brokenImports,
      cyclicGroupChanges: compareCyclicGroups(original, simulated, {renames}),
    };
  }

  private collectEdges(graph: DirectedGraph): EdgeInfo[] {
    const edges: EdgeInfo[] = [];
    graph.forEachEdge((_edge, attrs, source, target) => {
      edges.push({ source, target, kind: attrs.kind });
    });
    return edges;
  }

  private edgeKey(e: EdgeInfo): string {
    return `${e.source}|${e.target}|${e.kind || ''}`;
  }

  // ── Health score (side-effect free) ────────────────────────────

  private computeHealthScore(graph: DirectedGraph): { score: number; dimensions: HealthDimension[] } {
    const dimensions = [
      calculateCouplingScore(graph),
      calculateCohesionScore(graph),
      calculateCyclicGroupsScore(graph),
      calculateGodFilesScore(graph),
      calculateOrphansScore(graph),
      calculateDepthScore(graph),
    ];

    const score = Math.round(
      dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0)
    );

    return { score, dimensions };
  }
}
