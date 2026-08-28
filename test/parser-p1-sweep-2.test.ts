import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/parser-p1-sweep-2');

async function fixture(name: string) {
  const parsed = await parseProject(fixtureDir, { useCache: false });
  return parsed.find(file => file.filePath === name)!;
}

describe('P1 parser sweep 2', () => {
  it('Dart invocations produce evidence-backed call edges, never declarations', async () => {
    const file = await fixture('calls.dart');

    expect(file.symbols.map(symbol => `${symbol.kind}:${symbol.id}`)).toEqual([
      'function:calls.dart::helper',
      'function:calls.dart::run',
      'class:calls.dart::Worker',
      'method:calls.dart::Worker.work',
    ]);
    expect(file.edges.filter(edge => edge.kind === 'calls')).toEqual([
      expect.objectContaining({ source: 'calls.dart::run', target: 'calls.dart::helper', line: 6 }),
      expect.objectContaining({ source: 'calls.dart::Worker.work', target: 'calls.dart::helper', line: 11 }),
    ]);
  });

  it('R callbacks inside calls do not become declarations while local calls still resolve', async () => {
    const file = await fixture('calls.R');

    expect(file.symbols.filter(symbol => symbol.kind === 'function').map(symbol => symbol.id)).toEqual([
      'calls.R::helper',
      'calls.R::run',
    ]);
    expect(file.symbols.some(symbol => symbol.id.includes('__anon__') || symbol.name === 'callback')).toBe(false);
    expect(file.edges.filter(edge => edge.kind === 'calls')).toContainEqual(
      expect.objectContaining({ source: 'calls.R::run', target: 'calls.R::helper', line: 6 }),
    );
  });

  it('extracts the class and in-class method but deliberately omits locals and the lambda', async () => {
    const file = await fixture('extraction.cpp');

    expect(file.symbols.map(symbol => `${symbol.kind}:${symbol.id}`)).toEqual([
      'function:extraction.cpp::process',
      'class:extraction.cpp::Worker',
      'method:extraction.cpp::Worker.process',
    ]);
  });

  it('qualifies namespace members and joins an out-of-line method to its declaration', async () => {
    const file = await fixture('qualified.cpp');
    const ids = file.symbols.map(symbol => symbol.id);

    expect(ids).toContain('qualified.cpp::Outer');
    expect(ids).toContain('qualified.cpp::Outer.helper');
    expect(ids).toContain('qualified.cpp::Outer.Worker');
    expect(ids.filter(id => id === 'qualified.cpp::Outer.Worker.run')).toHaveLength(1);
    expect(file.edges).toContainEqual(
      expect.objectContaining({
        kind: 'calls',
        source: 'qualified.cpp::Outer.Worker.run',
        target: 'qualified.cpp::Outer.helper',
      }),
    );
  });
});
