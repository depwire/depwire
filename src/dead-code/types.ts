import type { DirectedGraph } from "graphology";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DeadSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
  exported: boolean;
  dependents: number;
  confidence: ConfidenceLevel;
  reason: string;
}

export interface DeadCodeReport {
  totalSymbols: number;
  deadSymbols: number;
  deadPercentage: number;
  byConfidence: {
    high: number;
    medium: number;
    low: number;
  };
  symbols: DeadSymbol[];
}

export interface DeadCodeOptions {
  confidence: ConfidenceLevel;
  includeTests: boolean;
  verbose: boolean;
  stats: boolean;
  json: boolean;
  debug: boolean;
}

export interface ExclusionContext {
  graph: DirectedGraph;
  projectRoot: string;
}

export interface ExclusionStats {
  total: number;
  excludedByTestFile: number;
  excludedByEntryPoint: number;
  excludedByConfigFile: number;
  excludedByTypeDeclaration: number;
  excludedByDefaultExport: number;
  excludedByFrameworkDir: number;
}
