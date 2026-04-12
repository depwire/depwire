import type { DirectedGraph } from 'graphology';
import type { SecurityFinding, Severity } from './types.js';

const MCP_PATTERN = /(?:mcp\/|mcp-|\.mcp\.)/i;
const ROUTE_PATTERN = /(?:routes?\/|api\/|handler|controller|endpoint|server)/i;
const CLI_PATTERN = /(?:commands?\/|cli\/|bin\/)/i;
const AUTH_PATTERN = /(?:auth|session|token|jwt|oauth|login|passport|middleware)/i;

interface EntryPoint {
  filePath: string;
  type: 'mcp-tool' | 'http-route' | 'cli-command';
}

function classifyEntryPoint(filePath: string): EntryPoint['type'] | null {
  if (MCP_PATTERN.test(filePath)) return 'mcp-tool';
  if (ROUTE_PATTERN.test(filePath)) return 'http-route';
  if (CLI_PATTERN.test(filePath)) return 'cli-command';
  return null;
}

function isUnauthenticatedRoute(filePath: string, graph: DirectedGraph): boolean {
  if (!ROUTE_PATTERN.test(filePath)) return false;

  // Check if this route file imports any auth middleware
  const routeNodes: string[] = [];
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) routeNodes.push(nodeId);
  });

  for (const nodeId of routeNodes) {
    const outNeighbors = graph.outNeighbors(nodeId);
    for (const neighbor of outNeighbors) {
      const neighborAttrs = graph.getNodeAttributes(neighbor);
      if (AUTH_PATTERN.test(neighborAttrs.filePath) || AUTH_PATTERN.test(neighborAttrs.name)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Walk UP the graph from the vulnerable file using getDependents (inNeighbors)
 * to find all entry points that can reach this file.
 */
function findReachableEntryPoints(
  filePath: string,
  graph: DirectedGraph
): EntryPoint[] {
  const entryPoints: EntryPoint[] = [];
  const visited = new Set<string>();
  const queue: string[] = [];

  // Find all nodes in the vulnerable file
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.filePath === filePath) {
      queue.push(nodeId);
      visited.add(nodeId);
    }
  });

  // BFS upward through dependents (who imports this?)
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = graph.inNeighbors(current);

    for (const dep of dependents) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      queue.push(dep);

      const attrs = graph.getNodeAttributes(dep);
      const epType = classifyEntryPoint(attrs.filePath);
      if (epType && !entryPoints.some(ep => ep.filePath === attrs.filePath)) {
        entryPoints.push({ filePath: attrs.filePath, type: epType });
      }
    }
  }

  return entryPoints;
}

const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

function elevateSeverity(current: Severity, levels: number): Severity {
  const idx = SEVERITY_ORDER.indexOf(current);
  const newIdx = Math.min(idx + levels, SEVERITY_ORDER.length - 1);
  return SEVERITY_ORDER[newIdx];
}

export function elevateByReachability(
  finding: SecurityFinding,
  graph: DirectedGraph,
  _projectRoot: string
): SecurityFinding {
  try {
    const entryPoints = findReachableEntryPoints(finding.file, graph);

    if (entryPoints.length === 0) return finding;

    const mcpEntryPoints = entryPoints.filter(ep => ep.type === 'mcp-tool');
    const httpEntryPoints = entryPoints.filter(ep => ep.type === 'http-route');
    const cliEntryPoints = entryPoints.filter(ep => ep.type === 'cli-command');

    let newSeverity = finding.severity;
    let elevationReason = '';

    // high + reachable from unauthenticated HTTP route → critical
    if (finding.severity === 'high') {
      const unauthRoutes = httpEntryPoints.filter(ep => isUnauthenticatedRoute(ep.filePath, graph));
      if (unauthRoutes.length > 0) {
        newSeverity = 'critical';
        elevationReason = `reachable from unauthenticated HTTP route: ${unauthRoutes[0].filePath}`;
      }
    }

    // medium + reachable from HTTP route → high
    if (finding.severity === 'medium' && httpEntryPoints.length > 0) {
      newSeverity = 'high';
      elevationReason = `reachable from HTTP route: ${httpEntryPoints[0].filePath}`;
    }

    // medium + reachable from MCP tool → high
    if (finding.severity === 'medium' && mcpEntryPoints.length > 0) {
      if (newSeverity === 'medium') {
        newSeverity = 'high';
        elevationReason = `reachable from MCP tool: ${mcpEntryPoints[0].filePath}`;
      }
    }

    // low + reachable from any external entry point → medium
    if (finding.severity === 'low' && entryPoints.length > 0) {
      newSeverity = 'medium';
      elevationReason = `reachable from ${entryPoints.length} external entry point(s)`;
    }

    const allEntryPointPaths = entryPoints.map(ep => `${ep.type}: ${ep.filePath}`);

    return {
      ...finding,
      severity: newSeverity,
      graphReachability: {
        entryPoints: allEntryPointPaths,
        reachableFrom: entryPoints.length,
        elevatedBy: elevationReason,
      },
    };
  } catch {
    return finding;
  }
}
