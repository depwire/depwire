import { User, UserRole, Status } from '../types';
import { add } from '../utils';

export class UserService {
  private users: User[] = [];

  addUser(name: string, email: string, role: UserRole): User {
    const id = add(this.users.length, 1).toString();
    const user: User = { id, name, email };
    this.users.push(user);
    return user;
  }

  getActiveUsers(): User[] {
    return this.users;
  }

  getUserCount(): number {
    return this.users.length;
  }
}
