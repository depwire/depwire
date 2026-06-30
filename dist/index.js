#!/usr/bin/env node
import {
  checkoutCommit,
  createEmptyState,
  createSnapshot,
  getCommitLog,
  getCurrentBranch,
  isGitRepo,
  loadSnapshot,
  popStash,
  prepareVizData,
  restoreOriginal,
  sampleCommits,
  saveSnapshot,
  startMcpServer,
  startVizServer,
  stashChanges,
  updateFileInGraph,
  verifyChange,
  watchProject
} from "./chunk-V5XK3HFM.js";
import {
  SimulationEngine,
  analyzeDeadCode,
  buildGraph,
  calculateHealthScore,
  findProjectRoot,
  generateDocs,
  getArchitectureSummary,
  getHealthTrend,
  getImpact,
  parseProject,
  scanSecurity,
  searchSymbols
} from "./chunk-TWWY4SQR.js";

// src/index.ts
import { Command } from "commander";
import { resolve as resolve6, dirname as dirname4, join as join5 } from "path";
import { writeFileSync, readFileSync as readFileSync4, existsSync } from "fs";
import { fileURLToPath as fileURLToPath4 } from "url";

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
import { dirname, resolve } from "path";
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
    const isAvailable = await new Promise((resolve7) => {
      const server = net.createServer().once("error", () => resolve7(false)).once("listening", () => {
        server.close();
        resolve7(true);
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
  const publicDir = resolve(__dirname, "viz", "public");
  app.get("/", (_req, res) => {
    const htmlPath = resolve(publicDir, "temporal.html");
    if (!htmlPath.startsWith(publicDir)) return res.status(403).send("Forbidden");
    const html = readFileSync(htmlPath, "utf-8");
    res.send(html);
  });
  app.get("/temporal.js", (_req, res) => {
    const jsPath = resolve(publicDir, "temporal.js");
    if (!jsPath.startsWith(publicDir)) return res.status(403).send("Forbidden");
    const js = readFileSync(jsPath, "utf-8");
    res.type("application/javascript").send(js);
  });
  app.get("/temporal.css", (_req, res) => {
    const cssPath = resolve(publicDir, "temporal.css");
    if (!cssPath.startsWith(publicDir)) return res.status(403).send("Forbidden");
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
  await new Promise((resolve7, reject) => {
    server.on("error", reject);
    process.on("SIGINT", () => {
      console.log("\n\nShutting down temporal server...");
      server.close(() => {
        console.log("Server stopped");
        resolve7();
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
      const graph = buildGraph(parsedFiles, projectDir);
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
    snapshots.reverse();
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

// src/telemetry.ts
import os from "os";
var TELEMETRY_URL = "https://telemetry.depwire.dev/event";
async function trackCommand(command, version = "unknown") {
  if (process.env.DEPWIRE_NO_TELEMETRY === "1" || process.env.DEPWIRE_NO_TELEMETRY === "true" || process.env.DO_NOT_TRACK === "1") {
    return;
  }
  const payload = {
    command,
    version,
    os: os.platform(),
    node: process.version
  };
  fetch(TELEMETRY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2e3)
  }).catch(() => {
  });
}

// src/commands/whatif.ts
import { resolve as resolve2 } from "path";
import chalk from "chalk";

// src/viz/whatif-server.ts
import express2 from "express";
import open2 from "open";
import { fileURLToPath as fileURLToPath2 } from "url";
import { dirname as dirname2, join as join3 } from "path";

// src/viz/generate-whatif-html.ts
function generateWhatIfHtml(currentVizData, simulatedVizData, simulationResult, operation, target) {
  const { healthDelta, diff } = simulationResult;
  const deltaSign = healthDelta.delta >= 0 ? "+" : "";
  const deltaLabel = healthDelta.delta === 0 ? "unchanged" : healthDelta.improved ? `${deltaSign}${healthDelta.delta} \u2713 improved` : `${healthDelta.delta} \u2717 degraded`;
  const deltaColor = healthDelta.delta === 0 ? "#fbbf24" : healthDelta.improved ? "#4ade80" : "#f87171";
  const opBadge = operation !== "none" ? `<span style="background:${deltaColor};color:#000;padding:4px 12px;border-radius:4px;font-weight:700;font-size:13px;text-transform:uppercase;margin-left:12px;">${operation} ${target}</span>` : "";
  const brokenImportsHtml = diff.brokenImports.length > 0 ? `<details style="margin-top:16px;background:#16213e;border:1px solid #2a2a4a;border-radius:8px;padding:12px 16px;">
        <summary style="cursor:pointer;color:#f87171;font-weight:600;font-size:14px;">Broken Imports (${diff.brokenImports.length})</summary>
        <ul style="margin:8px 0 0 16px;padding:0;list-style:none;">
          ${diff.brokenImports.map((bi) => `<li style="color:#e0e0e0;font-size:13px;padding:4px 0;font-family:monospace;">${bi.file} \u2192 <span style="color:#f87171;">${bi.importedSymbol}</span></li>`).join("")}
        </ul>
      </details>` : "";
  const currentDataJson = JSON.stringify(currentVizData);
  const simulatedDataJson = JSON.stringify(simulatedVizData);
  const removedFilePairs = diff.removedEdges.map((e) => ({
    source: e.source.split("::")[0],
    target: e.target.split("::")[0]
  }));
  const removedFilePairsJson = JSON.stringify(removedFilePairs);
  const affectedFilesJson = JSON.stringify(diff.affectedNodes);
  const brokenImportFilesJson = JSON.stringify(diff.brokenImports.map((bi) => bi.file));
  const brokenCount = diff.brokenImports.length;
  const affectedCount = diff.affectedNodes.length;
  const healthDeltaVal = healthDelta.delta;
  let riskLevel;
  let riskColor;
  if (brokenCount > 10 || affectedCount > 20) {
    riskLevel = "High";
    riskColor = "#ef4444";
  } else if (brokenCount > 3 || affectedCount > 5) {
    riskLevel = "Medium";
    riskColor = "#fbbf24";
  } else {
    riskLevel = "Low";
    riskColor = "#4ade80";
  }
  const brokenColor = brokenCount > 0 ? "#ef4444" : "#4ade80";
  const affectedColor = affectedCount > 0 ? "#ef4444" : "#4ade80";
  const healthDeltaColor = healthDeltaVal < 0 ? "#ef4444" : healthDeltaVal > 0 ? "#4ade80" : "#6b7280";
  const healthDeltaStr = healthDeltaVal > 0 ? `+${healthDeltaVal}` : healthDeltaVal === 0 ? "0" : `${healthDeltaVal}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Depwire \u2014 What If Simulation</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { overflow: auto; height: auto; }
    .whatif-header {
      background: #16213e;
      border-bottom: 1px solid #2a2a4a;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .whatif-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      background: linear-gradient(135deg, #4a9eff, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .stats-bar {
      background: #0f1729;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 12px 24px;
      margin: 16px 24px;
      display: flex;
      align-items: center;
      gap: 28px;
      flex-wrap: wrap;
    }
    .stats-bar .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #a0a0a0;
    }
    .stats-bar .stat-val {
      font-weight: 700;
      font-size: 18px;
    }
    .stats-bar .risk-badge {
      padding: 4px 14px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      color: #000;
    }
    .panels {
      display: flex;
      flex-direction: row;
      gap: 0;
      width: 100%;
      height: calc(100vh - 220px);
      min-height: 400px;
    }
    .panel {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #2a2a4a;
      overflow: hidden;
      position: relative;
    }
    .panel:last-child { border-right: none; }
    .panel-label {
      background: #16213e;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #a0a0a0;
      border-bottom: 1px solid #2a2a4a;
      display: flex;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .panel-diagram {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .panel-diagram svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .broken-section {
      padding: 0 24px 24px;
    }
  </style>
</head>
<body>
  <div class="whatif-header">
    <h1>depwire \u2014 What If Simulation</h1>
    ${opBadge}
  </div>

  <div class="stats-bar">
    <div class="stat">Broken Imports: <span class="stat-val" style="color:${brokenColor}">${brokenCount}</span></div>
    <div class="stat">Affected Files: <span class="stat-val" style="color:${affectedColor}">${affectedCount}</span></div>
    <div class="stat">Health Score Delta: <span class="stat-val" style="color:${healthDeltaColor}">${healthDeltaStr}</span></div>
    <div class="stat"><span class="risk-badge" style="background:${riskColor}">${riskLevel} Risk</span></div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-label">
        <span>Current State</span>
        <span>${currentVizData.stats.totalFiles} files</span>
      </div>
      <div class="panel-diagram" id="arc-diagram-current">
        <svg id="svg-current"></svg>
      </div>
      <div class="tooltip" id="tooltip-current"></div>
    </div>
    <div class="panel">
      <div class="panel-label">
        <span>After Simulation</span>
        <span>${simulatedVizData.stats.totalFiles} files</span>
      </div>
      <div class="panel-diagram" id="arc-diagram-simulated">
        <svg id="svg-simulated"></svg>
      </div>
      <div class="tooltip" id="tooltip-simulated"></div>
    </div>
  </div>

  <div class="broken-section">
    ${brokenImportsHtml}
  </div>

  <script>window.__depwireWhatIf = true;</script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
  <script src="/arc.js"></script>
  <script>
    const currentData = ${currentDataJson};
    const simulatedData = ${simulatedDataJson};
    const removedFilePairs = ${removedFilePairsJson};
    const affectedFiles = new Set(${affectedFilesJson});
    const brokenImportFiles = new Set(${brokenImportFilesJson});

    // Inject broken arcs and ghost files into the simulated data
    // so they render on the right diagram and can be colored red
    if (removedFilePairs.length > 0) {
      // Deduplicate removed edges to file-level arcs
      const brokenArcMap = new Map();
      const ghostFiles = new Set();
      const existingFiles = new Set(simulatedData.files.map(f => f.path));

      for (const pair of removedFilePairs) {
        const key = pair.source + '::' + pair.target;
        if (brokenArcMap.has(key)) {
          brokenArcMap.get(key).edgeCount++;
        } else {
          brokenArcMap.set(key, {
            sourceFile: pair.source,
            targetFile: pair.target,
            edgeCount: 1,
            edgeKinds: ['imports'],
            broken: true,
          });
        }
        // Track files that don't exist in simulated data (deleted files)
        if (!existingFiles.has(pair.source)) ghostFiles.add(pair.source);
        if (!existingFiles.has(pair.target)) ghostFiles.add(pair.target);
      }

      // Add ghost file bars for deleted files
      for (const gf of ghostFiles) {
        simulatedData.files.push({
          path: gf,
          directory: gf.includes('/') ? gf.substring(0, gf.lastIndexOf('/')) : '.',
          symbolCount: 0,
          incomingCount: 0,
          outgoingCount: 0,
          ghost: true,
        });
      }

      // Re-sort files so ghost files are in correct position
      simulatedData.files.sort((a, b) => {
        if (a.directory !== b.directory) return a.directory.localeCompare(b.directory);
        return a.path.localeCompare(b.path);
      });

      // Add broken arcs to simulated data
      for (const arc of brokenArcMap.values()) {
        simulatedData.arcs.push(arc);
      }
    }

    // Mark affected arcs in simulated data
    simulatedData.arcs.forEach(arc => {
      if (affectedFiles.has(arc.sourceFile) || affectedFiles.has(arc.targetFile)) {
        arc.affected = true;
      }
    });

    // Mark affected file bars in simulated data
    simulatedData.files.forEach(file => {
      if (affectedFiles.has(file.path)) {
        file.affected = true;
      }
    });

    const left = window.createArcDiagram('arc-diagram-current', 'svg-current', 'tooltip-current', currentData);
    const right = window.createArcDiagram('arc-diagram-simulated', 'svg-simulated', 'tooltip-simulated', simulatedData);

    left.render();
    right.render();

    function applyGhostRedStyling() {
      const simContainer = d3.select('#arc-diagram-simulated');
      const hasAffected = affectedFiles.size > 0;

      if (!hasAffected) return;

      // --- SVG filter for red glow on affected nodes ---
      let defs = d3.select('#svg-simulated').select('defs');
      if (defs.empty()) {
        defs = d3.select('#svg-simulated').insert('defs', ':first-child');
      }
      if (defs.select('#red-glow').empty()) {
        const filter = defs.append('filter').attr('id', 'red-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
        filter.append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 4).attr('flood-color', '#ef4444').attr('flood-opacity', 0.8);
      }

      // --- Edges ---
      simContainer.selectAll('.arc').each(function(d) {
        const el = d3.select(this);
        if (d.broken) {
          // Broken import edges: dashed red, thicker
          el.attr('stroke', '#ef4444')
            .attr('stroke-opacity', 1.0)
            .attr('stroke-width', 3.0)
            .attr('stroke-dasharray', '6,3')
            .style('filter', null);
        } else if (d.affected) {
          // Affected edges: solid red
          el.attr('stroke', '#ef4444')
            .attr('stroke-opacity', 1.0)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', null)
            .style('filter', null);
        } else {
          // Non-affected edges: ghost
          el.attr('stroke-opacity', 0.08);
        }
      });

      // --- Node bars ---
      simContainer.selectAll('.file-bar').each(function(d) {
        const el = d3.select(this);
        if (d.affected || d.ghost) {
          // Affected / ghost nodes: glowing red
          el.attr('fill', '#ef4444')
            .attr('opacity', 1.0)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .style('filter', 'url(#red-glow)');
        } else {
          // Non-affected nodes: ghost
          el.attr('opacity', 0.15);
        }
      });
    }

    applyGhostRedStyling();

    window.addEventListener('resize', () => {
      left.render();
      right.render();
      applyGhostRedStyling();
    });
  </script>
</body>
</html>`;
}

// src/viz/whatif-server.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
async function findAvailablePort2(startPort, maxAttempts = 10) {
  const net = await import("net");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const testPort = startPort + attempt;
    const isAvailable = await new Promise((resolve7) => {
      const server = net.createServer();
      server.once("error", () => {
        resolve7(false);
      });
      server.once("listening", () => {
        server.close();
        resolve7(true);
      });
      server.listen(testPort, "127.0.0.1");
    });
    if (isAvailable) {
      if (attempt > 0) {
        console.error(`Port ${startPort} in use, using port ${testPort} instead`);
      }
      return testPort;
    }
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}
async function serveWhatIfViz(currentVizData, simulatedVizData, simulationResult, operation, target) {
  const availablePort = await findAvailablePort2(3335);
  const app = express2();
  app.get("/", (_req, res) => {
    const html = generateWhatIfHtml(currentVizData, simulatedVizData, simulationResult, operation, target);
    res.type("html").send(html);
  });
  app.get("/favicon.ico", (_req, res) => {
    res.sendFile(join3(__dirname2, "..", "..", "icon.png"));
  });
  const publicDir = join3(__dirname2, "viz", "public");
  app.use(express2.static(publicDir));
  app.get("/api/graph", (_req, res) => {
    res.json(currentVizData);
  });
  app.get("/api/current", (_req, res) => {
    res.json(currentVizData);
  });
  app.get("/api/simulated", (_req, res) => {
    res.json(simulatedVizData);
  });
  app.get("/api/result", (_req, res) => {
    res.json(simulationResult);
  });
  const server = app.listen(availablePort, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${availablePort}`;
    console.error(`
Opening What If UI at ${url}`);
    console.error("Press Ctrl+C to stop\n");
    open2(url);
  });
  process.on("SIGINT", () => {
    console.error("\nShutting down What If server...");
    server.close(() => {
      process.exit(0);
    });
  });
}

// src/commands/whatif.ts
async function whatif(dir, options) {
  if (!options.simulate) {
    const projectRoot2 = dir === "." ? findProjectRoot() : resolve2(dir);
    console.error(`Parsing project: ${projectRoot2}`);
    const parsedFiles2 = await parseProject(projectRoot2);
    const graph2 = buildGraph(parsedFiles2, projectRoot2);
    console.error(`Built graph: ${graph2.order} symbols, ${graph2.size} edges`);
    const vizData = prepareVizData(graph2, projectRoot2);
    const emptyResult = {
      action: { type: "delete", target: "" },
      originalGraph: { nodeCount: graph2.order, edgeCount: graph2.size, healthScore: 0 },
      simulatedGraph: { nodeCount: graph2.order, edgeCount: graph2.size, healthScore: 0 },
      diff: { addedEdges: [], removedEdges: [], affectedNodes: [], brokenImports: [], circularDepsIntroduced: [], circularDepsResolved: [] },
      healthDelta: { before: 0, after: 0, delta: 0, improved: false, dimensionChanges: [] }
    };
    await serveWhatIfViz(vizData, vizData, emptyResult, "none", "");
    return;
  }
  const validActions = ["move", "delete", "rename", "split", "merge"];
  if (!validActions.includes(options.simulate)) {
    console.error(chalk.red(`Invalid action: ${options.simulate}. Must be one of: ${validActions.join(", ")}`));
    process.exit(1);
  }
  if (!options.target) {
    console.error(chalk.red("--target is required for all simulation actions"));
    process.exit(1);
  }
  const action = buildAction(options);
  const projectRoot = dir === "." ? findProjectRoot() : resolve2(dir);
  console.error(`Parsing project: ${projectRoot}`);
  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
  console.error("");
  const engine = new SimulationEngine(graph);
  try {
    const result = engine.simulate(action);
    printResult(result);
    const currentVizData = prepareVizData(graph, projectRoot);
    const simulatedVizData = result.simulatedGraphInstance ? prepareVizData(result.simulatedGraphInstance, projectRoot) : currentVizData;
    const { simulatedGraphInstance, ...serializableResult } = result;
    await serveWhatIfViz(
      currentVizData,
      simulatedVizData,
      serializableResult,
      action.type,
      action.target
    );
  } catch (err) {
    console.error(chalk.red(`Simulation failed: ${err.message}`));
    process.exit(1);
  }
}
function buildAction(options) {
  const type = options.simulate;
  const target = options.target;
  switch (type) {
    case "move":
      if (!options.destination) {
        console.error(chalk.red("--destination is required for move action"));
        process.exit(1);
      }
      return { type: "move", target, destination: options.destination };
    case "delete":
      return { type: "delete", target };
    case "rename":
      if (!options.newName) {
        console.error(chalk.red("--new-name is required for rename action"));
        process.exit(1);
      }
      return { type: "rename", target, newName: options.newName };
    case "split":
      if (!options.newFile) {
        console.error(chalk.red("--new-file is required for split action"));
        process.exit(1);
      }
      if (!options.symbols) {
        console.error(chalk.red("--symbols is required for split action (comma-separated)"));
        process.exit(1);
      }
      return {
        type: "split",
        target,
        newFile: options.newFile,
        symbols: options.symbols.split(",").map((s) => s.trim())
      };
    case "merge":
      if (!options.source) {
        console.error(chalk.red("--source is required for merge action"));
        process.exit(1);
      }
      return { type: "merge", target, source: options.source };
    default:
      console.error(chalk.red(`Unknown action: ${type}`));
      process.exit(1);
  }
}
function printResult(result) {
  const { action, healthDelta, diff } = result;
  const line = "\u2500".repeat(45);
  console.log(chalk.bold("What If Simulation"));
  console.log(chalk.dim(line));
  const actionStr = formatAction(action);
  console.log(`${chalk.bold("Action:")}     ${actionStr}`);
  console.log(chalk.dim(line));
  const deltaSign = healthDelta.delta >= 0 ? "+" : "";
  const deltaColor = healthDelta.improved ? chalk.green : healthDelta.delta === 0 ? chalk.yellow : chalk.red;
  const deltaIcon = healthDelta.improved ? "\u2713 improved" : healthDelta.delta === 0 ? "\u2192 unchanged" : "\u2717 degraded";
  console.log(
    `${chalk.bold("Health Score:")}    ${healthDelta.before} \u2192 ${healthDelta.after}  ${deltaColor(`(${deltaSign}${healthDelta.delta} ${deltaIcon})`)}`
  );
  const changed = healthDelta.dimensionChanges.filter((d) => d.delta !== 0);
  if (changed.length > 0) {
    for (const d of changed) {
      const dSign = d.delta >= 0 ? "+" : "";
      const dColor = d.delta > 0 ? chalk.green : chalk.red;
      console.log(`  ${chalk.dim("\u2022")} ${d.name}: ${d.before} \u2192 ${d.after} ${dColor(`(${dSign}${d.delta})`)}`);
    }
  }
  console.log(`${chalk.bold("Affected Nodes:")}  ${diff.affectedNodes.length}`);
  console.log(`${chalk.bold("Broken Imports:")}  ${diff.brokenImports.length}`);
  if (diff.brokenImports.length > 0) {
    for (const bi of diff.brokenImports) {
      console.log(`  ${chalk.yellow("\u2022")} ${bi.file} ${bi.reason}`);
    }
  }
  console.log(
    `${chalk.bold("Circular Deps:")}   ${diff.circularDepsIntroduced.length} introduced, ${diff.circularDepsResolved.length} resolved`
  );
  console.log(`${chalk.bold("Added Edges:")}     ${diff.addedEdges.length}`);
  console.log(`${chalk.bold("Removed Edges:")}   ${diff.removedEdges.length}`);
  console.log(chalk.dim(line));
}
function formatAction(action) {
  switch (action.type) {
    case "move":
      return `MOVE ${action.target} \u2192 ${action.destination}`;
    case "delete":
      return `DELETE ${action.target}`;
    case "rename":
      return `RENAME ${action.target} \u2192 ${action.newName}`;
    case "split":
      return `SPLIT ${action.target} \u2192 ${action.newFile} (${action.symbols.join(", ")})`;
    case "merge":
      return `MERGE ${action.source} \u2192 ${action.target}`;
  }
}

// src/commands/security.ts
import { resolve as resolve3, dirname as dirname3, join as join4 } from "path";
import { readFileSync as readFileSync2 } from "fs";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/security/reporter.ts
import chalk2 from "chalk";
var SEVERITY_COLORS = {
  critical: chalk2.red.bold,
  high: chalk2.red,
  medium: chalk2.yellow,
  low: chalk2.blue,
  info: chalk2.dim
};
var SEVERITY_LABELS = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO"
};
function formatTable(result, elapsedMs) {
  const lines = [];
  const sep = "\u2500".repeat(62);
  lines.push("");
  lines.push(chalk2.bold("Depwire Security Scan"));
  lines.push("");
  const summaryParts = [
    result.summary.critical > 0 ? chalk2.red.bold(`${result.summary.critical} Critical`) : null,
    result.summary.high > 0 ? chalk2.red(`${result.summary.high} High`) : null,
    result.summary.medium > 0 ? chalk2.yellow(`${result.summary.medium} Medium`) : null,
    result.summary.low > 0 ? chalk2.blue(`${result.summary.low} Low`) : null,
    result.summary.info > 0 ? chalk2.dim(`${result.summary.info} Info`) : null
  ].filter(Boolean);
  if (summaryParts.length > 0) {
    lines.push(`\u250C${sep}\u2510`);
    lines.push(`\u2502  ${summaryParts.join("  \u2502  ")}  \u2502`);
    lines.push(`\u2514${sep}\u2518`);
  } else {
    lines.push(chalk2.green.bold("  No security findings detected."));
  }
  lines.push("");
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  for (const severity of severityOrder) {
    const group = result.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    const colorFn = SEVERITY_COLORS[severity];
    lines.push(colorFn(SEVERITY_LABELS[severity]));
    for (const finding of group) {
      lines.push(`  ${colorFn(`[${finding.id}]`)} ${finding.title}`);
      lines.push(`  File: ${finding.file}${finding.line ? `:${finding.line}` : ""}`);
      lines.push(`  ${chalk2.dim(finding.description)}`);
      lines.push(`  ${chalk2.dim("Fix:")} ${finding.suggestedFix}`);
      if (finding.graphReachability?.elevatedBy) {
        lines.push(`  ${chalk2.magenta("\u2191 Elevated:")} ${finding.graphReachability.elevatedBy}`);
      }
      lines.push("");
    }
  }
  const elapsed = (elapsedMs / 1e3).toFixed(1);
  lines.push(chalk2.dim(`Scanned ${result.filesScanned} files in ${elapsed}s`));
  lines.push(chalk2.dim("Run with --format json for machine output"));
  lines.push(chalk2.dim("Run with --format sarif for GitHub Security integration"));
  lines.push("");
  return lines.join("\n");
}
function formatJSON(result) {
  return JSON.stringify(result, null, 2);
}
function formatSARIF(result, version) {
  const rules = result.findings.map((f) => ({
    id: f.id,
    shortDescription: { text: f.title },
    fullDescription: { text: f.description },
    help: { text: f.suggestedFix },
    properties: {
      severity: f.severity,
      vulnerabilityClass: f.vulnerabilityClass
    }
  }));
  const uniqueRules = Array.from(
    new Map(rules.map((r) => [r.id, r])).values()
  );
  const results = result.findings.map((f) => {
    let level;
    if (f.severity === "critical" || f.severity === "high") level = "error";
    else if (f.severity === "medium") level = "warning";
    else level = "note";
    const sarifResult = {
      ruleId: f.id,
      level,
      message: { text: `${f.title}: ${f.description}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file },
            region: f.line ? { startLine: f.line } : void 0
          }
        }
      ]
    };
    return sarifResult;
  });
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "depwire",
            version,
            rules: uniqueRules
          }
        },
        results
      }
    ]
  };
  return JSON.stringify(sarif, null, 2);
}

// src/commands/security.ts
var __filename3 = fileURLToPath3(import.meta.url);
var __dirname3 = dirname3(__filename3);
function getVersion() {
  try {
    let dir = __dirname3;
    for (let i = 0; i < 5; i++) {
      const pkgPath = join4(dir, "package.json");
      try {
        const pkg = JSON.parse(readFileSync2(pkgPath, "utf-8"));
        if (pkg.name === "depwire-cli") return pkg.version;
      } catch {
      }
      dir = dirname3(dir);
    }
  } catch {
  }
  return "0.0.0";
}
var SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
async function securityCommand(dir, options) {
  const projectRoot = dir === "." ? findProjectRoot() : resolve3(dir);
  console.error(`Scanning: ${projectRoot}`);
  const startTime = Date.now();
  const parsedFiles = await parseProject(projectRoot);
  console.error(`Parsed ${parsedFiles.length} files`);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
  const result = await scanSecurity(projectRoot, graph, {
    target: options.target,
    classes: options.class,
    format: options.format || "table",
    graphAware: true
  });
  const elapsedMs = Date.now() - startTime;
  const format = options.format || "table";
  if (format === "json") {
    console.log(formatJSON(result));
  } else if (format === "sarif") {
    console.log(formatSARIF(result, getVersion()));
  } else {
    console.log(formatTable(result, elapsedMs));
  }
  if (options.failOn) {
    const threshold = options.failOn;
    const thresholdIdx = SEVERITY_ORDER.indexOf(threshold);
    if (thresholdIdx >= 0) {
      const hasFindings = result.findings.some(
        (f) => SEVERITY_ORDER.indexOf(f.severity) <= thresholdIdx
      );
      if (hasFindings) {
        console.error(`Findings at or above ${threshold} severity detected \u2014 exiting with code 1`);
        process.exit(1);
      }
    }
  }
}

// src/commands/verify-change.ts
import { resolve as resolve4 } from "path";
import { readFileSync as readFileSync3, readSync } from "fs";
import chalk3 from "chalk";
async function verifyChangeCommand(dir, options) {
  const input = resolveInput(options);
  if (!input) {
    printUsage();
    process.exit(1);
  }
  const projectRoot = dir === "." ? findProjectRoot() : resolve4(dir);
  console.error(`Parsing project: ${projectRoot}`);
  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
  const result = await verifyChange(input, { graph, projectRoot });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.quiet) {
    printVerdict(result, options);
  } else {
    printHumanReadable(result, options);
  }
  if (options.failOnWarnings) {
    if (result.risk_level === "high") {
      process.exit(2);
    } else if (result.risk_level === "medium") {
      process.exit(1);
    }
  }
}
function resolveInput(options) {
  if (options.diff) {
    const diffContent = readFileSync3(resolve4(options.diff), "utf-8");
    return { unified_diff: diffContent };
  }
  if (options.file && options.content) {
    return { file_path: options.file, new_content: options.content };
  }
  if (options.file && options.contentFrom) {
    const content = readFileSync3(resolve4(options.contentFrom), "utf-8");
    return { file_path: options.file, new_content: content };
  }
  if (options.file && !options.content && !options.contentFrom && !options.diff) {
    if (!process.stdin.isTTY) {
      const chunks = [];
      const buf = Buffer.alloc(65536);
      let bytesRead;
      try {
        while ((bytesRead = readSync(0, buf, 0, buf.length, null)) > 0) {
          chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
        }
      } catch {
      }
      const stdinContent = Buffer.concat(chunks).toString("utf-8");
      if (stdinContent.length > 0) {
        return { file_path: options.file, new_content: stdinContent };
      }
    }
  }
  return null;
}
function printUsage() {
  console.error(`Usage: depwire verify-change [options]

Input modes (exactly one required):
  --file <path> --content <string>       File path + new content inline
  --file <path> --content-from <file>    File path + content from another file
  --diff <patch-file>                    Unified diff file
  cat file | depwire verify-change --file <path>   Piped stdin

Options:
  --json                Output raw JSON
  --quiet               Only output the verdict line
  --fail-on-warnings    Exit 1 on medium risk, 2 on high risk
  --health-threshold N  Health regression threshold (default: -3)
  --no-color            Disable terminal colors`);
}
function printVerdict(result, options) {
  const useColor = !options.noColor && process.stdout.isTTY;
  const c = useColor ? chalk3 : { green: (s) => s, red: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s };
  if (result.safe) {
    console.log(c.green("\u2713 SAFE") + c.dim(` \u2014 risk: ${result.risk_level}`));
  } else {
    const icon = result.risk_level === "high" ? "\u2717" : "\u26A0";
    const color = result.risk_level === "high" ? c.red : c.yellow;
    console.log(color(`${icon} UNSAFE`) + c.dim(` \u2014 risk: ${result.risk_level}`));
  }
}
function printHumanReadable(result, options) {
  const useColor = !options.noColor && process.stdout.isTTY;
  const c = useColor ? chalk3 : { green: (s) => s, red: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s };
  const line = "\u2500".repeat(50);
  console.log("");
  console.log(c.bold("Verify Change Report"));
  console.log(c.dim(line));
  printVerdict(result, options);
  console.log(c.dim(line));
  const deltaSign = result.health_score_delta >= 0 ? "+" : "";
  const deltaColor = result.health_score_delta > 0 ? c.green : result.health_score_delta === 0 ? c.yellow : c.red;
  console.log(
    `${c.bold("Health Score:")}  ${result.health_score_before} \u2192 ${result.health_score_after}  ` + deltaColor(`(${deltaSign}${result.health_score_delta})`)
  );
  console.log(`${c.bold("Broken Imports:")} ${result.broken_imports.length}`);
  if (result.broken_imports.length > 0) {
    for (const bi of result.broken_imports) {
      console.log(`  ${c.red("\u2022")} ${bi.file} \u2014 missing ${c.bold(bi.missing_symbol)}`);
    }
  }
  console.log(`${c.bold("New Circular Deps:")} ${result.new_circular_dependencies.length}`);
  if (result.new_circular_dependencies.length > 0) {
    for (const dep of result.new_circular_dependencies) {
      console.log(`  ${c.red("\u2022")} ${dep.cycle.join(" \u2192 ")}`);
    }
  }
  console.log(`${c.bold("Security Findings:")} ${result.security_findings.length}`);
  if (result.security_findings.length > 0) {
    for (const f of result.security_findings) {
      const sevColor = f.severity === "critical" || f.severity === "high" ? c.red : f.severity === "medium" ? c.yellow : c.dim;
      console.log(`  ${sevColor("\u2022")} [${f.severity.toUpperCase()}] ${f.description} (${f.file}:${f.line})`);
    }
  }
  console.log(`${c.bold("Blast Radius:")}    ${result.blast_radius} files affected`);
  if (result.affected_files.length > 0 && result.affected_files.length <= 10) {
    for (const f of result.affected_files) {
      console.log(`  ${c.dim("\u2022")} ${f}`);
    }
  } else if (result.affected_files.length > 10) {
    for (const f of result.affected_files.slice(0, 10)) {
      console.log(`  ${c.dim("\u2022")} ${f}`);
    }
    console.log(c.dim(`  \u2026 and ${result.affected_files.length - 10} more`));
  }
  if (result.warnings.length > 0) {
    console.log(c.dim(line));
    console.log(`${c.bold("Warnings:")}`);
    for (const w of result.warnings) {
      console.log(`  ${c.yellow("\u26A0")} ${w}`);
    }
  }
  console.log(c.dim(line));
  console.log("");
}

// src/commands/diff.ts
import chalk4 from "chalk";

// src/core/diff.ts
import { execSync } from "child_process";
function git(cmd, cwd) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function isGitRepo2(cwd) {
  try {
    git("rev-parse --git-dir", cwd);
    return true;
  } catch {
    return false;
  }
}
function resolveRef(ref, cwd) {
  try {
    return git(`rev-parse ${ref}`, cwd);
  } catch {
    throw new DiffError(`Invalid git ref: "${ref}"`, 2);
  }
}
var DiffError = class extends Error {
  exitCode;
  constructor(message, exitCode) {
    super(message);
    this.name = "DiffError";
    this.exitCode = exitCode;
  }
};
async function computeDiff(commitA, commitB, projectRoot, options = {}) {
  if (!isGitRepo2(projectRoot)) {
    throw new DiffError("Not a git repository. Run this command inside a git project.", 2);
  }
  const resolvedA = resolveRef(commitA, projectRoot);
  const resolvedB = resolveRef(commitB, projectRoot);
  let originalRef;
  try {
    originalRef = git("rev-parse --abbrev-ref HEAD", projectRoot);
    if (originalRef === "HEAD") {
      originalRef = git("rev-parse HEAD", projectRoot);
    }
  } catch {
    throw new DiffError("Failed to determine current HEAD.", 2);
  }
  let stashed = false;
  try {
    const status = git("status --porcelain", projectRoot);
    if (status.length > 0) {
      git('stash push -m "depwire-diff-temp-stash"', projectRoot);
      stashed = true;
    }
  } catch {
    throw new DiffError("Failed to stash uncommitted changes.", 2);
  }
  let graphA;
  let graphB;
  let healthA = null;
  let healthB = null;
  let securityA = [];
  let securityB = [];
  let filesA = [];
  let filesB = [];
  let symbolsA = /* @__PURE__ */ new Map();
  let symbolsB = /* @__PURE__ */ new Map();
  let edgesA = /* @__PURE__ */ new Map();
  let edgesB = /* @__PURE__ */ new Map();
  try {
    console.error(`Checking out ${commitA} (${resolvedA.slice(0, 8)})...`);
    git(`checkout ${resolvedA} --quiet`, projectRoot);
    const parsedA = await parseProject(projectRoot);
    const gA = buildGraph(parsedA, projectRoot);
    graphA = gA;
    const summaryA = getArchitectureSummary(gA);
    filesA = Array.from(/* @__PURE__ */ new Set());
    gA.forEachNode((_n, attrs) => {
      filesA.push(attrs.filePath);
    });
    filesA = [...new Set(filesA)];
    gA.forEachNode((nodeId, attrs) => {
      symbolsA.set(nodeId, {
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine
      });
    });
    gA.forEachEdge((_edge, attrs, source, target) => {
      const key = `${source}->${target}::${attrs.kind}`;
      edgesA.set(key, {
        source,
        target,
        kind: attrs.kind,
        filePath: attrs.filePath || "",
        line: attrs.line || 0
      });
    });
    if (!options.noHealth) {
      const report = calculateHealthScore(gA, projectRoot);
      healthA = { overall: report.overall, grade: report.grade };
    }
    if (!options.noSecurity) {
      try {
        const scanResult = await scanSecurity(projectRoot, gA, { graphAware: true });
        if (scanResult?.findings) {
          securityA = scanResult.findings.map((f) => ({
            severity: f.severity || "low",
            title: f.title || f.description || "",
            file: f.file || "",
            line: f.line || 0,
            vulnerabilityClass: f.vulnerabilityClass || ""
          }));
        }
      } catch {
      }
    }
    console.error(`Checking out ${commitB} (${resolvedB.slice(0, 8)})...`);
    git(`checkout ${resolvedB} --quiet`, projectRoot);
    const parsedB = await parseProject(projectRoot);
    const gB = buildGraph(parsedB, projectRoot);
    graphB = gB;
    gB.forEachNode((_n, attrs) => {
      filesB.push(attrs.filePath);
    });
    filesB = [...new Set(filesB)];
    gB.forEachNode((nodeId, attrs) => {
      symbolsB.set(nodeId, {
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine
      });
    });
    gB.forEachEdge((_edge, attrs, source, target) => {
      const key = `${source}->${target}::${attrs.kind}`;
      edgesB.set(key, {
        source,
        target,
        kind: attrs.kind,
        filePath: attrs.filePath || "",
        line: attrs.line || 0
      });
    });
    if (!options.noHealth) {
      const report = calculateHealthScore(gB, projectRoot);
      healthB = { overall: report.overall, grade: report.grade };
    }
    if (!options.noSecurity) {
      try {
        const scanResult = await scanSecurity(projectRoot, gB, { graphAware: true });
        if (scanResult?.findings) {
          securityB = scanResult.findings.map((f) => ({
            severity: f.severity || "low",
            title: f.title || f.description || "",
            file: f.file || "",
            line: f.line || 0,
            vulnerabilityClass: f.vulnerabilityClass || ""
          }));
        }
      } catch {
      }
    }
  } finally {
    try {
      console.error(`Restoring original state...`);
      git(`checkout ${originalRef} --quiet`, projectRoot);
    } catch {
      try {
        git(`checkout -f ${originalRef} --quiet`, projectRoot);
      } catch {
        console.error(`WARNING: Failed to restore original ref "${originalRef}". Manual cleanup needed.`);
      }
    }
    if (stashed) {
      try {
        git("stash pop", projectRoot);
      } catch {
        console.error('WARNING: Failed to restore stashed changes. Run "git stash pop" manually.');
      }
    }
  }
  const addedSymbols = [];
  const removedSymbols = [];
  const modifiedSymbols = [];
  for (const [id, sym] of symbolsB) {
    if (!symbolsA.has(id)) {
      addedSymbols.push(sym);
    } else {
      const oldSym = symbolsA.get(id);
      if (oldSym.kind !== sym.kind || oldSym.startLine !== sym.startLine || oldSym.endLine !== sym.endLine) {
        modifiedSymbols.push(sym);
      }
    }
  }
  for (const [id, sym] of symbolsA) {
    if (!symbolsB.has(id)) {
      removedSymbols.push(sym);
    }
  }
  const addedEdges = [];
  const removedEdges = [];
  for (const [key, edge] of edgesB) {
    if (!edgesA.has(key)) {
      addedEdges.push(edge);
    }
  }
  for (const [key, edge] of edgesA) {
    if (!edgesB.has(key)) {
      removedEdges.push(edge);
    }
  }
  const fileSetA = new Set(filesA);
  const fileSetB = new Set(filesB);
  const addedFiles = filesB.filter((f) => !fileSetA.has(f));
  const removedFiles = filesA.filter((f) => !fileSetB.has(f));
  const blastFiles = /* @__PURE__ */ new Set();
  for (const sym of addedSymbols) blastFiles.add(sym.filePath);
  for (const sym of removedSymbols) blastFiles.add(sym.filePath);
  for (const sym of modifiedSymbols) blastFiles.add(sym.filePath);
  for (const edge of addedEdges) {
    if (edge.filePath) blastFiles.add(edge.filePath);
  }
  for (const edge of removedEdges) {
    if (edge.filePath) blastFiles.add(edge.filePath);
  }
  let health = null;
  if (healthA && healthB) {
    health = {
      before: healthA.overall,
      after: healthB.overall,
      delta: healthB.overall - healthA.overall,
      grade_before: healthA.grade,
      grade_after: healthB.grade
    };
  }
  let security = null;
  if (!options.noSecurity) {
    const secAKeys = new Set(securityA.map((f) => `${f.file}:${f.line}:${f.vulnerabilityClass}`));
    const secBKeys = new Set(securityB.map((f) => `${f.file}:${f.line}:${f.vulnerabilityClass}`));
    const newFindings = securityB.filter((f) => !secAKeys.has(`${f.file}:${f.line}:${f.vulnerabilityClass}`));
    const fixedFindings = securityA.filter((f) => !secBKeys.has(`${f.file}:${f.line}:${f.vulnerabilityClass}`));
    security = { new_findings: newFindings, fixed_findings: fixedFindings };
  }
  return {
    commit_a: commitA,
    commit_b: commitB,
    commit_a_resolved: resolvedA,
    commit_b_resolved: resolvedB,
    symbols: { added: addedSymbols, removed: removedSymbols, modified: modifiedSymbols },
    edges: { added: addedEdges, removed: removedEdges },
    files: { added: addedFiles, removed: removedFiles, count_a: filesA.length, count_b: filesB.length },
    blast_radius: { files: Array.from(blastFiles), count: blastFiles.size },
    health,
    security
  };
}

// src/commands/diff.ts
import { resolve as resolve5 } from "path";
async function diffCommand(commitA, commitB, dir, options) {
  if (!commitA || !commitB) {
    printUsage2();
    process.exit(1);
  }
  const projectRoot = dir === "." ? findProjectRoot() : resolve5(dir);
  try {
    const result = await computeDiff(commitA, commitB, projectRoot, {
      path: options.path,
      noSecurity: options.noSecurity,
      noHealth: options.noHealth
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanReadable2(result, options);
    }
  } catch (err) {
    if (err instanceof DiffError) {
      console.error(getC(options).red(`Error: ${err.message}`));
      process.exit(err.exitCode);
    }
    throw err;
  }
}
function getC(options) {
  const useColor = !options.noColor && process.stdout.isTTY;
  if (useColor) return chalk4;
  return {
    green: (s) => s,
    red: (s) => s,
    yellow: (s) => s,
    dim: (s) => s,
    bold: (s) => s,
    cyan: (s) => s
  };
}
function printUsage2() {
  console.error(`Usage: depwire diff <commit-a> <commit-b> [options]

Compare the dependency graph between two git commits.
Shows added/removed/modified symbols, edge changes, blast radius,
health delta, and security diff \u2014 all computed deterministically.

Arguments:
  commit-a         Any valid git ref (branch, tag, hash, HEAD~N)
  commit-b         Any valid git ref

Options:
  --json           Output JSON for scripting
  --verbose        Show every changed symbol and edge by name
  --no-color       Disable terminal colors
  --no-security    Skip security diff (faster)
  --no-health      Skip health score comparison (faster)
  --path <path>    Diff a specific subdirectory only

Examples:
  depwire diff main feature/auth-refactor
  depwire diff HEAD~5 HEAD --verbose
  depwire diff v1.5.0 v1.6.0 --json | jq`);
}
function printHumanReadable2(result, options) {
  const c = getC(options);
  const line = "\u2501".repeat(47);
  const totalChanges = result.symbols.added.length + result.symbols.removed.length + result.symbols.modified.length + result.edges.added.length + result.edges.removed.length;
  if (totalChanges === 0 && result.files.added.length === 0 && result.files.removed.length === 0) {
    console.log(`No structural changes between ${result.commit_a} and ${result.commit_b}.`);
    return;
  }
  console.log("");
  console.log(c.bold(`Depwire diff: ${result.commit_a}..${result.commit_b}`));
  console.log(c.dim(line));
  console.log("");
  console.log(c.bold("Symbols"));
  if (result.symbols.added.length > 0) {
    const names = result.symbols.added.slice(0, 3).map((s) => s.name);
    const more = result.symbols.added.length > 3 ? ` ...` : "";
    console.log(`  ${c.green("+")} ${result.symbols.added.length} added      ${c.dim(names.join(", ") + more)}`);
  }
  if (result.symbols.removed.length > 0) {
    const names = result.symbols.removed.slice(0, 3).map((s) => s.name);
    const more = result.symbols.removed.length > 3 ? ` ...` : "";
    console.log(`  ${c.red("-")} ${result.symbols.removed.length} removed    ${c.dim(names.join(", ") + more)}`);
  }
  if (result.symbols.modified.length > 0) {
    const names = result.symbols.modified.slice(0, 3).map((s) => s.name);
    const more = result.symbols.modified.length > 3 ? ` ...` : "";
    console.log(`  ${c.yellow("~")} ${result.symbols.modified.length} modified   ${c.dim(names.join(", ") + more)}`);
  }
  if (result.symbols.added.length === 0 && result.symbols.removed.length === 0 && result.symbols.modified.length === 0) {
    console.log(`  ${c.dim("(no changes)")}`);
  }
  console.log("");
  console.log(c.bold("Edges"));
  if (result.edges.added.length > 0) {
    console.log(`  ${c.green("+")} ${result.edges.added.length} added`);
  }
  if (result.edges.removed.length > 0) {
    console.log(`  ${c.red("-")} ${result.edges.removed.length} removed`);
  }
  if (result.edges.added.length === 0 && result.edges.removed.length === 0) {
    console.log(`  ${c.dim("(no changes)")}`);
  }
  console.log("");
  console.log(c.bold("Files"));
  console.log(`  ${result.files.count_a} \u2192 ${result.files.count_b}  (${c.green(`+${result.files.added.length}`)} / ${c.red(`-${result.files.removed.length}`)})`);
  console.log("");
  console.log(`${c.bold("Blast radius:")}    ${result.blast_radius.count} files affected`);
  if (result.health) {
    const deltaSign = result.health.delta >= 0 ? "+" : "";
    const deltaColor = result.health.delta > 0 ? c.green : result.health.delta === 0 ? c.yellow : c.red;
    console.log(
      `${c.bold("Health score:")}    ${result.health.before} \u2192 ${result.health.after}  ${deltaColor(`(${deltaSign}${result.health.delta})`)}  [${result.health.grade_before} \u2192 ${result.health.grade_after}]`
    );
  }
  if (result.security) {
    const newCount = result.security.new_findings.length;
    const fixedCount = result.security.fixed_findings.length;
    const newStr = newCount > 0 ? c.red(`${newCount} new`) : c.dim("0 new");
    const fixedStr = fixedCount > 0 ? c.green(`${fixedCount} fixed`) : c.dim("0 fixed");
    console.log(`${c.bold("Security:")}        ${newStr} / ${fixedStr}`);
  }
  console.log(c.dim(line));
  if (options.verbose) {
    console.log("");
    if (result.symbols.added.length > 0) {
      console.log(c.bold(c.green("Added symbols:")));
      for (const sym of result.symbols.added) {
        console.log(`  ${c.green("+")} ${sym.name} (${sym.kind}) ${c.dim(sym.filePath + ":" + sym.startLine)}`);
      }
      console.log("");
    }
    if (result.symbols.removed.length > 0) {
      console.log(c.bold(c.red("Removed symbols:")));
      for (const sym of result.symbols.removed) {
        console.log(`  ${c.red("-")} ${sym.name} (${sym.kind}) ${c.dim(sym.filePath + ":" + sym.startLine)}`);
      }
      console.log("");
    }
    if (result.symbols.modified.length > 0) {
      console.log(c.bold(c.yellow("Modified symbols:")));
      for (const sym of result.symbols.modified) {
        console.log(`  ${c.yellow("~")} ${sym.name} (${sym.kind}) ${c.dim(sym.filePath + ":" + sym.startLine)}`);
      }
      console.log("");
    }
    if (result.edges.added.length > 0 && result.edges.added.length <= 50) {
      console.log(c.bold(c.green("Added edges:")));
      for (const edge of result.edges.added.slice(0, 20)) {
        const src = edge.source.split("::").pop() || edge.source;
        const tgt = edge.target.split("::").pop() || edge.target;
        console.log(`  ${c.green("+")} ${src} \u2192 ${tgt} (${edge.kind})`);
      }
      if (result.edges.added.length > 20) {
        console.log(c.dim(`  ... and ${result.edges.added.length - 20} more`));
      }
      console.log("");
    }
    if (result.edges.removed.length > 0 && result.edges.removed.length <= 50) {
      console.log(c.bold(c.red("Removed edges:")));
      for (const edge of result.edges.removed.slice(0, 20)) {
        const src = edge.source.split("::").pop() || edge.source;
        const tgt = edge.target.split("::").pop() || edge.target;
        console.log(`  ${c.red("-")} ${src} \u2192 ${tgt} (${edge.kind})`);
      }
      if (result.edges.removed.length > 20) {
        console.log(c.dim(`  ... and ${result.edges.removed.length - 20} more`));
      }
      console.log("");
    }
    if (result.blast_radius.files.length > 0) {
      console.log(c.bold("Affected files:"));
      for (const f of result.blast_radius.files.slice(0, 20)) {
        console.log(`  ${c.dim("\u2022")} ${f}`);
      }
      if (result.blast_radius.files.length > 20) {
        console.log(c.dim(`  ... and ${result.blast_radius.files.length - 20} more`));
      }
      console.log("");
    }
    if (result.security && result.security.new_findings.length > 0) {
      console.log(c.bold(c.red("New security findings:")));
      for (const f of result.security.new_findings) {
        console.log(`  ${c.red("\u2022")} [${f.severity.toUpperCase()}] ${f.title} (${f.file}:${f.line})`);
      }
      console.log("");
    }
    if (result.security && result.security.fixed_findings.length > 0) {
      console.log(c.bold(c.green("Fixed security findings:")));
      for (const f of result.security.fixed_findings) {
        console.log(`  ${c.green("\u2022")} [${f.severity.toUpperCase()}] ${f.title} (${f.file}:${f.line})`);
      }
      console.log("");
    }
  }
  console.log("");
}

// src/index.ts
var __filename4 = fileURLToPath4(import.meta.url);
var __dirname4 = dirname4(__filename4);
var packageJsonPath = join5(__dirname4, "../package.json");
var packageJson = JSON.parse(readFileSync4(packageJsonPath, "utf-8"));
var program = new Command();
program.name("depwire").description("Code cross-reference graph builder for multi-language projects").version(packageJson.version);
program.command("parse").description("Parse a project and build dependency graph").argument("[directory]", "Project directory to parse (defaults to current directory or auto-detected project root)").option("-o, --output <path>", "Output JSON file path", "depwire-output.json").option("--pretty", "Pretty-print JSON output").option("--stats", "Print summary statistics").option("--exclude <patterns...>", 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")').option("--verbose", "Show detailed parsing progress").action(async (directory, options) => {
  trackCommand("parse", packageJson.version);
  const startTime = Date.now();
  try {
    const projectRoot = directory ? resolve6(directory) : findProjectRoot();
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = await parseProject(projectRoot, {
      exclude: options.exclude,
      verbose: options.verbose
    });
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles, projectRoot);
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
  trackCommand("query", packageJson.version);
  try {
    const projectRoot = resolve6(directory);
    const cacheFile = resolve6("depwire-output.json");
    let graph;
    if (existsSync(cacheFile)) {
      console.log("Loading from cache...");
      const json = JSON.parse(readFileSync4(cacheFile, "utf-8"));
      graph = importFromJSON(json);
    } else {
      console.log("Parsing project...");
      const parsedFiles = await parseProject(projectRoot);
      graph = buildGraph(parsedFiles, projectRoot);
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
  trackCommand("viz", packageJson.version);
  try {
    const projectRoot = directory ? resolve6(directory) : findProjectRoot();
    console.log(`Parsing project: ${projectRoot}`);
    const parsedFiles = await parseProject(projectRoot, {
      exclude: options.exclude,
      verbose: options.verbose
    });
    console.log(`Parsed ${parsedFiles.length} files`);
    const graph = buildGraph(parsedFiles, projectRoot);
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
  trackCommand("temporal", packageJson.version);
  try {
    const projectRoot = directory ? resolve6(directory) : findProjectRoot();
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
  trackCommand("mcp", packageJson.version);
  try {
    const state = createEmptyState();
    let projectRootToConnect = null;
    if (directory) {
      projectRootToConnect = resolve6(directory);
    } else {
      const detectedRoot = findProjectRoot();
      const cwd = process.cwd();
      if (detectedRoot !== cwd || existsSync(join5(cwd, "package.json")) || existsSync(join5(cwd, "tsconfig.json")) || existsSync(join5(cwd, "go.mod")) || existsSync(join5(cwd, "pyproject.toml")) || existsSync(join5(cwd, "setup.py")) || existsSync(join5(cwd, ".git"))) {
        projectRootToConnect = detectedRoot;
      }
    }
    if (projectRootToConnect) {
      console.error(`Parsing project: ${projectRootToConnect}`);
      const parsedFiles = await parseProject(projectRootToConnect);
      console.error(`Parsed ${parsedFiles.length} files`);
      const graph = buildGraph(parsedFiles, projectRootToConnect);
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
  trackCommand("docs", packageJson.version);
  const startTime = Date.now();
  try {
    const projectRoot = directory ? resolve6(directory) : findProjectRoot();
    const outputDir = options.output ? resolve6(options.output) : join5(projectRoot, ".depwire");
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
    const graph = buildGraph(parsedFiles, projectRoot);
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
  return new Promise((resolve7) => {
    rl.question("Add .depwire/ to .gitignore? [Y/n] ", (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve7(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}
function addToGitignore(projectRoot, pattern) {
  const gitignorePath = join5(projectRoot, ".gitignore");
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
  trackCommand("health", packageJson.version);
  try {
    const projectRoot = directory ? resolve6(directory) : findProjectRoot();
    const startTime = Date.now();
    const parsedFiles = await parseProject(projectRoot);
    const graph = buildGraph(parsedFiles, projectRoot);
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
program.command("dead-code").description("Identify dead code - symbols defined but never referenced").argument("[directory]", "Project directory to analyze (defaults to current directory or auto-detected project root)").option("--confidence <level>", "Minimum confidence level to show: high, medium, low (default: medium)", "medium").option("--json", "Output as JSON (for CI/automation)").option("--verbose", "Show detailed info for each dead symbol").option("--stats", "Show summary statistics").option("--include-tests", "Include test files in analysis").option("--include-low", "Shortcut for --confidence low").option("--debug", "Show debug information (exclusion stats)").action(async (directory, options) => {
  trackCommand("dead-code", packageJson.version);
  try {
    const projectRoot = directory ? resolve6(directory) : findProjectRoot();
    const startTime = Date.now();
    const parsedFiles = await parseProject(projectRoot);
    const graph = buildGraph(parsedFiles, projectRoot);
    const confidence = options.includeLow ? "low" : options.confidence || "medium";
    const report = analyzeDeadCode(graph, projectRoot, {
      confidence,
      includeTests: options.includeTests || false,
      verbose: options.verbose || false,
      stats: options.stats || false,
      json: options.json || false,
      debug: options.debug || false
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    }
    const totalTime = Date.now() - startTime;
    if (!options.json) {
      console.log(`
Analysis completed in ${(totalTime / 1e3).toFixed(2)}s
`);
    }
  } catch (err) {
    console.error("Error analyzing dead code:", err);
    process.exit(1);
  }
});
program.command("whatif").description("Simulate architectural changes before touching code").argument("[directory]", "Project directory (defaults to auto-detected project root)").option("--simulate <action>", "Action to simulate: move, delete, rename, split, merge").option("--target <file>", "File to apply the action to").option("--destination <file>", "Destination path (for move action)").option("--new-name <name>", "New name (for rename action)").option("--source <file>", "Source file (for merge action)").option("--new-file <file>", "New file path (for split action)").option("--symbols <symbols>", "Comma-separated symbol names (for split action)").action(async (directory, options) => {
  trackCommand("whatif", packageJson.version);
  try {
    await whatif(directory || ".", options);
  } catch (err) {
    console.error("Error running simulation:", err);
    process.exit(1);
  }
});
program.command("security").description("Scan codebase for security vulnerabilities (deterministic, no API key required)").argument("[directory]", "Project directory to scan (defaults to current directory or auto-detected project root)").option("--target <file>", "Scan a single file instead of the whole repo").option("--class <classes...>", "Only run specific vulnerability class checks").option("--format <format>", "Output format: table (default), json, sarif", "table").option("--fail-on <level>", "Exit with code 1 if findings at this severity or above").action(async (directory, options) => {
  trackCommand("security", packageJson.version);
  try {
    await securityCommand(directory || ".", options);
  } catch (err) {
    console.error("Error running security scan:", err);
    process.exit(1);
  }
});
program.command("verify-change").description("Verify a proposed code change is safe before applying it").argument("[directory]", "Project directory (defaults to auto-detected project root)").option("--file <path>", "File path being changed").option("--content <string>", "New file content (inline)").option("--content-from <file>", "Read new content from a file").option("--diff <patch>", "Unified diff file to verify").option("--json", "Output raw JSON").option("--quiet", "Only output the verdict line").option("--fail-on-warnings", "Exit 1 on medium risk, 2 on high risk").option("--health-threshold <n>", "Health regression threshold (default: -3)").option("--no-color", "Disable terminal colors").action(async (directory, options) => {
  trackCommand("verify-change", packageJson.version);
  try {
    await verifyChangeCommand(directory || ".", options);
  } catch (err) {
    console.error("Error running verify-change:", err);
    process.exit(1);
  }
});
program.command("diff").description("Compare dependency graph between two git commits").argument("<commit-a>", "First git ref (branch, tag, hash, HEAD~N)").argument("<commit-b>", "Second git ref").option("--json", "Output JSON for scripting").option("--verbose", "Show every changed symbol and edge by name").option("--no-color", "Disable terminal colors").option("--no-security", "Skip security diff (faster)").option("--no-health", "Skip health score comparison (faster)").option("--path <path>", "Diff a specific subdirectory only").action(async (commitA, commitB, options) => {
  trackCommand("diff", packageJson.version);
  try {
    await diffCommand(commitA, commitB, ".", options);
  } catch (err) {
    console.error("Error running diff:", err);
    process.exit(1);
  }
});
program.parse();
