import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.config import settings
from src.core.database import get_async_db
from src.users.models import UserModel, UserRoleEnum

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/token", auto_error=False)


def credentials_error():
    return HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not validate credentials",
                         headers={"WWW-Authenticate": "Bearer"})


async def resolve_user(request: Request, db: AsyncSession, *, optional: bool = False):
    authorization = request.headers.get("Authorization")
    if authorization is None and optional:
        return None
    parts = authorization.split() if authorization is not None else []
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise credentials_error()
    try:
        payload = jwt.decode(parts[1], settings.JWT_SECRET_KEY, algorithms=["HS256"],
                             options={"require": ["exp", "sub"]})
        username = payload.get("sub")
        if not isinstance(username, str) or not username.strip() or payload.get("type") not in (None, "access"):
            raise credentials_error()
    except (jwt.PyJWTError, ValueError, TypeError):
        raise credentials_error() from None
    user = await db.scalar(select(UserModel).where(UserModel.username == username))
    if user is None:
        raise credentials_error()
    return user  # Role and identity come from the DB, never a caller/JWT role claim.


async def get_current_user(request: Request, token: str | None = Depends(oauth2_scheme),
                           db: AsyncSession = Depends(get_async_db)) -> UserModel:
    return await resolve_user(request, db)


async def get_optional_current_user(request: Request, db: AsyncSession = Depends(get_async_db)) -> UserModel | None:
    return await resolve_user(request, db, optional=True)


async def require_organizer(current_user: UserModel = Depends(get_current_user)) -> UserModel:
    if current_user.role != UserRoleEnum.organizer:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Access denied. This endpoint is restricted to system organizers only.")
    return current_user
