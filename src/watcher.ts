import chokidar, { FSWatcher } from 'chokidar';
import { relative } from 'path';

export interface WatcherCallbacks {
  onFileChanged: (filePath: string) => void | Promise<void>;
  onFileAdded: (filePath: string) => void | Promise<void>;
  onFileDeleted: (filePath: string) => void | Promise<void>;
}

export function watchProject(projectRoot: string, callbacks: WatcherCallbacks): FSWatcher {
  const watcher = chokidar.watch(['**/*.ts', '**/*.tsx'], {
    cwd: projectRoot,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.*',  // Hidden directories
    ],
    ignoreInitial: true,  // Don't fire events for existing files
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,  // Wait 300ms after last change before firing
      pollInterval: 100,
    },
  });

  watcher.on('change', (filePath: string) => {
    const relativePath = relative(projectRoot, filePath);
    callbacks.onFileChanged(relativePath);
  });

  watcher.on('add', (filePath: string) => {
    const relativePath = relative(projectRoot, filePath);
    callbacks.onFileAdded(relativePath);
  });

  watcher.on('unlink', (filePath: string) => {
    const relativePath = relative(projectRoot, filePath);
    callbacks.onFileDeleted(relativePath);
  });

  watcher.on('error', (error: Error) => {
    console.error('File watcher error:', error);
  });

  return watcher;
}
