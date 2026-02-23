const { User, AdminUser } = require('../models/User');
const config = require('../config');

class UserService {
  constructor(dbUrl) {
    this.dbUrl = dbUrl || config.DATABASE_URL;
    this._cache = new Map();
  }

  async getAll() {
    return Array.from(this._cache.values());
  }

  async getById(id) {
    return this._cache.get(id) || null;
  }

  async create(name, email) {
    const id = this._cache.size + 1;
    const user = new User(id, name, email);
    this._cache.set(id, user);
    return user;
  }

  async createAdmin(name, email, permissions) {
    const id = this._cache.size + 1;
    const admin = new AdminUser(id, name, email, permissions);
    this._cache.set(id, admin);
    return admin;
  }
}

module.exports = { UserService };
