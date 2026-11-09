import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCacheStats, openCache, RESOLUTION_VERSION } from '../src/parser/cache.js';

// PR #82 F2: better-sqlite3 12.x ships no Node 20 prebuilds (12.10.0 removed the
// EOL node-v115 builds), so on Node 20 the addon may fail to load and the parse
// cache is unavailable (full reparse, CLI otherwise functional). These tests
// assert cache behaviour and run only on the supported engine floor, Node >=22.
// The gate is an explicit version allowlist — never runtime availability
// detection, which would silently mask real cache regressions on supported Nodes.
const CACHE_ENGINE_SUPPORTED = parseInt(process.version.slice(1), 10) >= 22;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!CACHE_ENGINE_SUPPORTED)('parse cache format migration (requires Node >=22: better-sqlite3 12.x prebuilds)', () => {
  it('does not reuse a cache row written before the block-id version bump', () => {
    const root = mkdtempSync(join(tmpdir(), 'depwire-cache-v1-'));
    roots.push(root);
    writeFileSync(join(root, 'sample.ts'), 'const value = 1;\n');

    const oldCache = openCache(root);
    oldCache.prepare(`
      INSERT INTO file_cache (file_path, mtime, size, content_hash, parsed_data)
      VALUES ('sample.ts', 0, 17, 'old', '{"filePath":"sample.ts","symbols":[],"edges":[]}')
    `).run();
    oldCache.prepare(
      "UPDATE cache_meta SET value = ? WHERE key = 'resolution_version'"
    ).run(String(RESOLUTION_VERSION - 1));
    oldCache.close();

    const migrated = openCache(root);
    expect(getCacheStats(migrated).totalFiles).toBe(0);
    expect(
      migrated.prepare("SELECT value FROM cache_meta WHERE key = 'resolution_version'").get(),
    ).toEqual({ value: String(RESOLUTION_VERSION) });
    migrated.close();
  });
});
