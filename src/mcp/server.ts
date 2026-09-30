import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handleToolCall, getToolsList } from "./tools.js";
import type { DepwireState } from "./state.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

/** Package version, so serverInfo matches what npm and the MCP registry publish. */
function packageVersion(): string {
  try {
    // dist/ is flat, so package.json sits one level up from any bundle.
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function startMcpServer(state: DepwireState): Promise<void> {
  const server = new Server(
    {
      name: "depwire",
      version: packageVersion(),
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
