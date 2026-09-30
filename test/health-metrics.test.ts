import { describe, expect, it } from 'vitest';
import { DirectedGraph } from 'graphology';
import {
  calculateCohesionScore,
  calculateCouplingScore,
  calculateCyclicGroupsScore,
  calculateGodFilesScore
} from '../src/health/metrics.js';

function graphWithFiles(fileCount: number): DirectedGraph {
  const graph = new DirectedGraph();

  for (let i = 0; i < fileCount; i++) {
    graph.addNode(`file-${i}`, { filePath: `src/file-${i}.ts` });
  }

  return graph;
}

function graphWithGodFiles(fileCount: number, godFileCount: number): DirectedGraph {
  const graph = graphWithFiles(fileCount);
  const nonGodFileCount = fileCount - godFileCount;
  const connectionsPerGodFile = godFileCount >= 20 ? 100
    : godFileCount >= 10 ? 50
      : godFileCount >= 6 ? 30
        : 20;

  for (let godFile = 0; godFile < godFileCount; godFile++) {
    for (let connection = 0; connection < connectionsPerGodFile; connection++) {
      const target = godFileCount + ((godFile * connectionsPerGodFile + connection) % nonGodFileCount);
      graph.addEdge(`file-${godFile}`, `file-${target}`);
    }
  }

  return graph;
}

function graphWithCycles(fileCount: number, cycleCount: number): DirectedGraph {
  const graph = graphWithFiles(fileCount);

  for (let cycle = 0; cycle < cycleCount; cycle++) {
    const first = cycle * 2;
    const second = first + 1;
    graph.addEdge(`file-${first}`, `file-${second}`, {kind:"imports"});
    graph.addEdge(`file-${second}`, `file-${first}`, {kind:"imports"});
  }

  return graph;
}

describe('size-normalized health dimensions', () => {
  it('excludes references-type edges from coupling, cohesion, and circular dependencies', () => {
    const baseline = graphWithFiles(2);
    const withTypeCycle = graphWithFiles(2);
    withTypeCycle.addEdge('file-0', 'file-1', { kind: 'references-type' });
    withTypeCycle.addEdge('file-1', 'file-0', { kind: 'references-type' });

    expect(calculateCouplingScore(withTypeCycle)).toEqual(calculateCouplingScore(baseline));
    expect(calculateCohesionScore(withTypeCycle)).toEqual(calculateCohesionScore(baseline));
    expect(calculateCyclicGroupsScore(withTypeCycle)).toEqual(calculateCyclicGroupsScore(baseline));
  });

  it('does not score absent cyclic-group evidence as healthy', () => {
    const graph = graphWithFiles(0);

    expect(calculateGodFilesScore(graph).score).toBe(100);
    expect(calculateCyclicGroupsScore(graph).score).toBeNaN();
  });

  it('scores the recorded god-file distribution by density', () => {
    const cases = [
      { files: 42, godFiles: 1, density: 2.4, score: 80 },
      { files: 52, godFiles: 3, density: 5.8, score: 60 },
      { files: 178, godFiles: 6, density: 3.4, score: 60 },
      { files: 390, godFiles: 10, density: 2.6, score: 80 },
      { files: 874, godFiles: 50, density: 5.7, score: 60 }
    ];

    for (const expected of cases) {
      const result = calculateGodFilesScore(graphWithGodFiles(expected.files, expected.godFiles));

      expect(result.metrics.godFiles).toBe(expected.godFiles);
      expect(result.metrics.godFilesPer100).toBe(expected.density);
      expect(result.score).toBe(expected.score);
    }
  });

  it('scores cyclic file coverage and reports group count separately', () => {
    const result = calculateCyclicGroupsScore(graphWithCycles(100, 2));
    expect(result.metrics.groupCount).toBe(2);
    expect(result.metrics.cyclicFileCount).toBe(4);
    expect(result.metrics.cyclicFileRatio).toBe(0.04);
    expect(result.metrics.largestGroupSize).toBe(2);
    expect(result.score).toBe(84);
  });
});
