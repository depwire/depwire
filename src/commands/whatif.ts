import { resolve } from 'path';
import chalk from 'chalk';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { findProjectRoot } from '../utils/files.js';
import { SimulationEngine, SimulationAction, SimulationResult } from '../simulation/engine.js';

export interface WhatIfOptions {
  simulate?: string;
  target?: string;
  destination?: string;
  newName?: string;
  source?: string;
  newFile?: string;
  symbols?: string;
}

export async function whatif(dir: string, options: WhatIfOptions): Promise<void> {
  if (!options.simulate) {
    console.log('Usage: depwire whatif [dir] --simulate <action> --target <file> [options]');
    console.log('');
    console.log('Actions: move, delete, rename, split, merge');
    console.log('');
    console.log('Run without --simulate to open interactive browser UI (Phase B)');
    return;
  }

  // Validate action type
  const validActions = ['move', 'delete', 'rename', 'split', 'merge'];
  if (!validActions.includes(options.simulate)) {
    console.error(chalk.red(`Invalid action: ${options.simulate}. Must be one of: ${validActions.join(', ')}`));
    process.exit(1);
  }

  if (!options.target) {
    console.error(chalk.red('--target is required for all simulation actions'));
    process.exit(1);
  }

  // Build the simulation action
  const action = buildAction(options);

  // Parse codebase
  const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);
  console.log(`Parsing project: ${projectRoot}`);

  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles);
  console.log(`Built graph: ${graph.order} symbols, ${graph.size} edges`);

  // Run simulation
  console.log('');
  const engine = new SimulationEngine(graph);

  try {
    const result = engine.simulate(action);
    printResult(result);
  } catch (err: any) {
    console.error(chalk.red(`Simulation failed: ${err.message}`));
    process.exit(1);
  }
}

function buildAction(options: WhatIfOptions): SimulationAction {
  const type = options.simulate!;
  const target = options.target!;

  switch (type) {
    case 'move':
      if (!options.destination) {
        console.error(chalk.red('--destination is required for move action'));
        process.exit(1);
      }
      return { type: 'move', target, destination: options.destination };

    case 'delete':
      return { type: 'delete', target };

    case 'rename':
      if (!options.newName) {
        console.error(chalk.red('--new-name is required for rename action'));
        process.exit(1);
      }
      return { type: 'rename', target, newName: options.newName };

    case 'split':
      if (!options.newFile) {
        console.error(chalk.red('--new-file is required for split action'));
        process.exit(1);
      }
      if (!options.symbols) {
        console.error(chalk.red('--symbols is required for split action (comma-separated)'));
        process.exit(1);
      }
      return {
        type: 'split',
        target,
        newFile: options.newFile,
        symbols: options.symbols.split(',').map((s) => s.trim()),
      };

    case 'merge':
      if (!options.source) {
        console.error(chalk.red('--source is required for merge action'));
        process.exit(1);
      }
      return { type: 'merge', target, source: options.source };

    default:
      console.error(chalk.red(`Unknown action: ${type}`));
      process.exit(1);
  }
}

function printResult(result: SimulationResult): void {
  const { action, healthDelta, diff } = result;
  const line = '\u2500'.repeat(45);

  console.log(chalk.bold('What If Simulation'));
  console.log(chalk.dim(line));

  // Action summary
  const actionStr = formatAction(action);
  console.log(`${chalk.bold('Action:')}     ${actionStr}`);
  console.log(chalk.dim(line));

  // Health score
  const deltaSign = healthDelta.delta >= 0 ? '+' : '';
  const deltaColor = healthDelta.improved ? chalk.green : healthDelta.delta === 0 ? chalk.yellow : chalk.red;
  const deltaIcon = healthDelta.improved ? '\u2713 improved' : healthDelta.delta === 0 ? '\u2192 unchanged' : '\u2717 degraded';
  console.log(
    `${chalk.bold('Health Score:')}    ${healthDelta.before} \u2192 ${healthDelta.after}  ${deltaColor(`(${deltaSign}${healthDelta.delta} ${deltaIcon})`)}`
  );

  // Dimension changes (only show non-zero)
  const changed = healthDelta.dimensionChanges.filter((d) => d.delta !== 0);
  if (changed.length > 0) {
    for (const d of changed) {
      const dSign = d.delta >= 0 ? '+' : '';
      const dColor = d.delta > 0 ? chalk.green : chalk.red;
      console.log(`  ${chalk.dim('\u2022')} ${d.name}: ${d.before} \u2192 ${d.after} ${dColor(`(${dSign}${d.delta})`)}`);
    }
  }

  // Stats
  console.log(`${chalk.bold('Affected Nodes:')}  ${diff.affectedNodes.length}`);
  console.log(`${chalk.bold('Broken Imports:')}  ${diff.brokenImports.length}`);
  if (diff.brokenImports.length > 0) {
    for (const bi of diff.brokenImports) {
      console.log(`  ${chalk.yellow('\u2022')} ${bi.file} ${bi.reason}`);
    }
  }

  console.log(
    `${chalk.bold('Circular Deps:')}   ${diff.circularDepsIntroduced.length} introduced, ${diff.circularDepsResolved.length} resolved`
  );
  console.log(`${chalk.bold('Added Edges:')}     ${diff.addedEdges.length}`);
  console.log(`${chalk.bold('Removed Edges:')}   ${diff.removedEdges.length}`);
  console.log(chalk.dim(line));
}

function formatAction(action: SimulationAction): string {
  switch (action.type) {
    case 'move':
      return `MOVE ${action.target} \u2192 ${action.destination}`;
    case 'delete':
      return `DELETE ${action.target}`;
    case 'rename':
      return `RENAME ${action.target} \u2192 ${action.newName}`;
    case 'split':
      return `SPLIT ${action.target} \u2192 ${action.newFile} (${action.symbols.join(', ')})`;
    case 'merge':
      return `MERGE ${action.source} \u2192 ${action.target}`;
  }
}
