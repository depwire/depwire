import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'child_process';

/**
 * Revision syntax we accept from the command line or MCP arguments:
 * branch/tag names, hashes, HEAD~N, HEAD^2, @{u}, origin/main, A..B, A...B.
 * Anything else — leading '-', whitespace, shell metacharacters, control
 * characters — is rejected rather than escaped. Git itself never sees the
 * string through a shell (see runGit), so the allowlist only has to keep
 * option injection and nonsense out.
 */
const GIT_REVISION_PATTERN = /^[A-Za-z0-9_@][A-Za-z0-9._\/~^@{}:-]*$/;
const MAX_REVISION_LENGTH = 256;

export function isValidGitRevision(ref: unknown): ref is string {
  return typeof ref === 'string'
    && ref.length > 0
    && ref.length <= MAX_REVISION_LENGTH
    && GIT_REVISION_PATTERN.test(ref);
}

export function assertGitRevision(ref: unknown): string {
  if (!isValidGitRevision(ref)) {
    throw new Error(`Invalid git ref: "${String(ref)}"`);
  }
  return ref;
}

export type RunGitOptions = Omit<ExecFileSyncOptionsWithStringEncoding, 'encoding' | 'shell'>;

/**
 * Run git with an argument array. No shell is ever involved, so revision
 * names, branch names and file paths cannot break out of their argument.
 * Every argument that can carry user or repository input must still be
 * guarded against starting with '-' by the caller (see assertGitRevision)
 * or placed after '--'.
 */
export function runGit(args: readonly string[], options: RunGitOptions): string {
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) {
      throw new Error('Invalid git argument');
    }
  }
  return execFileSync('git', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
    encoding: 'utf-8',
    shell: false,
  });
}
