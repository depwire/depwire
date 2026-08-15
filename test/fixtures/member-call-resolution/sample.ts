// Fixture for the member-call resolution regression test (#14).
// Contains a local `push` function whose name collides with a common
// builtin/prototype method, plus a class exercising this./super. calls.

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
