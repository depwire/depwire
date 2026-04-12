import { resolve, dirname, join } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { buildGraph } from '../graph/index.js';
import { parseProject } from '../parser/index.js';
import { findProjectRoot } from '../utils/files.js';
import { scanSecurity } from '../security/scanner.js';
import { formatTable, formatJSON, formatSARIF } from '../security/reporter.js';
import type { Severity, VulnerabilityClass } from '../security/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Walk up to find package.json from bundled location
function getVersion(): string {
  try {
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
      const pkgPath = join(dir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'depwire-cli') return pkg.version;
      } catch { /* continue */ }
      dir = dirname(dir);
    }
  } catch { /* fallback */ }
  return '0.0.0';
}

export interface SecurityCommandOptions {
  target?: string;
  class?: string[];
  format?: string;
  failOn?: string;
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export async function securityCommand(
  dir: string,
  options: SecurityCommandOptions
): Promise<void> {
  const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);
  console.error(`Scanning: ${projectRoot}`);

  const startTime = Date.now();

  const parsedFiles = await parseProject(projectRoot);
  console.error(`Parsed ${parsedFiles.length} files`);

  const graph = buildGraph(parsedFiles);
  console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);

  const result = await scanSecurity(projectRoot, graph, {
    target: options.target,
    classes: options.class as VulnerabilityClass[] | undefined,
    format: (options.format as 'table' | 'json' | 'sarif') || 'table',
    graphAware: true,
  });

  const elapsedMs = Date.now() - startTime;

  // Format and output
  const format = options.format || 'table';

  if (format === 'json') {
    console.log(formatJSON(result));
  } else if (format === 'sarif') {
    console.log(formatSARIF(result, getVersion()));
  } else {
    console.log(formatTable(result, elapsedMs));
  }

  // Fail on severity threshold
  if (options.failOn) {
    const threshold = options.failOn as Severity;
    const thresholdIdx = SEVERITY_ORDER.indexOf(threshold);
    if (thresholdIdx >= 0) {
      const hasFindings = result.findings.some(
        f => SEVERITY_ORDER.indexOf(f.severity) <= thresholdIdx
      );
      if (hasFindings) {
        console.error(`Findings at or above ${threshold} severity detected — exiting with code 1`);
        process.exit(1);
      }
    }
  }
}
