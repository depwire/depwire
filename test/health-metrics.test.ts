import { describe, expect, it } from 'vitest';
import { DirectedGraph } from 'graphology';
import {
  calculateCohesionScore,
  calculateCouplingScore,
  calculateCircularDepsScore,
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
    graph.addEdge(`file-${first}`, `file-${second}`);
    graph.addEdge(`file-${second}`, `file-${first}`);
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
    expect(calculateCircularDepsScore(withTypeCycle)).toEqual(calculateCircularDepsScore(baseline));
  });

  it('scores empty projects as healthy without dividing by zero', () => {
    const graph = graphWithFiles(0);

    expect(calculateGodFilesScore(graph).score).toBe(100);
    expect(calculateCircularDepsScore(graph).score).toBe(100);
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

  it('scores the recorded cycle distribution by density and preserves exact zero', () => {
    const cases = [
      { files: 42, cycles: 0, density: 0, score: 100 },
      { files: 52, cycles: 11, density: 21.2, score: 20 },
      { files: 178, cycles: 0, density: 0, score: 100 },
      { files: 390, cycles: 1, density: 0.3, score: 80 },
      { files: 874, cycles: 110, density: 12.6, score: 40 }
    ];

    for (const expected of cases) {
      const result = calculateCircularDepsScore(graphWithCycles(expected.files, expected.cycles));

      expect(result.metrics.cycles).toBe(expected.cycles);
      expect(result.metrics.cyclesPer100).toBe(expected.density);
      expect(result.score).toBe(expected.score);
    }
  });
});
