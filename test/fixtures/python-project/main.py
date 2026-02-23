from services.user_service import UserService
from utils.helpers import validate_email
from config import DATABASE_URL, MAX_RETRIES

def main():
    service = UserService()
    users = service.get_all()
    for user in users:
        if validate_email(user.email):
            print(f"Valid: {user.name}")

if __name__ == "__main__":
    main()
