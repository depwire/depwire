import { execSync } from 'child_process';
import { CommitInfo } from './types.js';

export async function getCommitLog(
  dir: string,
  limit?: number
): Promise<CommitInfo[]> {
  try {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error(`Invalid git log limit: ${limit}`);
    }
    const limitArg = limit ? `-n ${limit}` : '';
    const output = execSync(
      `git log ${limitArg} --pretty=format:"%H|%aI|%s|%an"`,
      { cwd: dir, encoding: 'utf-8' }
    );

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
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      encoding: 'utf-8',
    }).trim();
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
    execSync(`git checkout -q ${hash}`, { cwd: dir, stdio: 'ignore' }); // depwire-security-reviewed: hash validated above
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
    execSync(`git checkout -q ${originalBranch}`, { // depwire-security-reviewed: branch validated above
      cwd: dir,
      stdio: 'ignore',
    });
  } catch (error) {
    throw new Error(`Failed to restore branch ${originalBranch}: ${error}`);
  }
}

export async function stashChanges(dir: string): Promise<boolean> {
  try {
    const status = execSync('git status --porcelain', {
      cwd: dir,
      encoding: 'utf-8',
    }).trim();

    if (status) {
      execSync('git stash push -q -m "depwire temporal analysis"', {
        cwd: dir,
        stdio: 'ignore',
      });
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
    const stashList = execSync('git stash list', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
    }).trim();

    // Only pop if stash is non-empty
    if (stashList) {
      execSync('git stash pop -q', { cwd: dir, stdio: 'ignore' });
    }
  } catch (error) {
    // Silently ignore - don't print anything to terminal
  }
}

export function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
