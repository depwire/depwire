import chalk from 'chalk';
import type { SecurityScanResult, SecurityFinding, Severity } from './types.js';

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
  info: chalk.dim,
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};

export function formatTable(result: SecurityScanResult, elapsedMs: number): string {
  const lines: string[] = [];
  const sep = '\u2500'.repeat(62);

  lines.push('');
  lines.push(chalk.bold('Depwire Security Scan'));
  lines.push('');

  // Summary banner
  const summaryParts = [
    result.summary.critical > 0 ? chalk.red.bold(`${result.summary.critical} Critical`) : null,
    result.summary.high > 0 ? chalk.red(`${result.summary.high} High`) : null,
    result.summary.medium > 0 ? chalk.yellow(`${result.summary.medium} Medium`) : null,
    result.summary.low > 0 ? chalk.blue(`${result.summary.low} Low`) : null,
    result.summary.info > 0 ? chalk.dim(`${result.summary.info} Info`) : null,
  ].filter(Boolean);

  if (summaryParts.length > 0) {
    lines.push(`\u250C${sep}\u2510`);
    lines.push(`\u2502  ${summaryParts.join('  \u2502  ')}  \u2502`);
    lines.push(`\u2514${sep}\u2518`);
  } else {
    lines.push(chalk.green.bold('  No security findings detected.'));
  }

  lines.push('');

  // Group findings by severity
  const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

  for (const severity of severityOrder) {
    const group = result.findings.filter(f => f.severity === severity);
    if (group.length === 0) continue;

    const colorFn = SEVERITY_COLORS[severity];
    lines.push(colorFn(SEVERITY_LABELS[severity]));

    for (const finding of group) {
      lines.push(`  ${colorFn(`[${finding.id}]`)} ${finding.title}`);
      lines.push(`  File: ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
      lines.push(`  ${chalk.dim(finding.description)}`);
      lines.push(`  ${chalk.dim('Fix:')} ${finding.suggestedFix}`);

      if (finding.graphReachability?.elevatedBy) {
        lines.push(`  ${chalk.magenta('\u2191 Elevated:')} ${finding.graphReachability.elevatedBy}`);
      }

      lines.push('');
    }
  }

  // Footer
  const elapsed = (elapsedMs / 1000).toFixed(1);
  lines.push(chalk.dim(`Scanned ${result.filesScanned} files in ${elapsed}s`));
  lines.push(chalk.dim('Run with --format json for machine output'));
  lines.push(chalk.dim('Run with --format sarif for GitHub Security integration'));
  lines.push('');

  return lines.join('\n');
}

export function formatJSON(result: SecurityScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatSARIF(result: SecurityScanResult, version: string): string {
  const rules = result.findings.map(f => ({
    id: f.id,
    shortDescription: { text: f.title },
    fullDescription: { text: f.description },
    help: { text: f.suggestedFix },
    properties: {
      severity: f.severity,
      vulnerabilityClass: f.vulnerabilityClass,
    },
  }));

  // Deduplicate rules by id
  const uniqueRules = Array.from(
    new Map(rules.map(r => [r.id, r])).values()
  );

  const results = result.findings.map(f => {
    let level: string;
    if (f.severity === 'critical' || f.severity === 'high') level = 'error';
    else if (f.severity === 'medium') level = 'warning';
    else level = 'note';

    const sarifResult: any = {
      ruleId: f.id,
      level,
      message: { text: `${f.title}: ${f.description}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file },
            region: f.line ? { startLine: f.line } : undefined,
          },
        },
      ],
    };

    return sarifResult;
  });

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'depwire',
            version,
            rules: uniqueRules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
