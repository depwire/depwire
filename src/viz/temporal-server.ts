import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { TemporalSnapshot } from '../temporal/types.js';
import { prepareTemporalVizData } from './temporal-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import('net');

  for (let attempt = 0; attempt < 10; attempt++) {
    const testPort = startPort + attempt;

    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.close();
          resolve(true);
        })
        .listen(testPort, '127.0.0.1');
    });

    if (isAvailable) {
      return testPort;
    }
  }

  throw new Error(`No available port found starting from ${startPort}`);
}

export async function startTemporalServer(
  snapshots: TemporalSnapshot[],
  projectRoot: string,
  preferredPort: number = 3334
): Promise<void> {
  const availablePort = await findAvailablePort(preferredPort);

  const app = express();

  const vizData = prepareTemporalVizData(snapshots, projectRoot);

  app.get('/api/data', (_req, res) => {
    res.json(vizData);
  });

  const publicDir = join(__dirname, 'viz', 'public');

  app.get('/', (_req, res) => {
    const htmlPath = join(publicDir, 'temporal.html');
    const html = readFileSync(htmlPath, 'utf-8');
    res.send(html);
  });

  app.get('/temporal.js', (_req, res) => {
    const jsPath = join(publicDir, 'temporal.js');
    const js = readFileSync(jsPath, 'utf-8');
    res.type('application/javascript').send(js);
  });

  app.get('/temporal.css', (_req, res) => {
    const cssPath = join(publicDir, 'temporal.css');
    const css = readFileSync(cssPath, 'utf-8');
    res.type('text/css').send(css);
  });

  const server = app.listen(availablePort, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${availablePort}`;
    console.log(`\n✓ Temporal visualization server running at ${url}`);
    console.log('  Press Ctrl+C to stop\n');

    open(url).catch(() => {
      console.log('  (Could not open browser automatically)');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    process.on('SIGINT', () => {
      console.log('\n\nShutting down temporal server...');
      server.close(() => {
        console.log('Server stopped');
        resolve();
        process.exit(0);
      });
    });
  });
}
