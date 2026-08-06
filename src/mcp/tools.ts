import { DirectedGraph } from "graphology";
import { dirname, join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import {
  searchSymbols,
  getDependencies,
  getDependents,
  getImpact,
  getFileSummary,
  getArchitectureSummary,
  getAffectedFiles,
  findSymbols,
  type SymbolMatch,
} from "../graph/queries.js";
import type { DepwireState } from "./state.js";
import { isProjectLoaded } from "./state.js";
import { connectToRepo } from "./connect.js";
import { prepareVizData } from "../viz/data.js";
import { generateArcDiagramHTML } from "../viz/generate-html.js";
import { startVizServer } from "../viz/server.js";
import { parseProject } from "../parser/index.js";
import { buildGraph } from "../graph/index.js";
import { generateDocs } from "../docs/index.js";
import { loadMetadata } from "../docs/metadata.js";
import { calculateHealthScore } from "../health/index.js";
import { getCommitLog, isGitRepo } from "../temporal/git.js";
import { sampleCommits } from "../temporal/sampler.js";
import { loadSnapshot, createSnapshot } from "../temporal/snapshots.js";
import type { TemporalSnapshot } from "../temporal/types.js";
import { analyzeDeadCode } from "../dead-code/index.js";
import { SimulationEngine } from "../simulation/engine.js";
import type { SimulationAction } from "../simulation/engine.js";
import { scanSecurity } from "../security/scanner.js";
import type { VulnerabilityClass } from "../security/types.js";
import { handleVerifyChange } from "./tools/verify-change.js";
import { handleClaimFiles } from "./tools/claim-files.js";
import { handleReleaseFiles } from "./tools/release-files.js";
import { handleGetActiveClaims } from "./tools/get-active-claims.js";
import { handleRecordDecision } from "./tools/record-decision.js";
import { handleGetDecisions } from "./tools/get-decisions.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Centralized path normalizer for all inbound MCP file-path arguments.
 * Graph keys are stored POSIX-style (forward slashes, no leading "./").
 * Windows clients may pass backslash paths (e.g. "src\app\component.ts"),
 * which would otherwise never match. Normalize before any graph lookup.
 */
function normalizePath(p: string | undefined): string | undefined {
  if (!p) return p;
  return p
    .replace(/\\/g, '/')   // backslash → forward slash
    .replace(/^\.\//, '')  // strip leading ./
    .replace(/\/+$/, '');  // strip trailing slash
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
      description: "Look up detailed information about a symbol (function, class, variable, type, etc.) by name. Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The symbol name to look up (e.g., 'UserService') or full ID (e.g., 'src/services/UserService.ts::UserService')",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "get_dependencies",
      description: "Get all symbols that a given symbol depends on (what does this symbol use/import/call?). Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_dependents",
      description: "Get all symbols that depend on a given symbol (what uses this symbol?). Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "impact_analysis",
      description: "Analyze what would break if a symbol is changed, renamed, or removed. Shows direct dependents, transitive dependents (chain reaction), and all affected files. Cross-language edges included — a TypeScript fetch call to a Python route will show the Python file as affected. Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation. Use this before making changes to understand the blast radius.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')",
          },
          file: {
            type: "string",
            description: "Optional: File path to disambiguate when multiple symbols have the same name (e.g., 'src/router.ts')",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_file_context",
      description: "Get complete context about a file — all symbols defined in it, all imports, all exports, and all files that import from it. Includes cross-language connections (REST API calls, subprocess invocations). Supports startLine/endLine for reading large files in chunks.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative file path (e.g., 'services/UserService.ts')",
          },
          startLine: {
            type: "number",
            description: "Optional: start line number (1-based) to return only a slice of file content",
          },
          endLine: {
            type: "number",
            description: "Optional: end line number (1-based, inclusive) to return only a slice of file content",
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
    {
      name: "get_project_docs",
      description: "Retrieve auto-generated codebase documentation. Returns architecture overview, code conventions, dependency maps, and onboarding guides. Documentation must be generated first with `depwire docs` command.",
      inputSchema: {
        type: "object",
        properties: {
          doc_type: {
            type: "string",
            description: "Document type to retrieve: 'architecture', 'conventions', 'dependencies', 'onboarding', or 'all' (default: 'all')",
          },
        },
      },
    },
    {
      name: "update_project_docs",
      description: "Regenerate codebase documentation with the latest changes. If docs don't exist, generates them for the first time. Use this after significant code changes to keep documentation up-to-date.",
      inputSchema: {
        type: "object",
        properties: {
          doc_type: {
            type: "string",
            description: "Document type to update: 'architecture', 'conventions', 'dependencies', 'onboarding', or 'all' (default: 'all')",
          },
        },
      },
    },
    {
      name: "get_health_score",
      description: "Get a 0-100 health score for the project's dependency architecture. Scores coupling, cohesion, circular dependencies, god files, orphan files, and dependency depth. Returns overall score, per-dimension breakdown, and actionable recommendations.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_temporal_graph",
      description: "Show how the dependency graph evolved over git history. Returns snapshots at sampled commits showing file counts, symbol counts, edge counts, and structural changes over time.",
      inputSchema: {
        type: "object",
        properties: {
          commits: {
            type: "number",
            description: "Number of commits to sample (default: 10)",
          },
          strategy: {
            type: "string",
            enum: ["even", "weekly", "monthly"],
            description: "Sampling strategy (default: even)",
          },
        },
      },
    },
    {
      name: "find_dead_code",
      description: "Find potentially dead code — symbols that are defined but never referenced anywhere in the codebase. Returns symbols categorized by confidence level (high, medium, low). High confidence means definitely unused. Use this to identify cleanup opportunities.",
      inputSchema: {
        type: "object",
        properties: {
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Minimum confidence level to return (default: medium)",
            default: "medium",
          },
        },
      },
    },
    {
      name: "simulate_change",
      description: `Simulate an architectural change before touching any code. Returns health score delta, broken imports, and affected nodes. Zero file I/O — pure in-memory simulation. Cross-language edges included — deleting a Python route file will show TypeScript callers as affected.

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
            description: "Type of change to simulate",
          },
          target: {
            type: "string",
            description: "Relative file path of the primary target",
          },
          destination: {
            type: "string",
            description: "Required for move and rename — the new file path",
          },
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Required for split — symbol names to move to new file",
          },
          mergeTarget: {
            type: "string",
            description: "Required for merge — the file to merge into target",
          },
        },
        required: ["operation", "target"],
      },
    },
    {
      name: "security_scan",
      description: `Scan the codebase for security vulnerabilities using deterministic checks + graph-aware severity scoring. No API key required.

Checks: dependency CVEs, shell injection, hardcoded secrets, path traversal, auth bypass, input validation, information disclosure, cryptography weaknesses, frontend XSS, architecture-level risks.

Graph-aware severity: vulnerabilities reachable from MCP tools or HTTP routes are automatically elevated. A medium shell injection reachable from connect_repo becomes Critical.

Returns ranked findings (Critical → Low) with attack scenarios and suggested fixes. Use --target for single-file scan.`,
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Relative file path to scan. Omit to scan entire repo.",
          },
          classes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "dependency-cve", "shell-injection", "code-injection", "secrets",
                "path-traversal", "auth", "input-validation", "information-disclosure",
                "architecture", "cryptography", "supply-chain", "frontend-xss"
              ],
            },
            description: "Vulnerability classes to check. Omit for all.",
          },
          graphAware: {
            type: "boolean",
            description: "Enable graph-aware severity elevation (recommended). Default: true.",
          },
        },
      },
    },
    {
      name: "verify_change",
      description: "Before applying a code change, return a deterministic safety report. Checks for broken imports, new circular dependencies, health score impact, and runs a targeted scan on changed files. Used by AI coding assistants and autonomous agents.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "File path being changed (use with new_content)",
          },
          new_content: {
            type: "string",
            description: "The proposed new content of the file",
          },
          unified_diff: {
            type: "string",
            description: "A unified diff string (alternative to file_path + new_content)",
          },
          depwire_action_token: {
            type: "string",
            description: "Optional, reserved for future DAT integration",
          },
        },
      },
    },
    {
      name: "claim_files",
      description: "Multi-agent coordination: declare intent to modify files so other MCP clients see the claim and avoid conflicts. Claims expire after a configurable TTL.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Identifies the calling agent/session",
          },
          file_paths: {
            type: "array",
            items: { type: "string" },
            description: "Files to claim",
          },
          reason: {
            type: "string",
            description: "Optional human-readable reason for the claim",
          },
          ttl_minutes: {
            type: "number",
            description: "Time-to-live in minutes (default 30, max 240)",
          },
          depwire_action_token: {
            type: "string",
            description: "Optional, reserved for future DAT integration",
          },
        },
        required: ["session_id", "file_paths"],
      },
    },
    {
      name: "release_files",
      description: "Release a previously made file claim. The release is recorded as an event (append-only).",
      inputSchema: {
        type: "object",
        properties: {
          claim_id: {
            type: "string",
            description: "The claim ID to release",
          },
          session_id: {
            type: "string",
            description: "Must match the original claim's session_id",
          },
        },
        required: ["claim_id", "session_id"],
      },
    },
    {
      name: "get_active_claims",
      description: "Query who is currently working on what. Returns active file claims, useful for orchestrator agents deciding what to delegate.",
      inputSchema: {
        type: "object",
        properties: {
          filter_by_session: {
            type: "string",
            description: "Only return claims from this session",
          },
          filter_by_file: {
            type: "string",
            description: "Only return claims affecting this file",
          },
          include_expired: {
            type: "boolean",
            description: "Include expired claims (default false)",
          },
        },
      },
    },
    {
      name: "record_decision",
      description: "Save a structured decision so future clients (or the same client in a future session) can see what was decided and why. Stored in .depwire/decisions.jsonl.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Identifies the calling agent/session",
          },
          context: {
            type: "string",
            description: "What problem was being solved",
          },
          options_considered: {
            type: "array",
            items: { type: "string" },
            description: "Alternatives the client weighed",
          },
          decision: {
            type: "string",
            description: "What was chosen",
          },
          reasoning: {
            type: "string",
            description: "Why this option was chosen",
          },
          files_affected: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of files this decision touches",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags for categorization",
          },
          depwire_action_token: {
            type: "string",
            description: "Optional, reserved for future DAT integration",
          },
        },
        required: ["session_id", "context", "options_considered", "decision", "reasoning"],
      },
    },
    {
      name: "get_decisions",
      description: "Retrieve past decisions matching a query. Lets agents see what previous agents (or itself in a previous session) decided about similar problems.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search across context, decision, reasoning fields",
          },
          filter_by_session: {
            type: "string",
            description: "Only decisions from this session",
          },
          filter_by_file: {
            type: "string",
            description: "Only decisions affecting this file",
          },
          filter_by_tag: {
            type: "string",
            description: "Only decisions with this tag",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20, max 100)",
          },
          since: {
            type: "string",
            description: "ISO-8601 timestamp, only decisions after this time",
          },
        },
      },
    },
    {
      name: "affected_files",
      description: "Find all files affected by a change to a specific file or symbol. Includes test files that cover the affected code. Use this before running tests to know which test files to execute.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Relative path of the changed file (e.g., 'src/auth/token.ts')",
          },
          max_depth: {
            type: "number",
            description: "Maximum traversal depth (default: 5)",
          },
          tests_only: {
            type: "boolean",
            description: "Return only test files (default: false)",
          },
        },
        required: ["file_path"],
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
        result = handleGetArchitectureSummary(state.graph!, state.projectRoot);
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
    } else if (name === "get_project_docs") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = await handleGetProjectDocs(args.doc_type || "all", state);
      }
    } else if (name === "update_project_docs") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = await handleUpdateProjectDocs(args.doc_type || "all", state);
      }
    } else if (name === "get_health_score") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = handleGetHealthScore(state);
      }
    } else if (name === "get_temporal_graph") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = await handleGetTemporalGraph(state, args.commits || 10, args.strategy || "even");
      }
    } else if (name === "find_dead_code") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
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
          target: args.target,
        };
      } else {
        result = handleSimulateChange(args, state);
      }
    } else if (name === "security_scan") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else if (state.graph!.order === 0) {
        result = {
          status: "no_parseable_files",
          message: "No parseable files found. Nothing was analyzed, so no security scan was performed.",
          findings: [],
        };
      } else {
        result = await scanSecurity(state.projectRoot!, state.graph!, {
          target: normalizePath(args.target),
          classes: args.classes as VulnerabilityClass[] | undefined,
          graphAware: args.graphAware !== false,
        });
      }
    } else if (name === "verify_change") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = await handleVerifyChange(
          { ...args, file_path: normalizePath(args.file_path) } as any,
          state
        );
      }
    } else if (name === "claim_files") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = handleClaimFiles(args as any, state);
      }
    } else if (name === "release_files") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = handleReleaseFiles(args as any, state);
      }
    } else if (name === "get_active_claims") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = handleGetActiveClaims(args as any, state);
      }
    } else if (name === "record_decision") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = handleRecordDecision(args as any, state);
      }
    } else if (name === "get_decisions") {
      if (!isProjectLoaded(state)) {
        result = {
          error: "No project loaded",
          message: "Use connect_repo to connect to a codebase first",
        };
      } else {
        result = handleGetDecisions(args as any, state);
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
            result = handleAffectedFiles(normalizePath(args.file_path)!, graph, args.max_depth, args.tests_only);
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

/**
 * Create a disambiguation response when multiple symbols share the same name
 */
function createDisambiguationResponse(matches: SymbolMatch[], queryName: string) {
  const suggestion = matches.length > 0 ? matches[0].id : '';
  const exampleFile = matches.length > 0 ? matches[0].filePath : '';
  
  return {
    ambiguous: true,
    message: `Found ${matches.length} symbols named '${queryName}'. Disambiguate by:\n1. Using full ID: '${suggestion}'\n2. Or adding file parameter: { symbol: '${queryName}', file: '${exampleFile}' }`,
    matches: matches.map((m, index) => ({
      id: m.id,
      kind: m.kind,
      filePath: m.filePath,
      line: m.startLine,
      dependents: m.dependentCount,
      hint: index === 0 && m.dependentCount > 0 ? 'Most dependents — likely the one you want' : '',
    })),
    suggestion: suggestion,
  };
}

function handleGetSymbolInfo(name: string, graph: DirectedGraph) {
  const matches = findSymbols(graph, name);
  
  if (matches.length === 0) {
    // Try fuzzy search as fallback
    const fuzzyMatches = searchSymbols(graph, name).slice(0, 10);
    return {
      error: `Symbol '${name}' not found`,
      suggestion: fuzzyMatches.length > 0 
        ? `Did you mean: ${fuzzyMatches.map(m => m.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
      fuzzyMatches: fuzzyMatches.map(m => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        filePath: m.filePath,
      })),
    };
  }
  
  // Return all matches (even if just one)
  return {
    matches: matches.map(m => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      filePath: m.filePath,
      startLine: m.startLine,
      endLine: m.endLine,
      exported: m.exported,
      scope: m.scope,
      dependents: m.dependentCount,
    })),
    count: matches.length,
  };
}

function handleGetDependencies(symbol: string, graph: DirectedGraph) {
  const matches = findSymbols(graph, symbol);
  
  if (matches.length === 0) {
    // Try fuzzy search as fallback
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0 
        ? `Did you mean: ${fuzzyMatches.map(m => m.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
    };
  }
  
  // If multiple matches, return disambiguation response
  if (matches.length > 1) {
    return createDisambiguationResponse(matches, symbol);
  }
  
  // Single match - proceed with analysis
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
    symbol: target.id,
    dependencies: grouped,
    totalCount,
  };
}

function handleGetDependents(symbol: string, graph: DirectedGraph) {
  const matches = findSymbols(graph, symbol);
  
  if (matches.length === 0) {
    // Try fuzzy search as fallback
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0 
        ? `Did you mean: ${fuzzyMatches.map(m => m.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
    };
  }
  
  // If multiple matches, return disambiguation response
  if (matches.length > 1) {
    return createDisambiguationResponse(matches, symbol);
  }
  
  // Single match - proceed with analysis
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
    symbol: target.id,
    dependents: grouped,
    totalCount,
  };
}

function handleImpactAnalysis(symbol: string, graph: DirectedGraph, file?: string) {
  const matches = findSymbols(graph, symbol);
  
  if (matches.length === 0) {
    // Try fuzzy search as fallback
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0 
        ? `Did you mean: ${fuzzyMatches.map(m => m.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
    };
  }
  
  // If file parameter is provided, filter matches to that file
  let filteredMatches = matches;
  if (file) {
    const normalizedFile = normalizePath(file)!;
    filteredMatches = matches.filter(m => {
      const mfp = normalizePath(m.filePath)!;
      return mfp === normalizedFile || mfp.endsWith(normalizedFile);
    });
    if (filteredMatches.length === 0) {
      return {
        error: `Symbol '${symbol}' not found in file '${file}'`,
        availableFiles: matches.map(m => m.filePath),
        suggestion: `The symbol exists in: ${matches.map(m => m.filePath).join(', ')}`,
      };
    }
  }
  
  // If multiple matches remain, return disambiguation response
  if (filteredMatches.length > 1) {
    return createDisambiguationResponse(filteredMatches, symbol);
  }
  
  // Single match - proceed with impact analysis
  const target = filteredMatches[0];
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
      id: target.id,
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

const MAX_CONTENT_BYTES = 32768; // 32KB limit for MCP responses

function handleGetFileContext(filePath: string | undefined, graph: DirectedGraph, startLine?: number, endLine?: number) {
  const normalized = normalizePath(filePath);
  // Find all symbols in this file
  const fileSymbols: any[] = [];
  
  graph.forEachNode((nodeId, attrs) => {
    if (normalizePath(attrs.filePath) === normalized) {
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

  // If startLine/endLine provided, filter symbols to those in range
  let filteredSymbols = fileSymbols;
  if (startLine !== undefined || endLine !== undefined) {
    const sl = startLine ?? 1;
    const el = endLine ?? Number.MAX_SAFE_INTEGER;
    filteredSymbols = fileSymbols.filter(s => {
      return (s.startLine >= sl && s.startLine <= el) ||
             (s.endLine >= sl && s.endLine <= el) ||
             (s.startLine <= sl && s.endLine >= el);
    });

    // Add line numbers to output for context
    filteredSymbols = filteredSymbols.map(s => ({
      ...s,
      lineRange: `${s.startLine}-${s.endLine}`,
    }));
  }
  
  // Find imports (outgoing cross-file edges)
  const importsMap = new Map<string, Set<string>>();
  
  graph.forEachNode((nodeId, attrs) => {
    if (normalizePath(attrs.filePath) === normalized) {
      graph.forEachOutEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const targetAttrs = graph.getNodeAttributes(target);
        if (normalizePath(targetAttrs.filePath) !== normalized) {
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
    if (normalizePath(attrs.filePath) === normalized) {
      graph.forEachInEdge(nodeId, (edge, edgeAttrs, source, target) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        if (normalizePath(sourceAttrs.filePath) !== normalized) {
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

  const lineRangeNote = (startLine !== undefined || endLine !== undefined)
    ? ` (showing lines ${startLine ?? 1}-${endLine ?? 'end'})`
    : '';
  
  const summary = `${normalized} defines ${fileSymbols.length} symbol(s), imports from ${imports.length} file(s), and is imported by ${importedBy.length} file(s).${lineRangeNote}`;
  
  const result = {
    filePath: normalized,
    symbols: filteredSymbols,
    imports,
    importedBy,
    summary,
    ...(startLine !== undefined || endLine !== undefined
      ? { lineRange: { startLine: startLine ?? 1, endLine: endLine ?? 'end' }, totalSymbols: fileSymbols.length }
      : {}),
  };

  // Smart truncation: check serialized size
  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length > MAX_CONTENT_BYTES && startLine === undefined && endLine === undefined) {
    const totalKB = Math.round(serialized.length / 1024);
    const truncated = serialized.slice(0, MAX_CONTENT_BYTES);
    return JSON.parse(JSON.stringify({
      ...result,
      _truncated: true,
      _note: `Response truncated — full output is ${totalKB} KB. Use startLine/endLine params to read specific sections: get_file_context("${filePath}", startLine, endLine)`,
      symbols: filteredSymbols.slice(0, Math.max(10, Math.floor(filteredSymbols.length / 2))),
      importedBy: importedBy.slice(0, 20),
    }));
  }
  
  return result;
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

function handleAffectedFiles(
  filePath: string,
  graph: DirectedGraph,
  maxDepth?: number,
  testsOnly?: boolean,
) {
  const result = getAffectedFiles(graph, filePath, {
    maxDepth: maxDepth ?? 5,
    testsOnly: testsOnly ?? false,
  });

  if (result.totalCount === 0) {
    return {
      target: filePath,
      affected_files: [],
      test_files: [],
      total_affected: 0,
      total_tests: 0,
      message: `No affected files found for '${filePath}'. Check the path is relative to the project root.`,
    };
  }

  const files = testsOnly ? result.testFiles : result.affected;

  return {
    target: filePath,
    affected_files: testsOnly ? [] : result.affected,
    test_files: result.testFiles,
    total_affected: result.affected.length,
    total_tests: result.testFiles.length,
    summary: `Changing ${filePath} affects ${result.affected.length} file(s), including ${result.testFiles.length} test file(s).`,
  };
}

function handleGetArchitectureSummary(graph: DirectedGraph, projectRoot?: string) {
  const summary = getArchitectureSummary(graph, projectRoot);
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
    ...(summary.fileCount === 0
      ? { note: 'No parseable files found. Nothing was analyzed.' }
      : {}),
  };
}

function handleListFiles(directory: string | undefined, graph: DirectedGraph) {
  const fileSummary = getFileSummary(graph);
  
  let filtered = fileSummary;
  if (directory) {
    const normalizedDir = normalizePath(directory)!;
    filtered = fileSummary.filter(f => normalizePath(f.filePath)!.startsWith(normalizedDir));
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

async function handleGetProjectDocs(
  docType: string,
  state: DepwireState
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const docsDir = join(state.projectRoot!, '.depwire');
  
  // Check if docs exist
  if (!existsSync(docsDir)) {
    const errorMessage = `Project documentation has not been generated yet.

Run \`depwire docs ${state.projectRoot}\` to generate codebase documentation.

Once generated, this tool will return the requested documentation.

Available document types:
- architecture: High-level structural overview
- conventions: Auto-detected coding patterns
- dependencies: Complete dependency mapping
- onboarding: Guide for new developers`;
    
    return {
      content: [{ type: "text", text: errorMessage }],
    };
  }
  
  // Load metadata
  const metadata = loadMetadata(docsDir);
  if (!metadata) {
    return {
      content: [{ type: "text", text: "Documentation directory exists but metadata is missing. Please regenerate with `depwire docs`." }],
    };
  }
  
  // Determine which docs to return
  const docsToReturn = docType === 'all' 
    ? ['architecture', 'conventions', 'dependencies', 'onboarding']
    : [docType];
  
  let output = '';
  const missing: string[] = [];
  
  for (const doc of docsToReturn) {
    if (!metadata.documents[doc]) {
      missing.push(doc);
      continue;
    }
    
    const filePath = join(docsDir, metadata.documents[doc].file);
    
    // Path containment check
    if (!resolve(filePath).startsWith(resolve(docsDir))) {
      missing.push(doc);
      continue;
    }
    
    if (!existsSync(filePath)) {
      missing.push(doc);
      continue;
    }
    
    const content = readFileSync(filePath, 'utf-8');
    
    if (docsToReturn.length > 1) {
      output += `\n\n---\n\n# ${doc.toUpperCase()}\n\n`;
    }
    
    output += content;
  }
  
  if (missing.length > 0) {
    output += `\n\n---\n\n**Note:** The following documents are missing: ${missing.join(', ')}. Run \`depwire docs ${state.projectRoot} --update\` to generate them.`;
  }
  
  return {
    content: [{ type: "text", text: output }],
  };
}

async function handleUpdateProjectDocs(
  docType: string,
  state: DepwireState
): Promise<any> {
  const startTime = Date.now();
  const docsDir = join(state.projectRoot!, '.depwire');
  
  console.error('Regenerating project documentation...');
  
  // Re-parse the project
  const parsedFiles = await parseProject(state.projectRoot!);
  const graph = buildGraph(parsedFiles, state.projectRoot!);
  const parseTime = (Date.now() - startTime) / 1000;
  
  // Update state graph
  state.graph = graph;
  
  // Load package.json to get version
  const packageJsonPath = join(__dirname, '../../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  
  // Determine which docs to generate
  const docsToGenerate = docType === 'all'
    ? ['architecture', 'conventions', 'dependencies', 'onboarding']
    : [docType];
  
  // Check if docs exist
  const docsExist = existsSync(docsDir);
  
  // Generate docs
  const result = await generateDocs(graph, state.projectRoot!, packageJson.version, parseTime, {
    outputDir: docsDir,
    format: 'markdown',
    include: docsToGenerate,
    update: docsExist,
    only: docsExist ? docsToGenerate : undefined,
    verbose: false,
    stats: false,
  });
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  if (result.success) {
    const fileCount = new Set<string>();
    graph.forEachNode((node, attrs) => {
      fileCount.add(attrs.filePath);
    });
    
    return {
      status: 'success',
      message: `Updated ${result.generated.join(', ')} (${fileCount.size} files, ${graph.order} symbols, ${elapsed.toFixed(1)}s)`,
      generated: result.generated,
      stats: {
        files: fileCount.size,
        symbols: graph.order,
        edges: graph.size,
        time: elapsed,
      },
    };
  } else {
    return {
      status: 'error',
      message: `Failed to update documentation: ${result.errors.join(', ')}`,
      errors: result.errors,
    };
  }
}

/**
 * Handle get_health_score tool call
 */
function handleGetHealthScore(state: DepwireState) {
  const graph = state.graph!;
  const projectRoot = state.projectRoot!;
  
  const report = calculateHealthScore(graph, projectRoot);

  if (report.status === 'no_parseable_files') {
    return {
      status: 'no_parseable_files',
      message: 'No parseable files found. Nothing was analyzed, so no health score is available.',
      filesScanned: 0,
      supportedExtensions: report.supportedExtensions || [],
    };
  }
  
  return report;
}

async function handleGetTemporalGraph(
  state: DepwireState,
  commits: number,
  strategy: "even" | "weekly" | "monthly"
): Promise<any> {
  const projectRoot = state.projectRoot!;

  if (!isGitRepo(projectRoot)) {
    return {
      error: "Not a git repository",
      message: "Temporal analysis requires git history",
    };
  }

  try {
    const allCommits = await getCommitLog(projectRoot);
    if (allCommits.length === 0) {
      return {
        error: "No commits found",
        message: "Repository has no commit history",
      };
    }

    const sampledCommits = sampleCommits(allCommits, commits, strategy);

    const snapshots: TemporalSnapshot[] = [];
    const outputDir = join(projectRoot, ".depwire", "temporal");

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
        commits_to_sample: sampledCommits.length,
      };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    const growth = {
      files: last.stats.totalFiles - first.stats.totalFiles,
      symbols: last.stats.totalSymbols - first.stats.totalSymbols,
      edges: last.stats.totalEdges - first.stats.totalEdges,
    };

    const trend =
      growth.files > 0
        ? "Growing"
        : growth.files < 0
          ? "Shrinking"
          : "Stable";

    let biggestGrowth = { index: 0, files: 0, date: "", message: "" };
    for (let i = 1; i < snapshots.length; i++) {
      const delta = snapshots[i].stats.totalFiles - snapshots[i - 1].stats.totalFiles;
      if (delta > biggestGrowth.files) {
        biggestGrowth = {
          index: i,
          files: delta,
          date: snapshots[i].commitDate,
          message: snapshots[i].commitMessage,
        };
      }
    }

    return {
      status: "success",
      time_range: {
        from: first.commitDate,
        to: last.commitDate,
      },
      snapshots: snapshots.map((s) => ({
        commit: s.commitHash.substring(0, 8),
        date: s.commitDate,
        message: s.commitMessage,
        author: s.commitAuthor,
        files: s.stats.totalFiles,
        symbols: s.stats.totalSymbols,
        edges: s.stats.totalEdges,
      })),
      growth,
      trend,
      biggest_growth_period: biggestGrowth.files > 0 ? biggestGrowth : null,
      summary: `Analyzed ${snapshots.length} snapshots from ${new Date(first.commitDate).toLocaleDateString()} to ${new Date(last.commitDate).toLocaleDateString()}. Overall trend: ${trend}.`,
    };
  } catch (error) {
    return {
      error: "Failed to analyze temporal graph",
      message: String(error),
    };
  }
}

function handleFindDeadCode(state: DepwireState, confidence: string): any {
  if (!state.graph || !state.projectRoot) {
    return {
      error: "No project loaded",
      message: "Use connect_repo to connect to a codebase first",
    };
  }

  if (state.graph.order === 0) {
    return {
      status: "no_parseable_files",
      message: "No parseable files found. Nothing was analyzed, so no dead-code report is available.",
      totalSymbols: 0,
      deadSymbols: 0,
    };
  }

  try {
    const report = analyzeDeadCode(state.graph, state.projectRoot, {
      confidence: confidence as any,
      includeTests: false,
      verbose: false,
      stats: false,
      json: true,
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
        reason: s.reason,
      })),
      summary: `Found ${report.deadSymbols} potentially dead symbols (${report.byConfidence.high} high, ${report.byConfidence.medium} medium, ${report.byConfidence.low} low confidence) out of ${report.totalSymbols} total symbols (${report.deadPercentage.toFixed(1)}% dead code).`,
    };
  } catch (error) {
    return {
      error: "Failed to analyze dead code",
      message: String(error),
    };
  }
}

function handleSimulateChange(args: Record<string, any>, state: DepwireState): any {
  const { operation, symbols } = args;
  const target = normalizePath(args.target)!;
  const destination = normalizePath(args.destination);
  const mergeTarget = normalizePath(args.mergeTarget);
  const graph = state.graph!;

  // Validate required fields per operation
  if ((operation === "move" || operation === "rename") && !destination) {
    return {
      error: true,
      message: "destination is required for move and rename operations",
      operation,
      target,
    };
  }

  if (operation === "split" && (!symbols || symbols.length === 0)) {
    return {
      error: true,
      message: "symbols is required for split operations and must not be empty",
      operation,
      target,
    };
  }

  if (operation === "merge" && !mergeTarget) {
    return {
      error: true,
      message: "mergeTarget is required for merge operations",
      operation,
      target,
    };
  }

  // Validate target exists in the graph
  const targetNodes = graph.filterNodes(
    (_node: string, attrs: any) => {
      const fp = attrs.filePath?.replace(/^\.\//, '').replace(/\/+$/, '');
      const t = target.replace(/^\.\//, '').replace(/\/+$/, '');
      return fp === t || fp?.endsWith('/' + t) || t.endsWith('/' + fp);
    }
  );

  if (targetNodes.length === 0) {
    return {
      error: true,
      message: `Target file '${target}' not found in the dependency graph`,
      operation,
      target,
    };
  }

  // Build the SimulationAction
  let action: SimulationAction;
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
      action = { type: "split", target, newFile: destination || target.replace(/(\.\w+)$/, '.split$1'), symbols };
      break;
    case "merge":
      action = { type: "merge", target, source: mergeTarget };
      break;
    default:
      return {
        error: true,
        message: `Unknown operation: ${operation}`,
        operation,
        target,
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
        importedSymbol: bi.importedSymbol,
      })),
      removedEdges: removedEdgeCount,
      circularDepsIntroduced: result.diff.circularDepsIntroduced.length,
      circularDepsResolved: result.diff.circularDepsResolved.length,
      summary: `${operation.charAt(0).toUpperCase() + operation.slice(1)}ing ${target} would ${result.healthDelta.delta >= 0 ? 'improve' : 'reduce'} health score from ${result.healthDelta.before} to ${result.healthDelta.after} (${result.healthDelta.delta >= 0 ? '+' : ''}${result.healthDelta.delta}), breaking ${brokenImportCount} import${brokenImportCount !== 1 ? 's' : ''} across ${affectedNodeCount} affected node${affectedNodeCount !== 1 ? 's' : ''}.`,
    };
  } catch (err: any) {
    return {
      error: true,
      message: err.message,
      operation,
      target,
    };
  }
}


