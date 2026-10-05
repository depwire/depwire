import { afterEach, expect, it, vi } from 'vitest';
import { DirectedGraph } from 'graphology';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../src/security/checks/dependencies.js', () => ({
  checkDependencies: vi.fn(async () => []),
}));

import { checkDependencies } from '../src/security/checks/dependencies.js';
import { scanSecurity } from '../src/security/scanner.js';
import { formatTable } from '../src/security/reporter.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.mocked(checkDependencies).mockClear();
});

it('skips dependency audits when opted out or when selected classes exclude them', async () => {
  const root = mkdtempSync(join(tmpdir(), 'depwire-offline-security-'));
  roots.push(root);
  writeFileSync(join(root, 'index.ts'), 'export const value = 1;\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { example: '^1.0.0' } }));
  const graph = new DirectedGraph();
  graph.addNode('index.ts::value', { filePath: 'index.ts', name: 'value', kind: 'variable' });

  const offline = await scanSecurity(root, graph, { dependencyAudit: false });
  expect(checkDependencies).not.toHaveBeenCalled();
  expect(offline.dependencyAudit.skippedReason).toBe('disabled');
  expect(formatTable(offline, 0)).toContain('Dependency CVE and supply-chain checks skipped');

  const secrets = await scanSecurity(root, graph, { classes: ['secrets'] });
  expect(checkDependencies).not.toHaveBeenCalled();
  expect(secrets.dependencyAudit.skippedReason).toBe('class-filter');

  await scanSecurity(root, graph, { classes: ['dependency-cve'] });
  expect(checkDependencies).toHaveBeenCalledTimes(1);
});
