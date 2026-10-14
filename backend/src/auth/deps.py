import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.config import settings
from src.core.database import get_async_db
from src.users.models import UserModel
from src.auth.schemas import TokenData

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/token"
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_async_db)
) -> UserModel:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        username: str | None = payload.get("sub")

        if username is None:
            raise credentials_exception

        token_data = TokenData(username=username)

    except (jwt.PyJWTError, ValueError):
        raise credentials_exception

    query = select(UserModel).where(UserModel.username == token_data.username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def get_optional_current_user(
    request: Request,
    db: AsyncSession = Depends(get_async_db)
) -> UserModel | None:
    """
    Safely resolves the current user context if a token exists. 
    Bypasses authentication failure cleanly to allow anonymous traffic.
    """
    authorization: str | None = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        # Splits 'Bearer <token_string>' into list array elements
        parts = authorization.split(" ")
        if len(parts) != 2:
            return None

        token = parts[1]

        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        username: str | None = payload.get("sub")
        if username is None:
            return None

        query = select(UserModel).where(UserModel.username == username)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    except (jwt.PyJWTError, ValueError, IndexError):
        return None
