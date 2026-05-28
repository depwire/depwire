/**
 * diff — Core logic for structural comparison between two git commits.
 * Deterministic graph diff. No LLM.
 * Shared by CLI command (and potentially MCP tool in future).
 */

import { execSync } from 'child_process';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { calculateHealthScore } from '../health/index.js';
import { scoreToGrade } from '../health/metrics.js';
import { scanSecurity } from '../security/scanner.js';
import { getArchitectureSummary } from '../graph/queries.js';
import type { SymbolNode, SymbolEdge } from '../parser/types.js';

export interface DiffOptions {
  path?: string;
  noSecurity?: boolean;
  noHealth?: boolean;
}

export interface DiffSymbol {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface DiffEdge {
  source: string;
  target: string;
  kind: string;
  filePath: string;
  line: number;
}

export interface SecurityFindingDiff {
  severity: string;
  title: string;
  file: string;
  line: number;
  vulnerabilityClass: string;
}

export interface DiffResult {
  commit_a: string;
  commit_b: string;
  commit_a_resolved: string;
  commit_b_resolved: string;
  symbols: {
    added: DiffSymbol[];
    removed: DiffSymbol[];
    modified: DiffSymbol[];
  };
  edges: {
    added: DiffEdge[];
    removed: DiffEdge[];
  };
  files: {
    added: string[];
    removed: string[];
    count_a: number;
    count_b: number;
  };
  blast_radius: {
    files: string[];
    count: number;
  };
  health: {
    before: number;
    after: number;
    delta: number;
    grade_before: string;
    grade_after: string;
  } | null;
  security: {
    new_findings: SecurityFindingDiff[];
    fixed_findings: SecurityFindingDiff[];
  } | null;
}

function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function isGitRepo(cwd: string): boolean {
  try {
    git('rev-parse --git-dir', cwd);
    return true;
  } catch {
    return false;
  }
}

function resolveRef(ref: string, cwd: string): string {
  try {
    return git(`rev-parse ${ref}`, cwd);
  } catch {
    throw new DiffError(`Invalid git ref: "${ref}"`, 2);
  }
}

export class DiffError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'DiffError';
    this.exitCode = exitCode;
  }
}

export async function computeDiff(
  commitA: string,
  commitB: string,
  projectRoot: string,
  options: DiffOptions = {}
): Promise<DiffResult> {
  // Step 1: Validate git state
  if (!isGitRepo(projectRoot)) {
    throw new DiffError('Not a git repository. Run this command inside a git project.', 2);
  }

  const resolvedA = resolveRef(commitA, projectRoot);
  const resolvedB = resolveRef(commitB, projectRoot);

  // Step 2: Save current state
  let originalRef: string;
  try {
    originalRef = git('rev-parse --abbrev-ref HEAD', projectRoot);
    if (originalRef === 'HEAD') {
      // Detached HEAD — save commit hash
      originalRef = git('rev-parse HEAD', projectRoot);
    }
  } catch {
    throw new DiffError('Failed to determine current HEAD.', 2);
  }

  let stashed = false;
  try {
    const status = git('status --porcelain', projectRoot);
    if (status.length > 0) {
      git('stash push -m "depwire-diff-temp-stash"', projectRoot);
      stashed = true;
    }
  } catch {
    throw new DiffError('Failed to stash uncommitted changes.', 2);
  }

  let graphA: any;
  let graphB: any;
  let healthA: { overall: number; grade: string } | null = null;
  let healthB: { overall: number; grade: string } | null = null;
  let securityA: SecurityFindingDiff[] = [];
  let securityB: SecurityFindingDiff[] = [];
  let filesA: string[] = [];
  let filesB: string[] = [];
  let symbolsA: Map<string, DiffSymbol> = new Map();
  let symbolsB: Map<string, DiffSymbol> = new Map();
  let edgesA: Map<string, DiffEdge> = new Map();
  let edgesB: Map<string, DiffEdge> = new Map();

  try {
    // Step 3: Build graph for commit-a
    console.error(`Checking out ${commitA} (${resolvedA.slice(0, 8)})...`);
    git(`checkout ${resolvedA} --quiet`, projectRoot);

    const parsedA = await parseProject(projectRoot);
    const gA = buildGraph(parsedA, projectRoot);
    graphA = gA;

    const summaryA = getArchitectureSummary(gA);
    filesA = Array.from(new Set<string>());
    gA.forEachNode((_n: string, attrs: any) => {
      filesA.push(attrs.filePath);
    });
    filesA = [...new Set(filesA)];

    gA.forEachNode((nodeId: string, attrs: any) => {
      symbolsA.set(nodeId, {
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
      });
    });

    gA.forEachEdge((_edge: string, attrs: any, source: string, target: string) => {
      const key = `${source}->${target}::${attrs.kind}`;
      edgesA.set(key, {
        source,
        target,
        kind: attrs.kind,
        filePath: attrs.filePath || '',
        line: attrs.line || 0,
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
          securityA = scanResult.findings.map((f: any) => ({
            severity: f.severity || 'low',
            title: f.title || f.description || '',
            file: f.file || '',
            line: f.line || 0,
            vulnerabilityClass: f.vulnerabilityClass || '',
          }));
        }
      } catch { /* security scan may fail */ }
    }

    // Step 4: Build graph for commit-b
    console.error(`Checking out ${commitB} (${resolvedB.slice(0, 8)})...`);
    git(`checkout ${resolvedB} --quiet`, projectRoot);

    const parsedB = await parseProject(projectRoot);
    const gB = buildGraph(parsedB, projectRoot);
    graphB = gB;

    gB.forEachNode((_n: string, attrs: any) => {
      filesB.push(attrs.filePath);
    });
    filesB = [...new Set(filesB)];

    gB.forEachNode((nodeId: string, attrs: any) => {
      symbolsB.set(nodeId, {
        id: nodeId,
        name: attrs.name,
        kind: attrs.kind,
        filePath: attrs.filePath,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
      });
    });

    gB.forEachEdge((_edge: string, attrs: any, source: string, target: string) => {
      const key = `${source}->${target}::${attrs.kind}`;
      edgesB.set(key, {
        source,
        target,
        kind: attrs.kind,
        filePath: attrs.filePath || '',
        line: attrs.line || 0,
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
          securityB = scanResult.findings.map((f: any) => ({
            severity: f.severity || 'low',
            title: f.title || f.description || '',
            file: f.file || '',
            line: f.line || 0,
            vulnerabilityClass: f.vulnerabilityClass || '',
          }));
        }
      } catch { /* security scan may fail */ }
    }

  } finally {
    // Step 5: Restore original state (CRITICAL — always runs)
    try {
      console.error(`Restoring original state...`);
      git(`checkout ${originalRef} --quiet`, projectRoot);
    } catch {
      // If checkout fails, try harder
      try {
        git(`checkout -f ${originalRef} --quiet`, projectRoot);
      } catch {
        console.error(`WARNING: Failed to restore original ref "${originalRef}". Manual cleanup needed.`);
      }
    }

    if (stashed) {
      try {
        git('stash pop', projectRoot);
      } catch {
        console.error('WARNING: Failed to restore stashed changes. Run "git stash pop" manually.');
      }
    }
  }

  // Step 6: Compute the diff
  const addedSymbols: DiffSymbol[] = [];
  const removedSymbols: DiffSymbol[] = [];
  const modifiedSymbols: DiffSymbol[] = [];

  for (const [id, sym] of symbolsB) {
    if (!symbolsA.has(id)) {
      addedSymbols.push(sym);
    } else {
      const oldSym = symbolsA.get(id)!;
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

  const addedEdges: DiffEdge[] = [];
  const removedEdges: DiffEdge[] = [];

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

  // Files diff
  const fileSetA = new Set(filesA);
  const fileSetB = new Set(filesB);
  const addedFiles = filesB.filter(f => !fileSetA.has(f));
  const removedFiles = filesA.filter(f => !fileSetB.has(f));

  // Blast radius: all files containing changed symbols
  const blastFiles = new Set<string>();
  for (const sym of addedSymbols) blastFiles.add(sym.filePath);
  for (const sym of removedSymbols) blastFiles.add(sym.filePath);
  for (const sym of modifiedSymbols) blastFiles.add(sym.filePath);
  for (const edge of addedEdges) { if (edge.filePath) blastFiles.add(edge.filePath); }
  for (const edge of removedEdges) { if (edge.filePath) blastFiles.add(edge.filePath); }

  // Health diff
  let health: DiffResult['health'] = null;
  if (healthA && healthB) {
    health = {
      before: healthA.overall,
      after: healthB.overall,
      delta: healthB.overall - healthA.overall,
      grade_before: healthA.grade,
      grade_after: healthB.grade,
    };
  }

  // Security diff
  let security: DiffResult['security'] = null;
  if (!options.noSecurity) {
    const secAKeys = new Set(securityA.map(f => `${f.file}:${f.line}:${f.vulnerabilityClass}`));
    const secBKeys = new Set(securityB.map(f => `${f.file}:${f.line}:${f.vulnerabilityClass}`));

    const newFindings = securityB.filter(f => !secAKeys.has(`${f.file}:${f.line}:${f.vulnerabilityClass}`));
    const fixedFindings = securityA.filter(f => !secBKeys.has(`${f.file}:${f.line}:${f.vulnerabilityClass}`));

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
    security,
  };
}
