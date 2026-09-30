import { analyzeCyclicGroups } from '../../graph/cyclic-groups.js';
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
  } catch (error) {
    throw new Error(`Architecture analysis unavailable: ${error}`);
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
  const result = analyzeCyclicGroups(graph, {witnessAnchor:isSecurityFile});
  if (result.status !== 'analyzed') throw new Error(`Cyclic groups unavailable: ${result.reason}`);
  return result.groups.filter(group => group.files.some(isSecurityFile)).map(group => ({
    id:'',severity:'high',vulnerabilityClass:'architecture',file:group.witness.files[0],
    cyclicGroup:group,cyclicEdgeView:result.edgeView,dimensions_v:result.dimensions_v,
    title:'Cyclic dependency group involving auth/crypto',
    description:`${group.size} mutually dependent files: ${group.files.join(', ')}. Witness: ${group.witness.files.join(' → ')}. Edge view: ${result.edgeView}.`,
    attackScenario:'Mutual dependencies involving authentication deserve review for initialization-order assumptions; this structural finding does not prove a bypass.',
    suggestedFix:'Separate mutually dependent responsibilities and inspect the witness dependencies.',
  }));
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

const SKIP_FILE_PATTERNS = ['test/', 'tests/', 'test/fixtures/', '__tests__/', 'fixtures/', 'spec/'];

function checkDeadAuthCode(graph: DirectedGraph): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  graph.forEachNode((node, attrs) => {
    if (!attrs.exported) return;
    if (!isSecurityFile(attrs.filePath)) return;

    // Skip test/fixture files
    const lowerPath = attrs.filePath.toLowerCase();
    if (SKIP_FILE_PATTERNS.some(p => lowerPath.includes(p))) return;

    // Skip single-letter variables and short names (loop vars, locals)
    if (!attrs.name || attrs.name.length < 4) return;

    // Skip common local variable names that get misidentified
    const SKIP_NAMES = new Set(['line', 'lines', 'content', 'findings', 'result', 'results', 'data', 'options', 'args', 'config', 'error', 'catchBlock', 'nearbyLines', 'isCryptoFile', 'isAuthFile', 'isAuthRelatedFile']);
    if (SKIP_NAMES.has(attrs.name)) return;

    if (graph.inDegree(node) === 0) {
      // Deduplicate by file + line + name
      const dedupKey = `${attrs.filePath}:${attrs.startLine}:${attrs.name}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

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
