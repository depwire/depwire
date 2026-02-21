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
    // Only process TypeScript files
    if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) return;
    
    // Convert absolute path to relative path for consistency
    const relativePath = absolutePath.replace(projectRoot + '/', '');
    console.error(`[Watcher] Change event: ${relativePath}`);
    callbacks.onFileChanged(relativePath);
  });

  watcher.on('add', (absolutePath: string) => {
    // Only process TypeScript files
    if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) return;
    
    // Convert absolute path to relative path for consistency
    const relativePath = absolutePath.replace(projectRoot + '/', '');
    console.error(`[Watcher] Add event: ${relativePath}`);
    callbacks.onFileAdded(relativePath);
  });

  watcher.on('unlink', (absolutePath: string) => {
    // Only process TypeScript files
    if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) return;
    
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
    let tsFileCount = 0;
    
    // Count .ts and .tsx files
    for (const dir of dirs) {
      const files = watched[dir];
      tsFileCount += files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).length;
    }
    
    console.error(`[Watcher] Watching ${tsFileCount} TypeScript files in ${dirs.length} directories`);
  });

  watcher.on('all', (event, path) => {
    console.error(`[Watcher] ALL event: ${event} ${path}`);
  });

  return watcher;
}
