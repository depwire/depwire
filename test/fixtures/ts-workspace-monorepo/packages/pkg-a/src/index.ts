import { helperFn } from 'pkg-b';

export function useHelper(): number {
  return helperFn(21);
}
