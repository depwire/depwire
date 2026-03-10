import { basename } from 'path';
import { TemporalSnapshot } from '../temporal/types.js';
import { diffSnapshots } from '../temporal/diff.js';

export interface TemporalVizData {
  projectName: string;
  snapshots: Array<{
    commitHash: string;
    commitDate: string;
    commitMessage: string;
    commitAuthor: string;
    stats: {
      totalFiles: number;
      totalSymbols: number;
      totalEdges: number;
      languages: Record<string, number>;
    };
    files: Array<{
      path: string;
      symbols: number;
      connections: number;
    }>;
    arcs: Array<{
      source: string;
      target: string;
      weight: number;
    }>;
    diff?: {
      addedFiles: string[];
      removedFiles: string[];
      addedEdges: Array<{ source: string; target: string }>;
      removedEdges: Array<{ source: string; target: string }>;
      statsChange: {
        files: number;
        symbols: number;
        edges: number;
      };
    };
  }>;
  timeline: Array<{
    index: number;
    date: string;
    shortHash: string;
    message: string;
  }>;
}

export function prepareTemporalVizData(
  snapshots: TemporalSnapshot[],
  projectRoot: string
): TemporalVizData {
  const projectName = basename(projectRoot);

  const snapshotsWithDiff = snapshots.map((snapshot, index) => {
    const diff =
      index > 0 ? diffSnapshots(snapshots[index - 1], snapshot) : undefined;

    return {
      commitHash: snapshot.commitHash,
      commitDate: snapshot.commitDate,
      commitMessage: snapshot.commitMessage,
      commitAuthor: snapshot.commitAuthor,
      stats: snapshot.stats,
      files: snapshot.files,
      arcs: snapshot.edges,
      diff,
    };
  });

  const timeline = snapshots.map((snapshot, index) => ({
    index,
    date: snapshot.commitDate,
    shortHash: snapshot.commitHash.substring(0, 8),
    message: snapshot.commitMessage,
  }));

  return {
    projectName,
    snapshots: snapshotsWithDiff,
    timeline,
  };
}
