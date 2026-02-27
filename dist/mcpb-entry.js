#!/usr/bin/env node
import {
  buildGraph,
  createEmptyState,
  parseProject,
  startMcpServer,
  updateFileInGraph,
  watchProject
} from "./chunk-7QY73JHM.js";

// src/mcpb-entry.ts
import { resolve } from "path";
async function main() {
  const state = createEmptyState();
  const projectPath = process.env.MCPB_CONFIG_PROJECT_PATH || process.env.DEPWIRE_PROJECT_PATH || "";
  if (projectPath) {
    try {
      const projectRoot = resolve(projectPath);
      console.error(`[MCPB] Parsing project: ${projectRoot}`);
      const parsedFiles = parseProject(projectRoot);
      console.error(`[MCPB] Parsed ${parsedFiles.length} files`);
      const graph = buildGraph(parsedFiles);
      console.error(`[MCPB] Built graph: ${graph.order} symbols, ${graph.size} edges`);
      state.graph = graph;
      state.projectRoot = projectRoot;
      state.projectName = projectRoot.split("/").pop() || "project";
      console.error("[MCPB] Starting file watcher...");
      state.watcher = watchProject(projectRoot, {
        onFileChanged: async (filePath) => {
          console.error(`[MCPB] File changed: ${filePath}`);
          try {
            await updateFileInGraph(state.graph, projectRoot, filePath);
            console.error(`[MCPB] Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`[MCPB] Failed to update graph: ${error}`);
          }
        },
        onFileAdded: async (filePath) => {
          console.error(`[MCPB] File added: ${filePath}`);
          try {
            await updateFileInGraph(state.graph, projectRoot, filePath);
            console.error(`[MCPB] Graph updated for ${filePath}`);
          } catch (error) {
            console.error(`[MCPB] Failed to update graph: ${error}`);
          }
        },
        onFileDeleted: (filePath) => {
          console.error(`[MCPB] File deleted: ${filePath}`);
          try {
            const fileNodes = state.graph.filterNodes(
              (node, attrs) => attrs.filePath === filePath
            );
            fileNodes.forEach((node) => state.graph.dropNode(node));
            console.error(`[MCPB] Removed ${filePath} from graph`);
          } catch (error) {
            console.error(`[MCPB] Failed to remove file: ${error}`);
          }
        }
      });
    } catch (error) {
      console.error(`[MCPB] Failed to parse project: ${error}`);
      console.error("[MCPB] Starting without a project loaded. Use connect_repo to connect.");
    }
  }
  await startMcpServer(state);
}
main().catch((err) => {
  console.error("[MCPB] Fatal error:", err);
  process.exit(1);
});
