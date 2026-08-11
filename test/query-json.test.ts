import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

const cliPath = resolve(import.meta.dirname, '../dist/index.js');

interface QueryResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runQuery(args: string[], cwd: string): QueryResult {
  const result = spawnSync(process.execPath, [cliPath, 'query', ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      DEPWIRE_NO_TELEMETRY: '1',
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('depwire query --json', () => {
  let uniqueDir: string;
  let ambiguousDir: string;
  let emptyDir: string;

  beforeAll(() => {
    uniqueDir = mkdtempSync(join(tmpdir(), 'depwire-query-unique-'));
    writeFileSync(
      join(uniqueDir, 'auth.ts'),
      'export function authenticate(): boolean { return true; }\n',
    );
    writeFileSync(
      join(uniqueDir, 'users.ts'),
      "import { authenticate } from './auth';\nexport function getUser(): boolean { return authenticate(); }\n",
    );
    writeFileSync(
      join(uniqueDir, 'admin.ts'),
      "import { getUser } from './users';\nexport function deleteUser(): boolean { return getUser(); }\n",
    );

    ambiguousDir = mkdtempSync(join(tmpdir(), 'depwire-query-ambiguous-'));
    writeFileSync(
      join(ambiguousDir, 'first.ts'),
      'export function authenticate(): boolean { return true; }\n',
    );
    writeFileSync(
      join(ambiguousDir, 'second.ts'),
      'export function authenticate(): boolean { return false; }\n',
    );

    emptyDir = mkdtempSync(join(tmpdir(), 'depwire-query-empty-'));
  });

  afterAll(() => {
    rmSync(uniqueDir, { recursive: true, force: true });
    rmSync(ambiguousDir, { recursive: true, force: true });
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('resolves a fully-qualified symbol through the existing two-argument form', () => {
    const result = runQuery([uniqueDir, 'auth.ts::authenticate', '--json'], uniqueDir);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.id).toBe('auth.ts::authenticate');
  });

  it('resolves a unique bare name with the directory defaulting to cwd', () => {
    const result = runQuery(['authenticate', '--json'], uniqueDir);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.symbol).toBe('authenticate');
    expect(output.id).toBe('auth.ts::authenticate');
  });

  it('returns exit 3 and every match for an ambiguous bare name', () => {
    const result = runQuery(['authenticate', '--json'], ambiguousDir);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(3);
    expect(output.error).toBe('ambiguous');
    expect(output.matches).toHaveLength(2);
    expect(output.matches.map((match: { id: string }) => match.id).sort()).toEqual([
      'first.ts::authenticate',
      'second.ts::authenticate',
    ]);
  });

  it('returns exit 1 for a nonexistent symbol', () => {
    const result = runQuery(['nosuchsymbol', '--json'], uniqueDir);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.error).toBe('not_found');
  });

  it('returns exit 2 for a directory with no parseable files', () => {
    const result = runQuery([emptyDir, 'anything', '--json'], uniqueDir);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(2);
    expect(output.error).toBe('no_parseable_files');
  });

  it('writes exactly one parseable JSON value to stdout', () => {
    const result = runQuery(['authenticate', '--json'], uniqueDir);

    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.trimStart().startsWith('{')).toBe(true);
    expect(result.stderr).toContain('Parsing project...');
  });

  it('reports direct dependents at depth 1 and transitive dependents at depth 2 or greater', () => {
    const result = runQuery(['authenticate', '--json'], uniqueDir);
    const output = JSON.parse(result.stdout);

    expect(output.directDependents.length).toBeGreaterThan(0);
    expect(output.directDependents.every((dependent: { depth: number }) => dependent.depth === 1)).toBe(true);
    expect(output.transitiveDependents.length).toBeGreaterThan(0);
    expect(output.transitiveDependents.every((dependent: { depth: number }) => dependent.depth >= 2)).toBe(true);
  });

  it('preserves the existing human-readable output without --json', () => {
    const result = runQuery(['.', 'authenticate'], uniqueDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'Parsing project...\n' +
      '=== Impact Analysis: authenticate (function) ===\n' +
      'Location: auth.ts:1-1\n' +
      '\nDirect Dependents: 2\n' +
      '  - __file__ (import) in users.ts:1\n' +
      '  - getUser (function) in users.ts:2\n' +
      '\nTotal Transitive Dependents: 4\n' +
      'Affected Files: 2\n' +
      '  - admin.ts\n' +
      '  - users.ts\n' +
      '\n',
    );
  });
});
