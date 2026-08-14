import { dirname } from 'path';
import type { DepwireGraph } from './graph.js';
import {
  findSymbols,
  getAffectedFiles,
  getArchitectureSummary,
  getDependencies,
  getDependents,
  getFileSummary,
  getImpact,
  searchSymbols,
  type SymbolMatch,
} from './graph/queries.js';
import { SimulationEngine, type SimulationAction } from './simulation/engine.js';

export type PrecomputedResult<T> =
  | { status: 'available'; value: T; computedAt: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'stale'; value: T; computedAt: string; reason: string };

export interface ToolContext {
  graph: DepwireGraph;
  getRepoMeta(): { name: string; root?: string };
  getPrecomputed<T>(toolName: string): Promise<PrecomputedResult<T>>;
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  requires: 'graph' | 'workspace' | 'precomputed';
  handler(args: any, ctx: ToolContext): Promise<ToolResult>;
}

function normalizePath(path: string | undefined): string | undefined {
  if (!path) return path;
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function toToolResult(result: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

async function runHandler(handler: () => unknown): Promise<ToolResult> {
  try {
    return toToolResult(handler());
  } catch (error) {
    console.error('Error handling tool call:', error);
    return toToolResult({ error: String(error) });
  }
}

function createDisambiguationResponse(matches: SymbolMatch[], queryName: string) {
  const suggestion = matches.length > 0 ? matches[0].id : '';
  const exampleFile = matches.length > 0 ? matches[0].filePath : '';

  return {
    ambiguous: true,
    message: `Found ${matches.length} symbols named '${queryName}'. Disambiguate by:\n1. Using full ID: '${suggestion}'\n2. Or adding file parameter: { symbol: '${queryName}', file: '${exampleFile}' }`,
    matches: matches.map((match, index) => ({
      id: match.id,
      kind: match.kind,
      filePath: match.filePath,
      line: match.startLine,
      dependents: match.dependentCount,
      hint: index === 0 && match.dependentCount > 0
        ? 'Most dependents — likely the one you want'
        : '',
    })),
    suggestion,
  };
}

function handleGetSymbolInfo(name: string, graph: DepwireGraph) {
  const matches = findSymbols(graph, name);

  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, name).slice(0, 10);
    return {
      error: `Symbol '${name}' not found`,
      suggestion: fuzzyMatches.length > 0
        ? `Did you mean: ${fuzzyMatches.map(match => match.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
      fuzzyMatches: fuzzyMatches.map(match => ({
        id: match.id,
        name: match.name,
        kind: match.kind,
        filePath: match.filePath,
      })),
    };
  }

  return {
    matches: matches.map(match => ({
      id: match.id,
      name: match.name,
      kind: match.kind,
      filePath: match.filePath,
      startLine: match.startLine,
      endLine: match.endLine,
      exported: match.exported,
      scope: match.scope,
      dependents: match.dependentCount,
    })),
    count: matches.length,
  };
}

function handleGetDependencies(symbol: string, graph: DepwireGraph) {
  const matches = findSymbols(graph, symbol);

  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0
        ? `Did you mean: ${fuzzyMatches.map(match => match.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
    };
  }

  if (matches.length > 1) {
    return createDisambiguationResponse(matches, symbol);
  }

  const target = matches[0];
  getDependencies(graph, target.id);
  const grouped: Record<string, any[]> = {};

  graph.forEachOutEdge(target.id, (edge, attrs, source, targetNode) => {
    const kind = attrs.kind;
    if (!grouped[kind]) grouped[kind] = [];

    const targetAttrs = graph.getNodeAttributes(targetNode);
    grouped[kind].push({
      name: targetAttrs.name,
      filePath: targetAttrs.filePath,
      kind: targetAttrs.kind,
    });
  });

  const totalCount = Object.values(grouped)
    .reduce((sum, dependencies) => sum + dependencies.length, 0);

  return { symbol: target.id, dependencies: grouped, totalCount };
}

function handleGetDependents(symbol: string, graph: DepwireGraph) {
  const matches = findSymbols(graph, symbol);

  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0
        ? `Did you mean: ${fuzzyMatches.map(match => match.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
    };
  }

  if (matches.length > 1) {
    return createDisambiguationResponse(matches, symbol);
  }

  const target = matches[0];
  getDependents(graph, target.id);
  const grouped: Record<string, any[]> = {};

  graph.forEachInEdge(target.id, (edge, attrs, source) => {
    const kind = attrs.kind;
    if (!grouped[kind]) grouped[kind] = [];

    const sourceAttrs = graph.getNodeAttributes(source);
    grouped[kind].push({
      name: sourceAttrs.name,
      filePath: sourceAttrs.filePath,
      kind: sourceAttrs.kind,
    });
  });

  const totalCount = Object.values(grouped)
    .reduce((sum, dependents) => sum + dependents.length, 0);

  return { symbol: target.id, dependents: grouped, totalCount };
}

function handleImpactAnalysis(
  symbol: string,
  graph: DepwireGraph,
  file?: string,
) {
  const matches = findSymbols(graph, symbol);

  if (matches.length === 0) {
    const fuzzyMatches = searchSymbols(graph, symbol).slice(0, 10);
    return {
      error: `Symbol '${symbol}' not found`,
      suggestion: fuzzyMatches.length > 0
        ? `Did you mean: ${fuzzyMatches.map(match => match.name).join(', ')}?`
        : 'Try using search_symbols to find available symbols',
    };
  }

  let filteredMatches = matches;
  if (file) {
    const normalizedFile = normalizePath(file)!;
    filteredMatches = matches.filter(match => {
      const matchFile = normalizePath(match.filePath)!;
      return matchFile === normalizedFile || matchFile.endsWith(normalizedFile);
    });

    if (filteredMatches.length === 0) {
      return {
        error: `Symbol '${symbol}' not found in file '${file}'`,
        availableFiles: matches.map(match => match.filePath),
        suggestion: `The symbol exists in: ${matches.map(match => match.filePath).join(', ')}`,
      };
    }
  }

  if (filteredMatches.length > 1) {
    return createDisambiguationResponse(filteredMatches, symbol);
  }

  const target = filteredMatches[0];
  const impact = getImpact(graph, target.id);
  const directWithKinds = impact.directDependents.map(dependent => {
    let relationship = 'unknown';
    graph.forEachEdge(dependent.id, target.id, (edge, attrs) => {
      relationship = attrs.kind;
    });
    return {
      name: dependent.name,
      filePath: dependent.filePath,
      kind: dependent.kind,
      relationship,
    };
  });

  const transitiveFormatted = impact.transitiveDependents
    .filter(dependent => !impact.directDependents.some(direct => direct.id === dependent.id))
    .map(dependent => ({
      name: dependent.name,
      filePath: dependent.filePath,
      kind: dependent.kind,
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

const MAX_CONTENT_BYTES = 32768;

function handleGetFileContext(
  filePath: string | undefined,
  graph: DepwireGraph,
  startLine?: number,
  endLine?: number,
) {
  const normalized = normalizePath(filePath);
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
      suggestion: 'Use list_files to see available files',
    };
  }

  let filteredSymbols = fileSymbols;
  if (startLine !== undefined || endLine !== undefined) {
    const firstLine = startLine ?? 1;
    const lastLine = endLine ?? Number.MAX_SAFE_INTEGER;
    filteredSymbols = fileSymbols.filter(symbol => (
      (symbol.startLine >= firstLine && symbol.startLine <= lastLine)
      || (symbol.endLine >= firstLine && symbol.endLine <= lastLine)
      || (symbol.startLine <= firstLine && symbol.endLine >= lastLine)
    ));
    filteredSymbols = filteredSymbols.map(symbol => ({
      ...symbol,
      lineRange: `${symbol.startLine}-${symbol.endLine}`,
    }));
  }

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

  const importedByMap = new Map<string, Set<string>>();
  graph.forEachNode((nodeId, attrs) => {
    if (normalizePath(attrs.filePath) === normalized) {
      graph.forEachInEdge(nodeId, (edge, edgeAttrs, source) => {
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
  const lineRangeNote = startLine !== undefined || endLine !== undefined
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

  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length > MAX_CONTENT_BYTES && startLine === undefined && endLine === undefined) {
    const totalKB = Math.round(serialized.length / 1024);
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

function handleSearchSymbols(query: string, limit: number, graph: DepwireGraph) {
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
    results: results.slice(0, limit).map(result => ({
      name: result.name,
      kind: result.kind,
      filePath: result.filePath,
      exported: result.exported,
      scope: result.scope,
    })),
    totalMatches: results.length,
    showing,
  };
}

function handleAffectedFiles(
  filePath: string,
  graph: DepwireGraph,
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

  return {
    target: filePath,
    affected_files: testsOnly ? [] : result.affected,
    test_files: result.testFiles,
    total_affected: result.affected.length,
    total_tests: result.testFiles.length,
    summary: `Changing ${filePath} affects ${result.affected.length} file(s), including ${result.testFiles.length} test file(s).`,
  };
}

function handleGetArchitectureSummary(graph: DepwireGraph, projectRoot?: string) {
  const summary = getArchitectureSummary(graph, projectRoot);
  const fileSummary = getFileSummary(graph);
  const dirMap = new Map<string, { fileCount: number; symbolCount: number }>();
  const languageBreakdown: Record<string, number> = {};

  fileSummary.forEach(file => {
    const directory = file.filePath.includes('/') ? dirname(file.filePath) : '.';
    if (!dirMap.has(directory)) {
      dirMap.set(directory, { fileCount: 0, symbolCount: 0 });
    }
    const entry = dirMap.get(directory)!;
    entry.fileCount++;
    entry.symbolCount += file.symbolCount;

    const path = file.filePath.toLowerCase();
    let language: string;
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      language = 'typescript';
    } else if (path.endsWith('.py')) {
      language = 'python';
    } else if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.mjs') || path.endsWith('.cjs')) {
      language = 'javascript';
    } else {
      language = 'other';
    }
    languageBreakdown[language] = (languageBreakdown[language] || 0) + 1;
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

function handleListFiles(directory: string | undefined, graph: DepwireGraph) {
  const fileSummary = getFileSummary(graph);
  let filtered = fileSummary;
  if (directory) {
    const normalizedDir = normalizePath(directory)!;
    filtered = fileSummary.filter(file => normalizePath(file.filePath)!.startsWith(normalizedDir));
  }

  const files = filtered.map(file => ({
    path: file.filePath,
    symbolCount: file.symbolCount,
    connections: file.incomingRefs + file.outgoingRefs,
  }));
  return { files, totalFiles: files.length };
}

function handleSimulateChange(args: Record<string, any>, graph: DepwireGraph): any {
  const { operation, symbols } = args;
  const target = normalizePath(args.target)!;
  const destination = normalizePath(args.destination);
  const mergeTarget = normalizePath(args.mergeTarget);

  if ((operation === 'move' || operation === 'rename') && !destination) {
    return {
      error: true,
      message: 'destination is required for move and rename operations',
      operation,
      target,
    };
  }

  if (operation === 'split' && (!symbols || symbols.length === 0)) {
    return {
      error: true,
      message: 'symbols is required for split operations and must not be empty',
      operation,
      target,
    };
  }

  if (operation === 'merge' && !mergeTarget) {
    return {
      error: true,
      message: 'mergeTarget is required for merge operations',
      operation,
      target,
    };
  }

  const targetNodes = graph.filterNodes((_node, attrs) => {
    const filePath = attrs.filePath?.replace(/^\.\//, '').replace(/\/+$/, '');
    const normalizedTarget = target.replace(/^\.\//, '').replace(/\/+$/, '');
    return filePath === normalizedTarget
      || filePath?.endsWith('/' + normalizedTarget)
      || normalizedTarget.endsWith('/' + filePath);
  });

  if (targetNodes.length === 0) {
    return {
      error: true,
      message: `Target file '${target}' not found in the dependency graph`,
      operation,
      target,
    };
  }

  let action: SimulationAction;
  switch (operation) {
    case 'move':
      action = { type: 'move', target, destination: destination! };
      break;
    case 'delete':
      action = { type: 'delete', target };
      break;
    case 'rename':
      action = { type: 'rename', target, newName: destination! };
      break;
    case 'split':
      action = {
        type: 'split',
        target,
        newFile: destination || target.replace(/(\.\w+)$/, '.split$1'),
        symbols,
      };
      break;
    case 'merge':
      action = { type: 'merge', target, source: mergeTarget! };
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
    const result = new SimulationEngine(graph).simulate(action);
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
      brokenImports: result.diff.brokenImports.map(brokenImport => ({
        file: brokenImport.file,
        importedSymbol: brokenImport.importedSymbol,
      })),
      removedEdges: removedEdgeCount,
      circularDepsIntroduced: result.diff.circularDepsIntroduced.length,
      circularDepsResolved: result.diff.circularDepsResolved.length,
      summary: `${operation.charAt(0).toUpperCase() + operation.slice(1)}ing ${target} would ${result.healthDelta.delta >= 0 ? 'improve' : 'reduce'} health score from ${result.healthDelta.before} to ${result.healthDelta.after} (${result.healthDelta.delta >= 0 ? '+' : ''}${result.healthDelta.delta}), breaking ${brokenImportCount} import${brokenImportCount !== 1 ? 's' : ''} across ${affectedNodeCount} affected node${affectedNodeCount !== 1 ? 's' : ''}.`,
    };
  } catch (error: any) {
    return { error: true, message: error.message, operation, target };
  }
}

export const toolRegistry: ToolDefinition[] = [
  {
    name: 'get_symbol_info',
    description: "Look up detailed information about a symbol (function, class, variable, type, etc.) by name. Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "The symbol name to look up (e.g., 'UserService') or full ID (e.g., 'src/services/UserService.ts::UserService')",
        },
      },
      required: ['name'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(() => handleGetSymbolInfo(args.name, ctx.graph)),
  },
  {
    name: 'get_dependencies',
    description: "Get all symbols that a given symbol depends on (what does this symbol use/import/call?). Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')",
        },
      },
      required: ['symbol'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(() => handleGetDependencies(args.symbol, ctx.graph)),
  },
  {
    name: 'get_dependents',
    description: "Get all symbols that depend on a given symbol (what uses this symbol?). Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation.",
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')",
        },
      },
      required: ['symbol'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(() => handleGetDependents(args.symbol, ctx.graph)),
  },
  {
    name: 'impact_analysis',
    description: "Analyze what would break if a symbol is changed, renamed, or removed. Shows direct dependents, transitive dependents (chain reaction), and all affected files. Cross-language edges included — a TypeScript fetch call to a Python route will show the Python file as affected. Pass a symbol name (e.g., 'Router') or a fully qualified ID (e.g., 'src/router.ts::Router') for exact matching. If multiple symbols share the same name, returns all matches for disambiguation. Use this before making changes to understand the blast radius.",
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: "Symbol name (e.g., 'Router') or full ID (e.g., 'src/router.ts::Router')",
        },
        file: {
          type: 'string',
          description: 'Optional: File path to disambiguate when multiple symbols have the same name (e.g., \'src/router.ts\')',
        },
      },
      required: ['symbol'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(
      () => handleImpactAnalysis(args.symbol, ctx.graph, normalizePath(args.file)),
    ),
  },
  {
    name: 'get_file_context',
    description: 'Get complete context about a file — all symbols defined in it, all imports, all exports, and all files that import from it. Includes cross-language connections (REST API calls, subprocess invocations). Supports startLine/endLine for reading large files in chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: "Relative file path (e.g., 'services/UserService.ts')",
        },
        startLine: {
          type: 'number',
          description: 'Optional: start line number (1-based) to return only a slice of file content',
        },
        endLine: {
          type: 'number',
          description: 'Optional: end line number (1-based, inclusive) to return only a slice of file content',
        },
      },
      required: ['filePath'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(() => handleGetFileContext(
      normalizePath(args.filePath), ctx.graph, args.startLine, args.endLine,
    )),
  },
  {
    name: 'search_symbols',
    description: 'Search for symbols by name across the entire codebase. Supports partial matching.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (case-insensitive substring match)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 20)',
        },
      },
      required: ['query'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(
      () => handleSearchSymbols(args.query, args.limit || 20, ctx.graph),
    ),
  },
  {
    name: 'get_architecture_summary',
    description: "Get a high-level overview of the project's architecture — file count, symbol count, most connected files, dependency hotspots, and orphan files.",
    inputSchema: { type: 'object', properties: {} },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(
      () => handleGetArchitectureSummary(ctx.graph, ctx.getRepoMeta().root),
    ),
  },
  {
    name: 'list_files',
    description: 'List all files in the project with basic stats.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Filter to a specific subdirectory (optional)',
        },
      },
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(
      () => handleListFiles(normalizePath(args.directory), ctx.graph),
    ),
  },
  {
    name: 'simulate_change',
    description: `Simulate an architectural change before touching any code. Returns health score delta, broken imports, and affected nodes. Zero file I/O — pure in-memory simulation. Cross-language edges included — deleting a Python route file will show TypeScript callers as affected.

Operations:
- delete: Simulate deleting a file. Shows every file that would break and the full blast radius.
- move: Simulate moving a file to a new path. Shows broken imports and edge changes.
- rename: Simulate renaming a file. Shows all affected imports and nodes.
- split: Simulate splitting a file by moving specified symbols to a new file.
- merge: Simulate merging two files into one. Fails fast on symbol name collision.

Always run this before any refactor that touches file structure.`,
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['move', 'delete', 'rename', 'split', 'merge'],
          description: 'Type of change to simulate',
        },
        target: {
          type: 'string',
          description: 'Relative file path of the primary target',
        },
        destination: {
          type: 'string',
          description: 'Required for move and rename — the new file path',
        },
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required for split — symbol names to move to new file',
        },
        mergeTarget: {
          type: 'string',
          description: 'Required for merge — the file to merge into target',
        },
      },
      required: ['operation', 'target'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(() => handleSimulateChange(args, ctx.graph)),
  },
  {
    name: 'affected_files',
    description: 'Find all files affected by a change to a specific file or symbol. Includes test files that cover the affected code. Use this before running tests to know which test files to execute.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: "Relative path of the changed file (e.g., 'src/auth/token.ts')",
        },
        max_depth: {
          type: 'number',
          description: 'Maximum traversal depth (default: 5)',
        },
        tests_only: {
          type: 'boolean',
          description: 'Return only test files (default: false)',
        },
      },
      required: ['file_path'],
    },
    requires: 'graph',
    handler: async (args, ctx) => runHandler(() => handleAffectedFiles(
      normalizePath(args.file_path)!, ctx.graph, args.max_depth, args.tests_only,
    )),
  },
];
