import express from 'express';
import open from 'open';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { VizData } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startVizServer(vizData: VizData, port: number = 3333, shouldOpen: boolean = true) {
  const app = express();
  
  // Serve static files from public directory
  // When bundled, __dirname points to dist/, so we need to go to viz/public
  const publicDir = join(__dirname, 'viz', 'public');
  app.use(express.static(publicDir));
  
  // API endpoint
  app.get('/api/graph', (req, res) => {
    res.json(vizData);
  });
  
  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\nCodeGraph visualization running at ${url}`);
    console.log('Press Ctrl+C to stop\n');
    
    if (shouldOpen) {
      open(url);
    }
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down visualization server...');
    server.close(() => {
      process.exit(0);
    });
  });
  
  return server;
}
