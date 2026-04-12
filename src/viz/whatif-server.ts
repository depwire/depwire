import express from 'express';
import open from 'open';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { VizData } from './types.js';
import type { SimulationResult } from '../simulation/engine.js';
import { generateWhatIfHtml } from './generate-whatif-html.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
  const net = await import('net');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const testPort = startPort + attempt;

    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();

      server.once('error', () => {
        resolve(false);
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(testPort, '127.0.0.1');
    });

    if (isAvailable) {
      if (attempt > 0) {
        console.error(`Port ${startPort} in use, using port ${testPort} instead`);
      }
      return testPort;
    }
  }

  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}

export async function serveWhatIfViz(
  currentVizData: VizData,
  simulatedVizData: VizData,
  simulationResult: SimulationResult,
  operation: string,
  target: string
): Promise<void> {
  const availablePort = await findAvailablePort(3335);

  const app = express();

  // Serve static files (arc.js, style.css) from viz/public
  const publicDir = join(__dirname, 'viz', 'public');
  app.use(express.static(publicDir));

  // Main page
  app.get('/', (_req, res) => {
    const html = generateWhatIfHtml(currentVizData, simulatedVizData, simulationResult, operation, target);
    res.type('html').send(html);
  });

  // API endpoints
  app.get('/api/current', (_req, res) => {
    res.json(currentVizData);
  });

  app.get('/api/simulated', (_req, res) => {
    res.json(simulatedVizData);
  });

  app.get('/api/result', (_req, res) => {
    res.json(simulationResult);
  });

  const server = app.listen(availablePort, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${availablePort}`;
    console.error(`\nOpening What If UI at ${url}`);
    console.error('Press Ctrl+C to stop\n');
    open(url);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('\nShutting down What If server...');
    server.close(() => {
      process.exit(0);
    });
  });
}
