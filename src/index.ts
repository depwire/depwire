#!/usr/bin/env node

import { Command } from 'commander';
import { resolve, dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { parseProject } from './parser/index.js';
import { buildGraph } from './graph/index.js';
import { exportToJSON, importFromJSON } from './graph/serializer.js';
import { getImpact, getArchitectureSummary, searchSymbols } from './graph/queries.js';
import { prepareVizData } from './viz/data.js';
import { startVizServer } from './viz/server.js';
import { startMcpServer } from './mcp/server.js';
import { createEmptyState } from './mcp/state.js';
import { watchProject } from './watcher.js';
import { updateFileInGraph } from './graph/updater.js';
import { generateDocs } from './docs/index.js';
import { calculateHealthScore, getHealthTrend } from './health/index.js';
import { formatHealthReport } from './health/display.js';
import { readFileSync as readFileSyncNode, appendFileSync, existsSync as existsSyncNode } from 'fs';
import { createInterface } from 'readline';
import { findProjectRoot } from './utils/files.js';
import { runTemporalAnalysis } from './temporal/index.js';
import { analyzeDeadCode } from './dead-code/index.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('depwire')
  .description('Code cross-reference graph builder for TypeScript projects')
  .version(packageJson.version);

program
  .command('parse')
  .description('Parse a TypeScript project and build dependency graph')
  .argument('[directory]', 'Project directory to parse (defaults to current directory or auto-detected project root)')
  .option('-o, --output <path>', 'Output JSON file path', 'depwire-output.json')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--stats', 'Print summary statistics')
  .option('--exclude <patterns...>', 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")')
  .option('--verbose', 'Show detailed parsing progress')
  .action(async (directory: string | undefined, options: { output: string; pretty?: boolean; stats?: boolean; exclude?: string[]; verbose?: boolean }) => {
    const startTime = Date.now();
    
    try {
      const projectRoot = directory ? resolve(directory) : findProjectRoot();
      
      console.log(`Parsing project: ${projectRoot}`);
      
      // Parse all TypeScript files
      const parsedFiles = await parseProject(projectRoot, {
        exclude: options.exclude,
        verbose: options.verbose
      });
      console.log(`Parsed ${parsedFiles.length} files`);
      
      // Build the graph
      const graph = buildGraph(parsedFiles);
      
      // Export to JSON
      const projectGraph = exportToJSON(graph, projectRoot);
      
      // Write to file
      const json = options.pretty 
        ? JSON.stringify(projectGraph, null, 2) 
        : JSON.stringify(projectGraph);
      
      writeFileSync(options.output, json, 'utf-8');
      console.log(`Graph exported to: ${options.output}`);
      
      // Print stats if requested
      if (options.stats) {
        const elapsed = Date.now() - startTime;
        const summary = getArchitectureSummary(graph);
        
        console.log('\n=== Project Statistics ===');
        console.log(`Files: ${summary.fileCount}`);
        console.log(`Symbols: ${summary.symbolCount}`);
        console.log(`Edges: ${summary.edgeCount}`);
        console.log(`Time: ${elapsed}ms`);
        
        if (summary.mostConnectedFiles.length > 0) {
          console.log('\nMost Connected Files:');
          for (const file of summary.mostConnectedFiles.slice(0, 5)) {
            console.log(`  ${file.filePath} (${file.connections} connections)`);
          }
        }
        
        if (summary.orphanFiles.length > 0) {
          console.log(`\nOrphan Files (no cross-references): ${summary.orphanFiles.length}`);
        }
      }
    } catch (err) {
      console.error('Error parsing project:', err);
      process.exit(1);
    }
  });

program
  .command('query')
  .description('Query impact analysis for a symbol')
  .argument('<directory>', 'Project directory')
  .argument('<symbol-name>', 'Symbol name to query')
  .action(async (directory: string, symbolName: string) => {
    try {
      const projectRoot = resolve(directory);
      const cacheFile = 'depwire-output.json';
      
      let graph;
      
      // Try to load from cache first
      if (existsSync(cacheFile)) {
        console.log('Loading from cache...');
        const json = JSON.parse(readFileSync(cacheFile, 'utf-8'));
        graph = importFromJSON(json);
      } else {
        console.log('Parsing project...');
        const parsedFiles = await parseProject(projectRoot);
        graph = buildGraph(parsedFiles);
      }
      
      // Search for the symbol
      const matches = searchSymbols(graph, symbolName);
      
      if (matches.length === 0) {
        console.log(`No symbols found matching: ${symbolName}`);
        return;
      }
      
      if (matches.length > 1) {
        console.log(`Found ${matches.length} symbols matching "${symbolName}":`);
        for (const match of matches) {
          console.log(`  - ${match.name} (${match.kind}) in ${match.filePath}:${match.startLine}`);
        }
        console.log('\nShowing impact for all matches...\n');
      }
      
      // Show impact for each match
      for (const match of matches) {
        console.log(`=== Impact Analysis: ${match.name} (${match.kind}) ===`);
        console.log(`Location: ${match.filePath}:${match.startLine}-${match.endLine}`);
        
        const impact = getImpact(graph, match.id);
        
        console.log(`\nDirect Dependents: ${impact.directDependents.length}`);
        for (const dep of impact.directDependents) {
          console.log(`  - ${dep.name} (${dep.kind}) in ${dep.filePath}:${dep.startLine}`);
        }
        
        console.log(`\nTotal Transitive Dependents: ${impact.transitiveDependents.length}`);
        console.log(`Affected Files: ${impact.affectedFiles.length}`);
        for (const file of impact.affectedFiles) {
          console.log(`  - ${file}`);
        }
        
        console.log('');
      }
    } catch (err) {
      console.error('Error querying symbol:', err);
      process.exit(1);
    }
  });

program
  .command('viz')
  .description('Launch interactive arc diagram visualization')
  .argument('[directory]', 'Project directory to visualize (defaults to current directory or auto-detected project root)')
  .option('-p, --port <number>', 'Server port', '3333')
  .option('--no-open', 'Don\'t auto-open browser')
  .option('--exclude <patterns...>', 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")')
  .option('--verbose', 'Show detailed parsing progress')
  .action(async (directory: string | undefined, options: { port: string; open: boolean; exclude?: string[]; verbose?: boolean }) => {
    try {
      const projectRoot = directory ? resolve(directory) : findProjectRoot();
      
      console.log(`Parsing project: ${projectRoot}`);
      
      // Parse all TypeScript files
      const parsedFiles = await parseProject(projectRoot, {
        exclude: options.exclude,
        verbose: options.verbose
      });
      console.log(`Parsed ${parsedFiles.length} files`);
      
      // Build the graph
      const graph = buildGraph(parsedFiles);
      
      // Prepare visualization data
      const vizData = prepareVizData(graph, projectRoot);
      console.log(`Found ${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} cross-file edges`);
      
      // Start visualization server
      const port = parseInt(options.port, 10);
      await startVizServer(vizData, graph, projectRoot, port, options.open, {
        exclude: options.exclude,
        verbose: options.verbose
      });
    } catch (err) {
      console.error('Error starting visualization:', err);
      process.exit(1);
    }
  });

program
  .command('temporal')
  .description('Visualize how the dependency graph evolved over git history')
  .argument('[directory]', 'Project directory to analyze (defaults to current directory or auto-detected project root)')
  .option('--commits <number>', 'Number of commits to sample', '20')
  .option('--strategy <type>', 'Sampling strategy: even, weekly, monthly', 'even')
  .option('-p, --port <number>', 'Server port', '3334')
  .option('--output <path>', 'Save snapshots to custom path (default: .depwire/temporal/)')
  .option('--verbose', 'Show progress for each commit being parsed')
  .option('--stats', 'Show summary statistics at end')
  .action(async (directory: string | undefined, options: { commits: string; strategy: string; port: string; output?: string; verbose?: boolean; stats?: boolean }) => {
    try {
      const projectRoot = directory ? resolve(directory) : findProjectRoot();
      
      await runTemporalAnalysis(projectRoot, {
        commits: parseInt(options.commits, 10),
        strategy: options.strategy as 'even' | 'weekly' | 'monthly',
        port: parseInt(options.port, 10),
        output: options.output,
        verbose: options.verbose,
        stats: options.stats,
      });
    } catch (err) {
      console.error('Error running temporal analysis:', err);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Start MCP server for AI coding tools')
  .argument('[directory]', 'Project directory to analyze (optional - auto-detects project root or use connect_repo tool to connect later)')
  .action(async (directory?: string) => {
    try {
      const state = createEmptyState();
      
      // Auto-detect project root if no directory provided
      let projectRootToConnect: string | null = null;
      
      if (directory) {
        // Explicit directory provided
        projectRootToConnect = resolve(directory);
      } else {
        // Try to auto-detect project root
        const detectedRoot = findProjectRoot();
        const cwd = process.cwd();
        
        // Only auto-connect if we found a project marker (detected root != cwd means we found something)
        if (detectedRoot !== cwd || existsSync(join(cwd, 'package.json')) || existsSync(join(cwd, 'tsconfig.json')) || existsSync(join(cwd, 'go.mod')) || existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'setup.py')) || existsSync(join(cwd, '.git'))) {
          projectRootToConnect = detectedRoot;
        }
      }

      if (projectRootToConnect) {
        
        // Log to stderr only (NEVER stdout - it corrupts MCP protocol)
        console.error(`Parsing project: ${projectRootToConnect}`);
        
        // Parse all TypeScript files
        const parsedFiles = await parseProject(projectRootToConnect);
        console.error(`Parsed ${parsedFiles.length} files`);
        
        // Build the graph
        const graph = buildGraph(parsedFiles);
        console.error(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
        
        // Set initial state
        state.graph = graph;
        state.projectRoot = projectRootToConnect;
        state.projectName = projectRootToConnect.split('/').pop() || 'project';

        // Start file watcher
        console.error("Starting file watcher...");
        state.watcher = watchProject(projectRootToConnect, {
          onFileChanged: async (filePath: string) => {
            console.error(`File changed: ${filePath}`);
            try {
              await updateFileInGraph(state.graph!, projectRootToConnect, filePath);
              console.error(`Graph updated for ${filePath}`);
            } catch (error) {
              console.error(`Failed to update graph: ${error}`);
            }
          },
          onFileAdded: async (filePath: string) => {
            console.error(`File added: ${filePath}`);
            try {
              await updateFileInGraph(state.graph!, projectRootToConnect, filePath);
              console.error(`Graph updated for ${filePath}`);
            } catch (error) {
              console.error(`Failed to update graph: ${error}`);
            }
          },
          onFileDeleted: (filePath: string) => {
            console.error(`File deleted: ${filePath}`);
            try {
              const fileNodes = state.graph!.filterNodes((node, attrs) => 
                attrs.filePath === filePath
              );
              fileNodes.forEach(node => state.graph!.dropNode(node));
              console.error(`Removed ${filePath} from graph`);
            } catch (error) {
              console.error(`Failed to remove file: ${error}`);
            }
          },
        });
      }
      
      // Start MCP server (communicates via stdin/stdout)
      await startMcpServer(state);
    } catch (err) {
      console.error('Error starting MCP server:', err);
      process.exit(1);
    }
  });

program
  .command('docs')
  .description('Generate comprehensive codebase documentation')
  .argument('[directory]', 'Project directory to document (defaults to current directory or auto-detected project root)')
  .option('-o, --output <path>', 'Output directory (default: .depwire/ inside project)')
  .option('--format <type>', 'Output format: markdown | json', 'markdown')
  .option('--gitignore', 'Add .depwire/ to .gitignore automatically')
  .option('--no-gitignore', 'Don\'t modify .gitignore')
  .option('--include <docs>', 'Comma-separated list of docs to generate (default: all)', 'all')
  .option('--update', 'Regenerate existing docs')
  .option('--only <docs>', 'Used with --update, regenerate only specific docs')
  .option('--verbose', 'Show generation progress')
  .option('--stats', 'Show generation statistics at the end')
  .option('--exclude <patterns...>', 'Glob patterns to exclude (e.g., "**/*.test.*" "dist/**")')
  .action(async (directory: string | undefined, options: {
    output?: string;
    format: 'markdown' | 'json';
    gitignore?: boolean;
    include: string;
    update?: boolean;
    only?: string;
    verbose?: boolean;
    stats?: boolean;
    exclude?: string[];
  }) => {
    const startTime = Date.now();
    
    try {
      const projectRoot = directory ? resolve(directory) : findProjectRoot();
      const outputDir = options.output ? resolve(options.output) : join(projectRoot, '.depwire');
      
      // Parse include/only lists - always split by comma
      const includeList = options.include.split(',').map(s => s.trim());
      const onlyList = options.only 
        ? options.only.split(',').map(s => s.trim())
        : undefined;
      
      // Handle .gitignore
      if (options.gitignore === undefined && !existsSyncNode(outputDir)) {
        // First run, prompt user
        const answer = await promptGitignore();
        if (answer) {
          addToGitignore(projectRoot, '.depwire/');
        }
      } else if (options.gitignore === true) {
        addToGitignore(projectRoot, '.depwire/');
      }
      
      console.log(`Parsing project: ${projectRoot}`);
      
      // Parse all files
      const parsedFiles = await parseProject(projectRoot, {
        exclude: options.exclude,
        verbose: options.verbose
      });
      console.log(`Parsed ${parsedFiles.length} files`);
      
      // Build the graph
      const graph = buildGraph(parsedFiles);
      const parseTime = (Date.now() - startTime) / 1000;
      
      console.log(`Built graph: ${graph.order} symbols, ${graph.size} edges`);
      
      // Generate documentation
      if (options.verbose) {
        console.log(`\nGenerating documentation to: ${outputDir}`);
      }
      
      const result = await generateDocs(graph, projectRoot, packageJson.version, parseTime, {
        outputDir,
        format: options.format,
        include: includeList,
        update: options.update || false,
        only: onlyList,
        verbose: options.verbose || false,
        stats: options.stats || false,
      });
      
      if (result.success) {
        console.log(`\n✅ Documentation generated successfully!`);
        console.log(`Output directory: ${outputDir}`);
        console.log(`Generated files: ${result.generated.join(', ')}`);
        
        if (result.stats) {
          console.log(`\n=== Generation Statistics ===`);
          console.log(`Time: ${(result.stats.totalTime / 1000).toFixed(2)}s`);
          console.log(`Files generated: ${result.stats.filesGenerated}`);
        }
      } else {
        console.error(`\n❌ Documentation generation completed with errors:`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error('Error generating documentation:', err);
      process.exit(1);
    }
  });

async function promptGitignore(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Add .depwire/ to .gitignore? [Y/n] ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

function addToGitignore(projectRoot: string, pattern: string): void {
  const gitignorePath = join(projectRoot, '.gitignore');
  
  try {
    let content = '';
    if (existsSyncNode(gitignorePath)) {
      content = readFileSyncNode(gitignorePath, 'utf-8');
    }
    
    // Check if pattern already exists
    if (content.includes(pattern)) {
      return;
    }
    
    // Add pattern
    const newContent = content.endsWith('\n') ? `${content}${pattern}\n` : `${content}\n${pattern}\n`;
    appendFileSync(gitignorePath, content.endsWith('\n') ? `${pattern}\n` : `\n${pattern}\n`, 'utf-8');
    console.log(`Added ${pattern} to .gitignore`);
  } catch (err) {
    console.error(`Warning: Failed to update .gitignore: ${err}`);
  }
}

// Health command
program
  .command('health')
  .description('Analyze dependency architecture health (0-100 score)')
  .argument('[directory]', 'Project directory to analyze (defaults to current directory or auto-detected project root)')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show detailed breakdown')
  .action(async (directory: string | undefined, options: { json?: boolean; verbose?: boolean }) => {
    try {
      const projectRoot = directory ? resolve(directory) : findProjectRoot();
      const startTime = Date.now();
      
      // Parse project
      const parsedFiles = await parseProject(projectRoot);
      const graph = buildGraph(parsedFiles);
      const parseTime = Date.now() - startTime;
      
      // Calculate health score
      const report = calculateHealthScore(graph, projectRoot);
      const trend = getHealthTrend(projectRoot, report.overall);
      
      if (options.json) {
        // JSON output (for CI/automation)
        console.log(JSON.stringify(report, null, 2));
      } else {
        // Human-readable output
        const formatted = formatHealthReport(report, trend, options.verbose || false);
        console.log(formatted);
        
        const totalTime = Date.now() - startTime;
        console.log(`Analysis completed in ${(totalTime / 1000).toFixed(2)}s (parse: ${(parseTime / 1000).toFixed(2)}s)\n`);
      }
    } catch (err) {
      console.error('Error analyzing health:', err);
      process.exit(1);
    }
  });

// Dead code detection command
program
  .command('dead-code')
  .description('Identify dead code - symbols defined but never referenced')
  .argument('[directory]', 'Project directory to analyze (defaults to current directory or auto-detected project root)')
  .option('--confidence <level>', 'Minimum confidence level to show: high, medium, low (default: medium)', 'medium')
  .option('--json', 'Output as JSON (for CI/automation)')
  .option('--verbose', 'Show detailed info for each dead symbol')
  .option('--stats', 'Show summary statistics')
  .option('--include-tests', 'Include test files in analysis')
  .option('--include-low', 'Shortcut for --confidence low')
  .action(async (directory: string | undefined, options: { confidence?: string; json?: boolean; verbose?: boolean; stats?: boolean; includeTests?: boolean; includeLow?: boolean }) => {
    try {
      const projectRoot = directory ? resolve(directory) : findProjectRoot();
      const startTime = Date.now();
      
      const parsedFiles = await parseProject(projectRoot);
      const graph = buildGraph(parsedFiles);
      
      const confidence = options.includeLow ? 'low' : (options.confidence || 'medium');
      
      const report = analyzeDeadCode(graph, projectRoot, {
        confidence: confidence as any,
        includeTests: options.includeTests || false,
        verbose: options.verbose || false,
        stats: options.stats || false,
        json: options.json || false,
      });
      
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      }
      
      const totalTime = Date.now() - startTime;
      if (!options.json) {
        console.log(`\nAnalysis completed in ${(totalTime / 1000).toFixed(2)}s\n`);
      }
    } catch (err) {
      console.error('Error analyzing dead code:', err);
      process.exit(1);
    }
  });

program.parse();
