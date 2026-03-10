import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { TemporalSnapshot } from './types.js';
import { ProjectGraph } from '../parser/types.js';

export function saveSnapshot(
  snapshot: TemporalSnapshot,
  outputDir: string
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${snapshot.commitHash.substring(0, 8)}.json`;
  const filepath = join(outputDir, filename);

  writeFileSync(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export function loadSnapshot(
  commitHash: string,
  outputDir: string
): TemporalSnapshot | null {
  const shortHash = commitHash.substring(0, 8);
  const filepath = join(outputDir, `${shortHash}.json`);

  if (!existsSync(filepath)) {
    return null;
  }

  try {
    const content = readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function loadAllSnapshots(outputDir: string): TemporalSnapshot[] {
  if (!existsSync(outputDir)) {
    return [];
  }

  const files = readdirSync(outputDir).filter((f) => f.endsWith('.json'));
  const snapshots: TemporalSnapshot[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(outputDir, file), 'utf-8');
      snapshots.push(JSON.parse(content));
    } catch {
      continue;
    }
  }

  return snapshots.sort(
    (a, b) =>
      new Date(a.commitDate).getTime() - new Date(b.commitDate).getTime()
  );
}

export function createSnapshot(
  graph: ProjectGraph,
  commitHash: string,
  commitDate: string,
  commitMessage: string,
  commitAuthor: string
): TemporalSnapshot {
  const fileMap = new Map<
    string,
    { symbols: number; inbound: number; outbound: number }
  >();

  for (const node of graph.nodes) {
    if (!fileMap.has(node.filePath)) {
      fileMap.set(node.filePath, { symbols: 0, inbound: 0, outbound: 0 });
    }
    fileMap.get(node.filePath)!.symbols++;
  }

  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);

    if (sourceNode && targetNode && sourceNode.filePath !== targetNode.filePath) {
      if (fileMap.has(sourceNode.filePath)) {
        fileMap.get(sourceNode.filePath)!.outbound++;
      }
      if (fileMap.has(targetNode.filePath)) {
        fileMap.get(targetNode.filePath)!.inbound++;
      }
    }
  }

  const files = Array.from(fileMap.entries()).map(([path, data]) => ({
    path,
    symbols: data.symbols,
    connections: data.inbound + data.outbound,
  }));

  const edgeMap = new Map<string, number>();

  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);

    if (sourceNode && targetNode && sourceNode.filePath !== targetNode.filePath) {
      const key =
        sourceNode.filePath < targetNode.filePath
          ? `${sourceNode.filePath}|${targetNode.filePath}`
          : `${targetNode.filePath}|${sourceNode.filePath}`;

      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }

  const edges = Array.from(edgeMap.entries()).map(([key, weight]) => {
    const [source, target] = key.split('|');
    return { source, target, weight };
  });

  const languages: Record<string, number> = {};
  for (const file of graph.files) {
    const ext = file.split('.').pop() || 'unknown';
    const lang =
      ext === 'ts' || ext === 'tsx'
        ? 'typescript'
        : ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs'
          ? 'javascript'
          : ext === 'py'
            ? 'python'
            : ext === 'go'
              ? 'go'
              : 'other';

    languages[lang] = (languages[lang] || 0) + 1;
  }

  return {
    commitHash,
    commitDate,
    commitMessage,
    commitAuthor,
    stats: {
      totalFiles: graph.files.length,
      totalSymbols: graph.nodes.length,
      totalEdges: edges.length,
      languages,
    },
    files,
    edges,
  };
}
