import type { DirectedGraph } from 'graphology';
import { existsSync } from 'fs';
import { join } from 'path';
import { parseProject } from '../parser/index.js';
import type { SecurityScanResult, SecurityScanOptions, Severity, VulnerabilityClass } from './types.js';
import { checkDependencies } from './checks/dependencies.js';
import { checkInjection } from './checks/injection.js';
import { checkSecrets } from './checks/secrets.js';
import { checkPathTraversal } from './checks/path-traversal.js';
import { checkAuth } from './checks/auth.js';
import { checkInputValidation } from './checks/input-validation.js';
import { checkInformationDisclosure } from './checks/information-disclosure.js';
import { checkCryptography } from './checks/cryptography.js';
import { checkFrontend } from './checks/frontend.js';
import { checkArchitecture } from './checks/architecture.js';
import { elevateByReachability } from './graph-aware.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export async function scanSecurity(
  projectRoot: string,
  graph: DirectedGraph,
  options: SecurityScanOptions = {}
): Promise<SecurityScanResult> {
  const startTime = Date.now();

  // Parse project to get files with content access
  const parsedFiles = await parseProject(projectRoot);

  // Filter to target if specified
  const filteredFiles = options.target
    ? parsedFiles.filter(f => f.filePath === options.target || f.filePath.endsWith(options.target!))
    : parsedFiles;

  // Check if frontend files exist
  const hasFrontendFiles = filteredFiles.some(f => /\.(?:tsx|jsx|html)$/.test(f.filePath));

  // Run all checks in parallel
  const checkResults = await Promise.all([
    // Skip dependency checks for single-file scans — they are repo-wide by nature
    options.target ? Promise.resolve([]) : checkDependencies(filteredFiles, projectRoot),
    checkInjection(filteredFiles, projectRoot),
    checkSecrets(filteredFiles, projectRoot),
    checkPathTraversal(filteredFiles, projectRoot),
    checkAuth(filteredFiles, projectRoot),
    checkInputValidation(filteredFiles, projectRoot),
    checkInformationDisclosure(filteredFiles, projectRoot),
    checkCryptography(filteredFiles, projectRoot),
    hasFrontendFiles ? checkFrontend(filteredFiles, projectRoot) : Promise.resolve([]),
    checkArchitecture(filteredFiles, projectRoot, graph),
  ]);

  let findings = checkResults.flat();

  // Filter by vulnerability classes if specified
  if (options.classes && options.classes.length > 0) {
    const allowedClasses = new Set<VulnerabilityClass>(options.classes);
    findings = findings.filter(f => allowedClasses.has(f.vulnerabilityClass));
  }

  // Apply graph-aware severity elevation
  if (options.graphAware !== false) {
    findings = findings.map(f => elevateByReachability(f, graph, projectRoot));
  }

  // Sort by severity (critical first)
  findings.sort((a, b) => {
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });

  // Assign sequential IDs
  findings.forEach((f, i) => {
    f.id = `SEC-${String(i + 1).padStart(3, '0')}`;
  });

  // Build summary
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
    total: findings.length,
  };

  // Dependency audit info
  const depFindings = checkResults[0];
  const hasDeps = depFindings.length > 0;

  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    filesScanned: filteredFiles.length,
    findings,
    summary,
    dependencyAudit: {
      ran: hasDeps,
      packageManager: hasDeps ? detectPackageManager(projectRoot) : null,
      rawOutput: '',
    },
  };
}

function detectPackageManager(projectRoot: string): string {
  if (existsSync(join(projectRoot, 'package.json'))) return 'npm';
  if (existsSync(join(projectRoot, 'requirements.txt'))) return 'pip';
  if (existsSync(join(projectRoot, 'pyproject.toml'))) return 'pip';
  if (existsSync(join(projectRoot, 'Cargo.toml'))) return 'cargo';
  if (existsSync(join(projectRoot, 'go.mod'))) return 'go';
  return 'unknown';
}
