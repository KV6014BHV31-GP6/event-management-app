import os
import ulid
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError

from src.core.security import hash_password
from src.users.models import UserModel
from src.users.schemas import UserCreate


class UserService:
    @staticmethod
    async def create_user(db: AsyncSession, user_in: UserCreate) -> UserModel:
        if user_in.role.value != "user":
            raise HTTPException(status_code=403, detail="Public signup can only create a user account.")
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
            role=user_in.role.value
        )

        db.add(new_user)
        namespace = os.getenv('NU_DEMO_NAMESPACE', '')
        if os.getenv('NU_DEMO_PROFILE') == 'synthetic' and namespace and new_user.username.startswith(namespace):
            from src.journey.models import JourneyState
            db.add(JourneyState(key='account:' + new_user.id, kind='account', version=1, data={'enabled': True}))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            if await db.scalar(select(UserModel.id).where(UserModel.username == user_in.username)):
                raise HTTPException(status_code=400, detail="Username is already registered.") from None
            raise
        await db.refresh(new_user)
        return new_user
