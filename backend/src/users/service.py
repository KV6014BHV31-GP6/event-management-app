import ulid
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError

from src.core.security import hash_password
from src.users.models import UserModel, UserRoleEnum
from src.users.schemas import UserCreate, UserRole


class UserService:
    @staticmethod
    async def create_user(db: AsyncSession, user_in: UserCreate) -> UserModel:
        if user_in.role != UserRole.USER:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Public Signup only creates user accounts.")
        # Check uniqueness
        query = select(UserModel).where(UserModel.username == user_in.username)
        result = await db.execute(query)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username is already registered."
            )

        # Assemble DB record
        new_user = UserModel(
            # Using str(ulid.ULID()) converts it to a standard 26-char string cleanly
            id=str(ulid.ULID()),
            username=user_in.username,
            password_hash=hash_password(user_in.password),
            role=UserRoleEnum.user
        )

        db.add(new_user)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username is already registered.") from None
        await db.refresh(new_user)
        return new_user
