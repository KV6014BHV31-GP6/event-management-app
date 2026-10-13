from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_async_db
from src.core.security import verify_password, create_access_token
from src.users.models import UserModel
from src.auth.schemas import Token, UserLoginRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/token",
    response_model=Token,
    summary="OAuth2 Compatible Token Login (Form Data)",
    description="This endpoint enables the Swagger UI 'Authorize' system to work natively using standard form data parameters."
)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Accepts standard form-encoded data parameters:
    - **username**: User account name string
    - **password**: Plain-text password string
    """
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

    return Token(access_token=access_token)


@router.post(
    "/login",
    response_model=Token,
    summary="User Login via JSON Body",
    description="Allows modern client architectures to authenticate by sending standard JSON body structures."
)
async def login_via_json(
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

    return Token(access_token=access_token)
