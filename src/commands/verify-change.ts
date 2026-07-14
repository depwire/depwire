import { resolve } from 'path';
import { readFileSync, readSync } from 'fs';
import chalk from 'chalk';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { findProjectRoot } from '../utils/files.js';
import { verifyChange, type VerifyChangeOutput } from '../core/verify-change.js';

export interface VerifyChangeOptions {
  file?: string;
  content?: string;
  contentFrom?: string;
  diff?: string;
  json?: boolean;
  quiet?: boolean;
  failOnWarnings?: boolean;
  healthThreshold?: string;
  noColor?: boolean;
}

export async function verifyChangeCommand(
  dir: string,
  options: VerifyChangeOptions
): Promise<void> {
  // Resolve input mode
  const input = resolveInput(options);
  if (!input) {
    printUsage();
    process.exit(1);
  }

  // Parse codebase
  const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);
  console.error(`Parsing project: ${projectRoot}`);

  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);

  // Run verification
  const result = await verifyChange(input, { graph, projectRoot });

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.quiet) {
    printVerdict(result, options);
  } else {
    printHumanReadable(result, options);
  }

  // Cloud upsell (stderr, skip for machine-readable output)
  if (!options.json && !options.quiet) {
    console.error(
      '\n\x1b[2m→ Full report at app.depwire.dev — free to sign up\x1b[0m'
    );
  }

  // Exit code
  if (options.failOnWarnings) {
    if (result.risk_level === 'high') {
      process.exit(2);
    } else if (result.risk_level === 'medium') {
      process.exit(1);
    }
  }
}

function resolveInput(
  options: VerifyChangeOptions
): { file_path?: string; new_content?: string; unified_diff?: string } | null {
  if (options.diff) {
    // Mode C: unified diff from file
    const diffContent = readFileSync(resolve(options.diff), 'utf-8');
    return { unified_diff: diffContent };
  }

  if (options.file && options.content) {
    // Mode A: inline content
    return { file_path: options.file, new_content: options.content };
  }

  if (options.file && options.contentFrom) {
    // Mode B: content from a separate file
    const content = readFileSync(resolve(options.contentFrom), 'utf-8');
    return { file_path: options.file, new_content: content };
  }

  if (options.file && !options.content && !options.contentFrom && !options.diff) {
    // Mode D: piped stdin
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      const buf = Buffer.alloc(65536);
      let bytesRead: number;
      try {
        while ((bytesRead = readSync(0, buf, 0, buf.length, null)) > 0) {
          chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
        }
      } catch {
        // EOF or read error
      }
      const stdinContent = Buffer.concat(chunks).toString('utf-8');
      if (stdinContent.length > 0) {
        return { file_path: options.file, new_content: stdinContent };
      }
    }
  }

  return null;
}

function printUsage(): void {
  console.error(`Usage: depwire verify-change [options]

Input modes (exactly one required):
  --file <path> --content <string>       File path + new content inline
  --file <path> --content-from <file>    File path + content from another file
  --diff <patch-file>                    Unified diff file
  cat file | depwire verify-change --file <path>   Piped stdin

Options:
  --json                Output raw JSON
  --quiet               Only output the verdict line
  --fail-on-warnings    Exit 1 on medium risk, 2 on high risk
  --health-threshold N  Health regression threshold (default: -3)
  --no-color            Disable terminal colors`);
}

function printVerdict(result: VerifyChangeOutput, options: VerifyChangeOptions): void {
  const useColor = !options.noColor && process.stdout.isTTY;
  const c = useColor ? chalk : { green: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s, dim: (s: string) => s, bold: (s: string) => s } as typeof chalk;

  if (result.safe) {
    console.log(c.green('✓ SAFE') + c.dim(` — risk: ${result.risk_level}`));
  } else {
    const icon = result.risk_level === 'high' ? '✗' : '⚠';
    const color = result.risk_level === 'high' ? c.red : c.yellow;
    console.log(color(`${icon} UNSAFE`) + c.dim(` — risk: ${result.risk_level}`));
  }
}

function printHumanReadable(result: VerifyChangeOutput, options: VerifyChangeOptions): void {
  const useColor = !options.noColor && process.stdout.isTTY;
  const c = useColor ? chalk : { green: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s, dim: (s: string) => s, bold: (s: string) => s } as typeof chalk;
  const line = '─'.repeat(50);

  console.log('');
  console.log(c.bold('Verify Change Report'));
  console.log(c.dim(line));

  // Verdict
  printVerdict(result, options);
  console.log(c.dim(line));

  // Health score
  const deltaSign = result.health_score_delta >= 0 ? '+' : '';
  const deltaColor = result.health_score_delta > 0 ? c.green
    : result.health_score_delta === 0 ? c.yellow : c.red;
  console.log(
    `${c.bold('Health Score:')}  ${result.health_score_before} → ${result.health_score_after}  ` +
    deltaColor(`(${deltaSign}${result.health_score_delta})`)
  );

  // Broken imports
  console.log(`${c.bold('Broken Imports:')} ${result.broken_imports.length}`);
  if (result.broken_imports.length > 0) {
    for (const bi of result.broken_imports) {
      console.log(`  ${c.red('•')} ${bi.file} — missing ${c.bold(bi.missing_symbol)}`);
    }
  }

  // Circular dependencies
  console.log(`${c.bold('New Circular Deps:')} ${result.new_circular_dependencies.length}`);
  if (result.new_circular_dependencies.length > 0) {
    for (const dep of result.new_circular_dependencies) {
      console.log(`  ${c.red('•')} ${dep.cycle.join(' → ')}`);
    }
  }

  // Security findings
  console.log(`${c.bold('Security Findings:')} ${result.security_findings.length}`);
  if (result.security_findings.length > 0) {
    for (const f of result.security_findings) {
      const sevColor = f.severity === 'critical' || f.severity === 'high'
        ? c.red : f.severity === 'medium' ? c.yellow : c.dim;
      console.log(`  ${sevColor('•')} [${f.severity.toUpperCase()}] ${f.description} (${f.file}:${f.line})`);
    }
  }

  // Blast radius
  console.log(`${c.bold('Blast Radius:')}    ${result.blast_radius} files affected`);
  if (result.affected_files.length > 0 && result.affected_files.length <= 10) {
    for (const f of result.affected_files) {
      console.log(`  ${c.dim('•')} ${f}`);
    }
  } else if (result.affected_files.length > 10) {
    for (const f of result.affected_files.slice(0, 10)) {
      console.log(`  ${c.dim('•')} ${f}`);
    }
    console.log(c.dim(`  … and ${result.affected_files.length - 10} more`));
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(c.dim(line));
    console.log(`${c.bold('Warnings:')}`);
    for (const w of result.warnings) {
      console.log(`  ${c.yellow('⚠')} ${w}`);
    }
  }

  console.log(c.dim(line));
  console.log('');
}
