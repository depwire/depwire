import { UserService } from './services/UserService';
import { AuthService } from './services/AuthService';
import { Status } from './types';

const userService = new UserService();
const authService = new AuthService(userService);

const user = userService.addUser('Alice', 'alice@example.com', 'admin');
console.log('Created user:', user);

const found = authService.authenticate('alice@example.com');
console.log('Authenticated:', found);
console.log('Status:', Status.Active);
