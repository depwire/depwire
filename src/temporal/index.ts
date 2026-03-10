import { join } from 'path';
import { TemporalOptions, TemporalSnapshot } from './types.js';
import {
  getCommitLog,
  getCurrentBranch,
  checkoutCommit,
  restoreOriginal,
  stashChanges,
  popStash,
  isGitRepo,
} from './git.js';
import { sampleCommits } from './sampler.js';
import {
  saveSnapshot,
  loadSnapshot,
  loadAllSnapshots,
  createSnapshot,
} from './snapshots.js';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';
import { exportToJSON } from '../graph/serializer.js';
import { startTemporalServer } from '../viz/temporal-server.js';

export async function runTemporalAnalysis(
  projectDir: string,
  options: TemporalOptions
): Promise<void> {
  if (!isGitRepo(projectDir)) {
    throw new Error('Not a git repository. Temporal analysis requires git history.');
  }

  console.log('🔍 Analyzing git history...');

  const originalBranch = await getCurrentBranch(projectDir);
  const hadStash = await stashChanges(projectDir);

  try {
    const outputDir =
      options.output || join(projectDir, '.depwire', 'temporal');

    const commits = await getCommitLog(projectDir);
    if (commits.length === 0) {
      throw new Error('No commits found in repository');
    }

    console.log(`Found ${commits.length} commits`);

    const sampledCommits = sampleCommits(
      commits,
      options.commits,
      options.strategy
    );
    console.log(
      `Sampled ${sampledCommits.length} commits using ${options.strategy} strategy`
    );

    const snapshots: TemporalSnapshot[] = [];

    for (let i = 0; i < sampledCommits.length; i++) {
      const commit = sampledCommits[i];
      const progress = `[${i + 1}/${sampledCommits.length}]`;

      const existingSnapshot = loadSnapshot(commit.hash, outputDir);
      if (existingSnapshot) {
        if (options.verbose) {
          console.log(
            `${progress} Using cached snapshot for ${commit.hash.substring(0, 8)} - ${commit.message}`
          );
        }
        snapshots.push(existingSnapshot);
        continue;
      }

      if (options.verbose) {
        console.log(
          `${progress} Parsing commit ${commit.hash.substring(0, 8)} - ${commit.message}`
        );
      }

      await checkoutCommit(projectDir, commit.hash);

      const parsedFiles = await parseProject(projectDir);
      const graph = buildGraph(parsedFiles);
      const projectGraph = exportToJSON(graph, projectDir);

      const snapshot = createSnapshot(
        projectGraph,
        commit.hash,
        commit.date,
        commit.message,
        commit.author
      );

      saveSnapshot(snapshot, outputDir);
      snapshots.push(snapshot);
    }

    await restoreOriginal(projectDir, originalBranch);
    if (hadStash) {
      await popStash(projectDir);
    }

    snapshots.reverse();

    console.log(`✓ Created ${snapshots.length} snapshots`);

    if (options.stats) {
      printStats(snapshots);
    }

    console.log('\n🚀 Starting temporal visualization server...');
    await startTemporalServer(snapshots, projectDir, options.port);
  } catch (error) {
    await restoreOriginal(projectDir, originalBranch);
    if (hadStash) {
      await popStash(projectDir);
    }
    throw error;
  }
}

function printStats(snapshots: TemporalSnapshot[]): void {
  console.log('\n📊 Temporal Analysis Statistics:');

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  console.log(
    `\n  Time Range: ${new Date(first.commitDate).toLocaleDateString()} → ${new Date(last.commitDate).toLocaleDateString()}`
  );

  console.log(`\n  Growth:`);
  console.log(
    `    Files:   ${first.stats.totalFiles} → ${last.stats.totalFiles} (${last.stats.totalFiles >= first.stats.totalFiles ? '+' : ''}${last.stats.totalFiles - first.stats.totalFiles})`
  );
  console.log(
    `    Symbols: ${first.stats.totalSymbols} → ${last.stats.totalSymbols} (${last.stats.totalSymbols >= first.stats.totalSymbols ? '+' : ''}${last.stats.totalSymbols - first.stats.totalSymbols})`
  );
  console.log(
    `    Edges:   ${first.stats.totalEdges} → ${last.stats.totalEdges} (${last.stats.totalEdges >= first.stats.totalEdges ? '+' : ''}${last.stats.totalEdges - first.stats.totalEdges})`
  );

  let maxGrowth = { index: 0, files: 0 };
  for (let i = 1; i < snapshots.length; i++) {
    const growth =
      snapshots[i].stats.totalFiles - snapshots[i - 1].stats.totalFiles;
    if (growth > maxGrowth.files) {
      maxGrowth = { index: i, files: growth };
    }
  }

  if (maxGrowth.files > 0) {
    const growthCommit = snapshots[maxGrowth.index];
    console.log(`\n  Biggest Growth Period:`);
    console.log(
      `    +${maxGrowth.files} files at ${new Date(growthCommit.commitDate).toLocaleDateString()}`
    );
    console.log(`    ${growthCommit.commitMessage}`);
  }

  const trend =
    last.stats.totalFiles > first.stats.totalFiles
      ? 'Growing'
      : last.stats.totalFiles < first.stats.totalFiles
        ? 'Shrinking'
        : 'Stable';
  console.log(`\n  Overall Trend: ${trend}`);
}

export { loadAllSnapshots };
