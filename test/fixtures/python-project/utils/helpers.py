import re
from typing import Optional

EMAIL_REGEX = re.compile(r'^[\w\.-]+@[\w\.-]+\.\w+$')

def validate_email(email: str) -> bool:
    return bool(EMAIL_REGEX.match(email))

def slugify(text: str) -> str:
    return re.sub(r'[^\w]+', '-', text.lower()).strip('-')

def truncate(text: str, max_length: int = 100) -> str:
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."
