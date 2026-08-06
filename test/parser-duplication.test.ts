import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readdirSync, statSync } from 'fs';
import { parseProject } from '../src/parser/index.js';
import type { SymbolNode } from '../src/parser/types.js';

const fixturesRoot = resolve(import.meta.dirname, 'fixtures');
const repoRoot = resolve(import.meta.dirname, '..');

function listFixtureDirs(): string[] {
  return readdirSync(fixturesRoot).filter((name) => {
    const full = resolve(fixturesRoot, name);
    return statSync(full).isDirectory();
  });
}

/**
 * Two symbols sharing an id *and* a startLine is always a double-emit bug
 * (the same AST node was processed more than once). This must never happen.
 *
 * Two symbols sharing an id on *different* lines is a separate, known,
 * accepted limitation of function-scoped ids (block-scoped name reuse,
 * e.g. multiple `const names` in separate `if` blocks) and is NOT asserted
 * here.
 */
function findSameLineDuplicates(symbols: SymbolNode[]): Map<string, SymbolNode[]> {
  const byId = new Map<string, SymbolNode[]>();
  for (const s of symbols) {
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id)!.push(s);
  }

  const dupes = new Map<string, SymbolNode[]>();
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    const lines = new Set(group.map((s) => s.startLine));
    if (lines.size === 1) {
      dupes.set(id, group);
    }
  }
  return dupes;
}

/**
 * The same id must never carry two different `kind` values. This is what
 * caught `is_admin` being reported as `method/method/function` — a class
 * method colliding with an unrelated symbol due to a scope-tracking bug.
 */
function findCrossKindCollisions(symbols: SymbolNode[]): Map<string, Set<string>> {
  const kindsById = new Map<string, Set<string>>();
  for (const s of symbols) {
    if (!kindsById.has(s.id)) kindsById.set(s.id, new Set());
    kindsById.get(s.id)!.add(s.kind);
  }

  const collisions = new Map<string, Set<string>>();
  for (const [id, kinds] of kindsById) {
    if (kinds.size > 1) collisions.set(id, kinds);
  }
  return collisions;
}

describe('No double-emitted symbols across every fixture directory', () => {
  for (const dirName of listFixtureDirs()) {
    it(`${dirName}: zero same-line duplicate symbol ids`, async () => {
      const dir = resolve(fixturesRoot, dirName);
      const parsedFiles = await parseProject(dir, { useCache: false });
      const symbols = parsedFiles.flatMap((f) => f.symbols);

      const dupes = findSameLineDuplicates(symbols);
      if (dupes.size > 0) {
        const details = [...dupes.entries()]
          .map(([id, group]) => `  ${id} (x${group.length}, kinds=${group.map((s) => s.kind).join('/')})`)
          .join('\n');
        throw new Error(`Found same-line duplicate symbol ids in ${dirName}:\n${details}`);
      }
      expect(dupes.size).toBe(0);
    });

    it(`${dirName}: no cross-kind id collisions`, async () => {
      const dir = resolve(fixturesRoot, dirName);
      const parsedFiles = await parseProject(dir, { useCache: false });
      const symbols = parsedFiles.flatMap((f) => f.symbols);

      const collisions = findCrossKindCollisions(symbols);
      if (collisions.size > 0) {
        const details = [...collisions.entries()]
          .map(([id, kinds]) => `  ${id} -> ${[...kinds].join('/')}`)
          .join('\n');
        throw new Error(`Found cross-kind id collisions in ${dirName}:\n${details}`);
      }
      expect(collisions.size).toBe(0);
    });
  }
});

describe('No double-emitted symbols in this project\'s own src/', () => {
  it('zero same-line duplicate symbol ids across src/', async () => {
    const dir = resolve(repoRoot, 'src');
    const parsedFiles = await parseProject(dir, { useCache: false });
    const symbols = parsedFiles.flatMap((f) => f.symbols);

    const dupes = findSameLineDuplicates(symbols);
    if (dupes.size > 0) {
      const details = [...dupes.entries()]
        .map(([id, group]) => `  ${id} (x${group.length}, kinds=${group.map((s) => s.kind).join('/')})`)
        .join('\n');
      throw new Error(`Found same-line duplicate symbol ids in src/:\n${details}`);
    }
    expect(dupes.size).toBe(0);
  });

  it('no cross-kind id collisions across src/', async () => {
    const dir = resolve(repoRoot, 'src');
    const parsedFiles = await parseProject(dir, { useCache: false });
    const symbols = parsedFiles.flatMap((f) => f.symbols);

    const collisions = findCrossKindCollisions(symbols);
    if (collisions.size > 0) {
      const details = [...collisions.entries()]
        .map(([id, kinds]) => `  ${id} -> ${[...kinds].join('/')}`)
        .join('\n');
      throw new Error(`Found cross-kind id collisions in src/:\n${details}`);
    }
    expect(collisions.size).toBe(0);
  });
});
