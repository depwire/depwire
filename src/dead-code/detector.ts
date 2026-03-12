import type { Graph } from "graphology";
import path from "node:path";
import type { DeadSymbol, ExclusionContext } from "./types.js";

export function findDeadSymbols(
  graph: Graph,
  projectRoot: string,
  includeTests = false
): DeadSymbol[] {
  const deadSymbols: DeadSymbol[] = [];
  const context: ExclusionContext = { graph, projectRoot };

  for (const node of graph.nodes()) {
    const attrs = graph.getNodeAttributes(node);

    if (!attrs.file || !attrs.name) continue;

    const inDegree = graph.inDegree(node);

    if (inDegree === 0) {
      if (shouldExclude(attrs, context, includeTests)) {
        continue;
      }

      deadSymbols.push({
        name: attrs.name,
        kind: attrs.kind || "unknown",
        file: attrs.file,
        line: attrs.startLine || 0,
        exported: attrs.exported || false,
        dependents: 0,
        confidence: "high",
        reason: "Zero dependents",
      });
    }
  }

  return deadSymbols;
}

function shouldExclude(
  attrs: any,
  context: ExclusionContext,
  includeTests: boolean
): boolean {
  const filePath = attrs.file;
  const relativePath = path.relative(context.projectRoot, filePath);

  if (!includeTests && isTestFile(relativePath)) {
    return true;
  }

  if (isEntryPoint(relativePath)) {
    return true;
  }

  if (isConfigFile(relativePath)) {
    return true;
  }

  if (isTypeDeclarationFile(relativePath)) {
    return true;
  }

  if (attrs.kind === "default") {
    return true;
  }

  if (isFrameworkAutoLoadedFile(relativePath)) {
    return true;
  }

  return false;
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

function isEntryPoint(filePath: string): boolean {
  const basename = path.basename(filePath);
  return (
    basename === "index.ts" ||
    basename === "index.js" ||
    basename === "main.ts" ||
    basename === "main.js" ||
    basename === "app.ts" ||
    basename === "app.js" ||
    basename === "server.ts" ||
    basename === "server.js"
  );
}

function isConfigFile(filePath: string): boolean {
  return (
    filePath.includes(".config.") ||
    filePath.includes("config/") ||
    filePath.includes("vite.config") ||
    filePath.includes("rollup.config") ||
    filePath.includes("webpack.config")
  );
}

function isTypeDeclarationFile(filePath: string): boolean {
  return filePath.endsWith(".d.ts");
}

function isFrameworkAutoLoadedFile(filePath: string): boolean {
  return (
    filePath.includes("/pages/") ||
    filePath.includes("/routes/") ||
    filePath.includes("/middleware/") ||
    filePath.includes("/commands/") ||
    filePath.includes("/api/") ||
    filePath.includes("/app/")
  );
}
