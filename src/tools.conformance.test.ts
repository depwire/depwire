import { describe, expect, it } from 'vitest';
import { DirectedGraph } from 'graphology';
import { getToolsList, handleToolCall } from './mcp/tools.js';
import type { DepwireState } from './mcp/state.js';
import {
  toolRegistry,
  type PrecomputedResult,
  type ToolContext,
} from './tools.js';

function createConformanceGraph(): DirectedGraph {
  const graph = new DirectedGraph();

  graph.addNode('src/a.ts::Foo', {
    name: 'Foo',
    kind: 'class',
    filePath: 'src/a.ts',
    startLine: 1,
    endLine: 10,
    exported: true,
  });
  graph.addNode('src/a.ts::helperA', {
    name: 'helperA',
    kind: 'function',
    filePath: 'src/a.ts',
    startLine: 12,
    endLine: 20,
    exported: true,
  });
  graph.addNode('src/b.ts::Bar', {
    name: 'Bar',
    kind: 'class',
    filePath: 'src/b.ts',
    startLine: 1,
    endLine: 15,
    exported: true,
  });
  graph.addNode('src/c.ts::Baz', {
    name: 'Baz',
    kind: 'function',
    filePath: 'src/c.ts',
    startLine: 1,
    endLine: 8,
    exported: false,
  });
  graph.addNode('test/a.test.ts::coversFoo', {
    name: 'coversFoo',
    kind: 'function',
    filePath: 'test/a.test.ts',
    startLine: 1,
    endLine: 6,
    exported: false,
  });

  graph.mergeEdge('src/b.ts::Bar', 'src/a.ts::Foo', {
    kind: 'import',
    filePath: 'src/b.ts',
    line: 1,
  });
  graph.mergeEdge('src/c.ts::Baz', 'src/a.ts::Foo', {
    kind: 'call',
    filePath: 'src/c.ts',
    line: 3,
  });
  graph.mergeEdge('src/c.ts::Baz', 'src/b.ts::Bar', {
    kind: 'import',
    filePath: 'src/c.ts',
    line: 1,
  });
  graph.mergeEdge('test/a.test.ts::coversFoo', 'src/c.ts::Baz', {
    kind: 'call',
    filePath: 'test/a.test.ts',
    line: 2,
  });

  return graph;
}

const cases: Array<{ name: string; args: Record<string, any> }> = [
  { name: 'get_symbol_info', args: { name: 'Foo' } },
  { name: 'get_dependencies', args: { symbol: 'Bar' } },
  { name: 'get_dependents', args: { symbol: 'Foo' } },
  { name: 'impact_analysis', args: { symbol: 'Foo', file: './src/a.ts' } },
  { name: 'get_file_context', args: { filePath: './src/a.ts', startLine: 1, endLine: 20 } },
  { name: 'search_symbols', args: { query: 'a', limit: 10 } },
  { name: 'get_architecture_summary', args: {} },
  { name: 'list_files', args: { directory: './src' } },
  { name: 'simulate_change', args: { operation: 'delete', target: './src/a.ts' } },
  { name: 'affected_files', args: { file_path: './src/a.ts', max_depth: 5, tests_only: false } },
];

describe('pure tool registry conformance', () => {
  it.each(cases)('$name matches the existing MCP path', async ({ name, args }) => {
    const graph = createConformanceGraph();
    const state: DepwireState = {
      graph,
      projectRoot: '/repo',
      projectName: 'fixture',
      watcher: null,
    };
    const context: ToolContext = {
      graph,
      getRepoMeta: () => ({ name: 'fixture', root: '/repo' }),
      getPrecomputed: async <T>(): Promise<PrecomputedResult<T>> => ({
        status: 'unavailable',
        reason: 'Not used by graph tools',
      }),
    };
    const existingDefinition = getToolsList().find(tool => tool.name === name);
    const registryDefinition = toolRegistry.find(tool => tool.name === name);

    expect(toolRegistry).toHaveLength(10);
    expect(registryDefinition, `Missing registry tool: ${name}`).toBeDefined();
    expect(registryDefinition!.description).toEqual(existingDefinition!.description);
    expect(registryDefinition!.inputSchema).toEqual(existingDefinition!.inputSchema);
    expect(registryDefinition!.requires).toBe('graph');

    const existingResult = await handleToolCall(name, args, state);
    const registryResult = await registryDefinition!.handler(args, context);

    expect(registryResult).toEqual(existingResult);
  });
});
