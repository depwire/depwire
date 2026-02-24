import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handleToolCall, getToolsList } from "./tools.js";
import type { DepwireState } from "./state.js";

export async function startMcpServer(state: DepwireState): Promise<void> {
  const server = new Server(
    {
      name: "depwire",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Set up tool handlers
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getToolsList(),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleToolCall(name, args || {}, state);
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only (NEVER stdout)
  console.error("Depwire MCP server started");
  if (state.projectRoot) {
    console.error(`Project: ${state.projectRoot}`);
  } else {
    console.error("No project loaded. Use connect_repo to connect to a codebase.");
  }
}
