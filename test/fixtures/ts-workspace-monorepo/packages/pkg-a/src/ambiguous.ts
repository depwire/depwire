import * as ambiguous from 'pkg-b/ambiguous-barrel';

export function run() {
  ambiguous.helperFn(2);
}
