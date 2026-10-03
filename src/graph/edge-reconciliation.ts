import type { DirectedGraph } from 'graphology';
import type { GraphEdgeDrop } from './index.js';

/** Assert conservation at the parser/builder and cross-language boundaries. */
export function assertEdgeReconciliation(graph: DirectedGraph): void {
  const parsed = graph.getAttribute('parserEdgeCount') as number;
  const parserBuilt = graph.getAttribute('parserBuiltEdgeCount') as number;
  const builderDrops = graph.getAttribute('edgeDrops') as GraphEdgeDrop[];
  const crossLanguageAttempted = graph.getAttribute('crossLanguageAttemptedEdgeCount') as number;
  const crossLanguageDrops = graph.getAttribute('crossLanguageDrops') as unknown[];

  if (!Number.isInteger(parsed) || !Number.isInteger(parserBuilt) || !Array.isArray(builderDrops)
    || !Number.isInteger(crossLanguageAttempted) || !Array.isArray(crossLanguageDrops)) {
    throw new Error('Edge reconciliation diagnostics are incomplete');
  }
  if (parsed !== parserBuilt + builderDrops.length) {
    throw new Error(`Parser edge reconciliation failed: ${parsed} parsed != ${parserBuilt} built + ${builderDrops.length} recorded drops`);
  }
  const crossLanguageBuilt = graph.size - parserBuilt;
  if (crossLanguageAttempted !== crossLanguageBuilt + crossLanguageDrops.length) {
    throw new Error(`Cross-language edge reconciliation failed: ${crossLanguageAttempted} attempted != ${crossLanguageBuilt} built + ${crossLanguageDrops.length} recorded drops`);
  }
}
