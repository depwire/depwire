import type { DirectedGraph } from "graphology";
import type { DeadCodeReport, DeadCodeOptions, ConfidenceLevel } from "./types.js";
import { findDeadSymbols } from "./detector.js";
import { classifyDeadSymbols } from "./classifier.js";
import { displayDeadCodeReport } from "./display.js";
import { countGraphSymbols } from "../graph/counts.js";

export function analyzeDeadCode(
  graph: DirectedGraph,
  projectRoot: string,
  options: Partial<DeadCodeOptions> = {}
): DeadCodeReport {
  const opts: DeadCodeOptions = {
    confidence: options.confidence || "medium",
    includeTests: options.includeTests || false,
    verbose: options.verbose || false,
    stats: options.stats || false,
    json: options.json || false,
    debug: options.debug || false,
  };

  const { symbols: rawDeadSymbols } = findDeadSymbols(
    graph, 
    projectRoot, 
    opts.includeTests,
    opts.debug
  );

  const classifiedSymbols = classifyDeadSymbols(rawDeadSymbols, graph);

  const filteredSymbols = filterByConfidence(classifiedSymbols, opts.confidence);

  // ── DIAGNOSTIC INSTRUMENTATION (deadcode-diagnosis) ──
  // Stage 8 of the funnel: how many symbols survive confidence filtering.
  // Gated the same way as the detector-side funnel (findDeadSymbols logs
  // stages 1-7 to stderr already when enabled).
  if (opts.debug || process.env.DEPWIRE_DEBUG_FUNNEL === "1") {
    console.error(`  8. Survived confidence filter:  ${filteredSymbols.length} (of ${classifiedSymbols.length} classified, min confidence = "${opts.confidence}")`);
  }

  const totalSymbols = countGraphSymbols(graph);

  const byConfidence = {
    high: classifiedSymbols.filter((s) => s.confidence === "high").length,
    medium: classifiedSymbols.filter((s) => s.confidence === "medium").length,
    low: classifiedSymbols.filter((s) => s.confidence === "low").length,
  };

  const report: DeadCodeReport = {
    totalSymbols,
    deadSymbols: filteredSymbols.length,
    deadPercentage: (filteredSymbols.length / totalSymbols) * 100,
    byConfidence,
    symbols: filteredSymbols,
  };

  if (!opts.json) {
    displayDeadCodeReport(report, opts, projectRoot);
  }

  return report;
}

function filterByConfidence(
  symbols: any[],
  minConfidence: ConfidenceLevel
): any[] {
  const confidenceLevels = { high: 3, medium: 2, low: 1 };
  const minLevel = confidenceLevels[minConfidence];

  return symbols.filter(
    (s) => confidenceLevels[s.confidence as ConfidenceLevel] >= minLevel
  );
}

export { type DeadCodeReport, type DeadCodeOptions, type ConfidenceLevel } from "./types.js";
