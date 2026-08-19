import { resolve } from 'path';
import chalk from 'chalk';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { countGraphSymbols } from '../graph/counts.js';
import { findProjectRoot } from '../utils/files.js';
import { SimulationEngine, SimulationAction, SimulationResult } from '../simulation/engine.js';
import { prepareVizData } from '../viz/data.js';
import { serveWhatIfViz } from '../viz/whatif-server.js';
import { trackCloudCta } from '../telemetry.js';
import type http from 'http';

// Track active server for cleanup
let activeServer: http.Server | null = null;

const cleanup = () => {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
};

// Register cleanup handlers once
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

export interface WhatIfOptions {
  simulate?: string;
  target?: string;
  destination?: string;
  newName?: string;
  source?: string;
  newFile?: string;
  symbols?: string;
  json?: boolean;
  noBrowser?: boolean;
  timeout?: string;
}

export async function whatif(dir: string, options: WhatIfOptions): Promise<void> {
  const textOnly = options.json || options.noBrowser;

  if (!options.simulate) {
    if (textOnly) {
      console.error('--json and --no-browser require --simulate <action>');
      process.exit(1);
    }
    // Phase B: open browser UI
    const projectRoot = dir === '.' ? findProjectRoot() : resolve(dir);
    console.error(`Parsing project: ${projectRoot}`);

    const parsedFiles = await parseProject(projectRoot);
    const graph = buildGraph(parsedFiles, projectRoot);
    console.error(`Built graph: ${countGraphSymbols(graph)} symbols, ${graph.size} edges`);

    const vizData = prepareVizData(graph, projectRoot);

    // Empty simulation result for initial state
    const emptyResult: SimulationResult = {
      action: { type: 'delete', target: '' },
      originalGraph: { nodeCount: graph.order, edgeCount: graph.size, healthScore: 0 },
      simulatedGraph: { nodeCount: graph.order, edgeCount: graph.size, healthScore: 0 },
      diff: { addedEdges: [], removedEdges: [], affectedNodes: [], brokenImports: [], circularDepsIntroduced: [], circularDepsResolved: [] },
      healthDelta: { before: 0, after: 0, delta: 0, improved: false, dimensionChanges: [] },
    };

    const server = await serveWhatIfViz(vizData, vizData, emptyResult, 'none', '');
    activeServer = server;
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
  console.error(`Parsing project: ${projectRoot}`);

  const parsedFiles = await parseProject(projectRoot);
  const graph = buildGraph(parsedFiles, projectRoot);
  console.error(`Built graph: ${countGraphSymbols(graph)} symbols, ${graph.size} edges`);

  // Run simulation
  console.error('');
  const engine = new SimulationEngine(graph);

  try {
    const result = engine.simulate(action);

    // Determine risk level from health delta and broken imports
    const brokenCount = result.diff.brokenImports.length;
    const affectedCount = result.diff.affectedNodes.length;
    const riskLevel = brokenCount > 5 || affectedCount > 20 || result.healthDelta.delta < -5
      ? 'HIGH'
      : brokenCount > 0 || affectedCount > 5 || result.healthDelta.delta < -2
        ? 'MEDIUM'
        : 'LOW';

    // --json: machine-readable JSON output
    if (options.json) {
      const affected = result.diff.affectedNodes.map((nodeId: string) => {
        const attrs = graph.hasNode(nodeId) ? graph.getNodeAttributes(nodeId) : null;
        const depth = result.diff.brokenImports.some(bi => bi.file === attrs?.filePath) ? 1 : 2;
        const symbols = attrs ? [attrs.name] : [];
        return {
          filePath: attrs?.filePath || nodeId,
          depth,
          symbols,
          risk: depth === 1 ? riskLevel : 'LOW',
        };
      });

      const jsonOutput = {
        target: action.target,
        mode: action.type,
        affected,
        total_affected: affectedCount,
        risk_level: riskLevel,
        health_before: result.healthDelta.before,
        health_after: result.healthDelta.after,
      };

      console.log(JSON.stringify(jsonOutput, null, 2));
      process.exit(riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 1 : 0);
      return;
    }

    // --no-browser: human-readable text output
    if (options.noBrowser) {
      printResult(result);

      // Additional structured text output
      const directImports = result.diff.brokenImports;
      const indirectNodes = result.diff.affectedNodes.filter(
        nodeId => !directImports.some(bi => {
          const attrs = graph.hasNode(nodeId) ? graph.getNodeAttributes(nodeId) : null;
          return attrs && bi.file === attrs.filePath;
        })
      );

      console.log('');
      console.log(`Risk: ${riskLevel}`);
      console.log(`Affected files: ${affectedCount}`);

      if (directImports.length > 0) {
        console.log('  Direct (depth 1):');
        for (const bi of directImports) {
          console.log(`    ${bi.file} — imports ${bi.importedSymbol}`);
        }
      }

      if (indirectNodes.length > 0) {
        console.log('  Indirect (depth 2+):');
        const shown = indirectNodes.slice(0, 10);
        for (const nodeId of shown) {
          const attrs = graph.hasNode(nodeId) ? graph.getNodeAttributes(nodeId) : null;
          console.log(`    ${attrs?.filePath || nodeId}`);
        }
        if (indirectNodes.length > 10) {
          console.log(`    ... (${indirectNodes.length - 10} more)`);
        }
      }

      console.log(`  Health: ${result.healthDelta.before} → ${result.healthDelta.after} (${result.healthDelta.delta >= 0 ? '+' : ''}${result.healthDelta.delta} points)`);

      process.exit(riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 1 : 0);
      return;
    }

    // Default: print result then launch browser UI
    printResult(result);

    // Cloud upsell (stderr)
    console.error(
      '\n\x1b[2m→ Full report at app.depwire.dev — free to sign up\x1b[0m'
    );
    trackCloudCta('whatif');

    // Open browser UI with simulation results pre-loaded
    const currentVizData = prepareVizData(graph, projectRoot);
    const simulatedVizData = result.simulatedGraphInstance
      ? prepareVizData(result.simulatedGraphInstance, projectRoot)
      : currentVizData;

    // Strip the graph instance before passing to the server (not JSON-serializable)
    const { simulatedGraphInstance, ...serializableResult } = result;

    const server = await serveWhatIfViz(
      currentVizData,
      simulatedVizData,
      serializableResult as SimulationResult,
      action.type,
      action.target
    );
    activeServer = server;

    // Auto-timeout: close server after --timeout seconds (default 300)
    const timeoutSec = parseInt(options.timeout || '300', 10);
    if (timeoutSec > 0) {
      setTimeout(() => {
        console.error(`\nServer timed out after ${timeoutSec}s. Shutting down.`);
        cleanup();
        process.exit(0);
      }, timeoutSec * 1000).unref();
    }
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

  // Surface any dimension-level caveats (e.g. Orphans & Dead Code, #11) --
  // these apply even when that dimension's delta is 0, since the caveat is
  // about the absolute score not matching the real per-repo Health tab.
  const withNotes = healthDelta.dimensionChanges.filter((d) => d.note);
  for (const d of withNotes) {
    console.log(chalk.dim(`  \u26a0 ${d.name}: ${d.note}`));
  }

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
