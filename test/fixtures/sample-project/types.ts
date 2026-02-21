export interface User {
  id: string;
  name: string;
  email: string;
}

export type UserRole = 'admin' | 'user' | 'guest';

export enum Status {
  Active = 'active',
  Inactive = 'inactive',
}
