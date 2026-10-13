import ulid
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.participants.models import ParticipantModel
from src.participants.schemas import ParticipantCreate
from src.users.models import UserModel


class ParticipantService:
    @staticmethod
    async def create_participant(
        db: AsyncSession,
        participant_in: ParticipantCreate,
        current_user: UserModel | None
    ) -> ParticipantModel:

        # Rule 1 Default: No account active, initialize both tracking parameters as null
        assigned_user_id = None
        assigned_updated_by = None

        if current_user:
            # Rule 2: User profile registers themselves
            if current_user.role.value == "user":
                assigned_user_id = current_user.id
                assigned_updated_by = current_user.id

            # Rule 3: Organizer or Leader assists an external user registration
            elif current_user.role.value in ("organizer", "leader"):
                assigned_user_id = None
                assigned_updated_by = current_user.id

        # Unique Check: Ensure a physical user profile doesn't spawn duplicate mapping models
        if assigned_user_id:
            user_stmt = select(ParticipantModel).where(
                ParticipantModel.user_id == assigned_user_id)
            user_result = await db.execute(user_stmt)
            if user_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A participant profile is already linked to your user account."
                )

        # Unique Check: Ensure unique telephone constraints map smoothly
        phone_stmt = select(ParticipantModel).where(
            ParticipantModel.phone == participant_in.phone)
        phone_result = await db.execute(phone_stmt)
        if phone_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is already registered."
            )

        new_participant = ParticipantModel(
            id=str(ulid.ULID()),
            user_id=assigned_user_id,
            first_name=participant_in.first_name,
            last_name=participant_in.last_name,
            gender=participant_in.gender.value,
            date_of_birth=participant_in.date_of_birth,
            phone=participant_in.phone,
            address=participant_in.address,
            national_id=participant_in.national_id,
            updated_by_user_id=assigned_updated_by
        )

        db.add(new_participant)
        await db.commit()
        await db.refresh(new_participant)
        return new_participant
