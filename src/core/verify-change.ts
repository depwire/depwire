/**
 * verify_change — Core logic for deterministic safety reports on proposed code changes.
 * Shared by both the MCP tool and the CLI command.
 *
 * Broken-import detection is DIFF-BASED: we parse the proposed new_content,
 * compare its exported symbols against the symbols that currently exist in the
 * graph for that file, and only flag a broken import when an export is actually
 * *removed* (or renamed / made private) AND it still has external dependents.
 * Internal-only edits that keep every export intact never produce a false
 * "broken import" — which was the previous behaviour when every edit was
 * modelled as a full file deletion.
 */

import { DirectedGraph } from 'graphology';
import { SimulationEngine } from '../simulation/engine.js';
import { calculateHealthScore } from '../health/index.js';
import { scanSecurity } from '../security/scanner.js';
import { getImpact, getDependents } from '../graph/queries.js';
import { getParserForFile } from '../parser/detect.js';
import { initParser } from '../parser/wasm-init.js';

export interface VerifyChangeInput {
  file_path?: string;
  new_content?: string;
  unified_diff?: string;
  depwire_action_token?: string;
}

export interface BrokenImportEntry {
  file: string;
  missing_symbol: string;
  reason?: string;
}

export interface CircularDepEntry {
  cycle: string[];
}

export interface SecurityFinding {
  severity: string;
  description: string;
  file: string;
  line: number;
}

/**
 * Context that is NOT part of the safety verdict — health score and security
 * findings are surfaced for information only and never flip `safe`.
 */
export interface UnrelatedContext {
  note: string;
  health_score_before: number;
  health_score_after: number;
  health_score_delta: number;
  security_findings: SecurityFinding[];
}

export interface VerifyChangeOutput {
  safe: boolean;
  risk_level: 'low' | 'medium' | 'high';
  broken_imports: BrokenImportEntry[];
  new_circular_dependencies: CircularDepEntry[];
  health_score_delta: number;
  health_score_before: number;
  health_score_after: number;
  security_findings: SecurityFinding[];
  affected_files: string[];
  blast_radius: number;
  warnings: string[];
  /** Warnings that pertain specifically to THIS file/change. */
  relevant_warnings: string[];
  /** Health/security context that is explicitly NOT part of the verdict. */
  unrelated_context: UnrelatedContext;
}

export interface VerifyChangeContext {
  graph: DirectedGraph;
  projectRoot: string;
}

/** Normalize a path for comparison against POSIX-style graph keys. */
function normalizeFp(p: string | undefined): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Parse a unified diff to extract affected file paths
 */
function parseUnifiedDiff(diff: string): { filePath: string; isDelete: boolean }[] {
  const files: { filePath: string; isDelete: boolean }[] = [];
  const lines = diff.split('\n');

  for (const line of lines) {
    // Match --- a/path or +++ b/path
    const minusMatch = line.match(/^---\s+a\/(.+)/);
    const plusMatch = line.match(/^\+\+\+\s+b\/(.+)/);

    if (plusMatch && plusMatch[1] !== '/dev/null') {
      files.push({ filePath: plusMatch[1], isDelete: false });
    } else if (minusMatch && minusMatch[1] !== '/dev/null') {
      files.push({ filePath: minusMatch[1], isDelete: false });
    }
  }

  return files;
}

/** All graph node ids whose filePath matches `normFp`. */
function nodesInFile(graph: DirectedGraph, normFp: string): string[] {
  return graph.filterNodes((_node, attrs: any) => normalizeFp(attrs.filePath) === normFp);
}

/** Exported graph node ids for a file. */
function currentExportedNodes(graph: DirectedGraph, normFp: string): string[] {
  return graph.filterNodes(
    (_node, attrs: any) => normalizeFp(attrs.filePath) === normFp && attrs.exported === true
  );
}

/**
 * Run the conservative delete-simulation for a file (used for genuine deletions
 * and as a fallback when new_content cannot be parsed).
 */
function simulateFullDelete(
  engine: SimulationEngine,
  graph: DirectedGraph,
  filePath: string,
  brokenImports: BrokenImportEntry[],
  newCircularDeps: CircularDepEntry[],
  allAffectedFiles: Set<string>
): number | null {
  try {
    const simResult = engine.simulate({ type: 'delete', target: filePath });

    for (const bi of simResult.diff.brokenImports) {
      brokenImports.push({
        file: bi.file,
        missing_symbol: bi.importedSymbol,
        reason: bi.reason,
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

/**
 * Diff-based broken-import detection: only exports that disappear from the new
 * content AND still have external dependents are flagged.
 */
function detectRemovedExportBreaks(
  graph: DirectedGraph,
  normFp: string,
  displayPath: string,
  newExportedNames: Set<string>,
  brokenImports: BrokenImportEntry[]
): void {
  for (const nodeId of currentExportedNodes(graph, normFp)) {
    const attrs = graph.getNodeAttributes(nodeId);
    if (newExportedNames.has(attrs.name)) continue; // still exported — safe

    // This export was removed / renamed / made private.
    const externalDependents = getDependents(graph, nodeId).filter(
      (d) => normalizeFp(d.filePath) !== normFp
    );

    for (const dep of externalDependents) {
      brokenImports.push({
        file: dep.filePath,
        missing_symbol: attrs.name,
        reason: `${attrs.name} was removed from ${displayPath} but is still imported here`,
      });
    }
  }
}

export async function verifyChange(
  args: VerifyChangeInput,
  ctx: VerifyChangeContext
): Promise<VerifyChangeOutput> {
  const { graph, projectRoot } = ctx;
  const warnings: string[] = [];

  // Determine affected file(s) and whether we have full new_content to diff.
  let affectedFilePaths: string[] = [];
  const haveNewContent = !!args.file_path && args.new_content !== undefined;

  if (haveNewContent) {
    // Format A: file + content
    affectedFilePaths = [args.file_path!];
  } else if (args.unified_diff) {
    // Format B: unified diff
    const parsed = parseUnifiedDiff(args.unified_diff);
    affectedFilePaths = [...new Set(parsed.map((p) => p.filePath))];
  } else {
    const emptyContext: UnrelatedContext = {
      note: 'Health and security findings are informational and do not affect the safety verdict.',
      health_score_before: 0,
      health_score_after: 0,
      health_score_delta: 0,
      security_findings: [],
    };
    return {
      safe: false,
      risk_level: 'high',
      broken_imports: [],
      new_circular_dependencies: [],
      health_score_delta: 0,
      health_score_before: 0,
      health_score_after: 0,
      security_findings: [],
      affected_files: [],
      blast_radius: 0,
      warnings: ['Invalid input: provide either file_path + new_content, or unified_diff'],
      relevant_warnings: ['Invalid input: provide either file_path + new_content, or unified_diff'],
      unrelated_context: emptyContext,
    };
  }

  // Health score before (used for context + delete-sim deltas)
  const healthBefore = calculateHealthScore(graph, projectRoot);
  const healthScoreBefore = healthBefore.overall;

  const engine = new SimulationEngine(graph);
  const brokenImports: BrokenImportEntry[] = [];
  const newCircularDeps: CircularDepEntry[] = [];
  let healthScoreAfter = healthScoreBefore;
  const allAffectedFiles = new Set<string>();

  // Ensure language grammars are loaded before parsing new_content.
  await initParser();

  for (const filePath of affectedFilePaths) {
    const normFp = normalizeFp(filePath);
    const fileNodes = nodesInFile(graph, normFp);

    if (fileNodes.length === 0) {
      // New file — nothing it currently exports, so no import can break.
      warnings.push(`File ${filePath} is new (not in current graph)`);
      continue;
    }

    if (haveNewContent) {
      const newContent = args.new_content!;
      const isDeletion = newContent.trim().length === 0;

      if (isDeletion) {
        // Genuine deletion — the conservative full-delete analysis is correct.
        const after = simulateFullDelete(
          engine, graph, filePath, brokenImports, newCircularDeps, allAffectedFiles
        );
        if (after !== null) healthScoreAfter = after;
        else warnings.push(`Could not simulate deletion of ${filePath}`);
        continue;
      }

      // Modification: diff exported symbols instead of deleting the file.
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
        // Fallback: conservative full-file analysis with a clear warning.
        warnings.push(
          `Could not parse new content for ${filePath} — using conservative full-file analysis.`
        );
        const after = simulateFullDelete(
          engine, graph, filePath, brokenImports, newCircularDeps, allAffectedFiles
        );
        if (after !== null) healthScoreAfter = after;
      }
    } else {
      // Unified diff: no full new_content available — fall back to the
      // conservative full-file analysis and say so.
      warnings.push(
        `Conservative full-file analysis for ${filePath} (no new_content available for unified_diff).`
      );
      const after = simulateFullDelete(
        engine, graph, filePath, brokenImports, newCircularDeps, allAffectedFiles
      );
      if (after !== null) healthScoreAfter = after;
    }
  }

  // Modifications that remove nothing leave the dependency topology intact.
  if (brokenImports.length === 0 && newCircularDeps.length === 0) {
    healthScoreAfter = healthScoreBefore;
  }

  // De-duplicate broken imports by (file, missing_symbol) — a single importer
  // may reference a removed symbol through more than one edge.
  const dedupedBrokenImports: BrokenImportEntry[] = [];
  const seenBroken = new Set<string>();
  for (const bi of brokenImports) {
    const key = `${normalizeFp(bi.file)}::${bi.missing_symbol}`;
    if (seenBroken.has(key)) continue;
    seenBroken.add(key);
    dedupedBrokenImports.push(bi);
  }
  brokenImports.length = 0;
  brokenImports.push(...dedupedBrokenImports);

  // Compute blast radius from affected files (informational).
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

  // Run a security scan on the changed file(s) — informational context only.
  const securityFindings: SecurityFinding[] = [];
  for (const filePath of affectedFilePaths) {
    try {
      const scanResult = await scanSecurity(projectRoot, graph, {
        target: normalizeFp(filePath),
        graphAware: true,
      });
      if (scanResult && scanResult.findings) {
        for (const finding of scanResult.findings) {
          securityFindings.push({
            severity: finding.severity || 'low',
            description: finding.description || finding.title || '',
            file: finding.file || filePath,
            line: finding.line || 0,
          });
        }
      }
    } catch {
      // Security scan may fail on files not on disk — non-fatal.
    }
  }

  const healthDelta = healthScoreAfter - healthScoreBefore;

  // Safety verdict is driven ONLY by change-specific structural breakage:
  // removed exports with external dependents, and newly introduced cycles.
  // Security findings and health movement are informational (unrelated_context).
  let riskLevel: 'low' | 'medium' | 'high';
  if (brokenImports.length > 0 || newCircularDeps.length > 0) {
    riskLevel = 'high';
  } else if (healthDelta < -3) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  const safe = riskLevel === 'low';

  const unrelatedContext: UnrelatedContext = {
    note: 'Health score and security findings are informational and do NOT affect the safety verdict.',
    health_score_before: healthScoreBefore,
    health_score_after: healthScoreAfter,
    health_score_delta: healthDelta,
    security_findings: securityFindings,
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
    unrelated_context: unrelatedContext,
  };
}
