import { resolve, relative } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { findProjectRoot } from '../utils/files.js';
import { getAffectedFiles, type AffectedFile } from '../graph/queries.js';
import { trackCloudCta } from '../telemetry.js';

export interface AffectedCommandOptions {
  depth?: string;
  tests?: boolean;
  json?: boolean;
  gitDiff?: string;
}

export async function affectedCommand(
  fileOrSymbol: string | undefined,
  dir: string,
  options: AffectedCommandOptions,
): Promise<void> {
  const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);
  const maxDepth = options.depth ? parseInt(options.depth, 10) : 5;

  // Determine changed files
  let changedFiles: string[];

  if (options.gitDiff) {
    const ref = options.gitDiff;
    try {
      const raw = execSync(`git diff --name-only ${ref}`, {
        cwd: projectRoot,
        encoding: 'utf-8',
      }).trim();
      changedFiles = raw
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);
    } catch {
      console.error(chalk.red(`Failed to run git diff with ref: ${ref}`));
      process.exit(1);
    }

    if (changedFiles.length === 0) {
      console.log('No changed files found.');
      return;
    }
  } else if (fileOrSymbol) {
    changedFiles = [fileOrSymbol];
  } else {
    console.error(chalk.red('Provide a file path or use --git-diff <ref>'));
    process.exit(1);
  }

  // Parse + build graph
  console.error(`Parsing project: ${projectRoot}`);
  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);

  // Aggregate results across all changed files
  const allAffected = new Map<string, AffectedFile>();
  const allTestFiles = new Map<string, AffectedFile>();

  for (const changedFile of changedFiles) {
    // Normalize to relative path as stored in graph
    const relPath = changedFile.startsWith('/')
      ? relative(projectRoot, changedFile)
      : changedFile;

    const result = getAffectedFiles(graph, relPath, { maxDepth });

    for (const af of result.affected) {
      if (!allAffected.has(af.filePath) || allAffected.get(af.filePath)!.depth > af.depth) {
        allAffected.set(af.filePath, af);
      }
    }
    for (const tf of result.testFiles) {
      if (!allTestFiles.has(tf.filePath) || allTestFiles.get(tf.filePath)!.depth > tf.depth) {
        allTestFiles.set(tf.filePath, tf);
      }
    }
  }

  const affected = Array.from(allAffected.values()).sort(
    (a, b) => a.depth - b.depth || a.filePath.localeCompare(b.filePath),
  );
  const testFiles = Array.from(allTestFiles.values()).sort(
    (a, b) => a.depth - b.depth || a.filePath.localeCompare(b.filePath),
  );

  // JSON output
  if (options.json) {
    console.log(JSON.stringify({
      target: changedFiles.length === 1 ? changedFiles[0] : changedFiles,
      affected_files: affected,
      test_files: testFiles,
      total_affected: affected.length,
      total_tests: testFiles.length,
    }, null, 2));
    return;
  }

  // Human-readable output
  const line = '─'.repeat(50);

  if (options.tests) {
    // --tests: show only test files
    console.log('');
    console.log(chalk.bold(`Test files that cover affected code (${testFiles.length}):`));
    console.log(chalk.dim(line));
    if (testFiles.length === 0) {
      console.log(chalk.dim('  No test files found in the affected graph.'));
    } else {
      for (const tf of testFiles) {
        console.log(`  ${chalk.green('•')} ${tf.filePath} ${chalk.dim(`(depth ${tf.depth})`)}`);
      }
    }
  } else {
    // Full output
    console.log('');
    console.log(chalk.bold(`Affected files (${affected.length}):`));
    console.log(chalk.dim(line));
    if (affected.length === 0) {
      console.log(chalk.dim('  No affected files found.'));
    } else {
      for (const af of affected) {
        const icon = af.isTest ? chalk.yellow('⊘') : chalk.blue('•');
        console.log(`  ${icon} ${af.filePath} ${chalk.dim(`(${af.reason})`)}`);
      }
    }

    if (testFiles.length > 0) {
      console.log('');
      console.log(chalk.bold(`Test files that cover affected code (${testFiles.length}):`));
      console.log(chalk.dim(line));
      for (const tf of testFiles) {
        console.log(`  ${chalk.green('•')} ${tf.filePath} ${chalk.dim(`(depth ${tf.depth})`)}`);
      }
    }
  }

  console.log(chalk.dim(line));
  console.log('');

  // Cloud upsell (stderr, skip for JSON)
  console.error(
    '\n\x1b[2m→ Full report at app.depwire.dev — free to sign up\x1b[0m',
  );
  trackCloudCta('affected');
}
