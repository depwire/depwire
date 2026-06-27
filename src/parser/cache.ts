/**
 * SQLite-backed parse cache.
 *
 * Stores each ParsedFile as JSON keyed by its project-relative path, alongside
 * the file's mtime, size and a content hash. On a subsequent parse of the same
 * project, unchanged files are restored from cache instead of being re-parsed.
 *
 * The cache lives at {projectRoot}/.depwire/cache.db (git-ignored). It contains
 * only derived data — deleting it is always safe and simply forces a cold parse.
 *
 * Cache validity (per file, independent of every other file):
 *   - miss  : no cached row
 *   - miss  : current size  !== cached size
 *   - hit   : current mtime === cached mtime            (fast path)
 *   - hit   : mtime differs but content hash matches     (secondary check)
 *   - miss  : mtime differs and content hash differs
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, openSync, readSync, closeSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { ParsedFile } from './types.js';

/** Number of leading bytes of a file hashed for the secondary content check. */
const HASH_BYTES = 4096;

function cacheDir(projectRoot: string): string {
  return join(projectRoot, '.depwire');
}

function cacheDbPath(projectRoot: string): string {
  return join(cacheDir(projectRoot), 'cache.db');
}

/**
 * Compute a sha256 hash of the first {@link HASH_BYTES} bytes of a file.
 * Reads only the leading chunk so hashing stays cheap on large files.
 */
function hashFileHead(absPath: string): string {
  const buffer = Buffer.alloc(HASH_BYTES);
  let fd: number | undefined;
  try {
    fd = openSync(absPath, 'r');
    const bytesRead = readSync(fd, buffer, 0, HASH_BYTES, 0);
    return createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Open (or create) the parse cache for a project.
 * Creates the .depwire/ directory and required tables if missing.
 */
export function openCache(projectRoot: string): Database.Database {
  const dir = cacheDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(cacheDbPath(projectRoot));
  // WAL improves write throughput for the per-file upserts below.
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_cache (
      file_path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      parsed_data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

interface CacheRow {
  mtime: number;
  size: number;
  content_hash: string;
  parsed_data: string;
}

/**
 * Return cached ParsedFile entries that are still valid for the given files.
 *
 * @param db            Open cache database.
 * @param projectRoot   Absolute project root (used to resolve relative paths).
 * @param relativePaths Project-relative file paths to look up.
 * @returns Map of relative path -> ParsedFile for valid cache hits only.
 *
 * Note: projectRoot is required (and is an intentional addition to the brief's
 * signature) because ParsedFile.filePath is project-relative while statSync
 * needs an absolute path.
 */
export function getCachedFiles(
  db: Database.Database,
  projectRoot: string,
  relativePaths: string[]
): Map<string, ParsedFile> {
  const result = new Map<string, ParsedFile>();
  const select = db.prepare<[string], CacheRow>(
    'SELECT mtime, size, content_hash, parsed_data FROM file_cache WHERE file_path = ?'
  );

  for (const relPath of relativePaths) {
    const row = select.get(relPath);
    if (!row) continue;

    const absPath = join(projectRoot, relPath);
    let stats;
    try {
      stats = statSync(absPath);
    } catch {
      continue; // file vanished — treat as miss
    }

    const size = stats.size;
    if (size !== row.size) continue; // definitely changed

    const mtime = Math.floor(stats.mtimeMs);
    if (mtime !== row.mtime) {
      // Secondary check: file touched but content may be identical.
      let hash: string;
      try {
        hash = hashFileHead(absPath);
      } catch {
        continue;
      }
      if (hash !== row.content_hash) continue; // content actually changed
    }

    try {
      result.set(relPath, JSON.parse(row.parsed_data) as ParsedFile);
    } catch {
      // Corrupt JSON — skip so the file is re-parsed.
      continue;
    }
  }

  return result;
}

/**
 * Upsert freshly parsed files into the cache. Wrapped in a single transaction
 * for throughput. Files that can no longer be stat-ed are skipped.
 *
 * @param db          Open cache database.
 * @param projectRoot Absolute project root (resolves relative paths to stat).
 * @param parsedFiles Newly parsed files to persist.
 */
export function updateCache(
  db: Database.Database,
  projectRoot: string,
  parsedFiles: ParsedFile[]
): void {
  const upsert = db.prepare(
    `INSERT INTO file_cache (file_path, mtime, size, content_hash, parsed_data)
     VALUES (@file_path, @mtime, @size, @content_hash, @parsed_data)
     ON CONFLICT(file_path) DO UPDATE SET
       mtime = excluded.mtime,
       size = excluded.size,
       content_hash = excluded.content_hash,
       parsed_data = excluded.parsed_data`
  );

  const writeAll = db.transaction((files: ParsedFile[]) => {
    for (const file of files) {
      const absPath = join(projectRoot, file.filePath);
      let stats;
      try {
        stats = statSync(absPath);
      } catch {
        continue;
      }
      let contentHash: string;
      try {
        contentHash = hashFileHead(absPath);
      } catch {
        continue;
      }
      upsert.run({
        file_path: file.filePath,
        mtime: Math.floor(stats.mtimeMs),
        size: stats.size,
        content_hash: contentHash,
        parsed_data: JSON.stringify(file),
      });
    }
  });

  writeAll(parsedFiles);
}

/** Cache statistics: number of cached files and the on-disk db size in bytes. */
export function getCacheStats(db: Database.Database): { totalFiles: number; cacheSize: number } {
  const row = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM file_cache').get();
  const totalFiles = row?.count ?? 0;

  let cacheSize = 0;
  try {
    cacheSize = statSync(db.name).size;
  } catch {
    cacheSize = 0;
  }

  return { totalFiles, cacheSize };
}

/**
 * Delete the cache database for a project, including WAL/SHM sidecar files.
 * Safe to call when no cache exists.
 */
export function clearCache(projectRoot: string): void {
  const base = cacheDbPath(projectRoot);
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(base + suffix, { force: true });
  }
}
