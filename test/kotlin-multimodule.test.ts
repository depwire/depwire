import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';
import { resetModuleSourceRoots } from '../src/parser/kotlin.js';

describe('Kotlin multi-module import resolution', () => {
  const fixtureDir = resolve(import.meta.dirname, 'fixtures/kotlin-multimodule');

  afterAll(() => {
    resetModuleSourceRoots();
  });

  it('resolves cross-module Kotlin imports (ServiceA -> ServiceB)', async () => {
    const parsedFiles = await parseProject(fixtureDir);
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const crossModuleEdge = allEdges.find(
      (e) =>
        e.source.includes('ServiceA.kt') &&
        e.target.includes('ServiceB.kt') &&
        e.kind === 'imports'
    );

    expect(crossModuleEdge).toBeDefined();
    expect(crossModuleEdge!.source).toContain('module-a');
    expect(crossModuleEdge!.target).toContain('module-b');
  });

  it('preserves build-file-to-build-file edges', async () => {
    const parsedFiles = await parseProject(fixtureDir);
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const buildEdges = allEdges.filter(
      (e) => e.filePath.endsWith('.gradle.kts') && e.kind === 'imports'
    );

    expect(buildEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('parses all files in the multi-project build', async () => {
    const parsedFiles = await parseProject(fixtureDir);

    // 1 settings.gradle.kts + 3 build.gradle.kts + 2 Kotlin files = 6
    expect(parsedFiles.length).toBe(6);
  });
});
