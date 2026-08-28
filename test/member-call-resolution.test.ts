import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';
import { aggregateUnresolvedCalls } from '../src/parser/types.js';

// Regression test for #14: a member-expression call (`obj.method()`) whose
// receiver is not `this`/`super` must never fabricate a same-file `calls`
// edge just because the property name happens to collide with a locally
// declared symbol. `this.method()`/`super.method()`, where the receiver IS
// knowable, must keep producing edges.
const fixtureDir = resolve(import.meta.dirname, 'fixtures/member-call-resolution');

describe('member-call resolution (#14 -- no fabricated edge for unresolvable receivers)', () => {
  it('does NOT create a calls edge from arr.push(1) to the local push() function', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const wrongEdge = allEdges.find(
      (e) =>
        e.filePath === 'sample.ts' &&
        e.kind === 'calls' &&
        e.target === 'sample.ts::push'
    );
    expect(wrongEdge).toBeUndefined();
  });

  it('records the unresolvable arr.push(1) call as an unresolved call instead of dropping it silently', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const unresolved = aggregateUnresolvedCalls(parsedFiles);

    const entry = unresolved.find(
      (u) => u.fromFile === 'sample.ts' && u.callee === 'arr.push' && u.reason === 'unresolvable-receiver'
    );
    expect(entry).toBeDefined();
  });

  it('still creates a calls edge for this.other() (receiver is the enclosing class instance)', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);

    const edge = allEdges.find(
      (e) =>
        e.filePath === 'sample.ts' &&
        e.kind === 'calls' &&
        e.source === 'sample.ts::Derived.method' &&
        e.target === 'sample.ts::Derived.other'
    );
    expect(edge).toBeDefined();
  });

  // Known gap, reported rather than hidden: resolveScopedCallTarget walks the
  // declaring-class scope chain only -- it does not follow `extends` to look
  // up a base class's members. super.helper() therefore does not resolve to
  // Base.helper via this mechanism; it is recorded unresolved instead of
  // fabricating a wrong edge. Cross-class (super) resolution is out of scope
  // for this fix (super.-calls are ~0.1% of member calls -- see recon R3).
  it('records super.helper() as an unresolved call rather than fabricating a wrong edge (known gap: no `extends` lookup)', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);
    const unresolved = aggregateUnresolvedCalls(parsedFiles);

    const wrongEdge = allEdges.find(
      (e) => e.filePath === 'sample.ts' && e.kind === 'calls' && e.source === 'sample.ts::Derived.other'
    );
    expect(wrongEdge).toBeUndefined();

    const entry = unresolved.find(
      (u) => u.fromFile === 'sample.ts' && u.callee === 'super.helper' && u.reason === 'receiver-not-local'
    );
    expect(entry).toBeDefined();
  });

  it('does not resolve parameter or destructured bindings to same-named class members', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const sample = parsedFiles.find((file) => file.filePath === 'sample.ts')!;

    expect(sample.edges).not.toContainEqual(expect.objectContaining({
      kind: 'calls',
      target: 'sample.ts::BareCallCollisions.transaction',
    }));
    expect(sample.edges).not.toContainEqual(expect.objectContaining({
      kind: 'calls',
      target: 'sample.ts::BareCallCollisions.callable',
    }));
    expect(sample.unresolvedCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callee: 'transaction', reason: 'local-binding-not-modeled' }),
      expect.objectContaining({ callee: 'callable', reason: 'local-binding-not-modeled' }),
    ]));
  });

  it('does not resolve a global constructor to a same-named class method', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const sample = parsedFiles.find((file) => file.filePath === 'sample.ts')!;

    expect(sample.edges).not.toContainEqual(expect.objectContaining({
      kind: 'calls',
      source: 'sample.ts::BareCallCollisions.constructGlobal',
      target: 'sample.ts::BareCallCollisions.Error',
    }));
    expect(sample.unresolvedCalls).toContainEqual(expect.objectContaining({
      callee: 'Error',
      reason: 'receiver-required',
    }));
  });

  it('resolves imported constructors from import evidence and records external callees', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const sample = parsedFiles.find((file) => file.filePath === 'sample.ts')!;

    expect(sample.edges).toContainEqual(expect.objectContaining({
      kind: 'calls',
      source: 'sample.ts::constructImported',
      target: 'target.ts::ImportedCtor',
    }));
    expect(sample.unresolvedCalls).toContainEqual(expect.objectContaining({
      callee: 'externalCall',
      reason: 'unresolved-import-callee',
    }));
  });
});
