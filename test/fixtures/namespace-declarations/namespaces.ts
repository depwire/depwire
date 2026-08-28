export namespace Outer {
  export namespace Inner {
    export interface Shape {
      value: number;
    }

    export function fn(): number {
      return 1;
    }
  }
}

export declare namespace Contracts {
  export function validate(value: string): boolean;
}

declare module "ambient-package" {
  export interface Options {
    enabled: boolean;
  }
}

export function localUse(): number {
  return Outer.Inner.fn();
}

export const namespaceType: typeof Outer.Inner = Outer.Inner;
