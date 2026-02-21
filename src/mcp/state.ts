import { DirectedGraph } from 'graphology';
import type { FSWatcher } from 'chokidar';

export interface CodeGraphState {
  graph: DirectedGraph | null;
  projectRoot: string | null;
  projectName: string | null;
  watcher: FSWatcher | null;
}

export function createEmptyState(): CodeGraphState {
  return {
    graph: null,
    projectRoot: null,
    projectName: null,
    watcher: null,
  };
}

export function isProjectLoaded(state: CodeGraphState): boolean {
  return state.graph !== null && state.projectRoot !== null;
}
