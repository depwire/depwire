import chokidar, { FSWatcher } from 'chokidar';
import { join } from 'path';

export interface WatcherCallbacks {
  onFileChanged: (filePath: string) => void | Promise<void>;
  onFileAdded: (filePath: string) => void | Promise<void>;
  onFileDeleted: (filePath: string) => void | Promise<void>;
}

export function watchProject(projectRoot: string, callbacks: WatcherCallbacks): FSWatcher {
  console.error(`[Watcher] Creating watcher for: ${projectRoot}`);
  
  // Watch the directory directly (glob patterns don't work reliably on all systems)
  // We'll filter by extension in the callbacks
  const watcher = chokidar.watch(projectRoot, {
    ignored: [
      '**/node_modules/**',
      '**/vendor/**',  // Go dependencies
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.*',  // Hidden files and directories
    ],
    ignoreInitial: true,  // Don't fire events for existing files
    persistent: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,  // Wait 300ms after last change before firing
      pollInterval: 100,
    },
  });

  console.error('[Watcher] Attaching event listeners...');

  watcher.on('change', (absolutePath: string) => {
    // Only process TypeScript, JavaScript, Python, and Go files
    const validExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go'];
    if (!validExtensions.some(ext => absolutePath.endsWith(ext))) return;
    
    // Skip Go test files
    if (absolutePath.endsWith('_test.go')) return;
    
    // Convert absolute path to relative path for consistency
    const relativePath = absolutePath.replace(projectRoot + '/', '');
    console.error(`[Watcher] Change event: ${relativePath}`);
    callbacks.onFileChanged(relativePath);
  });

  watcher.on('add', (absolutePath: string) => {
    // Only process TypeScript, JavaScript, Python, and Go files
    const validExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go'];
    if (!validExtensions.some(ext => absolutePath.endsWith(ext))) return;
    
    // Skip Go test files
    if (absolutePath.endsWith('_test.go')) return;
    
    // Convert absolute path to relative path for consistency
    const relativePath = absolutePath.replace(projectRoot + '/', '');
    console.error(`[Watcher] Add event: ${relativePath}`);
    callbacks.onFileAdded(relativePath);
  });

  watcher.on('unlink', (absolutePath: string) => {
    // Only process TypeScript, JavaScript, Python, and Go files
    const validExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go'];
    if (!validExtensions.some(ext => absolutePath.endsWith(ext))) return;
    
    // Skip Go test files
    if (absolutePath.endsWith('_test.go')) return;
    
    // Convert absolute path to relative path for consistency
    const relativePath = absolutePath.replace(projectRoot + '/', '');
    console.error(`[Watcher] Unlink event: ${relativePath}`);
    callbacks.onFileDeleted(relativePath);
  });

  watcher.on('error', (error: Error) => {
    console.error('[Watcher] Error:', error);
  });

  watcher.on('ready', () => {
    console.error('[Watcher] Ready — watching for changes');
    // Log what we're actually watching
    const watched = watcher.getWatched();
    const dirs = Object.keys(watched);
    let fileCount = 0;
    
    // Count .ts, .tsx, .js, .jsx, .mjs, .cjs, .py, and .go files (excluding _test.go)
    for (const dir of dirs) {
      const files = watched[dir];
      fileCount += files.filter(f => 
        f.endsWith('.ts') || f.endsWith('.tsx') || 
        f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.mjs') || f.endsWith('.cjs') ||
        f.endsWith('.py') ||
        (f.endsWith('.go') && !f.endsWith('_test.go'))
      ).length;
    }
    
    console.error(`[Watcher] Watching ${fileCount} TypeScript/JavaScript/Python/Go files in ${dirs.length} directories`);
  });

  watcher.on('all', (event, path) => {
    console.error(`[Watcher] ALL event: ${event} ${path}`);
  });

  return watcher;
}
