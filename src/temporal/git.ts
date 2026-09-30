import { runGit } from '../utils/git.js';
import { CommitInfo } from './types.js';

export async function getCommitLog(
  dir: string,
  limit?: number
): Promise<CommitInfo[]> {
  try {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error(`Invalid git log limit: ${limit}`);
    }
    const args = ['log', ...(limit ? ['-n', String(limit)] : []), '--pretty=format:%H|%aI|%s|%an'];
    const output = runGit(args, { cwd: dir });

    if (!output.trim()) {
      return [];
    }

    return output
      .trim()
      .split('\n')
      .map((line) => {
        const [hash, date, message, author] = line.split('|');
        return { hash, date, message, author };
      });
  } catch (error) {
    throw new Error(`Failed to get git log: ${error}`);
  }
}

export async function getCurrentBranch(dir: string): Promise<string> {
  try {
    return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir }).trim();
  } catch (error) {
    throw new Error(`Failed to get current branch: ${error}`);
  }
}

export async function checkoutCommit(
  dir: string,
  hash: string
): Promise<void> {
  if (!/^[a-f0-9]+$/.test(hash)) {
    throw new Error(`Invalid commit hash: ${hash}`);
  }
  try {
    runGit(['checkout', '-q', hash, '--'], { cwd: dir, stdio: 'ignore' });
  } catch (error) {
    throw new Error(`Failed to checkout commit ${hash}: ${error}`);
  }
}

export async function restoreOriginal(
  dir: string,
  originalBranch: string
): Promise<void> {
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(originalBranch)) {
    throw new Error(`Invalid branch name: ${originalBranch}`);
  }
  try {
    runGit(['checkout', '-q', originalBranch, '--'], { cwd: dir, stdio: 'ignore' });
  } catch (error) {
    throw new Error(`Failed to restore branch ${originalBranch}: ${error}`);
  }
}

export async function stashChanges(dir: string): Promise<boolean> {
  try {
    const status = runGit(['status', '--porcelain'], { cwd: dir }).trim();

    if (status) {
      runGit(['stash', 'push', '-q', '-m', 'depwire temporal analysis'], { cwd: dir, stdio: 'ignore' });
      return true;
    }
    return false;
  } catch (error) {
    throw new Error(`Failed to stash changes: ${error}`);
  }
}

export async function popStash(dir: string): Promise<void> {
  try {
    // Check if there's actually something in the stash
    const stashList = runGit(['stash', 'list'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

    // Only pop if stash is non-empty
    if (stashList) {
      runGit(['stash', 'pop', '-q'], { cwd: dir, stdio: 'ignore' });
    }
  } catch (error) {
    throw new Error(`Failed to restore stashed changes in ${dir}; run git stash list and resolve manually: ${error}`);
  }
}

export function isGitRepo(dir: string): boolean {
  try {
    runGit(['rev-parse', '--git-dir'], { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
