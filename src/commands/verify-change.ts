import { resolve } from 'path';
import { readFileSync, readSync } from 'fs';
import chalk from 'chalk';
import { parseVerifyProject } from '../core/verify-change-project.js';
import { buildGraph } from '../graph/index.js';
import { countGraphSymbols } from '../graph/counts.js';
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
  noColor?: boolean;
}

export async function verifyChangeCommand(
  dir: string,
  options: VerifyChangeOptions
): Promise<void> {
  // Resolve input mode
  const input = resolveInput(options);
  if (!input) throw new Error('Missing input: provide file and content, or a unified diff');

  // Parse codebase
  const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);
  console.error(`Parsing project: ${projectRoot}`);

  const { parsed, sourceCoverage, unparsedFiles } = await parseVerifyProject(projectRoot);
  const graph = buildGraph(parsed, projectRoot);
  console.error(`Built graph: ${countGraphSymbols(graph)} symbols, ${graph.size} edges`);

  // Run verification
  const result = await verifyChange(input, { graph, projectRoot, sourceCoverage, unparsedFiles, parsedFiles: parsed });

  renderVerifyChange(result, options);
  const code = verifyChangeExitCode(result, options.failOnWarnings);
  if (code) process.exit(code);
}

export function verifyChangeExitCode(result: Pick<VerifyChangeOutput, 'risk_level'>, failOnWarnings = false): number {
  if (result.risk_level === 'error') return 1;
  return failOnWarnings ? result.risk_level === 'high' ? 2 : result.risk_level === 'medium' ? 1 : 0 : 0;
}
export function renderVerifyChange(result: VerifyChangeOutput, options: VerifyChangeOptions): void {
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (options.quiet) printVerdict(result, options);
  else printHumanReadable(result, options);
}

function resolveInput(
  options: VerifyChangeOptions
): { file_path?: string; new_content?: string; unified_diff?: string } | null {
  if ((options.diff !== undefined && (options.file !== undefined || options.content !== undefined || options.contentFrom !== undefined)) ||
      (options.content !== undefined && options.contentFrom !== undefined)) throw new Error('Conflicting input modes');
  if (options.diff !== undefined) {
    // Mode C: unified diff from file
    const diffContent = readFileSync(resolve(options.diff), 'utf-8');
    return { unified_diff: diffContent };
  }

  if (options.file && options.content !== undefined) {
    // Mode A: inline content
    return { file_path: options.file, new_content: options.content };
  }

  if (options.file && options.contentFrom) {
    // Mode B: content from a separate file
    const content = readFileSync(resolve(options.contentFrom), 'utf-8');
    return { file_path: options.file, new_content: content };
  }

  if (options.file && options.content === undefined && options.contentFrom === undefined && options.diff === undefined) {
    // Mode D: piped stdin
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      const buf = Buffer.alloc(65536);
      let bytesRead: number;
      try {
        while ((bytesRead = readSync(0, buf, 0, buf.length, null)) > 0) {
          chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
        }
      } catch (error) {
        // EOF is readSync returning zero; an exception means input is incomplete.
        throw new Error('Failed to read change content from stdin', { cause: error });
      }
      const stdinContent = Buffer.concat(chunks).toString('utf-8');
      if (stdinContent.length > 0) {
        return { file_path: options.file, new_content: stdinContent };
      }
    }
  }

  return null;
}

function printVerdict(result: VerifyChangeOutput, options: VerifyChangeOptions): void {
  const useColor = !options.noColor && process.stdout.isTTY;
  const c = useColor ? chalk : { green: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s, dim: (s: string) => s, bold: (s: string) => s } as typeof chalk;

  if (result.risk_level === 'error') console.log(c.red(`ERROR — ${result.error_reason}`));
  else if (result.safe) {
    console.log(c.green('✓ SAFE') + c.dim(` — risk: ${result.risk_level}`));
  } else {
    const icon = result.risk_level === 'high' ? '✗' : '⚠';
    const color = result.risk_level === 'high' ? c.red : c.yellow;
    console.log(color(`${icon} UNSAFE`) + c.dim(` — risk: ${result.risk_level}`));
  }
  for (const section of ['health', 'security'] as const) {
    if (result[`${section}_status`] !== 'computed') console.log(`${section}: ${result[`${section}_status`]} — ${result[`${section}_reason`]}`);
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
  if (result.health_status === 'computed' && result.health_score_delta !== null) {
    const deltaSign = result.health_score_delta >= 0 ? '+' : '';
    console.log(`${c.bold('Health Score:')} ${result.health_score_before} → ${result.health_score_after} (${deltaSign}${result.health_score_delta})`);
  }

  // Broken imports
  console.log(`${c.bold('Broken Imports:')} ${result.broken_imports.length}`);
  if (result.broken_imports.length > 0) {
    for (const bi of result.broken_imports) {
      console.log(`  ${c.red('•')} ${bi.file} — missing ${c.bold(bi.missing_symbol)}`);
    }
  }

  console.log(`${c.bold('Cyclic Group Changes:')} ${JSON.stringify(result.cyclicGroupChanges)}`);

  // Security findings
  if (result.security_status === 'computed') console.log(`${c.bold('Security Findings:')} ${result.security_findings!.length}`);
  if (result.security_findings && result.security_findings.length > 0) {
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
