import { isWithinRoot } from '../graph/paths.js';
import { simpleGit } from 'simple-git';
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'fs';
import { join, basename, resolve } from 'path';
import { tmpdir, homedir } from 'os';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { getArchitectureSummary } from '../graph/queries.js';
import { watchProject } from '../watcher.js';
import type { DepwireState } from './state.js';
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
  state: DepwireState
): Promise<any> {
  let freshCloneDir: string | undefined;
  try {
    let projectRoot: string;
    let projectName: string;
    let remoteSync: { status: 'current' | 'stale'; analyzedRevision: string | null; pullError?: string } | undefined;

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
      if (projectName === '.' || projectName === '..' || projectName.includes('\\')) {
        return { error: 'Invalid GitHub URL', message: 'Repository name must be a single path segment' };
      }

      // Create temp directory for cloned repos
      const reposDir = join(tmpdir(), 'depwire-repos');
      const cloneDir = join(reposDir, projectName);
      const tempRoot = resolve(tmpdir());
      const canonicalTempRoot = realpathSync(tempRoot);
      // macOS reports its managed temp directory through /var/folders, a symlink to
      // /private/var/folders. Trust only this OS temp location, not arbitrary /var paths.
      const managedMacTemp = process.platform === 'darwin'
        && /^\/var\/folders\/[^/]+\/[^/]+\/T$/.test(tempRoot)
        && isWithinRoot(canonicalTempRoot, '/private/var/folders');
      const tempValidation = validateProjectPath(tempRoot);
      if (!tempValidation.valid && !managedMacTemp) {
        return { error: 'Access denied', message: tempValidation.error };
      }
      mkdirSync(reposDir, { recursive: true });
      if (realpathSync(reposDir) !== join(canonicalTempRoot, 'depwire-repos')
        || (existsSync(cloneDir) && lstatSync(cloneDir).isSymbolicLink())) {
        return { error: 'Access denied', message: 'Clone directory must stay within the managed temp directory' };
      }

      console.error(`Connecting to GitHub repo: ${source}`);

      const git = simpleGit();
      let pullError: string | undefined;

      // Check if already cloned
      if (existsSync(cloneDir)) {
        console.error(`Repo already cloned at ${cloneDir}, pulling latest changes...`);
        try {
          await git.cwd(cloneDir).pull();
        } catch (error) {
          pullError = String(error);
          console.error(`Pull failed, using existing clone: ${pullError}`);
        }
      } else {
        console.error(`Cloning ${source} to ${cloneDir}...`);
        freshCloneDir = cloneDir;
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
      if (subdirectory) {
        const resolvedRoot = resolve(cloneDir);
        const resolvedProject = resolve(projectRoot);
        if (!isWithinRoot(resolvedProject, resolvedRoot)) {
          return { 
            error: 'Access denied', 
            message: 'Subdirectory must be within the project root' 
          };
        }
      }
      if (existsSync(projectRoot)
        && !isWithinRoot(realpathSync(projectRoot), realpathSync(cloneDir))) {
        return { error: 'Access denied', message: 'Subdirectory must be within the project root' };
      }
      const analyzedRevision = await git.cwd(cloneDir).revparse(['HEAD'])
        .then(revision => revision.trim()).catch(() => null);
      remoteSync = {
        status: pullError ? 'stale' : 'current',
        analyzedRevision,
        ...(pullError ? { pullError } : {}),
      };
      if (pullError) console.error(`WARNING: analysing cached revision ${analyzedRevision ?? 'unknown'} after pull failed: ${pullError}`);
    } else {
      // Local path - validate it's safe
      const resolvedSource = resolve(source);
      const validation = validateProjectPath(resolvedSource);
      if (!validation.valid) {
        return {
          error: "Access denied",
          message: validation.error,
        };
      }
      
      if (!existsSync(resolvedSource)) {
        return {
          error: "Directory not found",
          message: `Directory does not exist: ${source}`,
        };
      }

      projectRoot = subdirectory ? join(resolvedSource, subdirectory) : resolvedSource;
      if (subdirectory) {
        const resolvedRoot = resolvedSource;
        const resolvedProject = resolve(projectRoot);
        if (!isWithinRoot(resolvedProject, resolvedRoot)) {
          return { 
            error: 'Access denied', 
            message: 'Subdirectory must be within the project root' 
          };
        }
      }
      projectName = basename(projectRoot);
    }
    
    // Validate final projectRoot path
    const validation = isGitHub ? { valid: true } : validateProjectPath(projectRoot);
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
    const failedFiles = parsedFiles.errorFiles.length;

    if (parsedFiles.length === 0) {
      return {
        error: "No source files found",
        message: failedFiles > 0
          ? `No files parsed in ${projectRoot}. ${failedFiles} files failed.`
          : `No supported source files (.ts, .tsx, .js, .jsx, .py, .go) found in ${projectRoot}`,
        ...(failedFiles > 0 ? { failedFiles, errorFiles: parsedFiles.errorFiles } : {}),
      };
    }

    // Build the graph
    const graph = buildGraph(parsedFiles, projectRoot);

    // Update state
    state.graph = graph;
    state.projectRoot = projectRoot;
    state.projectName = projectName;

    console.error(`Parsed ${parsedFiles.length} files`);
    if (failedFiles > 0) console.error(`${failedFiles} files failed`);

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

    const result = {
      connected: true,
      projectRoot,
      projectName,
      ...(remoteSync ? { remoteSync } : {}),
      stats: {
        files: summary.totalFiles,
        symbols: summary.totalSymbols,
        edges: summary.totalEdges,
        crossFileEdges: summary.crossFileEdges,
        languages: languageBreakdown,
        ...(failedFiles > 0 ? { failedFiles } : {}),
      },
      mostConnectedFiles: mostConnected.map(f => ({
        path: f.filePath,
        connections: f.incomingCount + f.outgoingCount,
      })),
      ...(failedFiles > 0 ? { errorFiles: parsedFiles.errorFiles } : {}),
      summary: `${remoteSync?.status === 'stale' ? `WARNING: Pull failed; analysed cached revision ${remoteSync.analyzedRevision ?? 'unknown'}. ${remoteSync.pullError}\n` : ''}Connected to ${projectName}. Found ${summary.totalFiles} files with ${summary.totalSymbols} symbols and ${summary.crossFileEdges} cross-file edges.${failedFiles > 0 ? `\n${failedFiles} files failed.` : ''}`,
    };
    freshCloneDir = undefined;
    return result;
  } catch (error) {
    console.error("Error in connectToRepo:", error);
    return {
      error: "Connection failed",
      message: String(error),
    };
  } finally {
    if (freshCloneDir) {
      try { rmSync(freshCloneDir, { recursive: true, force: true }); }
      catch (error) { console.error(`Failed to clean up incomplete clone ${freshCloneDir}: ${error}`); }
    }
  }
}
