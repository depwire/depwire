import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseProject } from '../src/parser/index.js';
import { aggregateUnresolvedCalls } from '../src/parser/types.js';
import { resolveSuperCalls } from '../src/parser/super-calls.js';
import type { ParsedFile } from '../src/parser/types.js';

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

  it('resolves super.helper() through a same-file extends edge', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const allEdges = parsedFiles.flatMap((f) => f.edges);
    const unresolved = aggregateUnresolvedCalls(parsedFiles);

    const edge = allEdges.find(
      (e) => e.filePath === 'sample.ts' && e.kind === 'calls' &&
        e.source === 'sample.ts::Derived.other' && e.target === 'sample.ts::Base.helper'
    );
    expect(edge).toBeDefined();

    const entry = unresolved.find(
      (u) => u.fromFile === 'sample.ts' && u.callee === 'super.helper' && u.reason === 'receiver-not-local'
    );
    expect(entry).toBeUndefined();
  });

  it('resolves super.inherited() through an imported parent and retains external misses', async () => {
    const parsedFiles = await parseProject(fixtureDir, { useCache: false });
    const sample = parsedFiles.find((file) => file.filePath === 'sample.ts')!;

    expect(sample.edges).toContainEqual(expect.objectContaining({
      kind: 'calls',
      source: 'sample.ts::CrossFileDerived.method',
      target: 'target.ts::CrossFileBase.inherited',
    }));
    expect(sample.unresolvedCalls).toContainEqual(expect.objectContaining({
      callee: 'super.notProjectLocal',
      reason: 'receiver-not-local',
    }));
  });

  it('caps inheritance walking at eight hops and protects against cycles', () => {
    const symbols = Array.from({ length: 10 }, (_, i) => ({
      id: `chain.ts::C${i}`,
      name: `C${i}`,
      kind: 'class' as const,
      filePath: 'chain.ts',
      startLine: i + 1,
      endLine: i + 1,
      exported: true,
    }));
    symbols.push({
      id: 'chain.ts::C9.deep', name: 'deep', kind: 'method' as const,
      filePath: 'chain.ts', startLine: 20, endLine: 20, exported: false,
    });
    const parsed: ParsedFile = {
      filePath: 'chain.ts',
      symbols,
      edges: [
        ...Array.from({ length: 9 }, (_, i) => ({
          source: `chain.ts::C${i}`,
          target: `chain.ts::C${i + 1}`,
          kind: 'extends' as const,
          filePath: 'chain.ts',
          line: i + 1,
        })),
        { source: 'chain.ts::C9', target: 'chain.ts::C0', kind: 'extends', filePath: 'chain.ts', line: 20 },
      ],
      pendingSuperCalls: [{
        source: 'chain.ts::C0.call', declaringClass: 'chain.ts::C0', methodName: 'deep', line: 1,
      }],
    };

    expect(resolveSuperCalls([parsed])).toEqual({ resolved: 0, unresolved: 1 });
    expect(parsed.unresolvedCalls).toContainEqual(expect.objectContaining({ callee: 'super.deep' }));
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
