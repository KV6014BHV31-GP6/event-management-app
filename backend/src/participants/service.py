import ulid
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from src.participants.models import ParticipantModel
from src.registrations.models import UserGenderEnum
from src.users.models import UserModel, UserRoleEnum


class ParticipantService:
    @staticmethod
    async def resolve_for_registration(db, form, user_id):
        if user_id is not None:
            # Controlled writers use event -> user -> participant order. Unique keys
            # remain the cross-event/other-writer backstop, not identity evidence.
            await db.execute(select(UserModel.id).where(UserModel.id == user_id).with_for_update())
            own = await db.scalar(select(ParticipantModel).where(
                ParticipantModel.user_id == user_id).with_for_update().execution_options(populate_existing=True))
            if own is not None:
                if own.national_id != form.national_id:
                    raise HTTPException(403, "Participant identity cannot be matched to this request.")
                for key in ['first_name', 'last_name', 'date_of_birth', 'phone', 'address']:
                    setattr(own, key, getattr(form, key))
                own.gender = UserGenderEnum(form.gender.value)
                own.updated_by_user_id = user_id
                return own
        found = await db.scalar(select(ParticipantModel.id).where(ParticipantModel.national_id == form.national_id))
        if found is not None:
            raise HTTPException(403, "Participant identity cannot be matched to this request.")
        participant = ParticipantModel(id=str(ulid.ULID()), user_id=user_id,
            first_name=form.first_name, last_name=form.last_name, gender=UserGenderEnum(form.gender.value),
            date_of_birth=form.date_of_birth, phone=form.phone, address=form.address,
            national_id=form.national_id, updated_by_user_id=user_id)
        db.add(participant)
        await db.flush()  # Explicit FK ordering with autoflush=False.
        return participant

    @staticmethod
    async def create_participant(db, participant_in, current_user):
        # Keep D's standalone create surface, not R's new administrative routes.
        assigned = current_user.id if current_user and current_user.role == UserRoleEnum.user else None
        try:
            if assigned and await db.scalar(select(ParticipantModel.id).where(ParticipantModel.user_id == assigned)):
                raise HTTPException(400, "A participant profile is already linked to your user account.")
            participant = await ParticipantService.resolve_for_registration(db, participant_in, assigned)
            if current_user and assigned is None:
                participant.updated_by_user_id = current_user.id
            await db.commit()
            await db.refresh(participant)
            return participant
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, "Participant identity could not be created. No changes were saved.") from None
        except Exception:
            await db.rollback()
            raise
