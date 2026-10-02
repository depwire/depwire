import { describe, it, expect } from 'vitest';
import { DirectedGraph } from 'graphology';
import { classifyDeadSymbols } from '../src/dead-code/classifier.js';
import type { DeadSymbol } from '../src/dead-code/types.js';

/**
 * Reachability tests for every confidence branch in the dead-code classifier.
 *
 * The classifier receives only in-degree-zero symbols from the detector, so
 * every input has dependents === 0. The bug was that the general
 * zero-dependent branch ran first and returned "high" for all of them, making
 * the type-only / constructor / dynamic-dispatch mitigations unreachable.
 */
function makeSymbol(partial: Partial<DeadSymbol> & Pick<DeadSymbol, 'name' | 'kind' | 'file'>): DeadSymbol {
  return {
    line: 1,
    exported: false,
    dependents: 0,
    confidence: 'high',
    reason: 'Zero dependents',
    ...partial,
  } as DeadSymbol;
}

function classify(symbol: DeadSymbol) {
  // The classifier no longer queries the graph, but the public signature still
  // accepts one for API compatibility. Any empty graph satisfies it.
  const graph = new DirectedGraph();
  return classifyDeadSymbols([symbol], graph)[0];
}

describe('dead-code confidence classifier', () => {
  it('classifies a non-exported plain function as high confidence', () => {
    const symbol = classify(makeSymbol({ name: 'orphanFn', kind: 'function', file: 'src/utils.ts' }));
    expect(symbol.confidence).toBe('high');
    expect(symbol.reasonCode).toBe('not-exported-zero-dependents');
    expect(symbol.reason).toBe('Not exported, zero references');
  });

  it('classifies an exported non-barrel symbol as medium confidence', () => {
    const symbol = classify(makeSymbol({ name: 'publicFn', kind: 'function', file: 'src/utils.ts', exported: true }));
    expect(symbol.confidence).toBe('medium');
    expect(symbol.reasonCode).toBe('exported-no-dependents');
    expect(symbol.reason).toBe('Exported, zero dependents');
  });

  it('classifies an exported barrel-file symbol as medium confidence', () => {
    const symbol = classify(makeSymbol({ name: 'barrelFn', kind: 'function', file: 'src/utils/index.ts', exported: true }));
    expect(symbol.confidence).toBe('medium');
    expect(symbol.reasonCode).toBe('barrel-export');
    expect(symbol.reason).toBe('Exported from barrel file, zero dependents (might be used externally)');
  });

  it('classifies an exported root index.ts symbol as medium confidence (barrel)', () => {
    const symbol = classify(makeSymbol({ name: 'entryFn', kind: 'function', file: 'src/index.ts', exported: true }));
    expect(symbol.confidence).toBe('medium');
    expect(symbol.reasonCode).toBe('barrel-export');
  });

  it('classifies an interface as low confidence (type-only usage)', () => {
    const symbol = classify(makeSymbol({ name: 'IFoo', kind: 'interface', file: 'src/types.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('type-only-symbol');
    expect(symbol.reason).toBe('Type-only symbol (might be used via import type)');
  });

  it('classifies a type alias as low confidence (type-only usage)', () => {
    const symbol = classify(makeSymbol({ name: 'FooType', kind: 'type_alias', file: 'src/types.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('type-only-symbol');
  });

  it('classifies a class constructor as low confidence (invoked via new ClassName)', () => {
    const symbol = classify(makeSymbol({ name: 'constructor', kind: 'method', file: 'src/service.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('constructor-via-class');
    expect(symbol.reason).toBe('Constructor (invoked via new ClassName, not this symbol)');
  });

  it('classifies a route handler as low confidence (dynamic dispatch)', () => {
    const symbol = classify(makeSymbol({ name: 'getUser', kind: 'function', file: 'src/routes/user.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('dynamic-dispatch');
    expect(symbol.reason).toBe('In dynamic-use pattern directory (might be auto-loaded)');
  });

  it('classifies a page component as low confidence (dynamic dispatch)', () => {
    const symbol = classify(makeSymbol({ name: 'HomePage', kind: 'function', file: 'src/pages/home.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('dynamic-dispatch');
  });

  it('classifies a middleware function as low confidence (dynamic dispatch)', () => {
    const symbol = classify(makeSymbol({ name: 'authMiddleware', kind: 'function', file: 'src/middleware/auth.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('dynamic-dispatch');
  });

  it('classifies a command handler as low confidence (dynamic dispatch)', () => {
    const symbol = classify(makeSymbol({ name: 'deployCmd', kind: 'function', file: 'src/commands/deploy.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('dynamic-dispatch');
  });

  it('classifies an api handler as low confidence (dynamic dispatch)', () => {
    const symbol = classify(makeSymbol({ name: 'apiHandler', kind: 'function', file: 'src/api/health.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('dynamic-dispatch');
  });

  it('prefers type-only classification over dynamic-dispatch for interfaces in routes', () => {
    const symbol = classify(makeSymbol({ name: 'IRoute', kind: 'interface', file: 'src/routes/user.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('type-only-symbol');
  });

  it('prefers constructor classification over dynamic-dispatch for controllers', () => {
    const symbol = classify(makeSymbol({ name: 'constructor', kind: 'method', file: 'src/controllers/user.ts' }));
    expect(symbol.confidence).toBe('low');
    expect(symbol.reasonCode).toBe('constructor-via-class');
  });
});
