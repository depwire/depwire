function target() {}
function mark(_value: unknown) { return () => {}; }

@mark(target())
export class Decorated {
  @mark(target())
  method(@mark(target()) value = target()) {
    target();
  }
}

function mixin() { return class {}; }
export class Derived extends mixin() {}
type ExternalType = typeof import('outside-package');

export const withDefault = (value = target()) => value;
