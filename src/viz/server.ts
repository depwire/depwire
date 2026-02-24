import express from 'express';
import open from 'open';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import type { DirectedGraph } from 'graphology';
import type { VizData } from './types.js';
import { watchProject } from '../watcher.js';
import { prepareVizData } from './data.js';
import { parseProject } from '../parser/index.js';
import { buildGraph } from '../graph/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Module-level state to prevent multiple servers
let activeServer: { server: any; port: number; url: string } | null = null;

export function startVizServer(
  initialVizData: VizData,
  graph: DirectedGraph,
  projectRoot: string,
  port: number = 3333,
  shouldOpen: boolean = true
): { server: any; url: string; alreadyRunning: boolean } {
  // If server is already running, return existing info
  if (activeServer) {
    console.error(`Visualization server already running at ${activeServer.url}`);
    return {
      server: activeServer.server,
      url: activeServer.url,
      alreadyRunning: true,
    };
  }
  
  const app = express();
  
  // Mutable reference to viz data that updates when graph changes
  let vizData = initialVizData;
  
  // Serve static files from public directory
  // When bundled, __dirname points to dist/, so we need to go to viz/public
  const publicDir = join(__dirname, 'viz', 'public');
  app.use(express.static(publicDir));
  
  // API endpoint
  app.get('/api/graph', (req, res) => {
    res.json(vizData);
  });
  
  const server = app.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.error(`\nDepwire visualization running at ${url}`);
    console.error('Press Ctrl+C to stop\n');
    
    // Store active server info
    activeServer = { server, port, url };
    
    if (shouldOpen) {
      open(url);
    }
  });
  
  // WebSocket server for live updates
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.error('Browser connected to WebSocket');
    
    ws.on('close', () => {
      console.error('Browser disconnected from WebSocket');
    });
  });
  
  // Broadcast refresh message to all connected clients
  function broadcastRefresh() {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({ type: 'refresh' }));
      }
    });
  }
  
  // Start file watcher
  console.error('Starting file watcher...');
  const watcher = watchProject(projectRoot, {
    onFileChanged: async (filePath: string) => {
      console.error(`File changed: ${filePath} — re-parsing project...`);
      try {
        // Re-parse entire project (simplest and most reliable approach)
        const parsedFiles = parseProject(projectRoot);
        const newGraph = buildGraph(parsedFiles);
        
        // Replace the graph reference (mutations affect the shared reference)
        // Copy nodes and edges to the existing graph object
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        
        // Regenerate viz data
        vizData = prepareVizData(graph, projectRoot);
        
        // Notify browser clients
        broadcastRefresh();
        
        console.error(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to update graph for ${filePath}:`, error);
      }
    },
    onFileAdded: async (filePath: string) => {
      console.error(`File added: ${filePath} — re-parsing project...`);
      try {
        // Re-parse entire project
        const parsedFiles = parseProject(projectRoot);
        const newGraph = buildGraph(parsedFiles);
        
        // Replace graph contents
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        
        // Regenerate viz data
        vizData = prepareVizData(graph, projectRoot);
        
        // Notify browser clients
        broadcastRefresh();
        
        console.error(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to update graph for ${filePath}:`, error);
      }
    },
    onFileDeleted: (filePath: string) => {
      console.error(`File deleted: ${filePath} — re-parsing project...`);
      try {
        // Re-parse entire project
        const parsedFiles = parseProject(projectRoot);
        const newGraph = buildGraph(parsedFiles);
        
        // Replace graph contents
        graph.clear();
        newGraph.forEachNode((node, attrs) => {
          graph.addNode(node, attrs);
        });
        newGraph.forEachEdge((edge, attrs, source, target) => {
          graph.addEdge(source, target, attrs);
        });
        
        // Regenerate viz data
        vizData = prepareVizData(graph, projectRoot);
        
        // Notify browser clients
        broadcastRefresh();
        
        console.error(`Graph updated (${vizData.stats.totalSymbols} symbols, ${vizData.stats.totalCrossFileEdges} edges)`);
      } catch (error) {
        console.error(`Failed to remove ${filePath} from graph:`, error);
      }
    },
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('\nShutting down visualization server...');
    activeServer = null; // Clear active server state
    watcher.close();
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  });
  
  const url = `http://127.0.0.1:${port}`;
  return { server, url, alreadyRunning: false };
}
