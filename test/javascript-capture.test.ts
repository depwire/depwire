import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { parseProject } from '../src/parser/index.js';

const root = resolve(import.meta.dirname, 'fixtures/javascript-capture');

async function fixture() {
  const files = await parseProject(root, { useCache: false });
  return (name: string) => files.find(file => file.filePath === name)!;
}

describe('JavaScript export and call evidence', () => {
  it('marks directly assigned CommonJS functions', async () => {
    const file = (await fixture())('direct.js');
    expect(file.symbols.find(s => s.name === 'direct')?.exported).toBe(true);
    expect(file.symbols.find(s => s.name === 'spaced')?.exported).toBe(true);
  });
  it('marks shorthand and named object values', async () => {
    const file = (await fixture())('object.js');
    expect(file.symbols.filter(s => ['alpha', 'beta'].includes(s.name)).map(s => s.exported)).toEqual([true, true]);
  });
  it('marks property assignments and inline functions', async () => {
    const file = (await fixture())('property.js');
    for (const name of ['first', 'second', 'inline']) expect(file.symbols.find(s => s.name === name)?.exported).toBe(true);
  });
  it('marks Object.assign values', async () => {
    const file = (await fixture())('assign.js');
    for (const name of ['one', 'two']) expect(file.symbols.find(s => s.name === name)?.exported).toBe(true);
  });
  it('records a proven local re-export import', async () => {
    const file = (await fixture())('reexport.js');
    expect(file.edges).toContainEqual(expect.objectContaining({ kind: 'imports', source: 'reexport.js::__file__', target: 'direct.js::__file__' }));
  });
  it('records conditional and computed exports without guessing', async () => {
    const file = (await fixture())('conditional.js');
    expect(file.symbols.find(s => s.name === 'conditional')?.exported).toBe(false);
    expect(file.symbols.find(s => s.name === 'computed')?.exported).toBe(false);
    expect(file.symbols.find(s => s.name === 'dynamic')?.exported).not.toBe(true);
    expect(file.unresolvedExports?.map(x => x.reason)).toEqual(expect.arrayContaining(['conditional-assignment', 'computed-property']));
  });
  it('keeps ESM declaration exports', async () => {
    const file = (await fixture())('esm.js');
    expect(file.symbols.find(s => s.name === 'esm')?.exported).toBe(true);
    expect(file.symbols.find(s => s.name === 'listed')?.exported).toBe(true);
  });
  it('captures direct calls inside assigned callbacks and at file scope', async () => {
    const file = (await fixture())('calls.js');
    expect(file.edges.filter(e => e.kind === 'calls' && e.target === 'calls.js::target').length).toBeGreaterThanOrEqual(2);
  });
  it('records an unresolved member receiver without a guessed local edge', async () => {
    const file = (await fixture())('calls.js');
    expect(file.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'obj.target', reason: 'unresolvable-receiver' }));
  });
  it('respects parameter shadowing and resolves only declared this members', async () => {
    const file = (await fixture())('shadow.js');
    expect(file.edges).not.toContainEqual(expect.objectContaining({ source: 'shadow.js::caller', target: 'shadow.js::target' }));
    expect(file.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'target', reason: 'local-binding-not-modeled' }));
    expect(file.edges).toContainEqual(expect.objectContaining({ source: 'shadow.js::Box.run', target: 'shadow.js::Box.target', kind: 'calls' }));
    expect(file.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'unknown', reason: 'receiver-not-local' }));
  });
  it('preserves a file-level import when the imported binding is called', async () => {
    const file = (await fixture())('imported-call.js');
    expect(file.edges.filter(e => e.source === 'imported-call.js::__file__' && e.target === 'direct.js::direct').map(e => e.kind)).toEqual(['imports']);
  });
});
