// Fixture for the member-call resolution regression test (#14).
// Contains a local `push` function whose name collides with a common
// builtin/prototype method, plus a class exercising this./super. calls.

import { CrossFileBase, ImportedCtor } from './target.js';
import { ExternalBase, externalCall } from 'external-call-package';

export function push(x: number): number {
  return x + 1;
}

export function useLocalArray(): void {
  const arr: number[] = [];
  // arr.push(x) -- receiver `arr` is a local array, not the `push` function
  // above. Before the fix, the blind fallback guessed sample.ts::push here
  // (a wrong edge, purely from name collision). After the fix: no edge.
  arr.push(1);
}

export class Base {
  helper(): number {
    return 1;
  }
}

export class Derived extends Base {
  method(): number {
    // this.method() -- receiver is knowable (the enclosing class); should
    // resolve to a real declared member and keep producing an edge.
    return this.other();
  }

  other(): number {
    // super.helper() -- also a knowable receiver; kept.
    return super.helper();
  }
}

export class CrossFileDerived extends CrossFileBase {
  method(): number {
    return super.inherited();
  }
}

export class ExternalDerived extends ExternalBase {
  method(): number {
    return super.notProjectLocal();
  }
}

// Bare identifiers need lexical/value evidence too. These names deliberately
// collide with class members, parameters, globals, and external imports.
export class BareCallCollisions {
  transaction(): number {
    return 0;
  }

  Error(): number {
    return 0;
  }

  callable(): number {
    return 0;
  }

  invokeCallback(transaction: () => number): number {
    return transaction();
  }

  invokeDestructured(source: { callable: () => number }): number {
    const { callable } = source;
    return callable();
  }

  constructGlobal(): Error {
    return new Error('not the Error method above');
  }
}

export function constructImported(): ImportedCtor {
  return new ImportedCtor();
}

export function invokeExternal(): void {
  externalCall();
}
