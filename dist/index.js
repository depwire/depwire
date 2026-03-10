#!/usr/bin/env node
import {
  buildGraph,
  calculateHealthScore,
  checkoutCommit,
  createEmptyState,
  createSnapshot,
  findProjectRoot,
  generateDocs,
  getArchitectureSummary,
  getCommitLog,
  getCurrentBranch,
  getHealthTrend,
  getImpact,
  isGitRepo,
  loadSnapshot,
  parseProject,
  popStash,
  prepareVizData,
  restoreOriginal,
  sampleCommits,
  saveSnapshot,
  searchSymbols,
  startMcpServer,
  startVizServer,
  stashChanges,
  updateFileInGraph,
  watchProject
} from "./chunk-5QXVYDBT.js";

// src/index.ts
import { Command } from "commander";
import { resolve, dirname as dirname2, join as join3 } from "path";
import { writeFileSync, readFileSync as readFileSync2, existsSync } from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";

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

// src/health/display.ts
function formatHealthReport(report, trend, verbose) {
  let output = "";
  output += `
${bold("Depwire Health Score")}

`;
  const gradeColor = getGradeColor(report.grade);
  let overallLine = `${bold("Overall:")} ${report.overall}/100 (${gradeColor(bold(`Grade: ${report.grade}`))})`;
  if (trend) {
    const trendColor = trend.startsWith("\u2191") ? green : trend.startsWith("\u2193") ? red : gray;
    overallLine += ` ${trendColor(trend)} from last check`;
  }
  output += overallLine + "\n\n";
  output += formatDimensionsTable(report.dimensions);
  output += `
${bold("Summary:")}
${report.summary}

`;
  if (report.recommendations.length > 0) {
    output += `${yellow(bold("\u26A0\uFE0F  Recommendations:"))}
`;
    for (const rec of report.recommendations) {
      output += `  \u2022 ${rec}
`;
    }
    output += "\n";
  }
  if (verbose) {
    output += `${bold("Dimension Details:")}

`;
    for (const dim of report.dimensions) {
      output += `${bold(dim.name)} (${dim.score}/100, Grade: ${getGradeColor(dim.grade)(dim.grade)})
`;
      output += `  ${dim.details}
`;
      output += `  Metrics: ${JSON.stringify(dim.metrics, null, 2)}

`;
    }
  }
  output += `${gray(`Parsed ${report.projectStats.files} files, ${report.projectStats.symbols} symbols, ${report.projectStats.edges} edges`)}
`;
  return output;
}
function formatDimensionsTable(dimensions) {
  const headers = ["Dimension", "Score", "Grade", "Weight"];
  const widths = [25, 8, 8, 8];
  let output = "";
  output += "\u250C" + widths.map((w) => "\u2500".repeat(w)).join("\u252C") + "\u2510\n";
  output += "\u2502";
  headers.forEach((h, i) => {
    output += " " + h.padEnd(widths[i] - 1);
    output += "\u2502";
  });
  output += "\n";
  output += "\u251C" + widths.map((w) => "\u2500".repeat(w)).join("\u253C") + "\u2524\n";
  for (const dim of dimensions) {
    output += "\u2502";
    const gradeColor = getGradeColor(dim.grade);
    output += " " + dim.name.padEnd(widths[0] - 1);
    output += "\u2502";
    output += " " + dim.score.toString().padEnd(widths[1] - 1);
    output += "\u2502";
    const gradePadded = dim.grade.padEnd(widths[2] - 1);
    output += " " + gradeColor(gradePadded);
    output += "\u2502";
    const weightStr = `${(dim.weight * 100).toFixed(0)}%`;
    output += " " + weightStr.padEnd(widths[3] - 1);
    output += "\u2502";
    output += "\n";
  }
  output += "\u2514" + widths.map((w) => "\u2500".repeat(w)).join("\u2534") + "\u2518\n";
  return output;
}
function getGradeColor(grade) {
  switch (grade) {
    case "A":
      return green;
    case "B":
      return cyan;
    case "C":
      return yellow;
    case "D":
      return magenta;
    case "F":
      return red;
    default:
      return gray;
  }
}
function bold(text) {
  return `\x1B[1m${text}\x1B[0m`;
}
function green(text) {
  return `\x1B[32m${text}\x1B[0m`;
}
function cyan(text) {
  return `\x1B[36m${text}\x1B[0m`;
}
function yellow(text) {
  return `\x1B[33m${text}\x1B[0m`;
}
function magenta(text) {
  return `\x1B[35m${text}\x1B[0m`;
}
function red(text) {
  return `\x1B[31m${text}\x1B[0m`;
}
function gray(text) {
  return `\x1B[90m${text}\x1B[0m`;
}

// src/index.ts
import { readFileSync as readFileSyncNode, appendFileSync, existsSync as existsSyncNode } from "fs";
import { createInterface } from "readline";

// src/temporal/index.ts
import { join as join2 } from "path";

// src/viz/temporal-server.ts
import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import open from "open";

// src/viz/temporal-data.ts
import { basename } from "path";

// src/temporal/diff.ts
function diffSnapshots(previous, current) {
  const prevFiles = new Set(previous.files.map((f) => f.path));
  const currFiles = new Set(current.files.map((f) => f.path));
  const addedFiles = Array.from(currFiles).filter((f) => !prevFiles.has(f));
  const removedFiles = Array.from(prevFiles).filter((f) => !currFiles.has(f));
  const prevEdges = new Set(
    previous.edges.map((e) => `${e.source}|${e.target}`)
  );
  const currEdges = new Set(current.edges.map((e) => `${e.source}|${e.target}`));
  const addedEdgeKeys = Array.from(currEdges).filter((e) => !prevEdges.has(e));
  const removedEdgeKeys = Array.from(prevEdges).filter((e) => !currEdges.has(e));
  const addedEdges = addedEdgeKeys.map((key) => {
    const [source, target] = key.split("|");
    return { source, target };
  });
  const removedEdges = removedEdgeKeys.map((key) => {
    const [source, target] = key.split("|");
    return { source, target };
  });
  return {
    addedFiles,
    removedFiles,
    addedEdges,
    removedEdges,
    statsChange: {
      files: current.stats.totalFiles - previous.stats.totalFiles,
      symbols: current.stats.totalSymbols - previous.stats.totalSymbols,
      edges: current.stats.totalEdges - previous.stats.totalEdges
    }
  };
}

// src/viz/temporal-data.ts
function prepareTemporalVizData(snapshots, projectRoot) {
  const projectName = basename(projectRoot);
  const snapshotsWithDiff = snapshots.map((snapshot, index) => {
    const diff = index > 0 ? diffSnapshots(snapshots[index - 1], snapshot) : void 0;
    return {
      commitHash: snapshot.commitHash,
      commitDate: snapshot.commitDate,
      commitMessage: snapshot.commitMessage,
      commitAuthor: snapshot.commitAuthor,
      stats: snapshot.stats,
      files: snapshot.files,
      arcs: snapshot.edges,
      diff
    };
  });
  const timeline = snapshots.map((snapshot, index) => ({
    index,
    date: snapshot.commitDate,
    shortHash: snapshot.commitHash.substring(0, 8),
    message: snapshot.commitMessage
  }));
  return {
    projectName,
    snapshots: snapshotsWithDiff,
    timeline
  };
}

// src/viz/temporal-server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
async function findAvailablePort(startPort) {
  const net = await import("net");
  for (let attempt = 0; attempt < 10; attempt++) {
    const testPort = startPort + attempt;
    const isAvailable = await new Promise((resolve2) => {
      const server = net.createServer().once("error", () => resolve2(false)).once("listening", () => {
        server.close();
        resolve2(true);
      }).listen(testPort, "127.0.0.1");
    });
    if (isAvailable) {
      return testPort;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startTemporalServer(snapshots, projectRoot, preferredPort = 3334) {
  const availablePort = await findAvailablePort(preferredPort);
  const app = express();
  const vizData = prepareTemporalVizData(snapshots, projectRoot);
  app.get("/api/data", (_req, res) => {
    res.json(vizData);
  });
  const publicDir = join(__dirname, "viz", "public");
  app.get("/", (_req, res) => {
    const htmlPath = join(publicDir, "temporal.html");
    const html = readFileSync(htmlPath, "utf-8");
    res.send(html);
  });
  app.get("/temporal.js", (_req, res) => {
    const jsPath = join(publicDir, "temporal.js");
    const js = readFileSync(jsPath, "utf-8");
    res.type("application/javascript").send(js);
  });
  app.get("/temporal.css", (_req, res) => {
    const cssPath = join(publicDir, "temporal.css");
    const css = readFileSync(cssPath, "utf-8");
    res.type("text/css").send(css);
  });
  const server = app.listen(availablePort, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${availablePort}`;
    console.log(`
\u2713 Temporal visualization server running at ${url}`);
    console.log("  Press Ctrl+C to stop\n");
    open(url).catch(() => {
      console.log("  (Could not open browser automatically)");
    });
  });
  await new Promise((resolve2, reject) => {
    server.on("error", reject);
    process.on("SIGINT", () => {
      console.log("\n\nShutting down temporal server...");
      server.close(() => {
        console.log("Server stopped");
        resolve2();
        process.exit(0);
      });
    });
  });
}

// src/temporal/index.ts
async function runTemporalAnalysis(projectDir, options) {
  if (!isGitRepo(projectDir)) {
    throw new Error("Not a git repository. Temporal analysis requires git history.");
  }
  console.log("\u{1F50D} Analyzing git history...");
  const originalBranch = await getCurrentBranch(projectDir);
  const hadStash = await stashChanges(projectDir);
  try {
    const outputDir = options.output || join2(projectDir, ".depwire", "temporal");
    const commits = await getCommitLog(projectDir);
    if (commits.length === 0) {
      throw new Error("No commits found in repository");
    }
    console.log(`Found ${commits.length} commits`);
    const sampledCommits = sampleCommits(
      commits,
      options.commits,
      options.strategy
    );
    console.log(
      `Sampled ${sampledCommits.length} commits using ${options.strategy} strategy`
    );
    const snapshots = [];
    for (let i = 0; i < sampledCommits.length; i++) {
      const commit = sampledCommits[i];
      const progress = `[${i + 1}/${sampledCommits.length}]`;
      const existingSnapshot = loadSnapshot(commit.hash, outputDir);
      if (existingSnapshot) {
        if (options.verbose) {
          console.log(
            `${progress} Using cached snapshot for ${commit.hash.substring(0, 8)} - ${commit.message}`
          );
        }
        snapshots.push(existingSnapshot);
        continue;
      }
      if (options.verbose) {
        console.log(
          `${progress} Parsing commit ${commit.hash.substring(0, 8)} - ${commit.message}`
        );
      }
      await checkoutCommit(projectDir, commit.hash);
      const parsedFiles = await parseProject(projectDir);
      const graph = buildGraph(parsedFiles);
      const projectGraph = exportToJSON(graph, projectDir);
      const snapshot = createSnapshot(
        projectGraph,
        commit.hash,
        commit.date,
        commit.message,
        commit.author
      );
      saveSnapshot(snapshot, outputDir);
      snapshots.push(snapshot);
    }
    await restoreOriginal(projectDir, originalBranch);
    if (hadStash) {
      await popStash(projectDir);
    }
    console.log(`\u2713 Created ${snapshots.length} snapshots`);
    if (options.stats) {
      printStats(snapshots);
    }
    console.log("\n\u{1F680} Starting temporal visualization server...");
    await startTemporalServer(snapshots, projectDir, options.port);
  } catch (error) {
    await restoreOriginal(projectDir, originalBranch);
    if (hadStash) {
      await popStash(projectDir);
    }
    throw error;
  }
}
function printStats(snapshots) {
  console.log("\n\u{1F4CA} Temporal Analysis Statistics:");
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  console.log(
    `
  Time Range: ${new Date(first.commitDate).toLocaleDateString()} \u2192 ${new Date(last.commitDate).toLocaleDateString()}`
  );
  console.log(`
  Growth:`);
  console.log(
    `    Files:   ${first.stats.totalFiles} \u2192 ${last.stats.totalFiles} (${last.stats.totalFiles >= first.stats.totalFiles ? "+" : ""}${last.stats.totalFiles - first.stats.totalFiles})`
  );
  console.log(
    `    Symbols: ${first.stats.totalSymbols} \u2192 ${last.stats.totalSymbols} (${last.stats.totalSymbols >= first.stats.totalSymbols ? "+" : ""}${last.stats.totalSymbols - first.stats.totalSymbols})`
  );
  console.log(
    `    Edges:   ${first.stats.totalEdges} \u2192 ${last.stats.totalEdges} (${last.stats.totalEdges >= first.stats.totalEdges ? "+" : ""}${last.stats.totalEdges - first.stats.totalEdges})`
  );
  let maxGrowth = { index: 0, files: 0 };
  for (let i = 1; i < snapshots.length; i++) {
    const growth = snapshots[i].stats.totalFiles - snapshots[i - 1].stats.totalFiles;
    if (growth > maxGrowth.files) {
      maxGrowth = { index: i, files: growth };
    }
  }
  if (maxGrowth.files > 0) {
    const growthCommit = snapshots[maxGrowth.index];
    console.log(`
  Biggest Growth Period:`);
    console.log(
      `    +${maxGrowth.files} files at ${new Date(growthCommit.commitDate).toLocaleDateString()}`
    );
    console.log(`    ${growthCommit.commitMessage}`);
  }
  const trend = last.stats.totalFiles > first.stats.totalFiles ? "Growing" : last.stats.totalFiles < first.stats.totalFiles ? "Shrinking" : "Stable";
  console.log(`
  Overall Trend: ${trend}`);
}

// src/index.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
var packageJsonPath = join3(__dirname2, "../package.json");
var packageJson = JSON.parse(readFileSync2(packageJsonPath, "utf-8"));
var program = new Command();
program.name("depwire").description("Code cross-reference graph builder for TypeScript projects").version(packageJson.version);
program.command("parse").description("Parse a TypeScript project and build dependency graph").argument("[directory]", "Project directory to parse (defaults to current directory or auto-detected project root)").option("-o, --output <path>", "Output JSON file path", "depwire-output.json").option("--pretty", "Pretty-print JSON output").option("--stats", "Print summary statistics").option("--exclude <patterns...>", 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")').option("--verbose", "Show detailed parsing progress").action(async (directory, options) => {
  const startTime = Date.now();
  try {
    const projectRoot = directory ? resolve(directory) : findProjectRoot();
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = await parseProject(projectRoot, {
      exclude: options.exclude,
      verbose: options.verbose
    });
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
    const cacheFile = "depwire-output.json";
    let graph;
    if (existsSync(cacheFile)) {
      console.log("Loading from cache...");
      const json = JSON.parse(readFileSync2(cacheFile, "utf-8"));
      graph = importFromJSON(json);
    } else {
      console.log("Parsing project...");
      const parsedFiles = await parseProject(projectRoot);
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
program.command("viz").description("Launch interactive arc diagram visualization").argument("[directory]", "Project directory to visualize (defaults to current directory or auto-detected project root)").option("-p, --port <number>", "Server port", "3333").option("--no-open", "Don't auto-open browser").option("--exclude <patterns...>", 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")').option("--verbose", "Show detailed parsing progress").action(async (directory, options) => {
  try {
    const projectRoot = directory ? resolve(directory) : findProjectRoot();
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = await parseProject(projectRoot, {
      exclude: options.exclude,
      verbose: options.verbose
    });
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles);
    const vizData = prepareVizData(graph, projectRoot);
    console.log(`Found ${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} cross-file edges`);
    const port = parseInt(options.port, 10);
    await startVizServer(vizData, graph, projectRoot, port, options.open, {
      exclude: options.exclude,
      verbose: options.verbose
    });
  } catch (err) {
    console.error("Error starting visualization:", err);
    process.exit(1);
  }
});
program.command("temporal").description("Visualize how the dependency graph evolved over git history").argument("[directory]", "Project directory to analyze (defaults to current directory or auto-detected project root)").option("--commits <number>", "Number of commits to sample", "20").option("--strategy <type>", "Sampling strategy: even, weekly, monthly", "even").option("-p, --port <number>", "Server port", "3334").option("--output <path>", "Save snapshots to custom path (default: .depwire/temporal/)").option("--verbose", "Show progress for each commit being parsed").option("--stats", "Show summary statistics at end").action(async (directory, options) => {
  try {
    const projectRoot = directory ? resolve(directory) : findProjectRoot();
    await runTemporalAnalysis(projectRoot, {
      commits: parseInt(options.commits, 10),
      strategy: options.strategy,
      port: parseInt(options.port, 10),
      output: options.output,
      verbose: options.verbose,
      stats: options.stats
    });
  } catch (err) {
    console.error("Error running temporal analysis:", err);
    process.exit(1);
  }
});
program.command("mcp").description("Start MCP server for AI coding tools").argument("[directory]", "Project directory to analyze (optional - auto-detects project root or use connect_repo tool to connect later)").action(async (directory) => {
  try {
    const state = createEmptyState();
    let projectRootToConnect = null;
    if (directory) {
      projectRootToConnect = resolve(directory);
    } else {
      const detectedRoot = findProjectRoot();
      const cwd = process.cwd();
      if (detectedRoot !== cwd || existsSync(join3(cwd, "package.json")) || existsSync(join3(cwd, "tsconfig.json")) || existsSync(join3(cwd, "go.mod")) || existsSync(join3(cwd, "pyproject.toml")) || existsSync(join3(cwd, "setup.py")) || existsSync(join3(cwd, ".git"))) {
        projectRootToConnect = detectedRoot;
      }
    }
    if (projectRootToConnect) {
      console.error(`Parsing project: ${projectRootToConnect}`);
      const parsedFiles = await parseProject(projectRootToConnect);
      console.error(`Parsed ${parsedFiles.length} files`);
      const graph = buildGraph(parsedFiles);
      console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
      state.graph = graph;
      state.projectRoot = projectRootToConnect;
      state.projectName = projectRootToConnect.split("/").pop() || "project";
      console.error("Starting file watcher...");
      state.watcher = watchProject(projectRootToConnect, {
        onFileChanged: async (filePath) => {
          console.error(`File changed: ${filePath}`);
          try {
            await updateFileInGraph(state.graph, projectRootToConnect, filePath);
            console.error(`Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`Failed to update graph: ${error}`);
          }
        },
        onFileAdded: async (filePath) => {
          console.error(`File added: ${filePath}`);
          try {
            await updateFileInGraph(state.graph, projectRootToConnect, filePath);
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
program.command("docs").description("Generate comprehensive codebase documentation").argument("[directory]", "Project directory to document (defaults to current directory or auto-detected project root)").option("-o, --output <path>", "Output directory (default: .depwire/ inside project)").option("--format <type>", "Output format: markdown | json", "markdown").option("--gitignore", "Add .depwire/ to .gitignore automatically").option("--no-gitignore", "Don't modify .gitignore").option("--include <docs>", "Comma-separated list of docs to generate (default: all)", "all").option("--update", "Regenerate existing docs").option("--only <docs>", "Used with --update, regenerate only specific docs").option("--verbose", "Show generation progress").option("--stats", "Show generation statistics at the end").option("--exclude <patterns...>", 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")').action(async (directory, options) => {
  const startTime = Date.now();
  try {
    const projectRoot = directory ? resolve(directory) : findProjectRoot();
    const outputDir = options.output ? resolve(options.output) : join3(projectRoot, ".depwire");
    const includeList = options.include.split(",").map((s) => s.trim());
    const onlyList = options.only ? options.only.split(",").map((s) => s.trim()) : void 0;
    if (options.gitignore === void 0 && !existsSyncNode(outputDir)) {
      const answer = await promptGitignore();
      if (answer) {
        addToGitignore(projectRoot, ".depwire/");
      }
    } else if (options.gitignore === true) {
      addToGitignore(projectRoot, ".depwire/");
    }
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = await parseProject(projectRoot, {
      exclude: options.exclude,
      verbose: options.verbose
    });
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles);
    const parseTime = (Date.now() - startTime) / 1e3;
    console.log(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
    if (options.verbose) {
      console.log(`
Generating documentation to: ${outputDir}`);
    }
    const result = await generateDocs(graph, projectRoot, packageJson.version, parseTime, {
      outputDir,
      format: options.format,
      include: includeList,
      update: options.update || false,
      only: onlyList,
      verbose: options.verbose || false,
      stats: options.stats || false
    });
    if (result.success) {
      console.log(`
\u2705 Documentation generated successfully!`);
      console.log(`Output directory: ${outputDir}`);
      console.log(`Generated files: ${result.generated.join(", ")}`);
      if (result.stats) {
        console.log(`
=== Generation Statistics ===`);
        console.log(`Time: ${(result.stats.totalTime / 1e3).toFixed(2)}s`);
        console.log(`Files generated: ${result.stats.filesGenerated}`);
      }
    } else {
      console.error(`
\u274C Documentation generation completed with errors:`);
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error("Error generating documentation:", err);
    process.exit(1);
  }
});
async function promptGitignore() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve2) => {
    rl.question("Add .depwire/ to .gitignore? [Y/n] ", (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve2(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}
function addToGitignore(projectRoot, pattern) {
  const gitignorePath = join3(projectRoot, ".gitignore");
  try {
    let content = "";
    if (existsSyncNode(gitignorePath)) {
      content = readFileSyncNode(gitignorePath, "utf-8");
    }
    if (content.includes(pattern)) {
      return;
    }
    const newContent = content.endsWith("\n") ? `${content}${pattern}
` : `${content}
${pattern}
`;
    appendFileSync(gitignorePath, content.endsWith("\n") ? `${pattern}
` : `
${pattern}
`, "utf-8");
    console.log(`Added ${pattern} to .gitignore`);
  } catch (err) {
    console.error(`Warning: Failed to update .gitignore: ${err}`);
  }
}
program.command("health").description("Analyze dependency architecture health (0-100 score)").argument("[directory]", "Project directory to analyze (defaults to current directory or auto-detected project root)").option("--json", "Output as JSON").option("--verbose", "Show detailed breakdown").action(async (directory, options) => {
  try {
    const projectRoot = directory ? resolve(directory) : findProjectRoot();
    const startTime = Date.now();
    const parsedFiles = await parseProject(projectRoot);
    const graph = buildGraph(parsedFiles);
    const parseTime = Date.now() - startTime;
    const report = calculateHealthScore(graph, projectRoot);
    const trend = getHealthTrend(projectRoot, report.overall);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const formatted = formatHealthReport(report, trend, options.verbose || false);
      console.log(formatted);
      const totalTime = Date.now() - startTime;
      console.log(`Analysis completed in ${(totalTime / 1e3).toFixed(2)}s (parse: ${(parseTime / 1e3).toFixed(2)}s)
`);
    }
  } catch (err) {
    console.error("Error analyzing health:", err);
    process.exit(1);
  }
});
program.parse();
