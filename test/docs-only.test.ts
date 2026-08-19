import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = resolve(import.meta.dirname, '../dist/index.js');
const fixturePath = resolve(import.meta.dirname, 'fixtures/sample-project');
const validNames = [
  'architecture', 'conventions', 'dependencies', 'onboarding',
  'files', 'api_surface', 'errors', 'tests', 'history', 'current',
  'status', 'health', 'dead_code',
];

function runDocs(outputDir: string, only: string) {
  return spawnSync(
    process.execPath,
    [cliPath, 'docs', fixturePath, '--update', '--only', only, '--no-gitignore', '--output', outputDir],
    {
      encoding: 'utf8',
      env: { ...process.env, DEPWIRE_NO_TELEMETRY: '1' },
    },
  );
}

describe('depwire docs --only', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'depwire-docs-only-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects every unknown name before generating any document', () => {
    const outputDir = join(tempDir, 'invalid');
    const result = runDocs(outputDir, 'architecture,AGENTS.md,unknown');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown document name(s): AGENTS.md, unknown');
    expect(result.stderr).toContain(`Valid document names: ${validNames.join(', ')}`);
    expect(existsSync(outputDir)).toBe(false);
  });

  it('still generates a valid requested document', () => {
    const outputDir = join(tempDir, 'valid');
    const result = runDocs(outputDir, 'architecture');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Generated files: ARCHITECTURE.md');
    expect(existsSync(join(outputDir, 'ARCHITECTURE.md'))).toBe(true);
  });
});
