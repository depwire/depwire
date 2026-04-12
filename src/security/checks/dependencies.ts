import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { SecurityFinding, Severity } from '../types.js';

function cvssToSeverity(score: number): Severity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

export async function checkDependencies(
  _files: ParsedFile[],
  projectRoot: string
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  try {
    // Detect package manager and run audit
    if (existsSync(join(projectRoot, 'package.json'))) {
      findings.push(...checkNpmAudit(projectRoot));
      findings.push(...checkPackageJsonPatterns(projectRoot));
      findings.push(...checkPostinstallScripts(projectRoot));
    }

    if (existsSync(join(projectRoot, 'requirements.txt')) || existsSync(join(projectRoot, 'pyproject.toml'))) {
      findings.push(...checkPipAudit(projectRoot));
    }

    if (existsSync(join(projectRoot, 'Cargo.toml'))) {
      findings.push(...checkCargoAudit(projectRoot));
    }

    if (existsSync(join(projectRoot, 'go.mod'))) {
      findings.push(...checkGoVerify(projectRoot));
    }
  } catch (err) {
    findings.push({
      id: '',
      severity: 'info',
      vulnerabilityClass: 'dependency-cve',
      file: 'package.json',
      title: 'Dependency audit error',
      description: `Dependency audit encountered an error: ${String(err)}`,
      attackScenario: 'N/A',
      suggestedFix: 'Ensure audit tools are installed and try again.',
    });
  }

  return findings;
}

function checkNpmAudit(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  try {
    const output = execSync('npm audit --json', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const audit = JSON.parse(output);
    const vulnerabilities = audit.vulnerabilities || {};

    for (const [name, vuln] of Object.entries<any>(vulnerabilities)) {
      const severity = vuln.severity === 'critical' ? 'critical'
        : vuln.severity === 'high' ? 'high'
        : vuln.severity === 'moderate' ? 'medium'
        : 'low';

      findings.push({
        id: '',
        severity: severity as Severity,
        vulnerabilityClass: 'dependency-cve',
        file: 'package.json',
        title: `Vulnerable dependency: ${name}`,
        description: `${name}@${vuln.range || 'unknown'} has a known ${vuln.severity} vulnerability. ${vuln.title || ''}`.trim(),
        attackScenario: `An attacker could exploit the known vulnerability in ${name} to compromise the application.`,
        suggestedFix: vuln.fixAvailable ? `Update ${name} to a patched version.` : `No fix currently available. Consider replacing ${name}.`,
      });
    }
  } catch (err: any) {
    // npm audit exits non-zero when vulns found — try to parse stderr/stdout
    if (err.stdout) {
      try {
        const audit = JSON.parse(err.stdout);
        const vulnerabilities = audit.vulnerabilities || {};
        for (const [name, vuln] of Object.entries<any>(vulnerabilities)) {
          const severity = vuln.severity === 'critical' ? 'critical'
            : vuln.severity === 'high' ? 'high'
            : vuln.severity === 'moderate' ? 'medium'
            : 'low';

          findings.push({
            id: '',
            severity: severity as Severity,
            vulnerabilityClass: 'dependency-cve',
            file: 'package.json',
            title: `Vulnerable dependency: ${name}`,
            description: `${name}@${vuln.range || 'unknown'} has a known ${vuln.severity} vulnerability.`,
            attackScenario: `An attacker could exploit the known vulnerability in ${name}.`,
            suggestedFix: vuln.fixAvailable ? `Update ${name} to a patched version.` : `No fix currently available.`,
          });
        }
      } catch {
        findings.push({
          id: '',
          severity: 'info',
          vulnerabilityClass: 'dependency-cve',
          file: 'package.json',
          title: 'npm audit unavailable',
          description: 'Could not parse npm audit output.',
          attackScenario: 'N/A',
          suggestedFix: 'Run npm audit manually to check for vulnerabilities.',
        });
      }
    } else {
      findings.push({
        id: '',
        severity: 'info',
        vulnerabilityClass: 'dependency-cve',
        file: 'package.json',
        title: 'npm audit unavailable',
        description: 'npm audit command failed or is not available.',
        attackScenario: 'N/A',
        suggestedFix: 'Ensure npm is installed and run npm audit manually.',
      });
    }
  }

  return findings;
}

function checkPackageJsonPatterns(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  try {
    const pkgPath = join(projectRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [name, version] of Object.entries<string>(allDeps)) {
      if (version.startsWith('^') || version.startsWith('~')) {
        findings.push({
          id: '',
          severity: 'info',
          vulnerabilityClass: 'supply-chain',
          file: 'package.json',
          title: `Flexible version range: ${name}@${version}`,
          description: `${name} uses a ${version.startsWith('^') ? 'caret' : 'tilde'} version range which allows automatic minor/patch updates.`,
          attackScenario: 'A compromised patch release could be automatically installed.',
          suggestedFix: `Pin to an exact version or use a lockfile to ensure reproducible builds.`,
        });
      }
    }
  } catch {
    // Ignore parse errors
  }

  return findings;
}

function checkPostinstallScripts(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const nodeModules = join(projectRoot, 'node_modules');

  if (!existsSync(nodeModules)) return findings;

  try {
    const topLevelDeps = readdirSync(nodeModules).filter(d => !d.startsWith('.'));

    for (const dep of topLevelDeps) {
      const depPkgPath = join(nodeModules, dep, 'package.json');
      if (!existsSync(depPkgPath)) continue;

      try {
        const depPkg = JSON.parse(readFileSync(depPkgPath, 'utf-8'));
        const scripts = depPkg.scripts || {};

        if (scripts.postinstall || scripts.preinstall || scripts.install) {
          const scriptName = scripts.postinstall ? 'postinstall' : scripts.preinstall ? 'preinstall' : 'install';
          const scriptContent = scripts[scriptName];

          findings.push({
            id: '',
            severity: 'high',
            vulnerabilityClass: 'supply-chain',
            file: `node_modules/${dep}/package.json`,
            title: `Supply chain risk: ${dep} has ${scriptName} script`,
            description: `The dependency ${dep} runs a ${scriptName} script on install: "${scriptContent}".`,
            attackScenario: `A compromised version of ${dep} could execute arbitrary code during npm install via its ${scriptName} script.`,
            suggestedFix: `Review the ${scriptName} script. Consider using --ignore-scripts or switching to a dependency without lifecycle scripts.`,
          });
        }
      } catch {
        // Ignore individual dep parse errors
      }
    }
  } catch {
    // Ignore readdir errors
  }

  return findings;
}

function checkPipAudit(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  try {
    const output = execSync('pip audit --format json', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const audit = JSON.parse(output);
    for (const vuln of audit.vulnerabilities || []) {
      findings.push({
        id: '',
        severity: cvssToSeverity(vuln.cvss?.score || 5.0),
        vulnerabilityClass: 'dependency-cve',
        file: existsSync(join(projectRoot, 'requirements.txt')) ? 'requirements.txt' : 'pyproject.toml',
        title: `Vulnerable Python dependency: ${vuln.name}`,
        description: `${vuln.name}@${vuln.version} — ${vuln.id}: ${vuln.description || 'Known vulnerability'}`,
        attackScenario: `An attacker could exploit the vulnerability in ${vuln.name}.`,
        suggestedFix: vuln.fix_versions?.length ? `Update to version ${vuln.fix_versions.join(' or ')}.` : 'No fix available.',
      });
    }
  } catch {
    findings.push({
      id: '',
      severity: 'info',
      vulnerabilityClass: 'dependency-cve',
      file: 'requirements.txt',
      title: 'pip audit unavailable',
      description: 'pip audit command failed or is not installed.',
      attackScenario: 'N/A',
      suggestedFix: 'Install pip-audit: pip install pip-audit',
    });
  }

  return findings;
}

function checkCargoAudit(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  try {
    const output = execSync('cargo audit --json', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const audit = JSON.parse(output);
    for (const advisory of audit.vulnerabilities?.list || []) {
      const a = advisory.advisory || {};
      findings.push({
        id: '',
        severity: cvssToSeverity(a.cvss?.score || 5.0),
        vulnerabilityClass: 'dependency-cve',
        file: 'Cargo.toml',
        title: `Vulnerable Rust crate: ${a.package || 'unknown'}`,
        description: `${a.id || 'RUSTSEC'}: ${a.title || 'Known vulnerability'}`,
        attackScenario: `An attacker could exploit the vulnerability in the crate.`,
        suggestedFix: a.patched_versions?.length ? `Update to a patched version.` : 'No fix available.',
      });
    }
  } catch {
    findings.push({
      id: '',
      severity: 'info',
      vulnerabilityClass: 'dependency-cve',
      file: 'Cargo.toml',
      title: 'cargo audit unavailable',
      description: 'cargo audit command failed or is not installed.',
      attackScenario: 'N/A',
      suggestedFix: 'Install cargo-audit: cargo install cargo-audit',
    });
  }

  return findings;
}

function checkGoVerify(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  try {
    execSync('go mod verify', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    const output = err.stdout || err.stderr || '';
    if (output.includes('SECURITY')) {
      findings.push({
        id: '',
        severity: 'high',
        vulnerabilityClass: 'dependency-cve',
        file: 'go.mod',
        title: 'Go module verification failed',
        description: `go mod verify reported issues: ${output.substring(0, 200)}`,
        attackScenario: 'Tampered modules could contain malicious code.',
        suggestedFix: 'Run go mod verify and resolve integrity issues.',
      });
    } else {
      findings.push({
        id: '',
        severity: 'info',
        vulnerabilityClass: 'dependency-cve',
        file: 'go.mod',
        title: 'go mod verify unavailable',
        description: 'go mod verify command failed.',
        attackScenario: 'N/A',
        suggestedFix: 'Ensure Go is installed and run go mod verify manually.',
      });
    }
  }

  return findings;
}
