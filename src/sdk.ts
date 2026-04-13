/**
 * depwire-cli SDK — Public API Surface
 *
 * This is the ONLY file the cloud (Railway parser) should import from.
 * Never import from internal paths like depwire-cli/dist/graph/index.js.
 *
 * Rule: if the cloud needs something not exported here, add it here —
 * do not reach into internal paths.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

/** Current SDK version — matches depwire-cli npm version */
export const DepwireSDKVersion: string = packageJson.version;

/** Parse a codebase directory and return raw parsed data */
export { parseProject } from './parser/index.js';

/** Build a graphology DirectedGraph from parsed data */
export { buildGraph } from './graph/index.js';

/** Calculate 0-100 architecture health score from a graph */
export { calculateHealthScore } from './health/index.js';

/** Detect unused symbols with High/Medium/Low confidence */
export { analyzeDeadCode } from './dead-code/index.js';

/** Generate the architecture documents for a codebase */
export { generateDocs } from './docs/index.js';

/** Search for symbols by name across the graph (partial matching) */
export { searchSymbols } from './graph/queries.js';

/** Get impact analysis for a symbol — direct dependents, transitive dependents, affected files */
export { getImpact } from './graph/queries.js';

/** Get high-level architecture summary — file count, symbol count, most connected files */
export { getArchitectureSummary } from './graph/queries.js';

/** Simulation engine — simulate a move/delete/rename/split/merge before touching code */
export { SimulationEngine } from './simulation/engine.js';

/** Simulation types used by SimulationEngine */
export type {
  SimulationAction,
  SimulationResult,
  GraphDiff,
  HealthDelta,
  BrokenImport,
} from './simulation/engine.js';

// Note: handleToolCall and getToolsList are excluded — MCP tools are
// consumed via stdio protocol, not direct function calls, in the cloud.

/**
 * Scan a codebase for security vulnerabilities.
 * Deterministic checks + graph-aware severity elevation.
 * No API key required. Use in CI pipelines and custom tooling.
 *
 * @param projectRoot - Absolute path to project root
 * @param graph - Built graph from buildGraph()
 * @param options - Scan options (target file, classes, format)
 */
export { scanSecurity } from './security/scanner.js';
export type {
  SecurityFinding,
  SecurityScanResult,
  SecurityScanOptions,
  Severity,
  VulnerabilityClass
} from './security/types.js';

/**
 * Detect cross-language edges (REST API calls, subprocess invocations)
 * between files written in different languages.
 * Called automatically during buildGraph — exposed here for custom pipelines.
 */
export { detectCrossLanguageEdges } from './cross-language/index.js';
export type { CrossLanguageEdge, CrossLanguageDetectionResult } from './cross-language/types.js';
