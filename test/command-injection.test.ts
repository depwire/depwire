import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectedGraph } from 'graphology';
import { computeDiff, DiffError } from '../src/core/diff.js';
import { affectedCommand } from '../src/commands/affected.js';
import { generateHistory } from '../src/docs/history.js';
import { checkoutCommit, getCommitLog, restoreOriginal } from '../src/temporal/git.js';
import { isValidGitRevision } from '../src/utils/git.js';

// Every payload below is a valid argument for the git subcommand it targets and,
// if it were ever handed to /bin/sh or cmd.exe as part of a command string, would
// create a file named `pwned` in the repository. `&` separates commands in both
// shells, `echo>pwned` needs no whitespace (whitespace is illegal in branch names).
const MARKER = 'pwned';
const SHELL_REF = `HEAD&echo>${MARKER}`;
// Branch names are stored as loose ref files and '>' is not a legal file name
// character on Windows, so the branch actually created there only carries '&'
// (cmd.exe's command separator); the file-creating payload is POSIX-only. The
// same applies to the file-name payload; cmd.exe does not expand backticks
// anyway, so the Windows variant only checks the path survives intact.
const SHELL_BRANCH = process.platform === 'win32' ? 'x&echo' : `x&echo>${MARKER}`;
const SHELL_FILE = process.platform === 'win32' ? 'a&echo pwned.ts' : `\`echo>${MARKER}\`.ts`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeRepo(extraFile?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'depwire-cmd-injection-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'depwire test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export function a(): number { return 1; }\n');
  if (extraFile) writeFileSync(join(dir, extraFile), 'export const b = 2;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

const repos: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('git revision allowlist', () => {
  it.each(['HEAD', 'HEAD~3', 'HEAD^2', 'main', 'origin/main', 'v1.21.0', 'abc123f', '@{u}', 'HEAD@{1}', 'main..feature', 'refs/heads/x', 'feat/pre-commit-hook'])(
    'accepts %s', ref => { expect(isValidGitRevision(ref)).toBe(true); });

  it.each([SHELL_REF, SHELL_BRANCH, '--output=/tmp/x', '-p', 'HEAD;ls', 'HEAD ls', 'HEAD|ls', 'HEAD$(ls)', 'HEAD`ls`', 'HEAD\nls', '', 'a'.repeat(257), 'ma"in', "ma'in", 'HEAD\\x'])(
    'rejects %j', ref => { expect(isValidGitRevision(ref)).toBe(false); });
});

describe('depwire diff (src/core/diff.ts)', () => {
  it('rejects a crafted <commit> argument before any git call', async () => {
    const dir = makeRepo(); repos.push(dir);
    await expect(computeDiff(SHELL_REF, 'HEAD', dir, { noSecurity: true, noHealth: true }))
      .rejects.toMatchObject({ name: 'DiffError', exitCode: 2, message: `Invalid git ref: "${SHELL_REF}"` });
    expect(existsSync(join(dir, MARKER))).toBe(false);
  });

  it('rejects option-shaped refs and ranges that are not a single commit', async () => {
    const dir = makeRepo(); repos.push(dir);
    await expect(computeDiff('--output=x', 'HEAD', dir, { noSecurity: true, noHealth: true })).rejects.toBeInstanceOf(DiffError);
    await expect(computeDiff('HEAD~0..HEAD', 'HEAD', dir, { noSecurity: true, noHealth: true })).rejects.toBeInstanceOf(DiffError);
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
  });

  it('restores a branch whose name contains shell metacharacters without running them', async () => {
    const dir = makeRepo(); repos.push(dir);
    git(dir, 'checkout', '-q', '-b', SHELL_BRANCH);
    const result = await computeDiff('HEAD', 'HEAD', dir, { noSecurity: true, noHealth: true });
    expect(result.commit_a_resolved).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(dir, MARKER))).toBe(false);
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(SHELL_BRANCH);
    expect(git(dir, 'status', '--porcelain', '--', 'src', MARKER)).toBe('');
  });
});

describe('depwire affected --git-diff (src/commands/affected.ts)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
  });

  it('rejects a crafted --git-diff ref and exits 1', async () => {
    const dir = makeRepo(); repos.push(dir);
    await expect(affectedCommand(undefined, dir, { gitDiff: SHELL_REF, json: true })).rejects.toThrow('exit 1');
    expect(existsSync(join(dir, MARKER))).toBe(false);
  });

  it('still accepts an ordinary ref', async () => {
    const dir = makeRepo(); repos.push(dir);
    writeFileSync(join(dir, 'src', 'a.ts'), 'export function a(): number { return 2; }\n');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await affectedCommand(undefined, dir, { gitDiff: 'HEAD', json: true });
    const printed = JSON.parse(log.mock.calls.map(c => String(c[0])).find(s => s.startsWith('{')) ?? '{}');
    expect(printed.target).toBe('src/a.ts');
  });
});

describe('HISTORY.md generation (src/docs/history.ts)', () => {
  it('passes repository file names to git as arguments, not through a shell', () => {
    const dir = makeRepo(SHELL_FILE); repos.push(dir);
    const graph = new DirectedGraph();
    graph.addNode(`${SHELL_FILE}::b`, { name: 'b', kind: 'variable', filePath: SHELL_FILE, startLine: 1, endLine: 1 });
    graph.addNode('src/a.ts::a', { name: 'a', kind: 'function', filePath: 'src/a.ts', startLine: 1, endLine: 1 });

    const output = generateHistory(graph, dir, '0.0.0-test');

    expect(existsSync(join(dir, MARKER))).toBe(false);
    expect(output).toContain('**Oldest files (foundation):**');
    expect(output).toContain(`\`${SHELL_FILE}\` — added `);
    expect(output).not.toContain('Unable to determine file ages');
    expect(output).toContain('Top 20 most-changed files:');
    expect(output).toMatch(/`src\/a\.ts` \| 1 \|/);
  });
});

describe('temporal analysis (src/temporal/git.ts)', () => {
  it('rejects crafted hashes, branch names and limits', async () => {
    const dir = makeRepo(); repos.push(dir);
    await expect(checkoutCommit(dir, SHELL_REF)).rejects.toThrow('Invalid commit hash');
    await expect(restoreOriginal(dir, SHELL_BRANCH)).rejects.toThrow('Invalid branch name');
    await expect(getCommitLog(dir, `5&echo>${MARKER}` as unknown as number)).rejects.toThrow('Invalid git log limit');
    expect(existsSync(join(dir, MARKER))).toBe(false);
  });

  it('reads the log with a bounded limit', async () => {
    const dir = makeRepo(); repos.push(dir);
    const commits = await getCommitLog(dir, 1);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe('init');
  });
});
