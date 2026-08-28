export interface A {
  id: string;
}

export class Outer {}

export namespace Outer {
  export interface Inner {
    nested: boolean;
  }
}
