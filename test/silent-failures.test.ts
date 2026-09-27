import { afterEach, describe, expect, it } from 'vitest';
import { DirectedGraph } from 'graphology';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateHealth } from '../src/docs/health.js';
import { generateDeadCode } from '../src/docs/dead-code.js';
import { scanDirectory } from '../src/utils/files.js';
import { updateFileInGraph } from '../src/graph/updater.js';
import { scanSecurity } from '../src/security/scanner.js';

const dirs: string[] = [];
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'depwire-failures-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe('failure propagation', () => {
  it('does not return an empty listing for a failed directory scan', () => {
    expect(() => scanDirectory(join(temp(), 'missing'))).toThrow('Error scanning directory');
  });

  it('rejects a failed watcher update and preserves the previous file graph', async () => {
    const graph = new DirectedGraph();
    graph.addNode('old', { filePath: 'missing.ts', name: 'old' });
    const before = graph.export();
    await expect(updateFileInGraph(graph, temp(), 'missing.ts')).rejects.toThrow();
    expect(graph.export()).toEqual(before);
  });

  it('does not return a clean security report for an empty project', async () => {
    await expect(scanSecurity(temp(), new DirectedGraph())).rejects.toThrow('No parseable files');
  });

  it('does not return a clean security report for an unmatched target', async () => {
    const root = temp();
    writeFileSync(join(root, 'index.ts'), 'export const value = 1;');
    await expect(scanSecurity(root, new DirectedGraph(), { target: 'missing.ts' }))
      .rejects.toThrow('No parseable files found for security scan target');
  });
});

it('rejects security scans when only part of the project parsed', async () => {
  const root = temp();
  writeFileSync(join(root, 'valid.ts'), 'export const value = 1;');
  writeFileSync(join(root, 'unreadable.ts'), 'export const hidden = 1;');
  chmodSync(join(root, 'unreadable.ts'), 0o000);
  await expect(scanSecurity(root, new DirectedGraph())).rejects.toThrow('1 files failed to parse');
});

it('does not render no dead code detected for an empty graph', () => {
  const report = generateDeadCode(new DirectedGraph(), temp(), 'empty');
  expect(report).toContain('Nothing was analyzed');
  expect(report).not.toContain('No dead code detected');
});

it('does not render no critical issues detected for an unscored health graph', () => {
  const report = generateHealth(new DirectedGraph(), temp(), 'test');
  expect(report).toContain('Nothing was analyzed');
  expect(report).not.toContain('No critical issues detected');
  expect(report).not.toContain('NaN/100');
});
