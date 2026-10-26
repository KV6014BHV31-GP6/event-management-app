from datetime import datetime, timedelta, timezone
import jwt
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_async_db
from src.core.security import verify_password, create_access_token
from src.users.models import UserModel
from src.auth.schemas import Token, UserLoginRequest
from src.auth.deps import verify_refresh_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


def create_refresh_token(username: str) -> str:
    """
    Generates a secure, long-lived refresh token string distinct from short access tokens.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {
        "sub": username,
        "type": "refresh",
        "exp": expire
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """
    Encapsulates the secure cookie configuration properties uniformly.
    """
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,            # Prevent XSS scripts access
        secure=True,              # Encrypted transport restriction over HTTPS tunnels
        samesite="strict",        # Prevent CSRF cross-origin flight patterns
        max_age=7 * 24 * 60 * 60,  # 7 days duration lifespans match
        path="/"                  # Globally accessible throughout context paths
    )


@router.post(
    "/token",
    response_model=Token,
    summary="OAuth2 Compatible Token Login (Form Data)",
    description="This endpoint enables the Swagger UI 'Authorize' system to work natively using standard form data parameters."
)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_async_db)
):
    query = select(UserModel).where(UserModel.username == form_data.username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_payload = {
        "sub": user.username,
        "role": user.role.value
    }
    access_token = create_access_token(data=token_payload)
    refresh_token = create_refresh_token(username=user.username)

    # Attach the secure refresh cookie container
    set_refresh_cookie(response=response, refresh_token=refresh_token)

    return Token(access_token=access_token)


@router.post(
    "/login",
    response_model=Token,
    summary="User Login via JSON Body",
    description="Allows modern client architectures to authenticate by sending standard JSON body structures."
)
async def login_via_json(
    response: Response,
    login_in: UserLoginRequest,
    db: AsyncSession = Depends(get_async_db)
):
    query = select(UserModel).where(UserModel.username == login_in.username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_payload = {
        "sub": user.username,
        "role": user.role.value
    }
    access_token = create_access_token(data=token_payload)
    refresh_token = create_refresh_token(username=user.username)

    # Attach the secure refresh cookie container
    set_refresh_cookie(response=response, refresh_token=refresh_token)

    return Token(access_token=access_token)


@router.post(
    "/refresh",
    response_model=Token,
    status_code=status.HTTP_200_OK,
    summary="Renew access token signatures via rotational cookie mechanics"
)
async def refresh_access_token_endpoint(
    response: Response,
    current_user: UserModel = Depends(verify_refresh_token)
):
    """
    Exchanges a valid long-lived Refresh Token cookie for a fresh short-lived Access Token.
    Implements token rotation by regenerating both tokens on every execution cycle.
    """
    token_payload = {
        "sub": current_user.username,
        "role": current_user.role.value
    }
    new_access_token = create_access_token(data=token_payload)
    new_refresh_token = create_refresh_token(username=current_user.username)

    # Overwrite cookie context with updated token rotation signature strings
    set_refresh_cookie(response=response, refresh_token=new_refresh_token)

    return Token(access_token=new_access_token)


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="User Logout",
    description="Explicitly clear the session footprint and wipe the secure refresh token cookie container from the client browser context."
)
async def logout_endpoint(response: Response):
    """
    Clears the HttpOnly refresh token cookie on the client side.
    """
    # Overwrites the cookie with an expired lifespan frame to force instant browser deletion
    response.delete_cookie(
        key="refresh_token",
        path="/",
        httponly=True,
        secure=True,
        samesite="strict"
    )

    return {"detail": "Successfully logged out and secure session context cleared."}
