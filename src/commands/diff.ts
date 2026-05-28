/**
 * depwire diff — CLI command for structural comparison between two git commits.
 */

import chalk from 'chalk';
import { computeDiff, DiffError, DiffResult } from '../core/diff.js';
import { findProjectRoot } from '../utils/files.js';
import { resolve } from 'path';

export interface DiffCommandOptions {
  json?: boolean;
  verbose?: boolean;
  noColor?: boolean;
  noSecurity?: boolean;
  noHealth?: boolean;
  path?: string;
}

export async function diffCommand(
  commitA: string,
  commitB: string,
  dir: string,
  options: DiffCommandOptions
): Promise<void> {
  if (!commitA || !commitB) {
    printUsage();
    process.exit(1);
  }

  const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);

  try {
    const result = await computeDiff(commitA, commitB, projectRoot, {
      path: options.path,
      noSecurity: options.noSecurity,
      noHealth: options.noHealth,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanReadable(result, options);
    }
  } catch (err) {
    if (err instanceof DiffError) {
      console.error(getC(options).red(`Error: ${err.message}`));
      process.exit(err.exitCode);
    }
    throw err;
  }
}

function getC(options: DiffCommandOptions) {
  const useColor = !options.noColor && process.stdout.isTTY;
  if (useColor) return chalk;
  return {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    cyan: (s: string) => s,
  } as typeof chalk;
}

function printUsage(): void {
  console.error(`Usage: depwire diff <commit-a> <commit-b> [options]

Compare the dependency graph between two git commits.
Shows added/removed/modified symbols, edge changes, blast radius,
health delta, and security diff — all computed deterministically.

Arguments:
  commit-a         Any valid git ref (branch, tag, hash, HEAD~N)
  commit-b         Any valid git ref

Options:
  --json           Output JSON for scripting
  --verbose        Show every changed symbol and edge by name
  --no-color       Disable terminal colors
  --no-security    Skip security diff (faster)
  --no-health      Skip health score comparison (faster)
  --path <path>    Diff a specific subdirectory only

Examples:
  depwire diff main feature/auth-refactor
  depwire diff HEAD~5 HEAD --verbose
  depwire diff v1.5.0 v1.6.0 --json | jq`);
}

function printHumanReadable(result: DiffResult, options: DiffCommandOptions): void {
  const c = getC(options);
  const line = '\u2501'.repeat(47);

  // Check for empty diff
  const totalChanges =
    result.symbols.added.length +
    result.symbols.removed.length +
    result.symbols.modified.length +
    result.edges.added.length +
    result.edges.removed.length;

  if (totalChanges === 0 && result.files.added.length === 0 && result.files.removed.length === 0) {
    console.log(`No structural changes between ${result.commit_a} and ${result.commit_b}.`);
    return;
  }

  console.log('');
  console.log(c.bold(`Depwire diff: ${result.commit_a}..${result.commit_b}`));
  console.log(c.dim(line));
  console.log('');

  // Symbols
  console.log(c.bold('Symbols'));
  if (result.symbols.added.length > 0) {
    const names = result.symbols.added.slice(0, 3).map(s => s.name);
    const more = result.symbols.added.length > 3 ? ` ...` : '';
    console.log(`  ${c.green('+')} ${result.symbols.added.length} added      ${c.dim(names.join(', ') + more)}`);
  }
  if (result.symbols.removed.length > 0) {
    const names = result.symbols.removed.slice(0, 3).map(s => s.name);
    const more = result.symbols.removed.length > 3 ? ` ...` : '';
    console.log(`  ${c.red('-')} ${result.symbols.removed.length} removed    ${c.dim(names.join(', ') + more)}`);
  }
  if (result.symbols.modified.length > 0) {
    const names = result.symbols.modified.slice(0, 3).map(s => s.name);
    const more = result.symbols.modified.length > 3 ? ` ...` : '';
    console.log(`  ${c.yellow('~')} ${result.symbols.modified.length} modified   ${c.dim(names.join(', ') + more)}`);
  }
  if (result.symbols.added.length === 0 && result.symbols.removed.length === 0 && result.symbols.modified.length === 0) {
    console.log(`  ${c.dim('(no changes)')}`);
  }
  console.log('');

  // Edges
  console.log(c.bold('Edges'));
  if (result.edges.added.length > 0) {
    console.log(`  ${c.green('+')} ${result.edges.added.length} added`);
  }
  if (result.edges.removed.length > 0) {
    console.log(`  ${c.red('-')} ${result.edges.removed.length} removed`);
  }
  if (result.edges.added.length === 0 && result.edges.removed.length === 0) {
    console.log(`  ${c.dim('(no changes)')}`);
  }
  console.log('');

  // Files
  console.log(c.bold('Files'));
  console.log(`  ${result.files.count_a} \u2192 ${result.files.count_b}  (${c.green(`+${result.files.added.length}`)} / ${c.red(`-${result.files.removed.length}`)})`);
  console.log('');

  // Blast radius
  console.log(`${c.bold('Blast radius:')}    ${result.blast_radius.count} files affected`);

  // Health
  if (result.health) {
    const deltaSign = result.health.delta >= 0 ? '+' : '';
    const deltaColor = result.health.delta > 0 ? c.green : result.health.delta === 0 ? c.yellow : c.red;
    console.log(
      `${c.bold('Health score:')}    ${result.health.before} \u2192 ${result.health.after}  ${deltaColor(`(${deltaSign}${result.health.delta})`)}  [${result.health.grade_before} \u2192 ${result.health.grade_after}]`
    );
  }

  // Security
  if (result.security) {
    const newCount = result.security.new_findings.length;
    const fixedCount = result.security.fixed_findings.length;
    const newStr = newCount > 0 ? c.red(`${newCount} new`) : c.dim('0 new');
    const fixedStr = fixedCount > 0 ? c.green(`${fixedCount} fixed`) : c.dim('0 fixed');
    console.log(`${c.bold('Security:')}        ${newStr} / ${fixedStr}`);
  }

  console.log(c.dim(line));

  // Verbose output
  if (options.verbose) {
    console.log('');

    if (result.symbols.added.length > 0) {
      console.log(c.bold(c.green('Added symbols:')));
      for (const sym of result.symbols.added) {
        console.log(`  ${c.green('+')} ${sym.name} (${sym.kind}) ${c.dim(sym.filePath + ':' + sym.startLine)}`);
      }
      console.log('');
    }

    if (result.symbols.removed.length > 0) {
      console.log(c.bold(c.red('Removed symbols:')));
      for (const sym of result.symbols.removed) {
        console.log(`  ${c.red('-')} ${sym.name} (${sym.kind}) ${c.dim(sym.filePath + ':' + sym.startLine)}`);
      }
      console.log('');
    }

    if (result.symbols.modified.length > 0) {
      console.log(c.bold(c.yellow('Modified symbols:')));
      for (const sym of result.symbols.modified) {
        console.log(`  ${c.yellow('~')} ${sym.name} (${sym.kind}) ${c.dim(sym.filePath + ':' + sym.startLine)}`);
      }
      console.log('');
    }

    if (result.edges.added.length > 0 && result.edges.added.length <= 50) {
      console.log(c.bold(c.green('Added edges:')));
      for (const edge of result.edges.added.slice(0, 20)) {
        const src = edge.source.split('::').pop() || edge.source;
        const tgt = edge.target.split('::').pop() || edge.target;
        console.log(`  ${c.green('+')} ${src} \u2192 ${tgt} (${edge.kind})`);
      }
      if (result.edges.added.length > 20) {
        console.log(c.dim(`  ... and ${result.edges.added.length - 20} more`));
      }
      console.log('');
    }

    if (result.edges.removed.length > 0 && result.edges.removed.length <= 50) {
      console.log(c.bold(c.red('Removed edges:')));
      for (const edge of result.edges.removed.slice(0, 20)) {
        const src = edge.source.split('::').pop() || edge.source;
        const tgt = edge.target.split('::').pop() || edge.target;
        console.log(`  ${c.red('-')} ${src} \u2192 ${tgt} (${edge.kind})`);
      }
      if (result.edges.removed.length > 20) {
        console.log(c.dim(`  ... and ${result.edges.removed.length - 20} more`));
      }
      console.log('');
    }

    if (result.blast_radius.files.length > 0) {
      console.log(c.bold('Affected files:'));
      for (const f of result.blast_radius.files.slice(0, 20)) {
        console.log(`  ${c.dim('\u2022')} ${f}`);
      }
      if (result.blast_radius.files.length > 20) {
        console.log(c.dim(`  ... and ${result.blast_radius.files.length - 20} more`));
      }
      console.log('');
    }

    if (result.security && result.security.new_findings.length > 0) {
      console.log(c.bold(c.red('New security findings:')));
      for (const f of result.security.new_findings) {
        console.log(`  ${c.red('\u2022')} [${f.severity.toUpperCase()}] ${f.title} (${f.file}:${f.line})`);
      }
      console.log('');
    }

    if (result.security && result.security.fixed_findings.length > 0) {
      console.log(c.bold(c.green('Fixed security findings:')));
      for (const f of result.security.fixed_findings) {
        console.log(`  ${c.green('\u2022')} [${f.severity.toUpperCase()}] ${f.title} (${f.file}:${f.line})`);
      }
      console.log('');
    }
  }

  console.log('');
}
// C3 test marker
