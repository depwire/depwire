import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { calculateOrphansScore } from '../src/health/metrics.js';
import { calculateWorkspaceOrphansScore } from '../src/health/workspace-metrics.js';

async function measure(label: string, projectRoot: string) {
  const parsed = await parseProject(projectRoot, { useCache: false });
  const graph = buildGraph(parsed, projectRoot);

  const pure = calculateOrphansScore(graph);
  const workspace = calculateWorkspaceOrphansScore(graph, projectRoot);

  console.log(`\n=== ${label} ===`);
  console.log('PURE   (calculateOrphansScore):        ', JSON.stringify(pure.metrics), 'score=', pure.score);
  console.log('WORKSPACE (calculateWorkspaceOrphansScore):', JSON.stringify(workspace.metrics), 'score=', workspace.score);
  console.log('score delta:', workspace.score - pure.score, 'points');
}

await measure('code-graph', process.cwd());
await measure('drizzle-orm', '/Users/atefataya/Developer/drizzle-orm');
