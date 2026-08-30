import { afterEach, describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { discoverJvmModuleRoots } from '../src/parser/jvm-modules.js';

describe('discoverJvmModuleRoots', () => {
  const fixturesDir = resolve(import.meta.dirname, 'fixtures');
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('rejects and records a Maven module path that traverses outside the project root', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'depwire-jvm-traversal-'));
    tempDirs.push(sandbox);
    const projectRoot = join(sandbox, 'project');
    const outsideRoot = join(sandbox, 'outside');
    mkdirSync(projectRoot);
    mkdirSync(join(outsideRoot, 'src/main/java'), { recursive: true });
    writeFileSync(join(projectRoot, 'pom.xml'), '<project><modules><module>../outside</module></modules></project>');

    const result = discoverJvmModuleRoots(projectRoot);

    expect(result.roots).toEqual([]);
    expect(result.verifiedRootSet.has(join(outsideRoot, 'src/main/java'))).toBe(false);
    expect(result.errors).toEqual([
      {
        path: '../outside',
        reason: expect.stringContaining('outside project root'),
      },
    ]);
  });

  describe('Maven multi-module', () => {
    it('discovers module source roots from pom.xml', () => {
      const projectRoot = resolve(fixturesDir, 'java-multimodule');
      const result = discoverJvmModuleRoots(projectRoot);

      expect(result.roots.length).toBeGreaterThan(0);
      expect(result.roots).toContain('module-a/src/main/java');
      expect(result.roots).toContain('module-b/src/main/java');
    });

    it('populates verifiedRootSet with absolute paths', () => {
      const projectRoot = resolve(fixturesDir, 'java-multimodule');
      const result = discoverJvmModuleRoots(projectRoot);

      expect(result.verifiedRootSet.size).toBeGreaterThan(0);
      expect(result.verifiedRootSet.has(resolve(projectRoot, 'module-a/src/main/java'))).toBe(true);
      expect(result.verifiedRootSet.has(resolve(projectRoot, 'module-b/src/main/java'))).toBe(true);
    });

    it('does not include non-existent source roots', () => {
      const projectRoot = resolve(fixturesDir, 'java-multimodule');
      const result = discoverJvmModuleRoots(projectRoot);

      // These directories don't exist in the fixture
      expect(result.roots).not.toContain('module-a/src/main/kotlin');
      expect(result.roots).not.toContain('module-a/src/test/java');
    });
  });

  describe('Gradle multi-project', () => {
    it('discovers module source roots from settings.gradle.kts', () => {
      const projectRoot = resolve(fixturesDir, 'kotlin-multimodule');
      const result = discoverJvmModuleRoots(projectRoot);

      expect(result.roots.length).toBeGreaterThan(0);
      expect(result.roots).toContain('module-a/src/main/kotlin');
      expect(result.roots).toContain('module-b/src/main/kotlin');
    });

    it('populates verifiedRootSet with absolute paths', () => {
      const projectRoot = resolve(fixturesDir, 'kotlin-multimodule');
      const result = discoverJvmModuleRoots(projectRoot);

      expect(result.verifiedRootSet.has(resolve(projectRoot, 'module-a/src/main/kotlin'))).toBe(true);
      expect(result.verifiedRootSet.has(resolve(projectRoot, 'module-b/src/main/kotlin'))).toBe(true);
    });
  });

  describe('No build files', () => {
    it('returns empty roots when no pom.xml or settings.gradle exists', () => {
      const projectRoot = resolve(fixturesDir); // fixtures dir has no pom/gradle
      const result = discoverJvmModuleRoots(projectRoot);

      expect(result.roots).toEqual([]);
      expect(result.verifiedRootSet.size).toBe(0);
    });
  });

  describe('Isolation between calls', () => {
    it('returns independent results for different projects', () => {
      const javaRoot = resolve(fixturesDir, 'java-multimodule');
      const kotlinRoot = resolve(fixturesDir, 'kotlin-multimodule');

      const javaResult = discoverJvmModuleRoots(javaRoot);
      const kotlinResult = discoverJvmModuleRoots(kotlinRoot);

      // Java fixture should not have Kotlin roots
      expect(javaResult.roots.some(r => r.includes('kotlin'))).toBe(false);
      // Kotlin fixture should not have Java roots
      expect(kotlinResult.roots.some(r => r.includes('java'))).toBe(false);
    });
  });
});
