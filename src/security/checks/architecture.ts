import type { DirectedGraph } from 'graphology';
import { dirname } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding } from '../types.js';

const AUTH_KEYWORDS = /(?:auth|token|session|jwt|oauth|login|passport|credential)/i;
const DATA_KEYWORDS = /(?:query|insert|fetch|get|find|select|update|delete|save|create|put|remove)/i;
const DB_IMPORT_KEYWORDS = /(?:db|database|prisma|mongoose|d1|sql|knex|sequelize|typeorm|drizzle)/i;
const CRYPTO_KEYWORDS = /(?:auth|crypto|token|session|jwt|password|hash)/i;

function isSecurityFile(filePath: string): boolean {
  return CRYPTO_KEYWORDS.test(filePath.toLowerCase());
}

function isRouteFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return /(?:routes?\/|api\/|handler|controller|endpoint)/.test(lower);
}

export async function checkArchitecture(
  files: ParsedFile[],
  projectRoot: string,
  graph: DirectedGraph
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    // 1. God files handling auth + business logic + data access
    findings.push(...checkGodFilesWithAuthAndData(graph));

    // 2. Circular dependencies in auth/crypto modules
    findings.push(...checkCircularAuthDeps(graph));

    // 3. Direct DB access from route handlers
    findings.push(...checkDirectDbFromRoutes(graph));

    // 4. Dead code in auth/crypto files
    findings.push(...checkDeadAuthCode(graph));

    // 5. Unauthenticated routes with high fan-in
    findings.push(...checkUnauthHighFanIn(graph));
  } catch {
    // Don't crash the entire scan
  }

  return findings;
}

function checkGodFilesWithAuthAndData(graph: DirectedGraph): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const fileConnections = new Map<string, number>();
  const fileSymbolNames = new Map<string, string[]>();

  graph.forEachNode((_node, attrs) => {
    const fp = attrs.filePath;
    if (!fileSymbolNames.has(fp)) fileSymbolNames.set(fp, []);
    fileSymbolNames.get(fp)!.push(attrs.name);
  });

  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      fileConnections.set(sf, (fileConnections.get(sf) || 0) + 1);
      fileConnections.set(tf, (fileConnections.get(tf) || 0) + 1);
    }
  });

  const connections = Array.from(fileConnections.values());
  const avg = connections.length > 0 ? connections.reduce((a, b) => a + b, 0) / connections.length : 0;
  const godThreshold = avg * 3;

  for (const [filePath, count] of fileConnections.entries()) {
    if (count <= godThreshold) continue;

    const symbols = fileSymbolNames.get(filePath) || [];
    const hasAuth = symbols.some(s => AUTH_KEYWORDS.test(s));
    const hasData = symbols.some(s => DATA_KEYWORDS.test(s));

    if (hasAuth && hasData) {
      findings.push({
        id: '',
        severity: 'medium',
        vulnerabilityClass: 'architecture',
        file: filePath,
        title: 'God file mixes auth and data access logic',
        description: `${filePath} has ${count} connections and contains both auth-related and data-access symbols. This violates separation of concerns and makes security auditing difficult.`,
        attackScenario: 'A bug in data access logic could inadvertently bypass auth checks when auth and data are tightly coupled in a single file.',
        suggestedFix: 'Split auth logic and data access into separate modules with a clear service layer boundary.',
      });
    }
  }

  return findings;
}

function checkCircularAuthDeps(graph: DirectedGraph): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Build file-level graph
  const fileGraph = new Map<string, Set<string>>();
  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      if (!fileGraph.has(sf)) fileGraph.set(sf, new Set());
      fileGraph.get(sf)!.add(tf);
    }
  });

  // Find cycles using DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    if (recStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    recStack.add(node);
    path.push(node);
    const neighbors = fileGraph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path]);
      }
    }
    recStack.delete(node);
  }

  for (const node of fileGraph.keys()) {
    if (!visited.has(node)) dfs(node, []);
  }

  // Deduplicate and check for auth/crypto involvement
  const seen = new Set<string>();
  for (const cycle of cycles) {
    const key = [...cycle].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    const hasSecurityFile = cycle.some(f => isSecurityFile(f));
    if (hasSecurityFile) {
      findings.push({
        id: '',
        severity: 'high',
        vulnerabilityClass: 'architecture',
        file: cycle[0],
        title: 'Circular dependency in auth/crypto module',
        description: `Circular dependency detected involving security-critical files: ${cycle.join(' → ')}`,
        attackScenario: 'Circular dependencies in auth modules can lead to initialization order bugs where auth checks are bypassed during startup.',
        suggestedFix: 'Break the circular dependency by extracting shared types/interfaces into a separate module.',
      });
    }
  }

  return findings;
}

function checkDirectDbFromRoutes(graph: DirectedGraph): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const fileImports = new Map<string, Set<string>>();

  graph.forEachEdge((_edge, attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      if (!fileImports.has(sf)) fileImports.set(sf, new Set());
      fileImports.get(sf)!.add(tf);
    }
  });

  for (const [filePath, imports] of fileImports.entries()) {
    if (!isRouteFile(filePath)) continue;

    for (const importedFile of imports) {
      const importedName = importedFile.toLowerCase();
      if (DB_IMPORT_KEYWORDS.test(importedName)) {
        findings.push({
          id: '',
          severity: 'medium',
          vulnerabilityClass: 'architecture',
          file: filePath,
          title: 'Direct DB access from route handler',
          description: `Route file ${filePath} imports directly from ${importedFile} (database client) without a service layer.`,
          attackScenario: 'Direct DB access from routes makes it harder to enforce consistent authorization, validation, and audit logging.',
          suggestedFix: 'Introduce a service layer between routes and database access for consistent security checks.',
        });
      }
    }
  }

  return findings;
}

function checkDeadAuthCode(graph: DirectedGraph): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  graph.forEachNode((node, attrs) => {
    if (!attrs.exported) return;
    if (!isSecurityFile(attrs.filePath)) return;
    if (graph.inDegree(node) === 0) {
      findings.push({
        id: '',
        severity: 'info',
        vulnerabilityClass: 'architecture',
        file: attrs.filePath,
        line: attrs.startLine,
        symbol: attrs.name,
        title: `Dead exported function in security file: ${attrs.name}`,
        description: `${attrs.name} in ${attrs.filePath} is exported but has zero dependents — may indicate an orphaned auth path.`,
        attackScenario: 'Dead auth code may indicate incomplete security migration, leaving old vulnerable code paths accessible.',
        suggestedFix: 'Review and remove dead auth code, or verify it is intentionally unused (e.g., SDK export).',
      });
    }
  });

  return findings;
}

function checkUnauthHighFanIn(graph: DirectedGraph): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Get file-level incoming refs
  const fileIncoming = new Map<string, number>();
  const fileImportedModules = new Map<string, Set<string>>();

  graph.forEachEdge((_edge, _attrs, source, target) => {
    const sf = graph.getNodeAttributes(source).filePath;
    const tf = graph.getNodeAttributes(target).filePath;
    if (sf !== tf) {
      fileIncoming.set(tf, (fileIncoming.get(tf) || 0) + 1);

      // Track what each file imports
      if (!fileImportedModules.has(sf)) fileImportedModules.set(sf, new Set());
      fileImportedModules.get(sf)!.add(tf);
    }
  });

  for (const [filePath, count] of fileIncoming.entries()) {
    if (!isRouteFile(filePath)) continue;

    // Check if this route file imports any auth middleware
    const imports = fileImportedModules.get(filePath) || new Set();
    const hasAuthImport = Array.from(imports).some(imp => AUTH_KEYWORDS.test(imp.toLowerCase()));

    if (hasAuthImport) continue;

    let severity: 'high' | 'medium' | 'low' | 'info';
    if (count > 10) severity = 'high';
    else if (count > 5) severity = 'medium';
    else if (count > 0) severity = 'low';
    else continue;

    findings.push({
      id: '',
      severity,
      vulnerabilityClass: 'architecture',
      file: filePath,
      title: `Unauthenticated route with high fan-in (${count})`,
      description: `${filePath} appears to be a route file with ${count} incoming references but imports no auth middleware.`,
      attackScenario: 'A route without authentication that is widely depended upon could expose sensitive functionality to unauthorized users.',
      suggestedFix: 'Add authentication middleware to this route or verify it is intentionally public.',
    });
  }

  return findings;
}
