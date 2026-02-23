from dataclasses import dataclass
from typing import Optional

@dataclass
class User:
    id: int
    name: str
    email: str
    role: str = "user"
    
    def is_admin(self) -> bool:
        return self.role == "admin"

@dataclass  
class AdminUser(User):
    permissions: list = None
    
    def grant_permission(self, perm: str):
        if self.permissions is None:
            self.permissions = []
        self.permissions.append(perm)
