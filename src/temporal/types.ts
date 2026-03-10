export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface TemporalSnapshot {
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
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export interface TemporalDiff {
  addedFiles: string[];
  removedFiles: string[];
  addedEdges: Array<{ source: string; target: string }>;
  removedEdges: Array<{ source: string; target: string }>;
  statsChange: {
    files: number;
    symbols: number;
    edges: number;
  };
}

export type SamplingStrategy = 'even' | 'weekly' | 'monthly';

export interface TemporalOptions {
  commits: number;
  strategy: SamplingStrategy;
  port: number;
  output?: string;
  verbose?: boolean;
  stats?: boolean;
}
