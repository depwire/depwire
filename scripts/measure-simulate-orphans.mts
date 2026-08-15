import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { SimulationEngine } from '../src/simulation/engine.js';

const projectRoot = process.cwd();
const parsed = await parseProject(projectRoot, { useCache: true });
const graph = buildGraph(parsed, projectRoot);

const engine = new SimulationEngine(graph);
const result = engine.simulate({ type: 'delete', target: 'src/health/workspace-metrics.ts' });

console.log('healthDelta:', JSON.stringify(result.healthDelta, null, 2));
