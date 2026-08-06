import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DirectedGraph } from 'graphology';
import { parseProject } from '../src/parser/index.js';
import { buildGraph } from '../src/graph/index.js';
import { calculateHealthScore } from '../src/health/index.js';

describe('health score refuses to score when nothing was parsed', () => {
  let emptyDir: string;
  let unparseableDir: string;
  let realDir: string;

  beforeAll(() => {
    emptyDir = mkdtempSync(join(tmpdir(), 'depwire-health-empty-'));

    unparseableDir = mkdtempSync(join(tmpdir(), 'depwire-health-junk-'));
    writeFileSync(join(unparseableDir, 'a.txt'), 'hello world\n');
    writeFileSync(join(unparseableDir, 'b.csv'), 'a,b,c\n1,2,3\n');

    realDir = mkdtempSync(join(tmpdir(), 'depwire-health-real-'));
    writeFileSync(
      join(realDir, 'index.ts'),
      `export function add(a: number, b: number): number {\n  return a + b;\n}\n`
    );
  });

  afterAll(() => {
    rmSync(emptyDir, { recursive: true, force: true });
    rmSync(unparseableDir, { recursive: true, force: true });
    rmSync(realDir, { recursive: true, force: true });
  });

  it('reports status "no_parseable_files" (not a fake 100/A) for an empty directory', async () => {
    const parsedFiles = await parseProject(emptyDir, { useCache: false });
    const graph = buildGraph(parsedFiles, emptyDir);

    expect(graph.order).toBe(0);

    const report = calculateHealthScore(graph, emptyDir);

    expect(report.status).toBe('no_parseable_files');
    expect(Number.isNaN(report.overall)).toBe(true);
    expect(report.grade).not.toBe('A');
    expect(report.dimensions).toEqual([]);
    expect(report.supportedExtensions && report.supportedExtensions.length).toBeGreaterThan(0);
  });

  it('reports status "no_parseable_files" for a directory containing only unparseable files (.txt/.csv)', async () => {
    const parsedFiles = await parseProject(unparseableDir, { useCache: false });
    const graph = buildGraph(parsedFiles, unparseableDir);

    expect(graph.order).toBe(0);

    const report = calculateHealthScore(graph, unparseableDir);

    expect(report.status).toBe('no_parseable_files');
    expect(Number.isNaN(report.overall)).toBe(true);
    expect(report.grade).not.toBe('A');
  });

  it('scores normally when there is at least one real source file (guard must not over-trigger)', async () => {
    const parsedFiles = await parseProject(realDir, { useCache: false });
    const graph = buildGraph(parsedFiles, realDir);

    expect(graph.order).toBeGreaterThan(0);

    const report = calculateHealthScore(graph, realDir);

    expect(report.status).toBe('scored');
    expect(typeof report.overall).toBe('number');
    expect(Number.isNaN(report.overall)).toBe(false);
    expect(report.dimensions.length).toBe(6);
  });

  it('produces a refusal object shape (not a score) for a manually-built empty graph, as used by the MCP get_health_score tool', () => {
    const graph = new DirectedGraph();
    const report = calculateHealthScore(graph, '/tmp/does-not-matter');

    expect(report.status).toBe('no_parseable_files');
    expect(report.message).toBeTruthy();
    // The MCP handler (handleGetHealthScore) wraps this into
    // { status: 'no_parseable_files', message, filesScanned: 0, supportedExtensions }
    // and never forwards overall/grade/dimensions for this case.
  });
});
