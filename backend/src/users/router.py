from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.core.database import get_async_db
from src.users.models import UserModel
from src.users.schemas import UserCreate, UserResponse
from src.users.service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_async_db)
):
    return await UserService.create_user(db=db, user_in=user_in)


@router.get("/me", response_model=UserResponse)
async def get_my_profile(
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieves the current authenticated user's profile information.
    Requires a valid JWT token passed via the Authorization Bearer header.
    """
    # Direct return; FastAPI automatically uses the UserResponse schema
    # to serialize the SQLAlchemy model instance into JSON.
    return current_user
