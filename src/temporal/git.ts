import { execSync } from 'child_process';
import { CommitInfo } from './types.js';

export async function getCommitLog(
  dir: string,
  limit?: number
): Promise<CommitInfo[]> {
  try {
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
  try {
    execSync(`git checkout -q ${hash}`, { cwd: dir, stdio: 'ignore' });
  } catch (error) {
    throw new Error(`Failed to checkout commit ${hash}: ${error}`);
  }
}

export async function restoreOriginal(
  dir: string,
  originalBranch: string
): Promise<void> {
  try {
    execSync(`git checkout -q ${originalBranch}`, {
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
    execSync('git stash pop -q', { cwd: dir, stdio: 'ignore' });
  } catch (error) {
    console.warn('Warning: Failed to restore stashed changes:', error);
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
