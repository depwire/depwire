import { DirectedGraph } from 'graphology';
import type { FSWatcher } from 'chokidar';

export interface DepwireState {
  graph: DirectedGraph | null;
  projectRoot: string | null;
  projectName: string | null;
  watcher: FSWatcher | null;
}

export function createEmptyState(): DepwireState {
  return {
    graph: null,
    projectRoot: null,
    projectName: null,
    watcher: null,
  };
}

export function isProjectLoaded(state: DepwireState): boolean {
  return state.graph !== null && state.projectRoot !== null;
}
