import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error Build/verification scripts are JavaScript, outside rootDir.
import { inspectSdkClosure } from '../scripts/check-sdk-closure.mjs';

const root = resolve(import.meta.dirname, '..');

describe('Workers-compatible SDK runtime closure', () => {
  it.each(['src/graph.ts', 'src/tools.ts', 'dist/graph.js', 'dist/tools.js'])(
    'inspects the complete %s closure, including Graphology', async entry => {
      const report = await inspectSdkClosure(entry, root);
      expect(report.files).toContain('node_modules/graphology/dist/graphology.mjs');
      expect(report.externals).toEqual(['events', 'path']);
      expect(report.bundleBytes).toBeGreaterThan(100_000);
    });

  it('rejects forbidden dependencies behind a re-export stub', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'depwire-sdk-closure-'));
    try {
      writeFileSync(join(dir, 'entry.js'), "export { load } from './hidden.js';");
      writeFileSync(join(dir, 'hidden.js'), "import { readFileSync } from 'node:fs'; export const load = readFileSync;");
      await expect(inspectSdkClosure('entry.js', dir)).rejects.toThrow('node:fs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects computed module loading instead of declaring it clean', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'depwire-sdk-dynamic-'));
    try {
      writeFileSync(join(dir, 'entry.js'), 'export function load(name) { return import(name); }');
      await expect(inspectSdkClosure('entry.js', dir)).rejects.toThrow(/Non-static|Incomplete/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
