import type { PublicA } from './named-barrel';

export function echo(value: PublicA): PublicA {
  return value;
}
