import simpleGit from 'simple-git';
import { existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { tmpdir, homedir } from 'os';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { getArchitectureSummary } from '../graph/queries.js';
import { watchProject } from '../watcher.js';
import type { CodeGraphState } from './state.js';
import { updateFileInGraph } from '../graph/updater.js';

function validateProjectPath(source: string): { valid: boolean; error?: string } {
  const resolved = resolve(source);
  
  // Block sensitive system directories
  const blockedPaths = [
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/boot',
    '/proc',
    '/sys',
    join(homedir(), '.ssh'),
    join(homedir(), '.gnupg'),
    join(homedir(), '.aws'),
    join(homedir(), '.config'),
    join(homedir(), '.env'),
  ];
  
  for (const blocked of blockedPaths) {
    if (resolved.startsWith(blocked)) {
      return { valid: false, error: `Access denied: ${blocked} is a protected path` };
    }
  }
  
  return { valid: true };
}

export async function connectToRepo(
  source: string,
  subdirectory: string | undefined,
  state: CodeGraphState
): Promise<any> {
  try {
    let projectRoot: string;
    let projectName: string;

    // Detect if source is a GitHub URL or local path
    const isGitHub = source.startsWith('https://github.com/') || source.startsWith('git@github.com:');

    if (isGitHub) {
      // Extract repo name from URL
      // https://github.com/t3-oss/create-t3-app -> create-t3-app
      // git@github.com:t3-oss/create-t3-app.git -> create-t3-app
      const match = source.match(/[\/:]([^\/]+?)(?:\.git)?$/);
      if (!match) {
        return {
          error: "Invalid GitHub URL",
          message: "Could not parse repository name from URL",
        };
      }
      projectName = match[1];

      // Create temp directory for cloned repos
      const reposDir = join(tmpdir(), 'codegraph-repos');
      const cloneDir = join(reposDir, projectName);

      console.error(`Connecting to GitHub repo: ${source}`);

      const git = simpleGit();

      // Check if already cloned
      if (existsSync(cloneDir)) {
        console.error(`Repo already cloned at ${cloneDir}, pulling latest changes...`);
        try {
          await git.cwd(cloneDir).pull();
        } catch (error) {
          console.error(`Pull failed, using existing clone: ${error}`);
        }
      } else {
        console.error(`Cloning ${source} to ${cloneDir}...`);
        try {
          await git.clone(source, cloneDir, ['--depth', '1', '--no-recurse-submodules', '--single-branch']);
        } catch (error) {
          return {
            error: "Failed to clone repository",
            message: `Git clone failed: ${error}. Ensure git is installed and the URL is correct.`,
          };
        }
      }

      projectRoot = subdirectory ? join(cloneDir, subdirectory) : cloneDir;
    } else {
      // Local path - validate it's safe
      const validation = validateProjectPath(source);
      if (!validation.valid) {
        return {
          error: "Access denied",
          message: validation.error,
        };
      }
      
      if (!existsSync(source)) {
        return {
          error: "Directory not found",
          message: `Directory does not exist: ${source}`,
        };
      }

      projectRoot = subdirectory ? join(source, subdirectory) : source;
      projectName = basename(projectRoot);
    }
    
    // Validate final projectRoot path
    const validation = validateProjectPath(projectRoot);
    if (!validation.valid) {
      return {
        error: "Access denied",
        message: validation.error,
      };
    }

    // Verify project root exists
    if (!existsSync(projectRoot)) {
      return {
        error: "Project root not found",
        message: `Directory does not exist: ${projectRoot}`,
      };
    }

    console.error(`Parsing project at ${projectRoot}...`);

    // Stop old watcher if running
    if (state.watcher) {
      console.error("Stopping previous file watcher...");
      await state.watcher.close();
      state.watcher = null;
    }

    // Parse the project
    const parsedFiles = await parseProject(projectRoot);

    if (parsedFiles.length === 0) {
      return {
        error: "No source files found",
        message: `No supported source files (.ts, .tsx, .js, .jsx, .py, .go) found in ${projectRoot}`,
      };
    }

    // Build the graph
    const graph = buildGraph(parsedFiles);

    // Update state
    state.graph = graph;
    state.projectRoot = projectRoot;
    state.projectName = projectName;

    console.error(`Parsed ${parsedFiles.length} files`);

    // Start file watcher
    console.error("Starting file watcher...");
    state.watcher = watchProject(projectRoot, {
      onFileChanged: async (filePath: string) => {
        console.error(`File changed: ${filePath}`);
        try {
          await updateFileInGraph(state.graph!, projectRoot, filePath);
          console.error(`Graph updated for ${filePath}`);
        } catch (error) {
          console.error(`Failed to update graph for ${filePath}: ${error}`);
        }
      },
      onFileAdded: async (filePath: string) => {
        console.error(`File added: ${filePath}`);
        try {
          await updateFileInGraph(state.graph!, projectRoot, filePath);
          console.error(`Graph updated for ${filePath}`);
        } catch (error) {
          console.error(`Failed to update graph for ${filePath}: ${error}`);
        }
      },
      onFileDeleted: (filePath: string) => {
        console.error(`File deleted: ${filePath}`);
        try {
          // Remove file from graph
          const fileNodes = state.graph!.filterNodes((node, attrs) => 
            attrs.filePath === filePath
          );
          fileNodes.forEach(node => state.graph!.dropNode(node));
          console.error(`Removed ${filePath} from graph`);
        } catch (error) {
          console.error(`Failed to remove ${filePath} from graph: ${error}`);
        }
      },
    });

    // Get architecture summary
    const summary = getArchitectureSummary(graph);
    const mostConnected = summary.mostConnectedFiles.slice(0, 3);
    
    // Count files by language
    const languageBreakdown: Record<string, number> = {};
    parsedFiles.forEach(file => {
      const ext = file.filePath.toLowerCase();
      let lang: string;
      if (ext.endsWith('.ts') || ext.endsWith('.tsx')) {
        lang = 'typescript';
      } else if (ext.endsWith('.py')) {
        lang = 'python';
      } else if (ext.endsWith('.js') || ext.endsWith('.jsx') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) {
        lang = 'javascript';
      } else if (ext.endsWith('.go')) {
        lang = 'go';
      } else {
        lang = 'other';
      }
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
    });

    return {
      connected: true,
      projectRoot,
      projectName,
      stats: {
        files: summary.totalFiles,
        symbols: summary.totalSymbols,
        edges: summary.totalEdges,
        crossFileEdges: summary.crossFileEdges,
        languages: languageBreakdown,
      },
      mostConnectedFiles: mostConnected.map(f => ({
        path: f.filePath,
        connections: f.incomingCount + f.outgoingCount,
      })),
      summary: `Connected to ${projectName}. Found ${summary.totalFiles} files with ${summary.totalSymbols} symbols and ${summary.crossFileEdges} cross-file edges.`,
    };
  } catch (error) {
    console.error("Error in connectToRepo:", error);
    return {
      error: "Connection failed",
      message: String(error),
    };
  }
}
