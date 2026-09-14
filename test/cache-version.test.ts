import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCacheStats, isCacheAvailable, openCache, RESOLUTION_VERSION } from '../src/parser/cache.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!isCacheAvailable())('parse cache format migration', () => {
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
