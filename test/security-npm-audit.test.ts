import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { npmAuditFindings, loadAdvisoryPatches, type NpmAudit } from '../src/security/npm-audit.js';
import { formatTable, formatJSON, formatSARIF } from '../src/security/reporter.js';
import type { SecurityScanResult } from '../src/security/types.js';

const audit: NpmAudit = JSON.parse(readFileSync(new URL('./fixtures/npm-audit/three-cases.json', import.meta.url), 'utf8'));
const patches = {
  'https://github.com/advisories/GHSA-hffm-xvc3-vprc:simple-git': ['3.36.0'],
  'https://github.com/advisories/GHSA-aaaa-bbbb-cccc:unpatched-fixture': null,
};
const packages = { 'node_modules/simple-git': { version: '3.35.2' } };
function result(): SecurityScanResult {
  const findings = npmAuditFindings(audit, packages, patches);
  findings.forEach((f,i) => f.id = `SEC-${i+1}`);
  return { scannedAt: '', projectRoot: '/fixture', filesScanned: 1, findings, suppressed: [],
    summary: { total:3, high:2, medium:1, low:0, critical:0, info:0, suppressed:0 },
    dependencyAudit: { ran:true, packageManager:'npm', rawOutput:'' } };
}
afterEach(() => vi.unstubAllGlobals());
describe('npm advisory presentation', () => {
  it.each(['table', 'json', 'sarif'])('distinguishes patched, aggregate and unpatched cases in %s', format => {
    const r = result();
    const output = format === 'table' ? formatTable(r, 0) : format === 'json' ? formatJSON(r) : formatSARIF(r, '1.20.0');
    expect(r.findings).toHaveLength(3);
    expect(output).toContain('Vulnerable dependency: simple-git');
    expect(output).toContain('Dependency vulnerable via transitives: depwire-cli');
    expect(output).toContain('depwire-cli → simple-git 3.35.2');
    expect(output).toContain('GHSA-hffm-xvc3-vprc');
    expect(output).toContain('https://github.com/advisories/GHSA-hffm-xvc3-vprc');
    expect(output).toContain('No automatic fix available in this dependency tree.');
    expect(output).toContain('Upstream patch available for simple-git (GHSA-hffm-xvc3-vprc): 3.36.0.');
    expect(output).toContain('No upstream patch exists for unpatched-fixture');
    expect(output).not.toContain('depwire-cli@*');
    expect(output).not.toContain('No fix currently available');
    if (format === 'json') expect(JSON.parse(output).findings).toHaveLength(3);
    if (format === 'sarif') {
      const run = JSON.parse(output).runs[0];
      expect(run.results).toHaveLength(3);
      expect(run.tool.driver.rules[1].help.text).toContain('3.36.0');
    }
  });
  it('does not infer no upstream patch from fixAvailable false', () => {
    const findings = npmAuditFindings(audit);
    expect(findings[1].suggestedFix).toContain('availability unknown');
    expect(findings[2].suggestedFix).not.toContain('No upstream patch exists');
  });
  it('retains multiple-hop, mixed, missing and cyclic via references without dropping findings', () => {
    const input = structuredClone(audit);
    input.vulnerabilities!.wrapper = { severity:'high', range:'*', via:['depwire-cli', 'missing', 'wrapper'], fixAvailable:false };
    input.vulnerabilities!['simple-git'].via.push('unpatched-fixture');
    const findings = npmAuditFindings(input, packages, patches);
    expect(findings).toHaveLength(4);
    expect(findings[3].description).toContain('wrapper → depwire-cli → simple-git 3.35.2');
    expect(findings[3].description).toContain('cyclic audit reference');
    expect(findings[3].description).toContain('advisory details unavailable');
    expect(findings[0].title).toBe('Vulnerable dependency: simple-git');
    expect(findings[0].suggestedFix).toContain('No upstream patch exists for unpatched-fixture');
  });
  it('reads upstream patch metadata and explicit unpatched status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ok:true, json: async () => ({ vulnerabilities:[{
      package: {ecosystem:'npm', name:url.includes('hffm') ? 'simple-git' : 'unpatched-fixture'},
      first_patched_version:url.includes('hffm') ? '3.36.0' : null,
    }] })})));
    expect(await loadAdvisoryPatches(audit)).toEqual(patches);
  });
  it('ignores malformed or withdrawn metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true, json: async () => ({vulnerabilities:{}})}));
    expect(await loadAdvisoryPatches(audit)).toEqual({});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true, json: async () => ({withdrawn_at:'2026-01-01', vulnerabilities:[]})}));
    expect(await loadAdvisoryPatches(audit)).toEqual({});
  });
  it('keeps findings when metadata fails or is rate-limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadAdvisoryPatches(audit)).toEqual({});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:false}));
    expect(await loadAdvisoryPatches(audit)).toEqual({});
  });
});
