import type { DirectedGraph } from 'graphology';
import { exportToJSON, importFromJSON } from './graph/serializer.js';
import type { ProjectGraph } from './parser/types.js';

/** A graphology dependency graph produced or consumed by Depwire. */
export type DepwireGraph = DirectedGraph;

/** Restore an in-memory Depwire graph from its JSON-safe representation. */
export function deserializeGraph(json: ProjectGraph): DepwireGraph {
  return importFromJSON(json);
}

/** Convert an in-memory Depwire graph to its JSON-safe representation. */
export function serializeGraph(
  graph: DepwireGraph,
  projectRoot = '',
): ProjectGraph {
  return exportToJSON(graph, projectRoot);
}

export {
  findSymbols,
  getFileSummary,
  getAffectedFiles,
  getImpact,
  searchSymbols,
  getArchitectureSummary,
  getDependencies,
  getDependents,
} from './graph/queries.js';

export { countGraphSymbols, isCountableSymbol } from './graph/counts.js';

export { SimulationEngine } from './simulation/engine.js';

export {
  calculateCouplingScore,
  calculateCohesionScore,
  calculateCircularDepsScore,
  calculateGodFilesScore,
  calculateOrphansScore,
  calculateDepthScore,
  scoreToGrade,
} from './health/metrics.js';
