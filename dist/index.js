#!/usr/bin/env node
import {
  buildGraph,
  createEmptyState,
  getArchitectureSummary,
  getImpact,
  parseProject,
  prepareVizData,
  searchSymbols,
  startMcpServer,
  updateFileInGraph,
  watchProject
} from "./chunk-G7DOBD4A.js";

// src/index.ts
import { Command } from "commander";
import { resolve } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";

// src/graph/serializer.ts
import { DirectedGraph } from "graphology";
function exportToJSON(graph, projectRoot) {
  const nodes = [];
  const edges = [];
  const fileSet = /* @__PURE__ */ new Set();
  graph.forEachNode((nodeId, attrs) => {
    nodes.push({
      id: nodeId,
      name: attrs.name,
      kind: attrs.kind,
      filePath: attrs.filePath,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      exported: attrs.exported,
      scope: attrs.scope
    });
    fileSet.add(attrs.filePath);
  });
  graph.forEachEdge((edge, attrs, source, target) => {
    edges.push({
      source,
      target,
      kind: attrs.kind,
      filePath: attrs.filePath,
      line: attrs.line
    });
  });
  return {
    projectRoot,
    files: Array.from(fileSet).sort(),
    nodes,
    edges,
    metadata: {
      parsedAt: (/* @__PURE__ */ new Date()).toISOString(),
      fileCount: fileSet.size,
      nodeCount: nodes.length,
      edgeCount: edges.length
    }
  };
}
function importFromJSON(json) {
  const graph = new DirectedGraph();
  for (const node of json.nodes) {
    graph.addNode(node.id, {
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      exported: node.exported,
      scope: node.scope
    });
  }
  for (const edge of json.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        filePath: edge.filePath,
        line: edge.line
      });
    }
  }
  return graph;
}

// src/viz/server.ts
import express from "express";
import open from "open";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { WebSocketServer } from "ws";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
function startVizServer(initialVizData, graph, projectRoot, port = 3333, shouldOpen = true) {
  const app = express();
  let vizData = initialVizData;
  const publicDir = join(__dirname, "viz", "public");
  app.use(express.static(publicDir));
  app.get("/api/graph", (req, res) => {
    res.json(vizData);
  });
  const server = app.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`
CodeGraph visualization running at ${url}`);
    console.log("Press Ctrl+C to stop\n");
    if (shouldOpen) {
      open(url);
    }
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    console.log("Browser connected to WebSocket");
    ws.on("close", () => {
      console.log("Browser disconnected from WebSocket");
    });
  });
  function broadcastRefresh() {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "refresh" }));
      }
    });
  }
  console.log("Starting file watcher...");
  const watcher = watchProject(projectRoot, {
    onFileChanged: async (filePath) => {
      console.log(`File changed: ${filePath} \u2014 re-parsing project...`);
      try {
        const parsedFiles = parseProject(projectRoot);
        const newGraph = buildGraph(parsedFiles);
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        vizData = prepareVizData(graph, projectRoot);
        broadcastRefresh();
        console.log(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to update graph for ${filePath}:`, error);
      }
    },
    onFileAdded: async (filePath) => {
      console.log(`File added: ${filePath} \u2014 re-parsing project...`);
      try {
        const parsedFiles = parseProject(projectRoot);
        const newGraph = buildGraph(parsedFiles);
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        vizData = prepareVizData(graph, projectRoot);
        broadcastRefresh();
        console.log(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to update graph for ${filePath}:`, error);
      }
    },
    onFileDeleted: (filePath) => {
      console.log(`File deleted: ${filePath} \u2014 re-parsing project...`);
      try {
        const parsedFiles = parseProject(projectRoot);
        const newGraph = buildGraph(parsedFiles);
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        vizData = prepareVizData(graph, projectRoot);
        broadcastRefresh();
        console.log(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to remove ${filePath} from graph:`, error);
      }
    }
  });
  process.on("SIGINT", () => {
    console.log("\nShutting down visualization server...");
    watcher.close();
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  });
  return server;
}

// src/index.ts
var program = new Command();
program.name("codegraph").description("Code cross-reference graph builder for TypeScript projects").version("0.1.0");
program.command("parse").description("Parse a TypeScript project and build dependency graph").argument("<directory>", "Project directory to parse").option("-o, --output <path>", "Output JSON file path", "codegraph-output.json").option("--pretty", "Pretty-print JSON output").option("--stats", "Print summary statistics").action(async (directory, options) => {
  const startTime = Date.now();
  try {
    const projectRoot = resolve(directory);
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = parseProject(projectRoot);
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles);
    const projectGraph = exportToJSON(graph, projectRoot);
    const json = options.pretty ? JSON.stringify(projectGraph, null, 2) : JSON.stringify(projectGraph);
    writeFileSync(options.output, json, "utf-8");
    console.log(`Graph exported to: ${options.output}`);
    if (options.stats) {
      const elapsed = Date.now() - startTime;
      const summary = getArchitectureSummary(graph);
      console.log("\n=== Project Statistics ===");
      console.log(`Files: ${summary.fileCount}`);
      console.log(`Symbols: ${summary.symbolCount}`);
      console.log(`Edges: ${summary.edgeCount}`);
      console.log(`Time: ${elapsed}ms`);
      if (summary.mostConnectedFiles.length > 0) {
        console.log("\nMost Connected Files:");
        for (const file of summary.mostConnectedFiles.slice(0, 5)) {
          console.log(`  ${file.filePath} (${file.connections} connections)`);
        }
      }
      if (summary.orphanFiles.length > 0) {
        console.log(`
Orphan Files (no cross-references): ${summary.orphanFiles.length}`);
      }
    }
  } catch (err) {
    console.error("Error parsing project:", err);
    process.exit(1);
  }
});
program.command("query").description("Query impact analysis for a symbol").argument("<directory>", "Project directory").argument("<symbol-name>", "Symbol name to query").action(async (directory, symbolName) => {
  try {
    const projectRoot = resolve(directory);
    const cacheFile = "codegraph-output.json";
    let graph;
    if (existsSync(cacheFile)) {
      console.log("Loading from cache...");
      const json = JSON.parse(readFileSync(cacheFile, "utf-8"));
      graph = importFromJSON(json);
    } else {
      console.log("Parsing project...");
      const parsedFiles = parseProject(projectRoot);
      graph = buildGraph(parsedFiles);
    }
    const matches = searchSymbols(graph, symbolName);
    if (matches.length === 0) {
      console.log(`No symbols found matching: ${symbolName}`);
      return;
    }
    if (matches.length > 1) {
      console.log(`Found ${matches.length} symbols matching "${symbolName}":`);
      for (const match of matches) {
        console.log(`  - ${match.name} (${match.kind}) in ${match.filePath}:${match.startLine}`);
      }
      console.log("\nShowing impact for all matches...\n");
    }
    for (const match of matches) {
      console.log(`=== Impact Analysis: ${match.name} (${match.kind}) ===`);
      console.log(`Location: ${match.filePath}:${match.startLine}-${match.endLine}`);
      const impact = getImpact(graph, match.id);
      console.log(`
Direct Dependents: ${impact.directDependents.length}`);
      for (const dep of impact.directDependents) {
        console.log(`  - ${dep.name} (${dep.kind}) in ${dep.filePath}:${dep.startLine}`);
      }
      console.log(`
Total Transitive Dependents: ${impact.transitiveDependents.length}`);
      console.log(`Affected Files: ${impact.affectedFiles.length}`);
      for (const file of impact.affectedFiles) {
        console.log(`  - ${file}`);
      }
      console.log("");
    }
  } catch (err) {
    console.error("Error querying symbol:", err);
    process.exit(1);
  }
});
program.command("viz").description("Launch interactive arc diagram visualization").argument("<directory>", "Project directory to visualize").option("-p, --port <number>", "Server port", "3333").option("--no-open", "Don't auto-open browser").action(async (directory, options) => {
  try {
    const projectRoot = resolve(directory);
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = parseProject(projectRoot);
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles);
    const vizData = prepareVizData(graph, projectRoot);
    console.log(`Found ${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} cross-file edges`);
    const port = parseInt(options.port, 10);
    startVizServer(vizData, graph, projectRoot, port, options.open);
  } catch (err) {
    console.error("Error starting visualization:", err);
    process.exit(1);
  }
});
program.command("mcp").description("Start MCP server for AI coding tools").argument("[directory]", "Project directory to analyze (optional - use connect_repo tool to connect later)").action(async (directory) => {
  try {
    const state = createEmptyState();
    if (directory) {
      const projectRoot = resolve(directory);
      console.error(`Parsing project: ${projectRoot}`);
      const parsedFiles = parseProject(projectRoot);
      console.error(`Parsed ${parsedFiles.length} files`);
      const graph = buildGraph(parsedFiles);
      console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
      state.graph = graph;
      state.projectRoot = projectRoot;
      state.projectName = projectRoot.split("/").pop() || "project";
      console.error("Starting file watcher...");
      state.watcher = watchProject(projectRoot, {
        onFileChanged: async (filePath) => {
          console.error(`File changed: ${filePath}`);
          try {
            await updateFileInGraph(state.graph, projectRoot, filePath);
            console.error(`Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`Failed to update graph: ${error}`);
          }
        },
        onFileAdded: async (filePath) => {
          console.error(`File added: ${filePath}`);
          try {
            await updateFileInGraph(state.graph, projectRoot, filePath);
            console.error(`Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`Failed to update graph: ${error}`);
          }
        },
        onFileDeleted: (filePath) => {
          console.error(`File deleted: ${filePath}`);
          try {
            const fileNodes = state.graph.filterNodes(
              (node, attrs) => attrs.filePath === filePath
            );
            fileNodes.forEach((node) => state.graph.dropNode(node));
            console.error(`Removed ${filePath} from graph`);
          } catch (error) {
            console.error(`Failed to remove file: ${error}`);
          }
        }
      });
    }
    await startMcpServer(state);
  } catch (err) {
    console.error("Error starting MCP server:", err);
    process.exit(1);
  }
});
program.parse();
