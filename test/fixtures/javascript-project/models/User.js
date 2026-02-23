class User {
  constructor(id, name, email) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.role = 'user';
  }

  isAdmin() {
    return this.role === 'admin';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
    };
  }
}

class AdminUser extends User {
  constructor(id, name, email, permissions = []) {
    super(id, name, email);
    this.role = 'admin';
    this.permissions = permissions;
  }

  hasPermission(perm) {
    return this.permissions.includes(perm);
  }
}

module.exports = { User, AdminUser };
