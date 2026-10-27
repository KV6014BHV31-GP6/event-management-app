from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher
from src.core.config import settings

password_context = PasswordHash((BcryptHasher(),))


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_context.verify(plain_password, hashed_password)

# --- New JWT Functions ---


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Generates a cryptographically signed JWT access token.
    """
    to_encode = data.copy()

    # Calculate token expiration time
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(
            timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    # Standard JWT claims use 'exp' for expiration timestamp
    to_encode.update({"exp": expire, "type": "access"})

    # Sign the token using HS256 algorithm and our application secret key
    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")
    return encoded_jwt
