#!/usr/bin/env node

// This is the entry point when running as an MCPB bundle in Claude Desktop
// It reads config from environment variables set by Claude Desktop

import { resolve } from 'path';
import { parseProject } from './parser/index.js';
import { buildGraph } from './graph/index.js';
import { startMcpServer } from './mcp/server.js';
import { createEmptyState } from './mcp/state.js';
import { watchProject } from './watcher.js';
import { updateFileInGraph } from './graph/updater.js';

async function main() {
  const state = createEmptyState();

  // Read user config from environment variables
  // Claude Desktop passes user_config values as MCPB_CONFIG_<FIELD_NAME_UPPERCASED>
  const projectPath = process.env.MCPB_CONFIG_PROJECT_PATH || process.env.CODEGRAPH_PROJECT_PATH || '';

  if (projectPath) {
    try {
      const projectRoot = resolve(projectPath);
      
      // Log to stderr only (NEVER stdout - it corrupts MCP protocol)
      console.error(`[MCPB] Parsing project: ${projectRoot}`);
      
      // Parse all TypeScript files
      const parsedFiles = parseProject(projectRoot);
      console.error(`[MCPB] Parsed ${parsedFiles.length} files`);
      
      // Build the graph
      const graph = buildGraph(parsedFiles);
      console.error(`[MCPB] Built graph: ${graph.order} symbols, ${graph.size} edges`);
      
      // Set initial state
      state.graph = graph;
      state.projectRoot = projectRoot;
      state.projectName = projectRoot.split('/').pop() || 'project';

      // Start file watcher
      console.error("[MCPB] Starting file watcher...");
      state.watcher = watchProject(projectRoot, {
        onFileChanged: async (filePath: string) => {
          console.error(`[MCPB] File changed: ${filePath}`);
          try {
            await updateFileInGraph(state.graph!, projectRoot, filePath);
            console.error(`[MCPB] Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`[MCPB] Failed to update graph: ${error}`);
          }
        },
        onFileAdded: async (filePath: string) => {
          console.error(`[MCPB] File added: ${filePath}`);
          try {
            await updateFileInGraph(state.graph!, projectRoot, filePath);
            console.error(`[MCPB] Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`[MCPB] Failed to update graph: ${error}`);
          }
        },
        onFileDeleted: (filePath: string) => {
          console.error(`[MCPB] File deleted: ${filePath}`);
          try {
            const fileNodes = state.graph!.filterNodes((node, attrs) => 
              attrs.filePath === filePath
            );
            fileNodes.forEach(node => state.graph!.dropNode(node));
            console.error(`[MCPB] Removed ${filePath} from graph`);
          } catch (error) {
            console.error(`[MCPB] Failed to remove file: ${error}`);
          }
        },
      });
    } catch (error) {
      console.error(`[MCPB] Failed to parse project: ${error}`);
      console.error("[MCPB] Starting without a project loaded. Use connect_repo to connect.");
    }
  }
  
  // Start MCP server (communicates via stdin/stdout)
  await startMcpServer(state);
}

main().catch(err => {
  console.error('[MCPB] Fatal error:', err);
  process.exit(1);
});
