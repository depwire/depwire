import { User } from '../types';
import { UserService } from './UserService';

export class AuthService {
  constructor(private userService: UserService) {}

  authenticate(email: string): User | null {
    const users = this.userService.getActiveUsers();
    return users.find(u => u.email === email) || null;
  }
}
