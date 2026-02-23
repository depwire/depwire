import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///db.sqlite3")
MAX_RETRIES = 3
DEBUG = True
API_VERSION = "v2"
TIMEOUT_SECONDS = 30

