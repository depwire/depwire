import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright-core';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// #69: the viz pages must render with the network blocked. Real servers are bundled into a
// disposable dist-shaped directory (same __dirname layout as the shipped CLI) with `open` stubbed.
const D3_SHA256 = '912111098ea99503a6f4967361d2bbdc9dbf58cf9c678c8e27e5b02d1a07f0c1';
const root = mkdtempSync(join(tmpdir(), 'viz-offline-'));
const project = join(root, 'project');
let child: ChildProcess;
let browser: Browser | undefined;
let urls: { index: string; whatif: string; temporal: string };

const harness = `
import { parseProject } from ${JSON.stringify(resolve('src/parser/index.ts'))};
import { buildGraph } from ${JSON.stringify(resolve('src/graph/index.ts'))};
import { prepareVizData } from ${JSON.stringify(resolve('src/viz/data.ts'))};
import { startVizServer } from ${JSON.stringify(resolve('src/viz/server.ts'))};
import { serveWhatIfViz } from ${JSON.stringify(resolve('src/viz/whatif-server.ts'))};
import { startTemporalServer } from ${JSON.stringify(resolve('src/viz/temporal-server.ts'))};
import { SimulationEngine } from ${JSON.stringify(resolve('src/simulation/engine.ts'))};
const project = process.argv[2];
const parsed = await parseProject(project, { useCache: false });
const graph = buildGraph(parsed, project);
const viz = prepareVizData(graph, project);
const index = await startVizServer(viz, graph, project, 4100, false);
const simulation = new SimulationEngine(graph).simulate({ type: 'delete', target: 'b.ts' });
const whatif = await serveWhatIfViz(viz, viz, simulation, 'delete', 'b.ts');
if (!whatif.listening) await new Promise(r => whatif.once('listening', r));
const whatifUrl = 'http://127.0.0.1:' + whatif.address().port;
const log = console.log;
let temporalUrl;
console.log = (...args) => { const m = /running at (http:\\/\\/\\S+)/.exec(args.join(' ')); if (m) temporalUrl = m[1]; };
const files = ['a.ts', 'b.ts', 'c.ts'].map(path => ({ path, symbols: 2, connections: 1 }));
const snapshot = (n, edges) => ({ commitHash: 'abcdef' + n, commitDate: '2026-01-0' + n + 'T00:00:00Z', commitMessage: 'c' + n, commitAuthor: 't',
  stats: { totalFiles: 3, totalSymbols: 6, totalEdges: edges.length, languages: { typescript: 3 } }, files, edges });
startTemporalServer([snapshot(1, [{ source: 'a.ts', target: 'b.ts', weight: 1 }]),
  snapshot(2, [{ source: 'a.ts', target: 'b.ts', weight: 1 }, { source: 'b.ts', target: 'c.ts', weight: 1 }])], project, 4200);
for (let i = 0; i < 100 && !temporalUrl; i++) await new Promise(r => setTimeout(r, 50));
log(JSON.stringify({ index: index.url, whatif: whatifUrl, temporal: temporalUrl }));
`;

async function launchBrowser() {
  // No skip path: a missing browser must fail this suite. CI runs `npx playwright-core install chromium` first.
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(`viz-offline requires the Playwright Chromium browser (run: npx playwright-core install chromium): ${(error as Error).message.split('\n')[0]}`);
  }
}

beforeAll(async () => {
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'a.ts'), "import { b } from './b';\nexport function a() { return b(); }\n");
  writeFileSync(join(project, 'b.ts'), "import { c } from './c';\nexport function b() { return c(); }\n");
  writeFileSync(join(project, 'c.ts'), 'export function c() { return 1; }\n');
  mkdirSync(join(root, 'dist'));
  cpSync(resolve('src/viz/public'), join(root, 'dist/viz/public'), { recursive: true });
  cpSync(resolve('icon.png'), join(root, 'icon.png'));
  writeFileSync(join(root, 'harness.ts'), harness);
  const stubOpen = { name: 'stub-open', setup(b: any) {
    b.onResolve({ filter: /^open$/ }, () => ({ path: 'open', namespace: 'stub-open' }));
    b.onLoad({ filter: /.*/, namespace: 'stub-open' }, () => ({ contents: 'export default async () => {};', loader: 'js' }));
  } };
  await build({ entryPoints: [join(root, 'harness.ts')], outfile: join(root, 'dist/harness.mjs'), bundle: true, platform: 'node', format: 'esm',
    packages: 'external', logLevel: 'silent', plugins: [stubOpen], absWorkingDir: resolve('.') });
  symlinkModules();
  child = spawn(process.execPath, [join(root, 'dist/harness.mjs'), project], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  urls = await new Promise((res, rej) => {
    let out = ''; let err = '';
    child.stderr!.on('data', d => { err += d; });
    child.stdout!.on('data', d => { out += d; try { res(JSON.parse(out.trim())); } catch { /* wait for full line */ } });
    child.on('exit', code => rej(new Error(`harness exited ${code}: ${err}`)));
  });
}, 120_000);

function symlinkModules() {
  // Resolve externalised packages and the wasm grammars from the repo checkout.
  cpSync(resolve('src/parser/grammars'), join(root, 'dist/parser/grammars'), { recursive: true });
  cpSync(resolve('src/security/native-binding-allowlist.json'), join(root, 'dist/security/native-binding-allowlist.json'), { recursive: true });
  writeFileSync(join(root, 'package.json'), readFileSync(resolve('package.json')));
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
}

afterAll(async () => {
  await browser?.close();
  child?.kill();
  rmSync(root, { recursive: true, force: true });
});

async function renderOffline(url: string, selector: string) {
  browser ??= await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  const external: string[] = [];
  const local: Array<{ url: string; status: number }> = [];
  await page.route('**/*', route => {
    const target = route.request().url();
    if (/^(http:\/\/127\.0\.0\.1:|data:|blob:)/.test(target)) return route.continue();
    external.push(target);
    return route.abort('internetdisconnected');
  });
  page.on('response', r => local.push({ url: r.url(), status: r.status() }));
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(selector, { timeout: 15_000 });
  const rendered = await page.evaluate(sel => ({
    d3Version: (window as any).d3?.version,
    nodes: document.querySelectorAll(sel).length,
    svgChildren: document.querySelectorAll('svg *').length,
  }), selector);
  await context.close();
  return { external, local, errors, rendered };
}

describe('viz pages render with the network blocked (#69)', () => {
  it('vendored d3 is the pinned 7.9.2 file', () => {
    const file = resolve('src/viz/public/vendor/d3.min.js');
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(D3_SHA256);
    expect(existsSync(resolve('src/viz/public/vendor/D3-LICENSE'))).toBe(true);
  });

  for (const [name, selector] of [['index', '.file-bar'], ['whatif', '.file-bar'], ['temporal', '.file-bar']] as const) {
    it(`${name} page renders SVG content with zero external requests`, async () => {
      const result = await renderOffline(urls[name], selector);
      expect(result.external).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.local.find(r => r.url.endsWith('/vendor/d3.min.js'))?.status).toBe(200);
      expect(result.rendered.d3Version).toBe('7.9.2');
      expect(result.rendered.nodes).toBeGreaterThan(0);
      expect(result.rendered.svgChildren).toBeGreaterThan(3);
    }, 60_000);
  }
});
