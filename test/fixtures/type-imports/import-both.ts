import { type A, B } from './x';

export function useX(a: A): number {
  return B() + (a ? 1 : 0);
}
