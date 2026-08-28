import { Outer } from './namespaces.js';

export function importedUse(): number {
  return Outer.Inner.fn();
}

export const importedNamespaceType: typeof Outer.Inner = Outer.Inner;
