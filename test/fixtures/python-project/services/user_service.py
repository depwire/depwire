from typing import List, Optional
from models.user import User, AdminUser
from config import DATABASE_URL

class UserService:
    def __init__(self):
        self.db_url = DATABASE_URL
        self._cache = {}
    
    def get_all(self) -> List[User]:
        return []
    
    def get_by_id(self, user_id: int) -> Optional[User]:
        return self._cache.get(user_id)
    
    def create_admin(self, name: str, email: str) -> AdminUser:
        admin = AdminUser(id=0, name=name, email=email, role="admin")
        return admin
