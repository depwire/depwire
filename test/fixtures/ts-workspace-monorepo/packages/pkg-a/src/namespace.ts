import * as tools from 'pkg-b/namespace-barrel';

export function run() {
  return tools.helperFn(2);
}

export function runAlternate() {
  return tools.alternate.helperFn(2);
}

export function cannotCallPrivate() {
  tools.privateFn();
  tools.alternate.privateFn();
}
