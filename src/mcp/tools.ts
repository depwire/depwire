import { DirectedGraph } from "graphology";
import { dirname } from "path";
import {
  searchSymbols,
  getDependencies,
  getDependents,
  getImpact,
  getFileSummary,
  getArchitectureSummary,
} from "../graph/queries.js";
import type { DepwireState } from "./state.js";
import { isProjectLoaded } from "./state.js";
import { connectToRepo } from "./connect.js";
import { prepareVizData } from "../viz/data.js";
import { generateArcDiagramHTML } from "../viz/generate-html.js";
import { startVizServer } from "../viz/server.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export function getToolsList(): ToolDefinition[] {
  return [
    {
      name: "connect_repo",
      description: "Connect Depwire to a codebase for analysis. Accepts a local directory path or a GitHub repository URL. If a GitHub URL is provided, the repo will be cloned automatically. This replaces the currently loaded project.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Local directory path (e.g., '/Users/me/project') or GitHub URL (e.g., 'https://github.com/vercel/next.js')",
          },
          subdirectory: {
            type: "string",
            description: "Subdirectory within the repo to analyze (optional, e.g., 'packages/core/src')",
          },
        },
        required: ["source"],
      },
    },
    {
      name: "get_symbol_info",
      description: "Look up detailed information about a symbol (function, class, variable, type, etc.) by name. Returns file location, type, line numbers, and export status.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The symbol name to look up (e.g., 'UserService', 'handleAuth')",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "get_dependencies",
      description: "Get all symbols that a given symbol depends on (what does this symbol use/import/call?).",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name or ID to analyze",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_dependents",
      description: "Get all symbols that depend on a given symbol (what uses this symbol?).",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name or ID to analyze",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "impact_analysis",
      description: "Analyze what would break if a symbol is changed, renamed, or removed. Shows direct dependents, transitive dependents (chain reaction), and all affected files. Use this before making changes to understand the blast radius.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "The symbol name or ID to analyze",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_file_context",
      description: "Get complete context about a file — all symbols defined in it, all imports, all exports, and all files that import from it.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative file path (e.g., 'services/UserService.ts')",
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "search_symbols",
      description: "Search for symbols by name across the entire codebase. Supports partial matching.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (case-insensitive substring match)",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 20)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_architecture_summary",
      description: "Get a high-level overview of the project's architecture — file count, symbol count, most connected files, dependency hotspots, and orphan files.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_files",
      description: "List all files in the project with basic stats.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Filter to a specific subdirectory (optional)",
          },
        },
      },
    },
    {
      name: "visualize_graph",
      description: "Render an interactive arc diagram visualization of the current codebase's cross-reference graph. Shows files as bars along the bottom and dependency arcs connecting them, colored by distance. The visualization appears inline in the conversation.",
      inputSchema: {
        type: "object",
        properties: {
          highlight: {
            type: "string",
            description: "File or symbol name to highlight in the visualization (optional)",
          },
          maxFiles: {
            type: "number",
            description: "Limit to top N most connected files (optional, default: all)",
          },
        },
      },
    },
  ];
}

export async function handleToolCall(
  name: string,
  args: Record<string, any>,
  state: DepwireState
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    let result: any;

    // connect_repo and get_architecture_summary can work without a loaded project
    if (name === "connect_repo") {
      result = await connectToRepo(args.source, args.subdirectory, state);
    } else if (name === "get_architecture_summary") {
      if (!isProjectLoaded(state)) {
        result = {
          status: "no_project",
          message: "No project loaded. Use connect_repo to analyze a codebase.",
        };
      } else {
        result = handleGetArchitectureSummary(state.graph!);
      }
    } else if (name === "visualize_graph") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = await handleVisualizeGraph(args.highlight, args.maxFiles, state);
      }
    } else {
      // All other tools require a loaded project
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        const graph = state.graph!;

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
            result = handleImpactAnalysis(args.symbol, graph);
            break;
          case "get_file_context":
            result = handleGetFileContext(args.filePath, graph);
            break;
          case "search_symbols":
            result = handleSearchSymbols(args.query, args.limit || 20, graph);
            break;
          case "list_files":
            result = handleListFiles(args.directory, graph);
            break;
          default:
            result = { error: `Unknown tool: ${name}` };
        }
      }
    }

    // Check if this is an MCP App response (visualize_graph)
    if (result && typeof result === 'object' && '_mcpAppResponse' in result) {
      const appResult = result as { text: string; html: string };
      return {
        content: [
          {
            type: "text",
            text: appResult.text,
          },
          {
            type: "resource",
            resource: {
              uri: "ui://depwire/arc-diagram",
              mimeType: "text/html;profile=mcp-app",
              text: appResult.html,
            },
          },
        ],
      };
    }

    // Check if result is already in the correct MCP response format
    if (result && typeof result === 'object' && 'content' in result && Array.isArray(result.content)) {
      return result as { content: Array<{ type: string; text: string }> };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error("Error handling tool call:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: String(error) }, null, 2),
        },
      ],
    };
  }
}

function handleGetSymbolInfo(name: string, graph: DirectedGraph) {
  const matches = searchSymbols(graph, name);
  
  // Filter for exact or close matches
  const exactMatches = matches.filter(m => m.name.toLowerCase() === name.toLowerCase());
  const results = exactMatches.length > 0 ? exactMatches : matches.slice(0, 10);
  
  return {
    matches: results.map(m => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      filePath: m.filePath,
      startLine: m.startLine,
      endLine: m.endLine,
      exported: m.exported,
      scope: m.scope,
    })),
    count: results.length,
  };
}

function handleGetDependencies(symbol: string, graph: DirectedGraph) {
  // Find the symbol
  const matches = searchSymbols(graph, symbol);
  if (matches.length === 0) {
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: "Try using search_symbols to find available symbols",
    };
  }
  
  const target = matches[0];
  const deps = getDependencies(graph, target.id);
  
  // Group by edge kind
  const grouped: Record<string, any[]> = {};
  
  graph.forEachOutEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) {
      grouped[kind] = [];
    }
    
    const targetAttrs = graph.getNodeAttributes(targetNode);
    grouped[kind].push({
      name: targetAttrs.name,
      filePath: targetAttrs.filePath,
      kind: targetAttrs.kind,
    });
  });
  
  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  
  return {
    symbol: `${target.filePath}::${target.name}`,
    dependencies: grouped,
    totalCount,
  };
}

function handleGetDependents(symbol: string, graph: DirectedGraph) {
  const matches = searchSymbols(graph, symbol);
  if (matches.length === 0) {
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: "Try using search_symbols to find available symbols",
    };
  }
  
  const target = matches[0];
  const deps = getDependents(graph, target.id);
  
  // Group by edge kind
  const grouped: Record<string, any[]> = {};
  
  graph.forEachInEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) {
      grouped[kind] = [];
    }
    
    const sourceAttrs = graph.getNodeAttributes(source);
    grouped[kind].push({
      name: sourceAttrs.name,
      filePath: sourceAttrs.filePath,
      kind: sourceAttrs.kind,
    });
  });
  
  const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  
  return {
    symbol: `${target.filePath}::${target.name}`,
    dependents: grouped,
    totalCount,
  };
}

function handleImpactAnalysis(symbol: string, graph: DirectedGraph) {
  const matches = searchSymbols(graph, symbol);
  if (matches.length === 0) {
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: "Try using search_symbols to find available symbols",
    };
  }
  
  const target = matches[0];
  const impact = getImpact(graph, target.id);
  
  // Get edge kinds for direct dependents
  const directWithKinds = impact.directDependents.map(dep => {
    let relationship = "unknown";
    graph.forEachEdge(dep.id, target.id, (edge, attrs) => {
      relationship = attrs.kind;
    });
    return {
      name: dep.name,
      filePath: dep.filePath,
      kind: dep.kind,
      relationship,
    };
  });
  
  // Format transitive dependents
  const transitiveFormatted = impact.transitiveDependents
    .filter(dep => !impact.directDependents.some(d => d.id === dep.id))
    .map(dep => ({
      name: dep.name,
      filePath: dep.filePath,
      kind: dep.kind,
    }));
  
  const summary = `Changing ${target.name} would directly affect ${impact.directDependents.length} symbol(s) and transitively affect ${transitiveFormatted.length} more, across ${impact.affectedFiles.length} file(s).`;
  
  return {
    symbol: {
      name: target.name,
      filePath: target.filePath,
      kind: target.kind,
    },
    impact: {
      directDependents: directWithKinds,
      transitiveDependents: transitiveFormatted,
      affectedFiles: impact.affectedFiles,
      summary,
    },
  };
}

function handleGetFileContext(filePath: string, graph: DirectedGraph) {
  // Find all symbols in this file
  const fileSymbols: any[] = [];
  
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      fileSymbols.push({
        name: attrs.name,
        kind: attrs.kind,
        exported: attrs.exported,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        scope: attrs.scope,
      });
    }
  });
  
  if (fileSymbols.length === 0) {
    return {
      error: `File '${filePath}' not found`,
      suggestion: "Use list_files to see available files",
    };
  }
  
  // Find imports (outgoing cross-file edges)
  const importsMap = new Map<string, Set<string>>();
  
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      graph.forEachOutEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const targetAttrs = graph.getNodeAttributes(target);
        if (targetAttrs.filePath !== filePath) {
          if (!importsMap.has(targetAttrs.filePath)) {
            importsMap.set(targetAttrs.filePath, new Set());
          }
          importsMap.get(targetAttrs.filePath)!.add(targetAttrs.name);
        }
      });
    }
  });
  
  const imports = Array.from(importsMap.entries()).map(([file, symbols]) => ({
    from: file,
    symbols: Array.from(symbols),
  }));
  
  // Find who imports from this file (incoming cross-file edges)
  const importedByMap = new Map<string, Set<string>>();
  
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      graph.forEachInEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        if (sourceAttrs.filePath !== filePath) {
          if (!importedByMap.has(sourceAttrs.filePath)) {
            importedByMap.set(sourceAttrs.filePath, new Set());
          }
          importedByMap.get(sourceAttrs.filePath)!.add(attrs.name);
        }
      });
    }
  });
  
  const importedBy = Array.from(importedByMap.entries()).map(([file, symbols]) => ({
    file,
    symbols: Array.from(symbols),
  }));
  
  const summary = `${filePath} defines ${fileSymbols.length} symbol(s), imports from ${imports.length} file(s), and is imported by ${importedBy.length} file(s).`;
  
  return {
    filePath,
    symbols: fileSymbols,
    imports,
    importedBy,
    summary,
  };
}

function handleSearchSymbols(query: string, limit: number, graph: DirectedGraph) {
  const results = searchSymbols(graph, query);
  
  // Sort by relevance
  const queryLower = query.toLowerCase();
  results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    // Exact match first
    if (aName === queryLower && bName !== queryLower) return -1;
    if (bName === queryLower && aName !== queryLower) return 1;
    
    // Prefix match second
    const aStarts = aName.startsWith(queryLower);
    const bStarts = bName.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (bStarts && !aStarts) return 1;
    
    // Then alphabetical
    return aName.localeCompare(bName);
  });
  
  const showing = Math.min(limit, results.length);
  
  return {
    query,
    results: results.slice(0, limit).map(r => ({
      name: r.name,
      kind: r.kind,
      filePath: r.filePath,
      exported: r.exported,
      scope: r.scope,
    })),
    totalMatches: results.length,
    showing,
  };
}

function handleGetArchitectureSummary(graph: DirectedGraph) {
  const summary = getArchitectureSummary(graph);
  const fileSummary = getFileSummary(graph);
  
  // Group by directory
  const dirMap = new Map<string, { fileCount: number; symbolCount: number }>();
  
  // Count files by language
  const languageBreakdown: Record<string, number> = {};
  
  fileSummary.forEach(f => {
    const dir = f.filePath.includes('/') ? dirname(f.filePath) : '.';
    if (!dirMap.has(dir)) {
      dirMap.set(dir, { fileCount: 0, symbolCount: 0 });
    }
    const entry = dirMap.get(dir)!;
    entry.fileCount++;
    entry.symbolCount += f.symbolCount;
    
    // Count language
    const ext = f.filePath.toLowerCase();
    let lang: string;
    if (ext.endsWith('.ts') || ext.endsWith('.tsx')) {
      lang = 'typescript';
    } else if (ext.endsWith('.py')) {
      lang = 'python';
    } else if (ext.endsWith('.js') || ext.endsWith('.jsx') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) {
      lang = 'javascript';
    } else {
      lang = 'other';
    }
    languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
  });
  
  const directories = Array.from(dirMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.symbolCount - a.symbolCount);
  
  const summaryText = `Project has ${summary.fileCount} files with ${summary.symbolCount} symbols and ${summary.edgeCount} edges. The most connected file is ${summary.mostConnectedFiles[0]?.filePath || 'N/A'} with ${summary.mostConnectedFiles[0]?.connections || 0} connections.`;
  
  return {
    overview: {
      totalFiles: summary.fileCount,
      totalSymbols: summary.symbolCount,
      totalEdges: summary.edgeCount,
      languages: languageBreakdown,
    },
    mostConnectedFiles: summary.mostConnectedFiles.slice(0, 10),
    directories: directories.slice(0, 10),
    orphanFiles: summary.orphanFiles,
    summary: summaryText,
  };
}

function handleListFiles(directory: string | undefined, graph: DirectedGraph) {
  const fileSummary = getFileSummary(graph);
  
  let filtered = fileSummary;
  if (directory) {
    filtered = fileSummary.filter(f => f.filePath.startsWith(directory));
  }
  
  const files = filtered.map(f => ({
    path: f.filePath,
    symbolCount: f.symbolCount,
    connections: f.incomingRefs + f.outgoingRefs,
  }));
  
  return {
    files,
    totalFiles: files.length,
  };
}

async function handleVisualizeGraph(
  highlight: string | undefined,
  maxFiles: number | undefined,
  state: DepwireState
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Prepare visualization data
  const vizData = prepareVizData(state.graph!, state.projectRoot);
  
  // Start the visualization server (or get existing URL if already running)
  const { url, alreadyRunning } = await startVizServer(
    vizData,
    state.graph!,
    state.projectRoot!,
    3456, // Use different port from CLI default to avoid conflicts
    false  // Don't auto-open browser from MCP
  );
  
  const fileCount = maxFiles && maxFiles < vizData.files.length ? maxFiles : vizData.files.length;
  const arcCount = vizData.arcs.filter(a => {
    if (!maxFiles || maxFiles >= vizData.files.length) return true;
    const topFiles = vizData.files
      .sort((a, b) => (b.incomingCount + b.outgoingCount) - (a.incomingCount + a.outgoingCount))
      .slice(0, maxFiles)
      .map(f => f.path);
    return topFiles.includes(a.sourceFile) && topFiles.includes(a.targetFile);
  }).length;
  
  const statusMessage = alreadyRunning 
    ? "Visualization server is already running."
    : "Visualization server started.";
  
  const message = `${statusMessage}

Interactive arc diagram: ${url}

The diagram shows ${fileCount} files and ${arcCount} cross-file dependencies.${highlight ? ` Highlighted: ${highlight}` : ''}

Features:
• Hover over arcs to see source → target details
• Click files to filter connections
• Search for specific files
• Export as SVG or PNG

The server will keep running until you end the MCP session or press Ctrl+C.`;

  return {
    content: [{ type: "text", text: message }],
  };
}
