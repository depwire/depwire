import { afterEach, describe, expect, it } from 'vitest';
import { DirectedGraph } from 'graphology';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SecurityFinding } from '../src/security/types.js';
import { suppressAllowlistedNativeBindings } from '../src/security/native-bindings.js';
import { scanSecurity } from '../src/security/scanner.js';

function lifecycleFinding(packageName: string): SecurityFinding {
  return {
    id: '',
    severity: 'high',
    vulnerabilityClass: 'supply-chain',
    file: `node_modules/${packageName}/package.json`,
    title: `Supply chain risk: ${packageName} has install script`,
    description: `${packageName} runs an install script.`,
    attackScenario: 'A compromised package could execute code during install.',
    suggestedFix: 'Review the install script.',
  };
}

describe('native-binding lifecycle allowlist', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('reports an allowlisted binding as suppressed with severity none and its reason', () => {
    const result = suppressAllowlistedNativeBindings([lifecycleFinding('esbuild')]);

    expect(result.findings).toEqual([]);
    expect(result.suppressed).toEqual([
      expect.objectContaining({
        severity: 'none',
        file: 'node_modules/esbuild/package.json',
        allowlistVersion: 1,
        suppressionReason: expect.stringContaining('platform-specific native executable'),
      }),
    ]);
  });

  it('keeps an unknown native binding as a high finding', () => {
    const finding = lifecycleFinding('unknown-native-addon');
    const result = suppressAllowlistedNativeBindings([finding]);

    expect(result.suppressed).toEqual([]);
    expect(result.findings).toEqual([finding]);
    expect(result.findings[0].severity).toBe('high');
  });

  it('threads both outcomes through the scanner result and summary', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'depwire-native-bindings-'));
    tempDirs.push(projectRoot);
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    writeFileSync(join(projectRoot, 'index.ts'), 'export const value = 1;\n');
    for (const packageName of ['esbuild', 'unknown-native-addon']) {
      const packageDir = join(projectRoot, 'node_modules', packageName);
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
        name: packageName,
        version: '1.0.0',
        scripts: { install: 'node-gyp rebuild' },
      }));
    }

    const result = await scanSecurity(projectRoot, new DirectedGraph(), { graphAware: false });

    expect(result.suppressed).toEqual([
      expect.objectContaining({ file: 'node_modules/esbuild/package.json', severity: 'none' }),
    ]);
    expect(result.summary.suppressed).toBe(1);
    expect(result.findings).toContainEqual(expect.objectContaining({
      file: 'node_modules/unknown-native-addon/package.json',
      severity: 'high',
    }));
  });
});
