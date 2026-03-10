import { CommitInfo, SamplingStrategy } from './types.js';

export function sampleCommits(
  commits: CommitInfo[],
  targetCount: number,
  strategy: SamplingStrategy
): CommitInfo[] {
  if (commits.length === 0) {
    return [];
  }

  if (commits.length <= targetCount) {
    return commits;
  }

  switch (strategy) {
    case 'even':
      return sampleEvenly(commits, targetCount);
    case 'weekly':
      return sampleWeekly(commits, targetCount);
    case 'monthly':
      return sampleMonthly(commits, targetCount);
    default:
      return sampleEvenly(commits, targetCount);
  }
}

function sampleEvenly(
  commits: CommitInfo[],
  targetCount: number
): CommitInfo[] {
  const result: CommitInfo[] = [];
  const first = commits[0];
  const last = commits[commits.length - 1];

  result.push(first);

  if (targetCount <= 2) {
    if (targetCount === 2) {
      result.push(last);
    }
    return result;
  }

  const step = Math.floor((commits.length - 2) / (targetCount - 2));

  for (let i = 1; i < targetCount - 1; i++) {
    const index = Math.min(i * step, commits.length - 2);
    result.push(commits[index]);
  }

  result.push(last);

  return result;
}

function sampleWeekly(
  commits: CommitInfo[],
  targetCount: number
): CommitInfo[] {
  const result: CommitInfo[] = [];
  const first = commits[0];
  const last = commits[commits.length - 1];

  result.push(first);

  const weekMap = new Map<string, CommitInfo>();

  for (const commit of commits) {
    const date = new Date(commit.date);
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    const key = `${year}-W${week}`;

    weekMap.set(key, commit);
  }

  const weeklyCommits = Array.from(weekMap.values());

  if (weeklyCommits.length <= targetCount) {
    return weeklyCommits;
  }

  const step = Math.floor((weeklyCommits.length - 2) / (targetCount - 2));
  for (let i = 1; i < targetCount - 1; i++) {
    const index = Math.min(i * step, weeklyCommits.length - 2);
    if (weeklyCommits[index] !== first && weeklyCommits[index] !== last) {
      result.push(weeklyCommits[index]);
    }
  }

  if (result[result.length - 1] !== last) {
    result.push(last);
  }

  return result;
}

function sampleMonthly(
  commits: CommitInfo[],
  targetCount: number
): CommitInfo[] {
  const result: CommitInfo[] = [];
  const first = commits[0];
  const last = commits[commits.length - 1];

  result.push(first);

  const monthMap = new Map<string, CommitInfo>();

  for (const commit of commits) {
    const date = new Date(commit.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    monthMap.set(key, commit);
  }

  const monthlyCommits = Array.from(monthMap.values());

  if (monthlyCommits.length <= targetCount) {
    return monthlyCommits;
  }

  const step = Math.floor((monthlyCommits.length - 2) / (targetCount - 2));
  for (let i = 1; i < targetCount - 1; i++) {
    const index = Math.min(i * step, monthlyCommits.length - 2);
    if (monthlyCommits[index] !== first && monthlyCommits[index] !== last) {
      result.push(monthlyCommits[index]);
    }
  }

  if (result[result.length - 1] !== last) {
    result.push(last);
  }

  return result;
}

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
