import type { Graph } from "graphology";
import path from "node:path";
import type { DeadSymbol, ConfidenceLevel, ConfidenceReasonCode } from "./types.js";

export function classifyDeadSymbols(
  symbols: DeadSymbol[],
  _graph: Graph
): DeadSymbol[] {
  return symbols.map((symbol) => {
    const { level, reasonCode } = calculateConfidence(symbol);
    const reason = generateReason(reasonCode);

    return {
      ...symbol,
      confidence: level,
      reason,
      reasonCode,
    };
  });
}

function calculateConfidence(
  symbol: DeadSymbol
): { level: ConfidenceLevel; reasonCode: ConfidenceReasonCode } {
  // LOW: type-only symbols are consumed in type position; the graph may or
  // may not capture that usage via references-type / import type edges.
  if (
    symbol.kind === "interface" ||
    symbol.kind === "type" ||
    symbol.kind === "type_alias"
  ) {
    return { level: "low", reasonCode: "type-only-symbol" };
  }

  // LOW: constructors are invoked via `new ClassName()`, which creates an
  // edge to the class node rather than the constructor method node.
  if (symbol.kind === "method" && symbol.name === "constructor") {
    return { level: "low", reasonCode: "constructor-via-class" };
  }

  // LOW: path-name heuristic, not evidence of framework invocation. A
  // conventional directory name only reduces confidence; it does not prove
  // usage, add a graph edge, or remove this symbol from the candidate set.
  if (isLikelyDynamicUsage(symbol.file)) {
    return { level: "low", reasonCode: "dynamic-dispatch" };
  }

  // MEDIUM: barrel files intentionally re-export symbols for external
  // consumers; the graph cannot see imports that use the barrel.
  if (symbol.exported && isBarrelFile(symbol.file)) {
    return { level: "medium", reasonCode: "barrel-export" };
  }

  // MEDIUM: any other exported symbol with zero dependents may be imported
  // by code outside the parsed set (tests omitted, downstream packages, etc.).
  if (symbol.exported) {
    return { level: "medium", reasonCode: "exported-no-dependents" };
  }

  // HIGH: internal-only symbol with zero dependents and none of the above
  // plausible hidden invocation paths.
  return { level: "high", reasonCode: "not-exported-zero-dependents" };
}

function generateReason(reasonCode: ConfidenceReasonCode): string {
  switch (reasonCode) {
    case "not-exported-zero-dependents":
      return "Not marked exported; zero dependents in the parsed graph";
    case "exported-no-dependents":
      return "Exported, zero dependents in the parsed graph (external consumers may exist)";
    case "barrel-export":
      return "Exported from barrel file, zero dependents (might be used externally)";
    case "type-only-symbol":
      return "Type-only symbol (might be used via import type)";
    case "constructor-via-class":
      return "Constructor (invoked via new ClassName, not this symbol)";
    case "dynamic-dispatch":
      return "Path-name heuristic: framework-style directory; invocation is unproven, so confidence is reduced";
    default:
      return "Potentially unused";
  }
}

function isBarrelFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename === "index.ts" || basename === "index.js";
}

function isLikelyDynamicUsage(filePath: string): boolean {
  return (
    filePath.includes("/routes/") ||
    filePath.includes("/pages/") ||
    filePath.includes("/middleware/") ||
    filePath.includes("/commands/") ||
    filePath.includes("/handlers/") ||
    filePath.includes("/api/")
  );
}
