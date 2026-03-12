import type { Graph } from "graphology";
import path from "node:path";
import type { DeadSymbol, ConfidenceLevel } from "./types.js";

export function classifyDeadSymbols(
  symbols: DeadSymbol[],
  graph: Graph
): DeadSymbol[] {
  return symbols.map((symbol) => {
    const confidence = calculateConfidence(symbol, graph);
    const reason = generateReason(symbol, confidence);

    return {
      ...symbol,
      confidence,
      reason,
    };
  });
}

function calculateConfidence(
  symbol: DeadSymbol,
  graph: Graph
): ConfidenceLevel {
  if (!symbol.exported && symbol.dependents === 0) {
    return "high";
  }

  if (symbol.exported && symbol.dependents === 0 && !isBarrelFile(symbol.file)) {
    return "high";
  }

  if (symbol.exported && symbol.dependents === 0 && isBarrelFile(symbol.file)) {
    return "medium";
  }

  const dependents = getSymbolDependents(symbol, graph);
  if (dependents.length === 1 && isTestFile(dependents[0])) {
    return "medium";
  }

  if (symbol.exported && isPackageEntryPoint(symbol.file)) {
    return "low";
  }

  if (
    (symbol.kind === "interface" || symbol.kind === "type") &&
    symbol.dependents === 0
  ) {
    return "low";
  }

  if (isLikelyDynamicUsage(symbol)) {
    return "low";
  }

  return "medium";
}

function generateReason(symbol: DeadSymbol, confidence: ConfidenceLevel): string {
  if (!symbol.exported && symbol.dependents === 0) {
    return "Not exported, zero references";
  }

  if (symbol.exported && symbol.dependents === 0 && !isBarrelFile(symbol.file)) {
    return "Exported, zero dependents";
  }

  if (symbol.exported && symbol.dependents === 0 && isBarrelFile(symbol.file)) {
    return "Exported from barrel file, zero dependents (might be used externally)";
  }

  if (confidence === "medium") {
    return "Low usage, might be dead";
  }

  if (confidence === "low") {
    if (symbol.kind === "interface" || symbol.kind === "type") {
      return "Type with zero dependents (might be used via import type)";
    }
    if (isPackageEntryPoint(symbol.file)) {
      return "Exported from package entry point (might be public API)";
    }
    if (isLikelyDynamicUsage(symbol)) {
      return "In dynamic-use pattern directory (might be auto-loaded)";
    }
  }

  return "Potentially unused";
}

function isBarrelFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename === "index.ts" || basename === "index.js";
}

function isTestFile(filePath: string): boolean {
  return (
    filePath.includes("__tests__/") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/")
  );
}

function isPackageEntryPoint(filePath: string): boolean {
  return (
    filePath.includes("/src/index.") ||
    filePath.includes("/lib/index.") ||
    filePath.endsWith("/index.ts") ||
    filePath.endsWith("/index.js")
  );
}

function isLikelyDynamicUsage(symbol: DeadSymbol): boolean {
  const filePath = symbol.file;
  return (
    filePath.includes("/routes/") ||
    filePath.includes("/pages/") ||
    filePath.includes("/middleware/") ||
    filePath.includes("/commands/") ||
    filePath.includes("/handlers/") ||
    filePath.includes("/api/")
  );
}

function getSymbolDependents(symbol: DeadSymbol, graph: Graph): string[] {
  const dependents: string[] = [];

  for (const node of graph.nodes()) {
    const attrs = graph.getNodeAttributes(node);
    if (attrs.file === symbol.file && attrs.name === symbol.name) {
      const inNeighbors = graph.inNeighbors(node);
      for (const neighbor of inNeighbors) {
        const neighborAttrs = graph.getNodeAttributes(neighbor);
        if (neighborAttrs.file) {
          dependents.push(neighborAttrs.file);
        }
      }
      break;
    }
  }

  return dependents;
}
