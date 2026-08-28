import type { A } from './types';
import type { Outer } from './types';

interface LocalParent {}
type LocalAlias = LocalParent;
type GenericAlias = Map<string, LocalParent>;

interface Child extends LocalParent {
  property: A;
  nested: Outer.Inner;
  method(input: LocalAlias): A;
}

class Implementation implements Child {
  property = {} as A;

  method(input: LocalAlias): A {
    const checked = input satisfies LocalAlias;
    return checked as A;
  }
}

export function convert(input: A): LocalAlias {
  return input as LocalAlias;
}
