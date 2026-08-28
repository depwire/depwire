import { type RootType, rootValue } from 'pkg-root/internal';

export interface UsesRootType {
  nested: RootType;
}

export const value = rootValue;
