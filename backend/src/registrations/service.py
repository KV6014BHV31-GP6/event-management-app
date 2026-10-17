import ulid
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from src.events.models import EventModel, EventStatusEnum  # 👈 確保引入了 EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum, UserGenderEnum, MarriageStatusTypeEnum
from src.registrations.schemas import RegistrationCreate


class RegistrationService:
    @staticmethod
    async def create_online_registration(
        db: AsyncSession,
        event_public_id: str,
        form_in: RegistrationCreate,
        current_user_id: str | None
    ) -> RegistrationModel:

        # 1. Validate Event Entity Existence
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event with public identifier '{event_public_id}' was not found."
            )

        # 2. Fixed: Correctly validate against the EventStatusEnum type object
        # Instead of event.status.lower() != "active", we check the Enum value directly
        if event.status != EventStatusEnum.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration rejected. This event is not currently accepting entries."
            )

        # 3. Strategy 5a: Search Participant strictly by national_id
        part_stmt = select(ParticipantModel).where(
            ParticipantModel.national_id == form_in.national_id)
        part_res = await db.execute(part_stmt)
        db_participant = part_res.scalar_one_or_none()

        if db_participant:
            participant_id = db_participant.id

            # Compare request payload values against existing record data properties
            has_changes = (
                db_participant.first_name != form_in.first_name or
                db_participant.last_name != form_in.last_name or
                db_participant.gender.value != form_in.gender.value or
                db_participant.date_of_birth != form_in.date_of_birth or
                db_participant.phone != form_in.phone or
                db_participant.address != form_in.address
            )

            if has_changes:
                # Update properties if tracking record has changed values
                db_participant.first_name = form_in.first_name
                db_participant.last_name = form_in.last_name
                db_participant.gender = UserGenderEnum[form_in.gender.value]
                db_participant.date_of_birth = form_in.date_of_birth
                db_participant.phone = form_in.phone
                db_participant.address = form_in.address
                db_participant.updated_by_user_id = current_user_id
                db.add(db_participant)
        else:
            # Create a completely new participant resource trace mapping row
            new_p = ParticipantModel(
                id=str(ulid.ULID()),
                user_id=current_user_id,
                first_name=form_in.first_name,
                last_name=form_in.last_name,
                gender=UserGenderEnum[form_in.gender.value],
                date_of_birth=form_in.date_of_birth,
                phone=form_in.phone,
                address=form_in.address,
                national_id=form_in.national_id
            )
            db.add(new_p)
            participant_id = new_p.id

        # 4. Enforce active double-booking unique database constraints layout
        dup_stmt = select(RegistrationModel).where(
            RegistrationModel.event_id == event.id,
            RegistrationModel.participant_id == participant_id,
            RegistrationModel.status != RegistrationStatusEnum.cancelled
        )
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This participant already holds an active registration record for this event."
            )

        # 5. Check Online Quota allocations parameters
        count_stmt = select(func.count()).select_from(RegistrationModel).where(
            RegistrationModel.event_id == event.id,
            RegistrationModel.channel == RegistrationChannelEnum.online,
            RegistrationModel.status != RegistrationStatusEnum.cancelled
        )
        count_res = await db.execute(count_stmt)
        total_active_online = count_res.scalar_one()

        if total_active_online >= event.online_quota:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration full. Online quota limits for this event are exhausted."
            )

        # 6. Instantiates Registration Object with 'pending' status property
        new_registration = RegistrationModel(
            id=str(ulid.ULID()),
            event_id=event.id,
            participant_id=participant_id,
            created_by_user_id=current_user_id,
            channel=RegistrationChannelEnum.online,
            status=RegistrationStatusEnum.pending,
            first_name=form_in.first_name,
            last_name=form_in.last_name,
            gender=UserGenderEnum[form_in.gender.value],
            date_of_birth=form_in.date_of_birth,
            phone=form_in.phone,
            address=form_in.address,
            national_id=form_in.national_id,
            income_band_code=form_in.income_band_code,
            medical_record=form_in.medical_record,
            marriage_status=MarriageStatusTypeEnum[form_in.marriage_status.value]
        )

        # 7. Commit transaction block directly inside worker boundary scope
        db.add(new_registration)
        await db.commit()
        await db.refresh(new_registration)
        return new_registration
