import {
  SimulationEngine,
  analyzeDeadCode,
  buildGraph,
  calculateHealthScore,
  clearCache,
  detectCrossLanguageEdges,
  generateDocs,
  getArchitectureSummary,
  getCacheStats,
  getImpact,
  parseProject,
  scanSecurity,
  searchSymbols
} from "./chunk-YE4DR6K4.js";

// src/sdk.ts
import { createRequire } from "module";

// src/parser/types.ts
function aggregateUnresolvedImports(parsedFiles) {
  const out = [];
  for (const file of parsedFiles) {
    if (file.unresolvedImports) out.push(...file.unresolvedImports);
  }
  return out;
}

// src/sdk.ts
var DepwireSDKVersion = createRequire(import.meta.url)("../package.json").version;
export {
  DepwireSDKVersion,
  SimulationEngine,
  aggregateUnresolvedImports,
  analyzeDeadCode,
  buildGraph,
  calculateHealthScore,
  clearCache,
  detectCrossLanguageEdges,
  generateDocs,
  getArchitectureSummary,
  getCacheStats,
  getImpact,
  parseProject,
  scanSecurity,
  searchSymbols
};
