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
            token, settings.JWT_SECRET_KEY, algorithms=["HS256"],
            options={"require": ["sub", "exp"]})
        username: str | None = payload.get("sub")

        if not isinstance(username, str) or not username or payload.get("type") not in (None, "access"):
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
    """Only an absent header is Guest; invalid credentials never become anonymous."""
    authorization = request.headers.get("Authorization")
    if authorization is None:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Malformed authorization header structure.",
                            headers={"WWW-Authenticate": "Bearer"})
    return await get_current_user(token=parts[1], db=db)


def get_refresh_token_from_cookie(request: Request) -> str:
    """
    Extracts the refresh token from secure HttpOnly cookies.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing from secure storage context.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return refresh_token


async def verify_refresh_token(
    token: str = Depends(get_refresh_token_from_cookie),
    db: AsyncSession = Depends(get_async_db)
) -> UserModel:
    """
    Validates the refresh token cryptographic signature and retrieves the tied user record.
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        username: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")

        if username is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token metadata context structure."
            )

        query = select(UserModel).where(UserModel.username == username)
        result = await db.execute(query)
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User associated with token does not exist."
            )

        return user

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired. Full re-authentication signature required."
        )
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
