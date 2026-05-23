/**
 * verify_change — Core logic for deterministic safety reports on proposed code changes.
 * Shared by both the MCP tool and the CLI command.
 */

import { DirectedGraph } from 'graphology';
import { SimulationEngine } from '../simulation/engine.js';
import { calculateHealthScore } from '../health/index.js';
import { scanSecurity } from '../security/scanner.js';
import { getImpact, findSymbols } from '../graph/queries.js';

export interface VerifyChangeInput {
  file_path?: string;
  new_content?: string;
  unified_diff?: string;
  depwire_action_token?: string;
}

export interface BrokenImportEntry {
  file: string;
  missing_symbol: string;
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
}

export interface VerifyChangeContext {
  graph: DirectedGraph;
  projectRoot: string;
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

export async function verifyChange(
  args: VerifyChangeInput,
  ctx: VerifyChangeContext
): Promise<VerifyChangeOutput> {
  const { graph, projectRoot } = ctx;
  const warnings: string[] = [];
  
  // Determine affected file(s)
  let affectedFilePaths: string[] = [];
  
  if (args.file_path && args.new_content !== undefined) {
    // Format A: file + content
    affectedFilePaths = [args.file_path];
  } else if (args.unified_diff) {
    // Format B: unified diff
    const parsed = parseUnifiedDiff(args.unified_diff);
    affectedFilePaths = [...new Set(parsed.map(p => p.filePath))];
  } else {
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
    };
  }

  // Get health score before
  const healthBefore = calculateHealthScore(graph, projectRoot);
  const healthScoreBefore = healthBefore.overall;

  // Use SimulationEngine to simulate deletion of affected files
  const engine = new SimulationEngine(graph);
  const brokenImports: BrokenImportEntry[] = [];
  const newCircularDeps: CircularDepEntry[] = [];
  let healthScoreAfter = healthScoreBefore;
  let blastRadius = 0;
  const allAffectedFiles = new Set<string>();

  for (const filePath of affectedFilePaths) {
    // Check if file exists in graph
    const nodesInFile = graph.filterNodes(
      (_node: string, attrs: any) => {
        const fp = attrs.filePath?.replace(/^\.\//, '');
        return fp === filePath || fp === filePath.replace(/^\.\//, '');
      }
    );

    if (nodesInFile.length > 0) {
      try {
        const simResult = engine.simulate({ type: 'delete', target: filePath });
        
        for (const bi of simResult.diff.brokenImports) {
          brokenImports.push({
            file: bi.file,
            missing_symbol: bi.importedSymbol,
          });
        }

        for (const cycle of simResult.diff.circularDepsIntroduced) {
          newCircularDeps.push({ cycle });
        }

        healthScoreAfter = simResult.healthDelta.after;
        
        for (const node of simResult.diff.affectedNodes) {
          const attrs = graph.hasNode(node) ? graph.getNodeAttributes(node) : null;
          if (attrs?.filePath) {
            allAffectedFiles.add(attrs.filePath);
          }
        }
      } catch {
        warnings.push(`Could not simulate changes to ${filePath}`);
      }
    } else {
      warnings.push(`File ${filePath} is new (not in current graph)`);
    }
  }

  // For modifications with no breaks, health stays the same
  if (brokenImports.length === 0 && newCircularDeps.length === 0) {
    healthScoreAfter = healthScoreBefore;
  }

  // Compute blast radius from affected files
  for (const filePath of affectedFilePaths) {
    allAffectedFiles.add(filePath);
    const nodesInFile = graph.filterNodes(
      (_node: string, attrs: any) => {
        const fp = attrs.filePath?.replace(/^\.\//, '');
        return fp === filePath || fp === filePath.replace(/^\.\//, '');
      }
    );
    
    for (const nodeId of nodesInFile) {
      const impact = getImpact(graph, nodeId);
      for (const file of impact.affectedFiles) {
        allAffectedFiles.add(file);
      }
    }
  }

  blastRadius = allAffectedFiles.size;
  const affectedFiles = Array.from(allAffectedFiles);

  // Run security scan on affected files
  const securityFindings: SecurityFinding[] = [];
  for (const filePath of affectedFilePaths) {
    try {
      const scanResult = await scanSecurity(projectRoot, graph, {
        target: filePath,
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
      // Security scan may fail on files not on disk
    }
  }

  // Calculate risk level
  const hasHighSecurity = securityFindings.some(f => 
    f.severity.toLowerCase() === 'critical' || f.severity.toLowerCase() === 'high'
  );
  const hasMediumSecurity = securityFindings.some(f => 
    f.severity.toLowerCase() === 'medium'
  );
  const healthDelta = healthScoreAfter - healthScoreBefore;

  let riskLevel: 'low' | 'medium' | 'high';
  if (brokenImports.length > 0 || newCircularDeps.length > 0 || hasHighSecurity || healthDelta < -10) {
    riskLevel = 'high';
  } else if (hasMediumSecurity || (healthDelta < -3 && healthDelta >= -10)) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  const safe = riskLevel === 'low';

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
  };
}
