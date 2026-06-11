import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';
import { resetModuleSourceRoots } from '../src/parser/java.js';

describe('Java multi-module import resolution', () => {
  const fixtureDir = resolve(import.meta.dirname, 'fixtures/java-multimodule');

  afterAll(() => {
    resetModuleSourceRoots();
  });

  it('resolves cross-module Java imports (ServiceA -> ServiceB)', async () => {
    const parsedFiles = await parseProject(fixtureDir);
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const crossModuleEdge = allEdges.find(
      (e) =>
        e.source.includes('ServiceA.java') &&
        e.target.includes('ServiceB.java') &&
        e.kind === 'imports'
    );

    expect(crossModuleEdge).toBeDefined();
    expect(crossModuleEdge!.source).toContain('module-a');
    expect(crossModuleEdge!.target).toContain('module-b');
  });

  it('preserves pom-to-pom edges', async () => {
    const parsedFiles = await parseProject(fixtureDir);
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const pomEdges = allEdges.filter(
      (e) => e.filePath.endsWith('pom.xml') && e.kind === 'imports'
    );

    expect(pomEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('parses all files in the multi-module project', async () => {
    const parsedFiles = await parseProject(fixtureDir);

    // 3 pom.xml + 2 Java files = 5
    expect(parsedFiles.length).toBe(5);
  });
});

describe('Java multi-module isolation', () => {
  it('does not leak module roots between parseProject calls', async () => {
    const multiModuleDir = resolve(import.meta.dirname, 'fixtures/java-multimodule');
    const kotlinDir = resolve(import.meta.dirname, 'fixtures/kotlin-multimodule');

    // Parse multi-module Java first
    const javaFiles = await parseProject(multiModuleDir);
    const javaEdges = javaFiles.flatMap((f) => f.edges);
    const javaCrossEdge = javaEdges.find(
      (e) => e.source.includes('ServiceA.java') && e.target.includes('ServiceB.java')
    );
    expect(javaCrossEdge).toBeDefined();

    // Parse Kotlin project next — should have its own module roots, not Java's
    const kotlinFiles = await parseProject(kotlinDir);
    const kotlinEdges = kotlinFiles.flatMap((f) => f.edges);
    const kotlinCrossEdge = kotlinEdges.find(
      (e) => e.source.includes('ServiceA.kt') && e.target.includes('ServiceB.kt')
    );
    expect(kotlinCrossEdge).toBeDefined();

    // Re-parse Java — should still work (roots were reset and re-discovered)
    const javaFiles2 = await parseProject(multiModuleDir);
    const javaEdges2 = javaFiles2.flatMap((f) => f.edges);
    const javaCrossEdge2 = javaEdges2.find(
      (e) => e.source.includes('ServiceA.java') && e.target.includes('ServiceB.java')
    );
    expect(javaCrossEdge2).toBeDefined();
  });
});
