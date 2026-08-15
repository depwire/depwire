import {
  SimulationEngine,
  analyzeDeadCode,
  buildGraph,
  calculateHealthScore,
  findSymbols,
  generateDocs,
  getAffectedFiles,
  getArchitectureSummary,
  getCrossFileEdges,
  getDependencies,
  getDependents,
  getFileSummary,
  getImpact,
  getParserForFile,
  initParser,
  loadMetadata,
  parseProject,
  parseTypeScriptFile,
  scanSecurity,
  searchSymbols
} from "./chunk-UAQP5QGE.js";

// src/viz/data.ts
import { basename } from "path";
function prepareVizData(graph, projectRoot) {
  const fileSummary = getFileSummary(graph);
  const crossFileEdges = getCrossFileEdges(graph);
  const files = fileSummary.map((f) => ({
    path: f.filePath,
    directory: f.filePath.includes("/") ? f.filePath.substring(0, f.filePath.lastIndexOf("/")) : ".",
    symbolCount: f.symbolCount,
    incomingCount: f.incomingRefs,
    outgoingCount: f.outgoingRefs
  }));
  files.sort((a, b) => {
    if (a.directory !== b.directory) {
      return a.directory.localeCompare(b.directory);
    }
    return a.path.localeCompare(b.path);
  });
  const arcMap = /* @__PURE__ */ new Map();
  for (const edge of crossFileEdges) {
    const key = `${edge.sourceFile}::${edge.targetFile}`;
    if (arcMap.has(key)) {
      const arc = arcMap.get(key);
      arc.edgeCount++;
      if (!arc.edgeKinds.includes(edge.kind)) {
        arc.edgeKinds.push(edge.kind);
      }
      if (edge.crossLanguage) {
        arc.crossLanguage = true;
        arc.edgeType = edge.edgeType || arc.edgeType;
      }
    } else {
      arcMap.set(key, {
        sourceFile: edge.sourceFile,
        targetFile: edge.targetFile,
        edgeCount: 1,
        edgeKinds: [edge.kind],
        crossLanguage: edge.crossLanguage || false,
        edgeType: edge.edgeType
      });
    }
  }
  const arcs = Array.from(arcMap.values());
  const projectName = basename(projectRoot);
  return {
    files,
    arcs,
    stats: {
      totalFiles: files.length,
      totalSymbols: graph.order,
      totalEdges: graph.size,
      totalCrossFileEdges: arcs.reduce((sum, arc) => sum + arc.edgeCount, 0)
    },
    projectName
  };
}

// src/watcher.ts
import chokidar from "chokidar";
function watchProject(projectRoot, callbacks) {
  console.error(`[Watcher] Creating watcher for: ${projectRoot}`);
  const watcherOptions = {
    ignored: [
      "**/node_modules/**",
      "**/vendor/**",
      // Go dependencies
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/.DS_Store",
      // macOS metadata
      "**/.env",
      // Environment files
      "**/.env.*",
      // Environment variants
      "**/.eslintcache",
      // ESLint cache
      "**/.vscode/**",
      // VS Code settings
      "**/.idea/**"
      // IntelliJ IDEA settings
    ],
    ignoreInitial: true,
    // Don't fire events for existing files
    persistent: true,
    followSymlinks: false,
    usePolling: true,
    // Use polling for macOS reliability
    interval: 1e3,
    // Poll every second
    atomic: true,
    // Handle atomic writes (VS Code, Sublime, etc.)
    awaitWriteFinish: {
      stabilityThreshold: 300,
      // Wait 300ms after last change before firing
      pollInterval: 100
    }
  };
  const watcher = chokidar.watch(projectRoot, watcherOptions);
  console.error("[Watcher] Attaching event listeners...");
  watcher.on("change", (absolutePath) => {
    const validExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".c", ".h", ".cs", ".csx", ".csproj", ".java", ".kt", ".kts", ".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++", ".inl", ".ipp", ".php", ".swift", ".mojo", ".\u{1F525}", ".rb", ".rake", ".gemspec", ".dart", ".R", ".r", ".Rmd", ".rmd"];
    if (!validExtensions.some((ext) => absolutePath.endsWith(ext))) return;
    const fileName = absolutePath.split("/").pop() || "";
    if (!validExtensions.some((ext) => absolutePath.endsWith(ext)) && !["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle.kts", "settings.gradle", "CMakeLists.txt", "conanfile.txt", "vcpkg.json", "Package.swift", "mojoproject.toml", "Gemfile", "pubspec.yaml", "DESCRIPTION", "NAMESPACE", "renv.lock"].includes(fileName)) return;
    if (absolutePath.endsWith("_test.go")) return;
    const relativePath = absolutePath.replace(projectRoot + "/", "");
    console.error(`[Watcher] Change event: ${relativePath}`);
    callbacks.onFileChanged(relativePath);
  });
  watcher.on("add", (absolutePath) => {
    const validExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".c", ".h", ".cs", ".csx", ".csproj", ".java", ".kt", ".kts", ".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++", ".inl", ".ipp", ".php", ".swift", ".mojo", ".\u{1F525}", ".rb", ".rake", ".gemspec", ".dart", ".R", ".r", ".Rmd", ".rmd"];
    const addFileName = absolutePath.split("/").pop() || "";
    if (!validExtensions.some((ext) => absolutePath.endsWith(ext)) && !["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle.kts", "settings.gradle", "CMakeLists.txt", "conanfile.txt", "vcpkg.json", "Package.swift", "mojoproject.toml", "Gemfile", "pubspec.yaml", "DESCRIPTION", "NAMESPACE", "renv.lock"].includes(addFileName)) return;
    if (absolutePath.endsWith("_test.go")) return;
    const relativePath = absolutePath.replace(projectRoot + "/", "");
    console.error(`[Watcher] Add event: ${relativePath}`);
    callbacks.onFileAdded(relativePath);
  });
  watcher.on("unlink", (absolutePath) => {
    const validExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".c", ".h", ".cs", ".csx", ".csproj", ".java", ".kt", ".kts", ".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++", ".inl", ".ipp", ".php", ".swift", ".mojo", ".\u{1F525}", ".rb", ".rake", ".gemspec", ".dart", ".R", ".r", ".Rmd", ".rmd"];
    if (!validExtensions.some((ext) => absolutePath.endsWith(ext))) return;
    if (absolutePath.endsWith("_test.go")) return;
    const relativePath = absolutePath.replace(projectRoot + "/", "");
    console.error(`[Watcher] Unlink event: ${relativePath}`);
    callbacks.onFileDeleted(relativePath);
  });
  watcher.on("error", (error) => {
    console.error("[Watcher] Error:", error);
  });
  watcher.on("ready", () => {
    console.error("[Watcher] Ready \u2014 watching for changes");
    const watched = watcher.getWatched();
    const dirs = Object.keys(watched);
    let fileCount = 0;
    for (const dir of dirs) {
      const files = watched[dir];
      fileCount += files.filter(
        (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx") || f.endsWith(".mjs") || f.endsWith(".cjs") || f.endsWith(".py") || f.endsWith(".go") && !f.endsWith("_test.go") || f.endsWith(".rs") || f.endsWith(".c") || f.endsWith(".h") || f.endsWith(".cs") || f.endsWith(".csx") || f.endsWith(".csproj") || f.endsWith(".java") || f === "pom.xml" || f === "build.gradle" || f === "build.gradle.kts" || f.endsWith(".kt") || f.endsWith(".kts") || f === "settings.gradle.kts" || f === "settings.gradle" || f.endsWith(".php") || f.endsWith(".swift") || f.endsWith(".mojo") || f.endsWith(".\u{1F525}") || f.endsWith(".rb") || f.endsWith(".rake") || f.endsWith(".gemspec") || f.endsWith(".dart") || f.endsWith(".R") || f.endsWith(".r") || f.endsWith(".Rmd") || f.endsWith(".rmd") || f.endsWith(".cpp") || f.endsWith(".cc") || f.endsWith(".cxx") || f.endsWith(".c++") || f.endsWith(".hpp") || f.endsWith(".hh") || f.endsWith(".hxx") || f.endsWith(".h++") || f.endsWith(".inl") || f.endsWith(".ipp") || f === "CMakeLists.txt" || f === "conanfile.txt" || f === "vcpkg.json"
      ).length;
    }
    console.error(`[Watcher] Watching ${fileCount} TypeScript/JavaScript/Python/Go/Rust/C/C++/C#/Java/Kotlin/PHP/Swift/Mojo/Ruby/Dart/R files in ${dirs.length} directories`);
  });
  return watcher;
}

// src/viz/server.ts
import express from "express";
import open from "open";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { WebSocketServer } from "ws";
var __filename = fileURLToPath(import.meta.url);
var __dirname2 = dirname(__filename);
var activeServer = null;
async function findAvailablePort(startPort, maxAttempts = 10) {
  const net = await import("net");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const testPort = startPort + attempt;
    const isAvailable = await new Promise((resolve4) => {
      const server = net.createServer();
      server.once("error", () => {
        resolve4(false);
      });
      server.once("listening", () => {
        server.close();
        resolve4(true);
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
async function startVizServer(initialVizData, graph, projectRoot, port = 3333, shouldOpen = true, options) {
  if (activeServer) {
    console.error(`Visualization server already running at ${activeServer.url}`);
    return {
      server: activeServer.server,
      url: activeServer.url,
      alreadyRunning: true
    };
  }
  const availablePort = await findAvailablePort(port);
  const app = express();
  let vizData = initialVizData;
  const publicDir = join(__dirname2, "viz", "public");
  app.use(express.static(publicDir));
  app.get("/api/graph", (req, res) => {
    res.json(vizData);
  });
  const server = app.listen(availablePort, "127.0.0.1", () => {
    const url2 = `http://127.0.0.1:${availablePort}`;
    console.error(`
Depwire visualization running at ${url2}`);
    console.error("Press Ctrl+C to stop\n");
    activeServer = { server, port: availablePort, url: url2 };
    if (shouldOpen) {
      open(url2);
    }
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    console.error("Browser connected to WebSocket");
    ws.on("close", () => {
      console.error("Browser disconnected from WebSocket");
    });
  });
  function broadcastRefresh() {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "refresh" }));
      }
    });
  }
  console.error("Starting file watcher...");
  const watcher = watchProject(projectRoot, {
    onFileChanged: async (filePath) => {
      console.error(`File changed: ${filePath} \u2014 re-parsing project...`);
      try {
        const parsedFiles = await parseProject(projectRoot, options);
        const newGraph = buildGraph(parsedFiles, projectRoot);
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        vizData = prepareVizData(graph, projectRoot);
        broadcastRefresh();
        console.error(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to update graph for ${filePath}:`, error);
      }
    },
    onFileAdded: async (filePath) => {
      console.error(`File added: ${filePath} \u2014 re-parsing project...`);
      try {
        const parsedFiles = await parseProject(projectRoot, options);
        const newGraph = buildGraph(parsedFiles, projectRoot);
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        vizData = prepareVizData(graph, projectRoot);
        broadcastRefresh();
        console.error(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to update graph for ${filePath}:`, error);
      }
    },
    onFileDeleted: async (filePath) => {
      console.error(`File deleted: ${filePath} \u2014 re-parsing project...`);
      try {
        const parsedFiles = await parseProject(projectRoot, options);
        const newGraph = buildGraph(parsedFiles, projectRoot);
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        vizData = prepareVizData(graph, projectRoot);
        broadcastRefresh();
        console.error(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to remove ${filePath} from graph:`, error);
      }
    }
  });
  process.on("SIGINT", () => {
    console.error("\nShutting down visualization server...");
    activeServer = null;
    watcher.close();
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  });
  const url = `http://127.0.0.1:${availablePort}`;
  return { server, url, alreadyRunning: false };
}

// src/mcp/state.ts
function createEmptyState() {
  return {
    graph: null,
    projectRoot: null,
    projectName: null,
    watcher: null
  };
}
function isProjectLoaded(state) {
  return state.graph !== null && state.projectRoot !== null;
}

// src/graph/updater.ts
import { join as join2 } from "path";
function removeFileFromGraph(graph, filePath) {
  const nodesToRemove = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.filePath === filePath) {
      nodesToRemove.push(node);
    }
  });
  nodesToRemove.forEach((node) => {
    try {
      graph.dropNode(node);
    } catch (error) {
    }
  });
}
function addFileToGraph(graph, parsedFile) {
  for (const symbol of parsedFile.symbols) {
    const nodeId = `${parsedFile.filePath}::${symbol.name}`;
    try {
      graph.addNode(nodeId, {
        name: symbol.name,
        kind: symbol.kind,
        filePath: parsedFile.filePath,
        startLine: symbol.location.startLine,
        endLine: symbol.location.endLine,
        exported: symbol.exported,
        scope: symbol.scope
      });
    } catch (error) {
    }
  }
  for (const edge of parsedFile.edges) {
    try {
      graph.mergeEdge(edge.source, edge.target, {
        kind: edge.kind,
        sourceFile: edge.sourceFile,
        targetFile: edge.targetFile
      });
    } catch (error) {
    }
  }
}
async function updateFileInGraph(graph, projectRoot, relativeFilePath) {
  removeFileFromGraph(graph, relativeFilePath);
  const absolutePath = join2(projectRoot, relativeFilePath);
  try {
    const parsedFile = parseTypeScriptFile(absolutePath, relativeFilePath);
    addFileToGraph(graph, parsedFile);
  } catch (error) {
    console.error(`Failed to parse file ${relativeFilePath}:`, error);
  }
}

// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/mcp/tools.ts
import { dirname as dirname2, join as join10, resolve as resolve3 } from "path";
import { existsSync as existsSync8, readFileSync as readFileSync6 } from "fs";

// src/mcp/connect.ts
import simpleGit from "simple-git";
import { existsSync } from "fs";
import { join as join3, basename as basename2, resolve } from "path";
import { tmpdir, homedir } from "os";
function validateProjectPath(source) {
  const resolved = resolve(source);
  const blockedPaths = [
    "/etc",
    "/var",
    "/usr",
    "/bin",
    "/sbin",
    "/boot",
    "/proc",
    "/sys",
    join3(homedir(), ".ssh"),
    join3(homedir(), ".gnupg"),
    join3(homedir(), ".aws"),
    join3(homedir(), ".config"),
    join3(homedir(), ".env")
  ];
  for (const blocked of blockedPaths) {
    if (resolved.startsWith(blocked)) {
      return { valid: false, error: `Access denied: ${blocked} is a protected path` };
    }
  }
  return { valid: true };
}
async function connectToRepo(source, subdirectory, state) {
  try {
    let projectRoot;
    let projectName;
    const isGitHub = source.startsWith("https://github.com/") || source.startsWith("git@github.com:");
    if (isGitHub) {
      const match = source.match(/[\/:]([^\/]+?)(?:\.git)?$/);
      if (!match) {
        return {
          error: "Invalid GitHub URL",
          message: "Could not parse repository name from URL"
        };
      }
      projectName = match[1];
      const reposDir = join3(tmpdir(), "depwire-repos");
      const cloneDir = join3(reposDir, projectName);
      console.error(`Connecting to GitHub repo: ${source}`);
      const git = simpleGit();
      if (existsSync(cloneDir)) {
        console.error(`Repo already cloned at ${cloneDir}, pulling latest changes...`);
        try {
          await git.cwd(cloneDir).pull();
        } catch (error) {
          console.error(`Pull failed, using existing clone: ${error}`);
        }
      } else {
        console.error(`Cloning ${source} to ${cloneDir}...`);
        try {
          await git.clone(source, cloneDir, ["--depth", "1", "--no-recurse-submodules", "--single-branch"]);
        } catch (error) {
          return {
            error: "Failed to clone repository",
            message: `Git clone failed: ${error}. Ensure git is installed and the URL is correct.`
          };
        }
      }
      projectRoot = subdirectory ? join3(cloneDir, subdirectory) : cloneDir;
      if (subdirectory) {
        const resolvedRoot = resolve(cloneDir);
        const resolvedProject = resolve(projectRoot);
        if (!resolvedProject.startsWith(resolvedRoot + "/") && resolvedProject !== resolvedRoot) {
          return {
            error: "Access denied",
            message: "Subdirectory must be within the project root"
          };
        }
      }
    } else {
      const validation2 = validateProjectPath(source);
      if (!validation2.valid) {
        return {
          error: "Access denied",
          message: validation2.error
        };
      }
      if (!existsSync(source)) {
        return {
          error: "Directory not found",
          message: `Directory does not exist: ${source}`
        };
      }
      projectRoot = subdirectory ? join3(source, subdirectory) : source;
      if (subdirectory) {
        const resolvedRoot = resolve(source);
        const resolvedProject = resolve(projectRoot);
        if (!resolvedProject.startsWith(resolvedRoot + "/") && resolvedProject !== resolvedRoot) {
          return {
            error: "Access denied",
            message: "Subdirectory must be within the project root"
          };
        }
      }
      projectName = basename2(projectRoot);
    }
    const validation = validateProjectPath(projectRoot);
    if (!validation.valid) {
      return {
        error: "Access denied",
        message: validation.error
      };
    }
    if (!existsSync(projectRoot)) {
      return {
        error: "Project root not found",
        message: `Directory does not exist: ${projectRoot}`
      };
    }
    console.error(`Parsing project at ${projectRoot}...`);
    if (state.watcher) {
      console.error("Stopping previous file watcher...");
      await state.watcher.close();
      state.watcher = null;
    }
    const parsedFiles = await parseProject(projectRoot);
    if (parsedFiles.length === 0) {
      return {
        error: "No source files found",
        message: `No supported source files (.ts, .tsx, .js, .jsx, .py, .go) found in ${projectRoot}`
      };
    }
    const graph = buildGraph(parsedFiles, projectRoot);
    state.graph = graph;
    state.projectRoot = projectRoot;
    state.projectName = projectName;
    console.error(`Parsed ${parsedFiles.length} files`);
    console.error("Starting file watcher...");
    state.watcher = watchProject(projectRoot, {
      onFileChanged: async (filePath) => {
        console.error(`File changed: ${filePath}`);
        try {
          await updateFileInGraph(state.graph, projectRoot, filePath);
          console.error(`Graph updated for ${filePath}`);
        } catch (error) {
          console.error(`Failed to update graph for ${filePath}: ${error}`);
        }
      },
      onFileAdded: async (filePath) => {
        console.error(`File added: ${filePath}`);
        try {
          await updateFileInGraph(state.graph, projectRoot, filePath);
          console.error(`Graph updated for ${filePath}`);
        } catch (error) {
          console.error(`Failed to update graph for ${filePath}: ${error}`);
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
          console.error(`Failed to remove ${filePath} from graph: ${error}`);
        }
      }
    });
    const summary = getArchitectureSummary(graph);
    const mostConnected = summary.mostConnectedFiles.slice(0, 3);
    const languageBreakdown = {};
    parsedFiles.forEach((file) => {
      const ext = file.filePath.toLowerCase();
      let lang;
      if (ext.endsWith(".ts") || ext.endsWith(".tsx")) {
        lang = "typescript";
      } else if (ext.endsWith(".py")) {
        lang = "python";
      } else if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) {
        lang = "javascript";
      } else if (ext.endsWith(".go")) {
        lang = "go";
      } else {
        lang = "other";
      }
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
    });
    return {
      connected: true,
      projectRoot,
      projectName,
      stats: {
        files: summary.totalFiles,
        symbols: summary.totalSymbols,
        edges: summary.totalEdges,
        crossFileEdges: summary.crossFileEdges,
        languages: languageBreakdown
      },
      mostConnectedFiles: mostConnected.map((f) => ({
        path: f.filePath,
        connections: f.incomingCount + f.outgoingCount
      })),
      summary: `Connected to ${projectName}. Found ${summary.totalFiles} files with ${summary.totalSymbols} symbols and ${summary.crossFileEdges} cross-file edges.`
    };
  } catch (error) {
    console.error("Error in connectToRepo:", error);
    return {
      error: "Connection failed",
      message: String(error)
    };
  }
}

// src/temporal/git.ts
import { execSync } from "child_process";
async function getCommitLog(dir, limit) {
  try {
    if (limit !== void 0 && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error(`Invalid git log limit: ${limit}`);
    }
    const limitArg = limit ? `-n ${limit}` : "";
    const output = execSync(
      `git log ${limitArg} --pretty=format:"%H|%aI|%s|%an"`,
      { cwd: dir, encoding: "utf-8" }
    );
    if (!output.trim()) {
      return [];
    }
    return output.trim().split("\n").map((line) => {
      const [hash, date, message, author] = line.split("|");
      return { hash, date, message, author };
    });
  } catch (error) {
    throw new Error(`Failed to get git log: ${error}`);
  }
}
async function getCurrentBranch(dir) {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: dir,
      encoding: "utf-8"
    }).trim();
  } catch (error) {
    throw new Error(`Failed to get current branch: ${error}`);
  }
}
async function checkoutCommit(dir, hash) {
  if (!/^[a-f0-9]+$/.test(hash)) {
    throw new Error(`Invalid commit hash: ${hash}`);
  }
  try {
    execSync(`git checkout -q ${hash}`, { cwd: dir, stdio: "ignore" });
  } catch (error) {
    throw new Error(`Failed to checkout commit ${hash}: ${error}`);
  }
}
async function restoreOriginal(dir, originalBranch) {
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(originalBranch)) {
    throw new Error(`Invalid branch name: ${originalBranch}`);
  }
  try {
    execSync(`git checkout -q ${originalBranch}`, {
      // depwire-security-reviewed: branch validated above
      cwd: dir,
      stdio: "ignore"
    });
  } catch (error) {
    throw new Error(`Failed to restore branch ${originalBranch}: ${error}`);
  }
}
async function stashChanges(dir) {
  try {
    const status = execSync("git status --porcelain", {
      cwd: dir,
      encoding: "utf-8"
    }).trim();
    if (status) {
      execSync('git stash push -q -m "depwire temporal analysis"', {
        cwd: dir,
        stdio: "ignore"
      });
      return true;
    }
    return false;
  } catch (error) {
    throw new Error(`Failed to stash changes: ${error}`);
  }
}
async function popStash(dir) {
  try {
    const stashList = execSync("git stash list", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
      // Suppress stderr
    }).trim();
    if (stashList) {
      execSync("git stash pop -q", { cwd: dir, stdio: "ignore" });
    }
  } catch (error) {
  }
}
function isGitRepo(dir) {
  try {
    execSync("git rev-parse --git-dir", { cwd: dir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// src/temporal/sampler.ts
function sampleCommits(commits, targetCount, strategy) {
  if (commits.length === 0) {
    return [];
  }
  if (commits.length <= targetCount) {
    return commits;
  }
  switch (strategy) {
    case "even":
      return sampleEvenly(commits, targetCount);
    case "weekly":
      return sampleWeekly(commits, targetCount);
    case "monthly":
      return sampleMonthly(commits, targetCount);
    default:
      return sampleEvenly(commits, targetCount);
  }
}
function sampleEvenly(commits, targetCount) {
  if (targetCount >= commits.length) {
    return commits;
  }
  const result = [];
  const step = (commits.length - 1) / (targetCount - 1);
  for (let i = 0; i < targetCount; i++) {
    const index = Math.round(i * step);
    result.push(commits[index]);
  }
  return result;
}
function sampleWeekly(commits, targetCount) {
  const result = [];
  const first = commits[0];
  const last = commits[commits.length - 1];
  result.push(first);
  const weekMap = /* @__PURE__ */ new Map();
  for (const commit of commits) {
    const date = new Date(commit.date);
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    const key = `${year}-W${week}`;
    weekMap.set(key, commit);
  }
  const weeklyCommits = Array.from(weekMap.values());
  if (weeklyCommits.length <= targetCount) {
    return weeklyCommits;
  }
  const step = Math.floor((weeklyCommits.length - 2) / (targetCount - 2));
  for (let i = 1; i < targetCount - 1; i++) {
    const index = Math.min(i * step, weeklyCommits.length - 2);
    if (weeklyCommits[index] !== first && weeklyCommits[index] !== last) {
      result.push(weeklyCommits[index]);
    }
  }
  if (result[result.length - 1] !== last) {
    result.push(last);
  }
  return result;
}
function sampleMonthly(commits, targetCount) {
  const result = [];
  const first = commits[0];
  const last = commits[commits.length - 1];
  result.push(first);
  const monthMap = /* @__PURE__ */ new Map();
  for (const commit of commits) {
    const date = new Date(commit.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, commit);
  }
  const monthlyCommits = Array.from(monthMap.values());
  if (monthlyCommits.length <= targetCount) {
    return monthlyCommits;
  }
  const step = Math.floor((monthlyCommits.length - 2) / (targetCount - 2));
  for (let i = 1; i < targetCount - 1; i++) {
    const index = Math.min(i * step, monthlyCommits.length - 2);
    if (monthlyCommits[index] !== first && monthlyCommits[index] !== last) {
      result.push(monthlyCommits[index]);
    }
  }
  if (result[result.length - 1] !== last) {
    result.push(last);
  }
  return result;
}
function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}

// src/temporal/snapshots.ts
import { writeFileSync, readFileSync, mkdirSync, existsSync as existsSync2, readdirSync } from "fs";
import { resolve as resolve2 } from "path";
function saveSnapshot(snapshot, outputDir) {
  if (!existsSync2(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const filename = `${snapshot.commitHash.substring(0, 8)}.json`;
  const filepath = resolve2(outputDir, filename);
  if (!filepath.startsWith(resolve2(outputDir))) {
    throw new Error(`Path traversal attempt blocked: ${filepath}`);
  }
  writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf-8");
}
function loadSnapshot(commitHash, outputDir) {
  const shortHash = commitHash.substring(0, 8);
  const filepath = resolve2(outputDir, `${shortHash}.json`);
  if (!filepath.startsWith(resolve2(outputDir)) || !existsSync2(filepath)) {
    return null;
  }
  try {
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function createSnapshot(graph, commitHash, commitDate, commitMessage, commitAuthor) {
  const fileMap = /* @__PURE__ */ new Map();
  for (const node of graph.nodes) {
    if (!fileMap.has(node.filePath)) {
      fileMap.set(node.filePath, { symbols: 0, inbound: 0, outbound: 0 });
    }
    fileMap.get(node.filePath).symbols++;
  }
  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode && sourceNode.filePath !== targetNode.filePath) {
      if (fileMap.has(sourceNode.filePath)) {
        fileMap.get(sourceNode.filePath).outbound++;
      }
      if (fileMap.has(targetNode.filePath)) {
        fileMap.get(targetNode.filePath).inbound++;
      }
    }
  }
  const files = Array.from(fileMap.entries()).map(([path, data]) => ({
    path,
    symbols: data.symbols,
    connections: data.inbound + data.outbound
  }));
  const edgeMap = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode && sourceNode.filePath !== targetNode.filePath) {
      const key = sourceNode.filePath < targetNode.filePath ? `${sourceNode.filePath}|${targetNode.filePath}` : `${targetNode.filePath}|${sourceNode.filePath}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }
  const edges = Array.from(edgeMap.entries()).map(([key, weight]) => {
    const [source, target] = key.split("|");
    return { source, target, weight };
  });
  const languages = {};
  for (const file of graph.files) {
    const ext = file.split(".").pop() || "unknown";
    const lang = ext === "ts" || ext === "tsx" ? "typescript" : ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs" ? "javascript" : ext === "py" ? "python" : ext === "go" ? "go" : "other";
    languages[lang] = (languages[lang] || 0) + 1;
  }
  return {
    commitHash,
    commitDate,
    commitMessage,
    commitAuthor,
    stats: {
      totalFiles: graph.files.length,
      totalSymbols: graph.nodes.length,
      totalEdges: edges.length,
      languages
    },
    files,
    edges
  };
}

// src/core/verify-change.ts
function normalizeFp(p) {
  if (!p) return "";
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
function parseUnifiedDiff(diff) {
  const files = [];
  const lines = diff.split("\n");
  for (const line of lines) {
    const minusMatch = line.match(/^---\s+a\/(.+)/);
    const plusMatch = line.match(/^\+\+\+\s+b\/(.+)/);
    if (plusMatch && plusMatch[1] !== "/dev/null") {
      files.push({ filePath: plusMatch[1], isDelete: false });
    } else if (minusMatch && minusMatch[1] !== "/dev/null") {
      files.push({ filePath: minusMatch[1], isDelete: false });
    }
  }
  return files;
}
function nodesInFile(graph, normFp) {
  return graph.filterNodes((_node, attrs) => normalizeFp(attrs.filePath) === normFp);
}
function currentExportedNodes(graph, normFp) {
  return graph.filterNodes(
    (_node, attrs) => normalizeFp(attrs.filePath) === normFp && attrs.exported === true
  );
}
function simulateFullDelete(engine, graph, filePath, brokenImports, newCircularDeps, allAffectedFiles) {
  try {
    const simResult = engine.simulate({ type: "delete", target: filePath });
    for (const bi of simResult.diff.brokenImports) {
      brokenImports.push({
        file: bi.file,
        missing_symbol: bi.importedSymbol,
        reason: bi.reason
      });
    }
    for (const cycle of simResult.diff.circularDepsIntroduced) {
      newCircularDeps.push({ cycle });
    }
    for (const node of simResult.diff.affectedNodes) {
      const attrs = graph.hasNode(node) ? graph.getNodeAttributes(node) : null;
      if (attrs?.filePath) allAffectedFiles.add(attrs.filePath);
    }
    return simResult.healthDelta.after;
  } catch {
    return null;
  }
}
function detectRemovedExportBreaks(graph, normFp, displayPath, newExportedNames, brokenImports) {
  for (const nodeId of currentExportedNodes(graph, normFp)) {
    const attrs = graph.getNodeAttributes(nodeId);
    if (newExportedNames.has(attrs.name)) continue;
    const externalDependents = getDependents(graph, nodeId).filter(
      (d) => normalizeFp(d.filePath) !== normFp
    );
    for (const dep of externalDependents) {
      brokenImports.push({
        file: dep.filePath,
        missing_symbol: attrs.name,
        reason: `${attrs.name} was removed from ${displayPath} but is still imported here`
      });
    }
  }
}
async function verifyChange(args, ctx) {
  const { graph, projectRoot } = ctx;
  const warnings = [];
  let affectedFilePaths = [];
  const haveNewContent = !!args.file_path && args.new_content !== void 0;
  if (haveNewContent) {
    affectedFilePaths = [args.file_path];
  } else if (args.unified_diff) {
    const parsed = parseUnifiedDiff(args.unified_diff);
    affectedFilePaths = [...new Set(parsed.map((p) => p.filePath))];
  } else {
    const emptyContext = {
      note: "Health and security findings are informational and do not affect the safety verdict.",
      health_score_before: 0,
      health_score_after: 0,
      health_score_delta: 0,
      security_findings: []
    };
    return {
      safe: false,
      risk_level: "high",
      broken_imports: [],
      new_circular_dependencies: [],
      health_score_delta: 0,
      health_score_before: 0,
      health_score_after: 0,
      security_findings: [],
      affected_files: [],
      blast_radius: 0,
      warnings: ["Invalid input: provide either file_path + new_content, or unified_diff"],
      relevant_warnings: ["Invalid input: provide either file_path + new_content, or unified_diff"],
      unrelated_context: emptyContext
    };
  }
  const healthBefore = calculateHealthScore(graph, projectRoot);
  const healthScoreBefore = healthBefore.overall;
  const engine = new SimulationEngine(graph);
  const brokenImports = [];
  const newCircularDeps = [];
  let healthScoreAfter = healthScoreBefore;
  const allAffectedFiles = /* @__PURE__ */ new Set();
  await initParser();
  for (const filePath of affectedFilePaths) {
    const normFp = normalizeFp(filePath);
    const fileNodes = nodesInFile(graph, normFp);
    if (fileNodes.length === 0) {
      warnings.push(`File ${filePath} is new (not in current graph)`);
      continue;
    }
    if (haveNewContent) {
      const newContent = args.new_content;
      const isDeletion = newContent.trim().length === 0;
      if (isDeletion) {
        const after = simulateFullDelete(
          engine,
          graph,
          filePath,
          brokenImports,
          newCircularDeps,
          allAffectedFiles
        );
        if (after !== null) healthScoreAfter = after;
        else warnings.push(`Could not simulate deletion of ${filePath}`);
        continue;
      }
      const parser = getParserForFile(filePath, newContent);
      let parsedOk = false;
      if (parser) {
        try {
          const parsed = parser.parseFile(normFp, newContent, projectRoot);
          const newExportedNames = new Set(
            parsed.symbols.filter((s) => s.exported).map((s) => s.name)
          );
          detectRemovedExportBreaks(graph, normFp, filePath, newExportedNames, brokenImports);
          parsedOk = true;
        } catch {
          parsedOk = false;
        }
      }
      if (!parsedOk) {
        warnings.push(
          `Could not parse new content for ${filePath} \u2014 using conservative full-file analysis.`
        );
        const after = simulateFullDelete(
          engine,
          graph,
          filePath,
          brokenImports,
          newCircularDeps,
          allAffectedFiles
        );
        if (after !== null) healthScoreAfter = after;
      }
    } else {
      warnings.push(
        `Conservative full-file analysis for ${filePath} (no new_content available for unified_diff).`
      );
      const after = simulateFullDelete(
        engine,
        graph,
        filePath,
        brokenImports,
        newCircularDeps,
        allAffectedFiles
      );
      if (after !== null) healthScoreAfter = after;
    }
  }
  if (brokenImports.length === 0 && newCircularDeps.length === 0) {
    healthScoreAfter = healthScoreBefore;
  }
  const dedupedBrokenImports = [];
  const seenBroken = /* @__PURE__ */ new Set();
  for (const bi of brokenImports) {
    const key = `${normalizeFp(bi.file)}::${bi.missing_symbol}`;
    if (seenBroken.has(key)) continue;
    seenBroken.add(key);
    dedupedBrokenImports.push(bi);
  }
  brokenImports.length = 0;
  brokenImports.push(...dedupedBrokenImports);
  for (const filePath of affectedFilePaths) {
    const normFp = normalizeFp(filePath);
    allAffectedFiles.add(normFp);
    for (const nodeId of nodesInFile(graph, normFp)) {
      const impact = getImpact(graph, nodeId);
      for (const file of impact.affectedFiles) allAffectedFiles.add(file);
    }
  }
  const blastRadius = allAffectedFiles.size;
  const affectedFiles = Array.from(allAffectedFiles);
  const securityFindings = [];
  for (const filePath of affectedFilePaths) {
    try {
      const scanResult = await scanSecurity(projectRoot, graph, {
        target: normalizeFp(filePath),
        graphAware: true
      });
      if (scanResult && scanResult.findings) {
        for (const finding of scanResult.findings) {
          securityFindings.push({
            severity: finding.severity || "low",
            description: finding.description || finding.title || "",
            file: finding.file || filePath,
            line: finding.line || 0
          });
        }
      }
    } catch {
    }
  }
  const healthDelta = healthScoreAfter - healthScoreBefore;
  let riskLevel;
  if (brokenImports.length > 0 || newCircularDeps.length > 0) {
    riskLevel = "high";
  } else if (healthDelta < -3) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }
  const safe = riskLevel === "low";
  const unrelatedContext = {
    note: "Health score and security findings are informational and do NOT affect the safety verdict.",
    health_score_before: healthScoreBefore,
    health_score_after: healthScoreAfter,
    health_score_delta: healthDelta,
    security_findings: securityFindings
  };
  return {
    safe,
    risk_level: riskLevel,
    broken_imports: brokenImports,
    new_circular_dependencies: newCircularDeps,
    health_score_delta: healthDelta,
    health_score_before: healthScoreBefore,
    health_score_after: healthScoreAfter,
    security_findings: securityFindings,
    affected_files: affectedFiles,
    blast_radius: blastRadius,
    warnings,
    relevant_warnings: warnings,
    unrelated_context: unrelatedContext
  };
}

// src/mcp/tools/verify-change.ts
async function handleVerifyChange(args, state) {
  return verifyChange(args, {
    graph: state.graph,
    projectRoot: state.projectRoot
  });
}

// src/mcp/tools/claim-files.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync2, appendFileSync } from "fs";
import { join as join5 } from "path";
import { randomUUID } from "crypto";
function ensureDepwireDir(projectRoot) {
  const dir = join5(projectRoot, ".depwire");
  if (!existsSync3(dir)) {
    mkdirSync2(dir, { recursive: true });
  }
  return dir;
}
function getClaimsFilePath(projectRoot) {
  const dir = ensureDepwireDir(projectRoot);
  return join5(dir, "claims.jsonl");
}
function readClaims(filePath) {
  if (!existsSync3(filePath)) {
    return [];
  }
  const content = readFileSync2(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
    }
  }
  return records;
}
function getActiveClaims(records, now) {
  const claimMap = /* @__PURE__ */ new Map();
  for (const record of records) {
    claimMap.set(record.claim_id, record);
  }
  return Array.from(claimMap.values()).filter((claim) => {
    if (claim.released) return false;
    if (new Date(claim.expires_at) <= now) return false;
    return true;
  });
}
function handleClaimFiles(args, state) {
  const projectRoot = state.projectRoot;
  const claimsFile = getClaimsFilePath(projectRoot);
  const now = /* @__PURE__ */ new Date();
  const ttlMinutes = Math.min(Math.max(args.ttl_minutes || 30, 1), 240);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1e3);
  const allRecords = readClaims(claimsFile);
  const activeClaims = getActiveClaims(allRecords, now);
  const conflicts = [];
  for (const filePath of args.file_paths) {
    for (const claim of activeClaims) {
      if (claim.session_id === args.session_id) continue;
      if (claim.file_paths.includes(filePath)) {
        conflicts.push({
          file: filePath,
          claimed_by_session: claim.session_id,
          claimed_at: claim.claimed_at,
          expires_at: claim.expires_at,
          reason: claim.reason
        });
      }
    }
  }
  if (conflicts.length > 0) {
    return {
      success: false,
      claim_id: "",
      claimed_files: [],
      conflicts,
      expires_at: ""
    };
  }
  const claimId = randomUUID();
  const record = {
    claim_id: claimId,
    session_id: args.session_id,
    file_paths: args.file_paths,
    reason: args.reason,
    claimed_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    released: false
  };
  appendFileSync(claimsFile, JSON.stringify(record) + "\n");
  return {
    success: true,
    claim_id: claimId,
    claimed_files: args.file_paths,
    conflicts: [],
    expires_at: expiresAt.toISOString()
  };
}

// src/mcp/tools/release-files.ts
import { existsSync as existsSync4, readFileSync as readFileSync3, appendFileSync as appendFileSync2 } from "fs";
import { join as join6 } from "path";
function handleReleaseFiles(args, state) {
  const projectRoot = state.projectRoot;
  const claimsFile = join6(projectRoot, ".depwire", "claims.jsonl");
  if (!existsSync4(claimsFile)) {
    return { success: false, released_files: [], error: "Claim not found" };
  }
  const content = readFileSync3(claimsFile, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  let foundClaim = null;
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.claim_id === args.claim_id) {
        foundClaim = record;
      }
    } catch {
    }
  }
  if (!foundClaim) {
    return { success: false, released_files: [], error: "Claim not found" };
  }
  if (foundClaim.session_id !== args.session_id) {
    return { success: false, released_files: [], error: "Session ID does not match the original claim" };
  }
  if (foundClaim.released) {
    return { success: false, released_files: [], error: "Claim already released" };
  }
  const releaseRecord = {
    ...foundClaim,
    released: true
  };
  appendFileSync2(claimsFile, JSON.stringify(releaseRecord) + "\n");
  return {
    success: true,
    released_files: foundClaim.file_paths
  };
}

// src/mcp/tools/get-active-claims.ts
import { existsSync as existsSync5, readFileSync as readFileSync4 } from "fs";
import { join as join7 } from "path";
function handleGetActiveClaims(args, state) {
  const projectRoot = state.projectRoot;
  const claimsFile = join7(projectRoot, ".depwire", "claims.jsonl");
  if (!existsSync5(claimsFile)) {
    return { active_claims: [], total: 0 };
  }
  const content = readFileSync4(claimsFile, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const claimMap = /* @__PURE__ */ new Map();
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      claimMap.set(record.claim_id, record);
    } catch {
    }
  }
  const now = /* @__PURE__ */ new Date();
  let claims = [];
  for (const record of claimMap.values()) {
    if (record.released) continue;
    const isExpired = new Date(record.expires_at) <= now;
    if (isExpired && !args.include_expired) continue;
    if (args.filter_by_session && record.session_id !== args.filter_by_session) continue;
    if (args.filter_by_file && !record.file_paths.includes(args.filter_by_file)) continue;
    claims.push({
      claim_id: record.claim_id,
      session_id: record.session_id,
      file_paths: record.file_paths,
      reason: record.reason,
      claimed_at: record.claimed_at,
      expires_at: record.expires_at,
      is_expired: isExpired
    });
  }
  return { active_claims: claims, total: claims.length };
}

// src/mcp/tools/record-decision.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync3, appendFileSync as appendFileSync3 } from "fs";
import { join as join8 } from "path";
import { randomUUID as randomUUID2 } from "crypto";
function ensureDepwireDir2(projectRoot) {
  const dir = join8(projectRoot, ".depwire");
  if (!existsSync6(dir)) {
    mkdirSync3(dir, { recursive: true });
  }
  return dir;
}
function handleRecordDecision(args, state) {
  const projectRoot = state.projectRoot;
  const dir = ensureDepwireDir2(projectRoot);
  const decisionsFile = join8(dir, "decisions.jsonl");
  const decisionId = randomUUID2();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = {
    decision_id: decisionId,
    session_id: args.session_id,
    timestamp: now,
    context: args.context,
    options_considered: args.options_considered,
    decision: args.decision,
    reasoning: args.reasoning,
    files_affected: args.files_affected || [],
    tags: args.tags || []
  };
  appendFileSync3(decisionsFile, JSON.stringify(record) + "\n");
  return {
    success: true,
    decision_id: decisionId,
    recorded_at: now
  };
}

// src/mcp/tools/get-decisions.ts
import { existsSync as existsSync7, readFileSync as readFileSync5 } from "fs";
import { join as join9 } from "path";
function handleGetDecisions(args, state) {
  const projectRoot = state.projectRoot;
  const decisionsFile = join9(projectRoot, ".depwire", "decisions.jsonl");
  if (!existsSync7(decisionsFile)) {
    return { decisions: [], total_matched: 0, returned: 0 };
  }
  const content = readFileSync5(decisionsFile, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  let records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
    }
  }
  if (args.filter_by_session) {
    records = records.filter((r) => r.session_id === args.filter_by_session);
  }
  if (args.filter_by_file) {
    records = records.filter((r) => r.files_affected.includes(args.filter_by_file));
  }
  if (args.filter_by_tag) {
    records = records.filter((r) => r.tags.includes(args.filter_by_tag));
  }
  if (args.since) {
    const sinceDate = new Date(args.since);
    records = records.filter((r) => new Date(r.timestamp) >= sinceDate);
  }
  if (args.query) {
    const q = args.query.toLowerCase();
    records = records.filter((r) => {
      const searchText = `${r.context} ${r.decision} ${r.reasoning}`.toLowerCase();
      return searchText.includes(q);
    });
  }
  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const totalMatched = records.length;
  const limit = Math.min(Math.max(args.limit || 20, 1), 100);
  const returned = records.slice(0, limit);
  return {
    decisions: returned,
    total_matched: totalMatched,
    returned: returned.length
  };
}

// src/mcp/tools.ts
function normalizePath(p) {
  if (!p) return p;
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
function getToolsList() {
  return [
    {
      name: "connect_repo",
      description: "Connect Depwire to a codebase for analysis. Accepts a local directory path or a GitHub repository URL. If a GitHub URL is provided, the repo will be cloned automatically. This replaces the currently loaded project.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Local directory path (e.g., '/Users/me/project') or GitHub URL (e.g., 'https://github.com/vercel/next.js')"
          },
          subdirectory: {
            type: "string",
            description: "Subdirectory within the repo to analyze (optional, e.g., 'packages/core/src')"
          }
        },
        required: ["source"]
      }
    },
    {
      name: "get_symbol_info",
      description: "Look up detailed information about a symbol (function, class, variable, type, etc.) by name. Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The symbol name to look up (e.g., 'UserService') or full ID (e.g., 'src/services/UserService.ts::UserService')"
          }
        },
        required: ["name"]
      }
    },
    {
      name: "get_dependencies",
      description: "Get all symbols that a given symbol depends on (what does this symbol use/import/call?). Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')"
          }
        },
        required: ["symbol"]
      }
    },
    {
      name: "get_dependents",
      description: "Get all symbols that depend on a given symbol (what uses this symbol?). Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')"
          }
        },
        required: ["symbol"]
      }
    },
    {
      name: "impact_analysis",
      description: "Analyze what would break if a symbol is changed, renamed, or removed. Shows direct dependents, transitive dependents (chain reaction), and all affected files. Cross-language edges included \u2014 a TypeScript fetch call to a Python route will show the Python file as affected. Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation. Use this before making changes to understand the blast radius.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')"
          },
          file: {
            type: "string",
            description: "Optional: File path to disambiguate when multiple symbols have the same name (e.g., 'src/router.ts')"
          }
        },
        required: ["symbol"]
      }
    },
    {
      name: "get_file_context",
      description: "Get complete context about a file \u2014 all symbols defined in it, all imports, all exports, and all files that import from it. Includes cross-language connections (REST API calls, subprocess invocations). Supports startLine/endLine for reading large files in chunks.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative file path (e.g., 'services/UserService.ts')"
          },
          startLine: {
            type: "number",
            description: "Optional: start line number (1-based) to return only a slice of file content"
          },
          endLine: {
            type: "number",
            description: "Optional: end line number (1-based, inclusive) to return only a slice of file content"
          }
        },
        required: ["filePath"]
      }
    },
    {
      name: "search_symbols",
      description: "Search for symbols by name across the entire codebase. Supports partial matching.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (case-insensitive substring match)"
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 20)"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "get_architecture_summary",
      description: "Get a high-level overview of the project's architecture \u2014 file count, symbol count, most connected files, dependency hotspots, and orphan files.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "list_files",
      description: "List all files in the project with basic stats.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Filter to a specific subdirectory (optional)"
          }
        }
      }
    },
    {
      name: "visualize_graph",
      description: "Render an interactive arc diagram visualization of the current codebase's cross-reference graph. Shows files as bars along the bottom and dependency arcs connecting them, colored by distance. The visualization appears inline in the conversation.",
      inputSchema: {
        type: "object",
        properties: {
          highlight: {
            type: "string",
            description: "File or symbol name to highlight in the visualization (optional)"
          },
          maxFiles: {
            type: "number",
            description: "Limit to top N most connected files (optional, default: all)"
          }
        }
      }
    },
    {
      name: "get_project_docs",
      description: "Retrieve auto-generated codebase documentation. Returns architecture overview, code conventions, dependency maps, and onboarding guides. Documentation must be generated first with `depwire docs` command.",
      inputSchema: {
        type: "object",
        properties: {
          doc_type: {
            type: "string",
            description: "Document type to retrieve: 'architecture', 'conventions', 'dependencies', 'onboarding', or 'all' (default: 'all')"
          }
        }
      }
    },
    {
      name: "update_project_docs",
      description: "Regenerate codebase documentation with the latest changes. If docs don't exist, generates them for the first time. Use this after significant code changes to keep documentation up-to-date.",
      inputSchema: {
        type: "object",
        properties: {
          doc_type: {
            type: "string",
            description: "Document type to update: 'architecture', 'conventions', 'dependencies', 'onboarding', or 'all' (default: 'all')"
          }
        }
      }
    },
    {
      name: "get_health_score",
      description: "Get a 0-100 health score for the project's dependency architecture. Scores coupling, cohesion, circular dependencies, god files, orphan files, and dependency depth. Returns overall score, per-dimension breakdown, and actionable recommendations.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "get_temporal_graph",
      description: "Show how the dependency graph evolved over git history. Returns snapshots at sampled commits showing file counts, symbol counts, edge counts, and structural changes over time.",
      inputSchema: {
        type: "object",
        properties: {
          commits: {
            type: "number",
            description: "Number of commits to sample (default: 10)"
          },
          strategy: {
            type: "string",
            enum: ["even", "weekly", "monthly"],
            description: "Sampling strategy (default: even)"
          }
        }
      }
    },
    {
      name: "find_dead_code",
      description: "Find potentially dead code \u2014 symbols that are defined but never referenced anywhere in the codebase. Returns symbols categorized by confidence level (high, medium, low). High confidence means definitely unused. Use this to identify cleanup opportunities.",
      inputSchema: {
        type: "object",
        properties: {
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Minimum confidence level to return (default: medium)",
            default: "medium"
          }
        }
      }
    },
    {
      name: "simulate_change",
      description: `Simulate an architectural change before touching any code. Returns health score delta, broken imports, and affected nodes. Zero file I/O \u2014 pure in-memory simulation. Cross-language edges included \u2014 deleting a Python route file will show TypeScript callers as affected.

Operations:
- delete: Simulate deleting a file. Shows every file that would break and the full blast radius.
- move: Simulate moving a file to a new path. Shows broken imports and edge changes.
- rename: Simulate renaming a file. Shows all affected imports and nodes.
- split: Simulate splitting a file by moving specified symbols to a new file.
- merge: Simulate merging two files into one. Fails fast on symbol name collision.

Always run this before any refactor that touches file structure.`,
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["move", "delete", "rename", "split", "merge"],
            description: "Type of change to simulate"
          },
          target: {
            type: "string",
            description: "Relative file path of the primary target"
          },
          destination: {
            type: "string",
            description: "Required for move and rename \u2014 the new file path"
          },
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Required for split \u2014 symbol names to move to new file"
          },
          mergeTarget: {
            type: "string",
            description: "Required for merge \u2014 the file to merge into target"
          }
        },
        required: ["operation", "target"]
      }
    },
    {
      name: "security_scan",
      description: `Scan the codebase for security vulnerabilities using deterministic checks + graph-aware severity scoring. No API key required.

Checks: dependency CVEs, shell injection, hardcoded secrets, path traversal, auth bypass, input validation, information disclosure, cryptography weaknesses, frontend XSS, architecture-level risks.

Graph-aware severity: vulnerabilities reachable from MCP tools or HTTP routes are automatically elevated. A medium shell injection reachable from connect_repo becomes Critical.

Returns ranked findings (Critical \u2192 Low) with attack scenarios and suggested fixes. Use --target for single-file scan.`,
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Relative file path to scan. Omit to scan entire repo."
          },
          classes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "dependency-cve",
                "shell-injection",
                "code-injection",
                "secrets",
                "path-traversal",
                "auth",
                "input-validation",
                "information-disclosure",
                "architecture",
                "cryptography",
                "supply-chain",
                "frontend-xss"
              ]
            },
            description: "Vulnerability classes to check. Omit for all."
          },
          graphAware: {
            type: "boolean",
            description: "Enable graph-aware severity elevation (recommended). Default: true."
          }
        }
      }
    },
    {
      name: "verify_change",
      description: "Before applying a code change, return a deterministic safety report. Checks for broken imports, new circular dependencies, health score impact, and runs a targeted scan on changed files. Used by AI coding assistants and autonomous agents.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "File path being changed (use with new_content)"
          },
          new_content: {
            type: "string",
            description: "The proposed new content of the file"
          },
          unified_diff: {
            type: "string",
            description: "A unified diff string (alternative to file_path + new_content)"
          },
          depwire_action_token: {
            type: "string",
            description: "Optional, reserved for future DAT integration"
          }
        }
      }
    },
    {
      name: "claim_files",
      description: "Multi-agent coordination: declare intent to modify files so other MCP clients see the claim and avoid conflicts. Claims expire after a configurable TTL.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Identifies the calling agent/session"
          },
          file_paths: {
            type: "array",
            items: { type: "string" },
            description: "Files to claim"
          },
          reason: {
            type: "string",
            description: "Optional human-readable reason for the claim"
          },
          ttl_minutes: {
            type: "number",
            description: "Time-to-live in minutes (default 30, max 240)"
          },
          depwire_action_token: {
            type: "string",
            description: "Optional, reserved for future DAT integration"
          }
        },
        required: ["session_id", "file_paths"]
      }
    },
    {
      name: "release_files",
      description: "Release a previously made file claim. The release is recorded as an event (append-only).",
      inputSchema: {
        type: "object",
        properties: {
          claim_id: {
            type: "string",
            description: "The claim ID to release"
          },
          session_id: {
            type: "string",
            description: "Must match the original claim's session_id"
          }
        },
        required: ["claim_id", "session_id"]
      }
    },
    {
      name: "get_active_claims",
      description: "Query who is currently working on what. Returns active file claims, useful for orchestrator agents deciding what to delegate.",
      inputSchema: {
        type: "object",
        properties: {
          filter_by_session: {
            type: "string",
            description: "Only return claims from this session"
          },
          filter_by_file: {
            type: "string",
            description: "Only return claims affecting this file"
          },
          include_expired: {
            type: "boolean",
            description: "Include expired claims (default false)"
          }
        }
      }
    },
    {
      name: "record_decision",
      description: "Save a structured decision so future clients (or the same client in a future session) can see what was decided and why. Stored in .depwire/decisions.jsonl.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Identifies the calling agent/session"
          },
          context: {
            type: "string",
            description: "What problem was being solved"
          },
          options_considered: {
            type: "array",
            items: { type: "string" },
            description: "Alternatives the client weighed"
          },
          decision: {
            type: "string",
            description: "What was chosen"
          },
          reasoning: {
            type: "string",
            description: "Why this option was chosen"
          },
          files_affected: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of files this decision touches"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags for categorization"
          },
          depwire_action_token: {
            type: "string",
            description: "Optional, reserved for future DAT integration"
          }
        },
        required: ["session_id", "context", "options_considered", "decision", "reasoning"]
      }
    },
    {
      name: "get_decisions",
      description: "Retrieve past decisions matching a query. Lets agents see what previous agents (or itself in a previous session) decided about similar problems.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search across context, decision, reasoning fields"
          },
          filter_by_session: {
            type: "string",
            description: "Only decisions from this session"
          },
          filter_by_file: {
            type: "string",
            description: "Only decisions affecting this file"
          },
          filter_by_tag: {
            type: "string",
            description: "Only decisions with this tag"
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20, max 100)"
          },
          since: {
            type: "string",
            description: "ISO-8601 timestamp, only decisions after this time"
          }
        }
      }
    },
    {
      name: "affected_files",
      description: "Find all files affected by a change to a specific file or symbol. Includes test files that cover the affected code. Use this before running tests to know which test files to execute.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Relative path of the changed file (e.g., 'src/auth/token.ts')"
          },
          max_depth: {
            type: "number",
            description: "Maximum traversal depth (default: 5)"
          },
          tests_only: {
            type: "boolean",
            description: "Return only test files (default: false)"
          }
        },
        required: ["file_path"]
      }
    }
  ];
}
async function handleToolCall(name, args, state) {
  try {
    let result;
    if (name === "connect_repo") {
      result = await connectToRepo(args.source, args.subdirectory, state);
    } else if (name === "get_architecture_summary") {
      if (!isProjectLoaded(state)) {
        result = {
          status: "no_project",
          message: "No project loaded. Use connect_repo to analyze a codebase."
        };
      } else {
        result = handleGetArchitectureSummary(state.graph, state.projectRoot);
      }
    } else if (name === "visualize_graph") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = await handleVisualizeGraph(args.highlight, args.maxFiles, state);
      }
    } else if (name === "get_project_docs") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = await handleGetProjectDocs(args.doc_type || "all", state);
      }
    } else if (name === "update_project_docs") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = await handleUpdateProjectDocs(args.doc_type || "all", state);
      }
    } else if (name === "get_health_score") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleGetHealthScore(state);
      }
    } else if (name === "get_temporal_graph") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = await handleGetTemporalGraph(state, args.commits || 10, args.strategy || "even");
      }
    } else if (name === "find_dead_code") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleFindDeadCode(state, args.confidence || "medium");
      }
    } else if (name === "simulate_change") {
      if (!isProjectLoaded(state)) {
        result = {
          error: true,
          message: "No project loaded. Use connect_repo to connect to a codebase first.",
          operation: args.operation,
          target: args.target
        };
      } else {
        result = handleSimulateChange(args, state);
      }
    } else if (name === "security_scan") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else if (state.graph.order === 0) {
        result = {
          status: "no_parseable_files",
          message: "No parseable files found. Nothing was analyzed, so no security scan was performed.",
          findings: []
        };
      } else {
        result = await scanSecurity(state.projectRoot, state.graph, {
          target: normalizePath(args.target),
          classes: args.classes,
          graphAware: args.graphAware !== false
        });
      }
    } else if (name === "verify_change") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = await handleVerifyChange(
          { ...args, file_path: normalizePath(args.file_path) },
          state
        );
      }
    } else if (name === "claim_files") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleClaimFiles(args, state);
      }
    } else if (name === "release_files") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleReleaseFiles(args, state);
      }
    } else if (name === "get_active_claims") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleGetActiveClaims(args, state);
      }
    } else if (name === "record_decision") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleRecordDecision(args, state);
      }
    } else if (name === "get_decisions") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        result = handleGetDecisions(args, state);
      }
    } else {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first"
        };
      } else {
        const graph = state.graph;
        switch (name) {
          case "get_symbol_info":
            result = handleGetSymbolInfo(args.name, graph);
            break;
          case "get_dependencies":
            result = handleGetDependencies(args.symbol, graph);
            break;
          case "get_dependents":
            result = handleGetDependents(args.symbol, graph);
            break;
          case "impact_analysis":
            result = handleImpactAnalysis(args.symbol, graph, normalizePath(args.file));
            break;
          case "get_file_context":
            result = handleGetFileContext(normalizePath(args.filePath), graph, args.startLine, args.endLine);
            break;
          case "search_symbols":
            result = handleSearchSymbols(args.query, args.limit || 20, graph);
            break;
          case "list_files":
            result = handleListFiles(normalizePath(args.directory), graph);
            break;
          case "affected_files":
            result = handleAffectedFiles(normalizePath(args.file_path), graph, args.max_depth, args.tests_only);
            break;
          default:
            result = { error: `Unknown tool: ${name}` };
        }
      }
    }
    if (result && typeof result === "object" && "_mcpAppResponse" in result) {
      const appResult = result;
      return {
        content: [
          {
            type: "text",
            text: appResult.text
          },
          {
            type: "resource",
            resource: {
              uri: "ui://depwire/arc-diagram",
              mimeType: "text/html;profile=mcp-app",
              text: appResult.html
            }
          }
        ]
      };
    }
    if (result && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
      return result;
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error("Error handling tool call:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: String(error) }, null, 2)
        }
      ]
    };
  }
}
function createDisambiguationResponse(matches, queryName) {
  const suggestion = matches.length > 0 ? matches[0].id : "";
  const exampleFile = matches.length > 0 ? matches[0].filePath : "";
  return {
    ambiguous: true,
    message: `Found ${matches.length} symbols named '${queryName}'. Disambiguate by:
1. Using full ID: '${suggestion}'
2. Or adding file parameter: { symbol: '${queryName}', file: '${exampleFile}' }`,
    matches: matches.map((m, index) => ({
      id: m.id,
      kind: m.kind,
      filePath: m.filePath,
      line: m.startLine,
      dependents: m.dependentCount,
      hint: index === 0 && m.dependentCount > 0 ? "Most dependents \u2014 likely the one you want" : ""
    })),
    suggestion
  };
}
function handleGetSymbolInfo(name, graph) {
  const matches = findSymbols(graph, name);
  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, name).slice(0, 10);
    return {
      error: `Symbol '${name}' not found`,
      suggestion: fuzzyMatches.length > 0 ? `Did you mean: ${fuzzyMatches.map((m) => m.name).join(", ")}?` : "Try using search_symbols to find available symbols",
      fuzzyMatches: fuzzyMatches.map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        filePath: m.filePath
      }))
    };
  }
  return {
    matches: matches.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      filePath: m.filePath,
      startLine: m.startLine,
      endLine: m.endLine,
      exported: m.exported,
      scope: m.scope,
      dependents: m.dependentCount
    })),
    count: matches.length
  };
}
function handleGetDependencies(symbol, graph) {
  const matches = findSymbols(graph, symbol);
  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0 ? `Did you mean: ${fuzzyMatches.map((m) => m.name).join(", ")}?` : "Try using search_symbols to find available symbols"
    };
  }
  if (matches.length > 1) {
    return createDisambiguationResponse(matches, symbol);
  }
  const target = matches[0];
  const deps = getDependencies(graph, target.id);
  const grouped = {};
  graph.forEachOutEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) {
      grouped[kind] = [];
    }
    const targetAttrs = graph.getNodeAttributes(targetNode);
    grouped[kind].push({
      name: targetAttrs.name,
      filePath: targetAttrs.filePath,
      kind: targetAttrs.kind
    });
  });
  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  return {
    symbol: target.id,
    dependencies: grouped,
    totalCount
  };
}
function handleGetDependents(symbol, graph) {
  const matches = findSymbols(graph, symbol);
  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0 ? `Did you mean: ${fuzzyMatches.map((m) => m.name).join(", ")}?` : "Try using search_symbols to find available symbols"
    };
  }
  if (matches.length > 1) {
    return createDisambiguationResponse(matches, symbol);
  }
  const target = matches[0];
  const deps = getDependents(graph, target.id);
  const grouped = {};
  graph.forEachInEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) {
      grouped[kind] = [];
    }
    const sourceAttrs = graph.getNodeAttributes(source);
    grouped[kind].push({
      name: sourceAttrs.name,
      filePath: sourceAttrs.filePath,
      kind: sourceAttrs.kind
    });
  });
  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  return {
    symbol: target.id,
    dependents: grouped,
    totalCount
  };
}
function handleImpactAnalysis(symbol, graph, file) {
  const matches = findSymbols(graph, symbol);
  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0 ? `Did you mean: ${fuzzyMatches.map((m) => m.name).join(", ")}?` : "Try using search_symbols to find available symbols"
    };
  }
  let filteredMatches = matches;
  if (file) {
    const normalizedFile = normalizePath(file);
    filteredMatches = matches.filter((m) => {
      const mfp = normalizePath(m.filePath);
      return mfp === normalizedFile || mfp.endsWith(normalizedFile);
    });
    if (filteredMatches.length === 0) {
      return {
        error: `Symbol '${symbol}' not found in file '${file}'`,
        availableFiles: matches.map((m) => m.filePath),
        suggestion: `The symbol exists in: ${matches.map((m) => m.filePath).join(", ")}`
      };
    }
  }
  if (filteredMatches.length > 1) {
    return createDisambiguationResponse(filteredMatches, symbol);
  }
  const target = filteredMatches[0];
  const impact = getImpact(graph, target.id);
  const directWithKinds = impact.directDependents.map((dep) => {
    let relationship = "unknown";
    graph.forEachEdge(dep.id, target.id, (edge, attrs) => {
      relationship = attrs.kind;
    });
    return {
      name: dep.name,
      filePath: dep.filePath,
      kind: dep.kind,
      relationship
    };
  });
  const transitiveFormatted = impact.transitiveDependents.filter((dep) => !impact.directDependents.some((d) => d.id === dep.id)).map((dep) => ({
    name: dep.name,
    filePath: dep.filePath,
    kind: dep.kind
  }));
  const summary = `Changing ${target.name} would directly affect ${impact.directDependents.length} symbol(s) and transitively affect ${transitiveFormatted.length} more, across ${impact.affectedFiles.length} file(s).`;
  return {
    symbol: {
      id: target.id,
      name: target.name,
      filePath: target.filePath,
      kind: target.kind
    },
    impact: {
      directDependents: directWithKinds,
      transitiveDependents: transitiveFormatted,
      affectedFiles: impact.affectedFiles,
      summary
    }
  };
}
var MAX_CONTENT_BYTES = 32768;
function handleGetFileContext(filePath, graph, startLine, endLine) {
  const normalized = normalizePath(filePath);
  const fileSymbols = [];
  graph.forEachNode((nodeId, attrs) => {
    if (normalizePath(attrs.filePath) === normalized) {
      fileSymbols.push({
        name: attrs.name,
        kind: attrs.kind,
        exported: attrs.exported,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        scope: attrs.scope
      });
    }
  });
  if (fileSymbols.length === 0) {
    return {
      error: `File '${filePath}' not found`,
      suggestion: "Use list_files to see available files"
    };
  }
  let filteredSymbols = fileSymbols;
  if (startLine !== void 0 || endLine !== void 0) {
    const sl = startLine ?? 1;
    const el = endLine ?? Number.MAX_SAFE_INTEGER;
    filteredSymbols = fileSymbols.filter((s) => {
      return s.startLine >= sl && s.startLine <= el || s.endLine >= sl && s.endLine <= el || s.startLine <= sl && s.endLine >= el;
    });
    filteredSymbols = filteredSymbols.map((s) => ({
      ...s,
      lineRange: `${s.startLine}-${s.endLine}`
    }));
  }
  const importsMap = /* @__PURE__ */ new Map();
  graph.forEachNode((nodeId, attrs) => {
    if (normalizePath(attrs.filePath) === normalized) {
      graph.forEachOutEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const targetAttrs = graph.getNodeAttributes(target);
        if (normalizePath(targetAttrs.filePath) !== normalized) {
          if (!importsMap.has(targetAttrs.filePath)) {
            importsMap.set(targetAttrs.filePath, /* @__PURE__ */ new Set());
          }
          importsMap.get(targetAttrs.filePath).add(targetAttrs.name);
        }
      });
    }
  });
  const imports = Array.from(importsMap.entries()).map(([file, symbols]) => ({
    from: file,
    symbols: Array.from(symbols)
  }));
  const importedByMap = /* @__PURE__ */ new Map();
  graph.forEachNode((nodeId, attrs) => {
    if (normalizePath(attrs.filePath) === normalized) {
      graph.forEachInEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        if (normalizePath(sourceAttrs.filePath) !== normalized) {
          if (!importedByMap.has(sourceAttrs.filePath)) {
            importedByMap.set(sourceAttrs.filePath, /* @__PURE__ */ new Set());
          }
          importedByMap.get(sourceAttrs.filePath).add(attrs.name);
        }
      });
    }
  });
  const importedBy = Array.from(importedByMap.entries()).map(([file, symbols]) => ({
    file,
    symbols: Array.from(symbols)
  }));
  const lineRangeNote = startLine !== void 0 || endLine !== void 0 ? ` (showing lines ${startLine ?? 1}-${endLine ?? "end"})` : "";
  const summary = `${normalized} defines ${fileSymbols.length} symbol(s), imports from ${imports.length} file(s), and is imported by ${importedBy.length} file(s).${lineRangeNote}`;
  const result = {
    filePath: normalized,
    symbols: filteredSymbols,
    imports,
    importedBy,
    summary,
    ...startLine !== void 0 || endLine !== void 0 ? { lineRange: { startLine: startLine ?? 1, endLine: endLine ?? "end" }, totalSymbols: fileSymbols.length } : {}
  };
  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length > MAX_CONTENT_BYTES && startLine === void 0 && endLine === void 0) {
    const totalKB = Math.round(serialized.length / 1024);
    const truncated = serialized.slice(0, MAX_CONTENT_BYTES);
    return JSON.parse(JSON.stringify({
      ...result,
      _truncated: true,
      _note: `Response truncated \u2014 full output is ${totalKB} KB. Use startLine/endLine params to read specific sections: get_file_context("${filePath}", startLine, endLine)`,
      symbols: filteredSymbols.slice(0, Math.max(10, Math.floor(filteredSymbols.length / 2))),
      importedBy: importedBy.slice(0, 20)
    }));
  }
  return result;
}
function handleSearchSymbols(query, limit, graph) {
  const results = searchSymbols(graph, query);
  const queryLower = query.toLowerCase();
  results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    if (aName === queryLower && bName !== queryLower) return -1;
    if (bName === queryLower && aName !== queryLower) return 1;
    const aStarts = aName.startsWith(queryLower);
    const bStarts = bName.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (bStarts && !aStarts) return 1;
    return aName.localeCompare(bName);
  });
  const showing = Math.min(limit, results.length);
  return {
    query,
    results: results.slice(0, limit).map((r) => ({
      name: r.name,
      kind: r.kind,
      filePath: r.filePath,
      exported: r.exported,
      scope: r.scope
    })),
    totalMatches: results.length,
    showing
  };
}
function handleAffectedFiles(filePath, graph, maxDepth, testsOnly) {
  const result = getAffectedFiles(graph, filePath, {
    maxDepth: maxDepth ?? 5,
    testsOnly: testsOnly ?? false
  });
  if (result.totalCount === 0) {
    return {
      target: filePath,
      affected_files: [],
      test_files: [],
      total_affected: 0,
      total_tests: 0,
      message: `No affected files found for '${filePath}'. Check the path is relative to the project root.`
    };
  }
  const files = testsOnly ? result.testFiles : result.affected;
  return {
    target: filePath,
    affected_files: testsOnly ? [] : result.affected,
    test_files: result.testFiles,
    total_affected: result.affected.length,
    total_tests: result.testFiles.length,
    summary: `Changing ${filePath} affects ${result.affected.length} file(s), including ${result.testFiles.length} test file(s).`
  };
}
function handleGetArchitectureSummary(graph, projectRoot) {
  const summary = getArchitectureSummary(graph, projectRoot);
  const fileSummary = getFileSummary(graph);
  const dirMap = /* @__PURE__ */ new Map();
  const languageBreakdown = {};
  fileSummary.forEach((f) => {
    const dir = f.filePath.includes("/") ? dirname2(f.filePath) : ".";
    if (!dirMap.has(dir)) {
      dirMap.set(dir, { fileCount: 0, symbolCount: 0 });
    }
    const entry = dirMap.get(dir);
    entry.fileCount++;
    entry.symbolCount += f.symbolCount;
    const ext = f.filePath.toLowerCase();
    let lang;
    if (ext.endsWith(".ts") || ext.endsWith(".tsx")) {
      lang = "typescript";
    } else if (ext.endsWith(".py")) {
      lang = "python";
    } else if (ext.endsWith(".js") || ext.endsWith(".jsx") || ext.endsWith(".mjs") || ext.endsWith(".cjs")) {
      lang = "javascript";
    } else {
      lang = "other";
    }
    languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
  });
  const directories = Array.from(dirMap.entries()).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.symbolCount - a.symbolCount);
  const summaryText = `Project has ${summary.fileCount} files with ${summary.symbolCount} symbols and ${summary.edgeCount} edges. The most connected file is ${summary.mostConnectedFiles[0]?.filePath || "N/A"} with ${summary.mostConnectedFiles[0]?.connections || 0} connections.`;
  return {
    overview: {
      totalFiles: summary.fileCount,
      totalSymbols: summary.symbolCount,
      totalEdges: summary.edgeCount,
      languages: languageBreakdown
    },
    mostConnectedFiles: summary.mostConnectedFiles.slice(0, 10),
    directories: directories.slice(0, 10),
    orphanFiles: summary.orphanFiles,
    summary: summaryText,
    ...summary.fileCount === 0 ? { note: "No parseable files found. Nothing was analyzed." } : {}
  };
}
function handleListFiles(directory, graph) {
  const fileSummary = getFileSummary(graph);
  let filtered = fileSummary;
  if (directory) {
    const normalizedDir = normalizePath(directory);
    filtered = fileSummary.filter((f) => normalizePath(f.filePath).startsWith(normalizedDir));
  }
  const files = filtered.map((f) => ({
    path: f.filePath,
    symbolCount: f.symbolCount,
    connections: f.incomingRefs + f.outgoingRefs
  }));
  return {
    files,
    totalFiles: files.length
  };
}
async function handleVisualizeGraph(highlight, maxFiles, state) {
  const vizData = prepareVizData(state.graph, state.projectRoot);
  const { url, alreadyRunning } = await startVizServer(
    vizData,
    state.graph,
    state.projectRoot,
    3456,
    // Use different port from CLI default to avoid conflicts
    false
    // Don't auto-open browser from MCP
  );
  const fileCount = maxFiles && maxFiles < vizData.files.length ? maxFiles : vizData.files.length;
  const arcCount = vizData.arcs.filter((a) => {
    if (!maxFiles || maxFiles >= vizData.files.length) return true;
    const topFiles = vizData.files.sort((a2, b) => b.incomingCount + b.outgoingCount - (a2.incomingCount + a2.outgoingCount)).slice(0, maxFiles).map((f) => f.path);
    return topFiles.includes(a.sourceFile) && topFiles.includes(a.targetFile);
  }).length;
  const statusMessage = alreadyRunning ? "Visualization server is already running." : "Visualization server started.";
  const message = `${statusMessage}

Interactive arc diagram: ${url}

The diagram shows ${fileCount} files and ${arcCount} cross-file dependencies.${highlight ? ` Highlighted: ${highlight}` : ""}

Features:
\u2022 Hover over arcs to see source \u2192 target details
\u2022 Click files to filter connections
\u2022 Search for specific files
\u2022 Export as SVG or PNG

The server will keep running until you end the MCP session or press Ctrl+C.`;
  return {
    content: [{ type: "text", text: message }]
  };
}
async function handleGetProjectDocs(docType, state) {
  const docsDir = join10(state.projectRoot, ".depwire");
  if (!existsSync8(docsDir)) {
    const errorMessage = `Project documentation has not been generated yet.

Run \`depwire docs ${state.projectRoot}\` to generate codebase documentation.

Once generated, this tool will return the requested documentation.

Available document types:
- architecture: High-level structural overview
- conventions: Auto-detected coding patterns
- dependencies: Complete dependency mapping
- onboarding: Guide for new developers`;
    return {
      content: [{ type: "text", text: errorMessage }]
    };
  }
  const metadata = loadMetadata(docsDir);
  if (!metadata) {
    return {
      content: [{ type: "text", text: "Documentation directory exists but metadata is missing. Please regenerate with `depwire docs`." }]
    };
  }
  const docsToReturn = docType === "all" ? ["architecture", "conventions", "dependencies", "onboarding"] : [docType];
  let output = "";
  const missing = [];
  for (const doc of docsToReturn) {
    if (!metadata.documents[doc]) {
      missing.push(doc);
      continue;
    }
    const filePath = join10(docsDir, metadata.documents[doc].file);
    if (!resolve3(filePath).startsWith(resolve3(docsDir))) {
      missing.push(doc);
      continue;
    }
    if (!existsSync8(filePath)) {
      missing.push(doc);
      continue;
    }
    const content = readFileSync6(filePath, "utf-8");
    if (docsToReturn.length > 1) {
      output += `

---

# ${doc.toUpperCase()}

`;
    }
    output += content;
  }
  if (missing.length > 0) {
    output += `

---

**Note:** The following documents are missing: ${missing.join(", ")}. Run \`depwire docs ${state.projectRoot} --update\` to generate them.`;
  }
  return {
    content: [{ type: "text", text: output }]
  };
}
async function handleUpdateProjectDocs(docType, state) {
  const startTime = Date.now();
  const docsDir = join10(state.projectRoot, ".depwire");
  console.error("Regenerating project documentation...");
  const parsedFiles = await parseProject(state.projectRoot);
  const graph = buildGraph(parsedFiles, state.projectRoot);
  const parseTime = (Date.now() - startTime) / 1e3;
  state.graph = graph;
  const packageJsonPath = join10(__dirname, "../../package.json");
  const packageJson = JSON.parse(readFileSync6(packageJsonPath, "utf-8"));
  const docsToGenerate = docType === "all" ? ["architecture", "conventions", "dependencies", "onboarding"] : [docType];
  const docsExist = existsSync8(docsDir);
  const result = await generateDocs(graph, state.projectRoot, packageJson.version, parseTime, {
    outputDir: docsDir,
    format: "markdown",
    include: docsToGenerate,
    update: docsExist,
    only: docsExist ? docsToGenerate : void 0,
    verbose: false,
    stats: false
  });
  const elapsed = (Date.now() - startTime) / 1e3;
  if (result.success) {
    const fileCount = /* @__PURE__ */ new Set();
    graph.forEachNode((node, attrs) => {
      fileCount.add(attrs.filePath);
    });
    return {
      status: "success",
      message: `Updated ${result.generated.join(", ")} (${fileCount.size} files, ${graph.order} symbols, ${elapsed.toFixed(1)}s)`,
      generated: result.generated,
      stats: {
        files: fileCount.size,
        symbols: graph.order,
        edges: graph.size,
        time: elapsed
      }
    };
  } else {
    return {
      status: "error",
      message: `Failed to update documentation: ${result.errors.join(", ")}`,
      errors: result.errors
    };
  }
}
function handleGetHealthScore(state) {
  const graph = state.graph;
  const projectRoot = state.projectRoot;
  const report = calculateHealthScore(graph, projectRoot);
  if (report.status === "no_parseable_files") {
    return {
      status: "no_parseable_files",
      message: "No parseable files found. Nothing was analyzed, so no health score is available.",
      filesScanned: 0,
      supportedExtensions: report.supportedExtensions || []
    };
  }
  return report;
}
async function handleGetTemporalGraph(state, commits, strategy) {
  const projectRoot = state.projectRoot;
  if (!isGitRepo(projectRoot)) {
    return {
      error: "Not a git repository",
      message: "Temporal analysis requires git history"
    };
  }
  try {
    const allCommits = await getCommitLog(projectRoot);
    if (allCommits.length === 0) {
      return {
        error: "No commits found",
        message: "Repository has no commit history"
      };
    }
    const sampledCommits = sampleCommits(allCommits, commits, strategy);
    const snapshots = [];
    const outputDir = join10(projectRoot, ".depwire", "temporal");
    for (const commit of sampledCommits) {
      const existing = loadSnapshot(commit.hash, outputDir);
      if (existing) {
        snapshots.push(existing);
      }
    }
    if (snapshots.length === 0) {
      return {
        status: "no_snapshots",
        message: "No temporal snapshots found. Run `depwire temporal` to generate them.",
        commits_found: allCommits.length,
        commits_to_sample: sampledCommits.length
      };
    }
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const growth = {
      files: last.stats.totalFiles - first.stats.totalFiles,
      symbols: last.stats.totalSymbols - first.stats.totalSymbols,
      edges: last.stats.totalEdges - first.stats.totalEdges
    };
    const trend = growth.files > 0 ? "Growing" : growth.files < 0 ? "Shrinking" : "Stable";
    let biggestGrowth = { index: 0, files: 0, date: "", message: "" };
    for (let i = 1; i < snapshots.length; i++) {
      const delta = snapshots[i].stats.totalFiles - snapshots[i - 1].stats.totalFiles;
      if (delta > biggestGrowth.files) {
        biggestGrowth = {
          index: i,
          files: delta,
          date: snapshots[i].commitDate,
          message: snapshots[i].commitMessage
        };
      }
    }
    return {
      status: "success",
      time_range: {
        from: first.commitDate,
        to: last.commitDate
      },
      snapshots: snapshots.map((s) => ({
        commit: s.commitHash.substring(0, 8),
        date: s.commitDate,
        message: s.commitMessage,
        author: s.commitAuthor,
        files: s.stats.totalFiles,
        symbols: s.stats.totalSymbols,
        edges: s.stats.totalEdges
      })),
      growth,
      trend,
      biggest_growth_period: biggestGrowth.files > 0 ? biggestGrowth : null,
      summary: `Analyzed ${snapshots.length} snapshots from ${new Date(first.commitDate).toLocaleDateString()} to ${new Date(last.commitDate).toLocaleDateString()}. Overall trend: ${trend}.`
    };
  } catch (error) {
    return {
      error: "Failed to analyze temporal graph",
      message: String(error)
    };
  }
}
function handleFindDeadCode(state, confidence) {
  if (!state.graph || !state.projectRoot) {
    return {
      error: "No project loaded",
      message: "Use connect_repo to connect to a codebase first"
    };
  }
  if (state.graph.order === 0) {
    return {
      status: "no_parseable_files",
      message: "No parseable files found. Nothing was analyzed, so no dead-code report is available.",
      totalSymbols: 0,
      deadSymbols: 0
    };
  }
  try {
    const report = analyzeDeadCode(state.graph, state.projectRoot, {
      confidence,
      includeTests: false,
      verbose: false,
      stats: false,
      json: true
    });
    return {
      status: "success",
      totalSymbols: report.totalSymbols,
      deadSymbols: report.deadSymbols,
      deadPercentage: report.deadPercentage,
      byConfidence: report.byConfidence,
      symbols: report.symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        file: s.file,
        line: s.line,
        exported: s.exported,
        dependents: s.dependents,
        confidence: s.confidence,
        reason: s.reason
      })),
      summary: `Found ${report.deadSymbols} potentially dead symbols (${report.byConfidence.high} high, ${report.byConfidence.medium} medium, ${report.byConfidence.low} low confidence) out of ${report.totalSymbols} total symbols (${report.deadPercentage.toFixed(1)}% dead code).`
    };
  } catch (error) {
    return {
      error: "Failed to analyze dead code",
      message: String(error)
    };
  }
}
function handleSimulateChange(args, state) {
  const { operation, symbols } = args;
  const target = normalizePath(args.target);
  const destination = normalizePath(args.destination);
  const mergeTarget = normalizePath(args.mergeTarget);
  const graph = state.graph;
  if ((operation === "move" || operation === "rename") && !destination) {
    return {
      error: true,
      message: "destination is required for move and rename operations",
      operation,
      target
    };
  }
  if (operation === "split" && (!symbols || symbols.length === 0)) {
    return {
      error: true,
      message: "symbols is required for split operations and must not be empty",
      operation,
      target
    };
  }
  if (operation === "merge" && !mergeTarget) {
    return {
      error: true,
      message: "mergeTarget is required for merge operations",
      operation,
      target
    };
  }
  const targetNodes = graph.filterNodes(
    (_node, attrs) => {
      const fp = attrs.filePath?.replace(/^\.\//, "").replace(/\/+$/, "");
      const t = target.replace(/^\.\//, "").replace(/\/+$/, "");
      return fp === t || fp?.endsWith("/" + t) || t.endsWith("/" + fp);
    }
  );
  if (targetNodes.length === 0) {
    return {
      error: true,
      message: `Target file '${target}' not found in the dependency graph`,
      operation,
      target
    };
  }
  let action;
  switch (operation) {
    case "move":
      action = { type: "move", target, destination };
      break;
    case "delete":
      action = { type: "delete", target };
      break;
    case "rename":
      action = { type: "rename", target, newName: destination };
      break;
    case "split":
      action = { type: "split", target, newFile: destination || target.replace(/(\.\w+)$/, ".split$1"), symbols };
      break;
    case "merge":
      action = { type: "merge", target, source: mergeTarget };
      break;
    default:
      return {
        error: true,
        message: `Unknown operation: ${operation}`,
        operation,
        target
      };
  }
  try {
    const engine = new SimulationEngine(graph);
    const result = engine.simulate(action);
    const brokenImportCount = result.diff.brokenImports.length;
    const affectedNodeCount = result.diff.affectedNodes.length;
    const removedEdgeCount = result.diff.removedEdges.length;
    return {
      operation,
      target,
      healthBefore: result.healthDelta.before,
      healthAfter: result.healthDelta.after,
      healthDelta: result.healthDelta.delta,
      affectedNodes: affectedNodeCount,
      brokenImports: result.diff.brokenImports.map((bi) => ({
        file: bi.file,
        importedSymbol: bi.importedSymbol
      })),
      removedEdges: removedEdgeCount,
      circularDepsIntroduced: result.diff.circularDepsIntroduced.length,
      circularDepsResolved: result.diff.circularDepsResolved.length,
      summary: `${operation.charAt(0).toUpperCase() + operation.slice(1)}ing ${target} would ${result.healthDelta.delta >= 0 ? "improve" : "reduce"} health score from ${result.healthDelta.before} to ${result.healthDelta.after} (${result.healthDelta.delta >= 0 ? "+" : ""}${result.healthDelta.delta}), breaking ${brokenImportCount} import${brokenImportCount !== 1 ? "s" : ""} across ${affectedNodeCount} affected node${affectedNodeCount !== 1 ? "s" : ""}.`
    };
  } catch (err) {
    return {
      error: true,
      message: err.message,
      operation,
      target
    };
  }
}

// src/mcp/server.ts
async function startMcpServer(state) {
  const server = new Server(
    {
      name: "depwire",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getToolsList()
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleToolCall(name, args || {}, state);
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Depwire MCP server started");
  if (state.projectRoot) {
    console.error(`Project: ${state.projectRoot}`);
  } else {
    console.error("No project loaded. Use connect_repo to connect to a codebase.");
  }
}

export {
  prepareVizData,
  watchProject,
  startVizServer,
  createEmptyState,
  updateFileInGraph,
  getCommitLog,
  getCurrentBranch,
  checkoutCommit,
  restoreOriginal,
  stashChanges,
  popStash,
  isGitRepo,
  sampleCommits,
  saveSnapshot,
  loadSnapshot,
  createSnapshot,
  verifyChange,
  startMcpServer
};
