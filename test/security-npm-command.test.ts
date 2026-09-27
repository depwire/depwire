import { afterEach, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDependencies } from '../src/security/checks/dependencies.js';

vi.mock('child_process', () => ({ execSync: vi.fn() }));
const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(d => rmSync(d, {recursive:true, force:true})); vi.unstubAllGlobals(); vi.resetAllMocks(); });
function project() {
  const root = mkdtempSync(join(tmpdir(), 'depwire-audit-'));
  dirs.push(root);
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/simple-git': {version:'3.35.2'} } }));
  return root;
}
it('uses identical rendering for successful and nonzero npm audit reports', async () => {
  const payload = readFileSync(new URL('./fixtures/npm-audit/three-cases.json', import.meta.url), 'utf8');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:false}));
  const root = project();
  vi.mocked(execSync).mockReturnValue(payload);
  const success = await checkDependencies([], root);
  vi.mocked(execSync).mockImplementation(() => { throw Object.assign(new Error('exit 1'), {stdout:payload}); });
  const nonzero = await checkDependencies([], root);
  expect(nonzero).toEqual(success);
  expect(nonzero).toHaveLength(3);
  expect(nonzero[1].description).toContain('depwire-cli → simple-git 3.35.2');
});
it.each(['not json', '{"error":{"code":"EAUDITNOLOCK"}}', '{}', '[]', 'null', '{"vulnerabilities":[]}', '{"vulnerabilities":null}'])('retains an audit unavailable finding for %s', async payload => {
  vi.mocked(execSync).mockImplementation(() => { throw Object.assign(new Error('exit 1'), {stdout:payload}); });
  const findings = await checkDependencies([], project());
  expect(findings).toHaveLength(1);
  expect(findings[0].title).toBe('npm audit unavailable');
});

it('accepts a valid clean npm audit report', async () => {
  vi.mocked(execSync).mockReturnValue('{"vulnerabilities":{}}');
  expect(await checkDependencies([], project())).toEqual([]);
});
