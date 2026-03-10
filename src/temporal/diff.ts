import { TemporalSnapshot, TemporalDiff } from './types.js';

export function diffSnapshots(
  previous: TemporalSnapshot,
  current: TemporalSnapshot
): TemporalDiff {
  const prevFiles = new Set(previous.files.map((f) => f.path));
  const currFiles = new Set(current.files.map((f) => f.path));

  const addedFiles = Array.from(currFiles).filter((f) => !prevFiles.has(f));
  const removedFiles = Array.from(prevFiles).filter((f) => !currFiles.has(f));

  const prevEdges = new Set(
    previous.edges.map((e) => `${e.source}|${e.target}`)
  );
  const currEdges = new Set(current.edges.map((e) => `${e.source}|${e.target}`));

  const addedEdgeKeys = Array.from(currEdges).filter((e) => !prevEdges.has(e));
  const removedEdgeKeys = Array.from(prevEdges).filter((e) => !currEdges.has(e));

  const addedEdges = addedEdgeKeys.map((key) => {
    const [source, target] = key.split('|');
    return { source, target };
  });

  const removedEdges = removedEdgeKeys.map((key) => {
    const [source, target] = key.split('|');
    return { source, target };
  });

  return {
    addedFiles,
    removedFiles,
    addedEdges,
    removedEdges,
    statsChange: {
      files: current.stats.totalFiles - previous.stats.totalFiles,
      symbols: current.stats.totalSymbols - previous.stats.totalSymbols,
      edges: current.stats.totalEdges - previous.stats.totalEdges,
    },
  };
}
