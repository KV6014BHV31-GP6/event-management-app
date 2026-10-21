import ulid
<<<<<<< Updated upstream
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from src.events.models import EventModel, EventStatusEnum  # 👈 確保引入了 EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum, UserGenderEnum, MarriageStatusTypeEnum
from src.registrations.schemas import RegistrationCreate
=======
from datetime import datetime, timezone
from fastapi import HTTPException, status
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.events.models import EventModel, EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum, UserGenderEnum, MarriageStatusTypeEnum
from src.registrations.schemas import RegistrationCreate, RegistrationStatus
>>>>>>> Stashed changes


class RegistrationService:
    @staticmethod
    async def create_online_registration(
        db: AsyncSession,
        event_public_id: str,
        form_in: RegistrationCreate,
        current_user_id: str | None
    ) -> RegistrationModel:
<<<<<<< Updated upstream

=======
        """
        Executes the online registration business workflow within an atomic database transaction context.
        """
>>>>>>> Stashed changes
        # 1. Validate Event Entity Existence
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()
<<<<<<< Updated upstream
=======

>>>>>>> Stashed changes
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event with public identifier '{event_public_id}' was not found."
            )

<<<<<<< Updated upstream
        # 2. Fixed: Correctly validate against the EventStatusEnum type object
        # Instead of event.status.lower() != "active", we check the Enum value directly
=======
>>>>>>> Stashed changes
        if event.status != EventStatusEnum.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration rejected. This event is not currently accepting entries."
            )

<<<<<<< Updated upstream
        # 3. Strategy 5a: Search Participant strictly by national_id
=======
        # 2. Search Participant strictly by national_id
>>>>>>> Stashed changes
        part_stmt = select(ParticipantModel).where(
            ParticipantModel.national_id == form_in.national_id)
        part_res = await db.execute(part_stmt)
        db_participant = part_res.scalar_one_or_none()

<<<<<<< Updated upstream
        if db_participant:
            participant_id = db_participant.id

            # Compare request payload values against existing record data properties
=======
        # 3. Evaluate Participant Records Layout (Update or Create)
        if db_participant:
            participant_id = db_participant.id

            # Compare incoming request information against past records
>>>>>>> Stashed changes
            has_changes = (
                db_participant.first_name != form_in.first_name or
                db_participant.last_name != form_in.last_name or
                db_participant.gender.value != form_in.gender.value or
                db_participant.date_of_birth != form_in.date_of_birth or
                db_participant.phone != form_in.phone or
                db_participant.address != form_in.address
            )

            if has_changes:
<<<<<<< Updated upstream
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
=======
                # Update participant details if personal demographics have shifted
                db_participant.first_name = form_in.first_name
                db_participant.last_name = form_in.last_name
                db_participant.gender = UserGenderEnum(form_in.gender.value)
                db_participant.date_of_birth = form_in.date_of_birth
                db_participant.phone = form_in.phone
                db_participant.address = form_in.address
                if current_user_id:
                    db_participant.updated_by_user_id = current_user_id

                db.add(db_participant)
        else:
            # Create a completely new participant record
>>>>>>> Stashed changes
            new_p = ParticipantModel(
                id=str(ulid.ULID()),
                user_id=current_user_id,
                first_name=form_in.first_name,
                last_name=form_in.last_name,
<<<<<<< Updated upstream
                gender=UserGenderEnum[form_in.gender.value],
=======
                gender=UserGenderEnum(form_in.gender.value),
>>>>>>> Stashed changes
                date_of_birth=form_in.date_of_birth,
                phone=form_in.phone,
                address=form_in.address,
                national_id=form_in.national_id
            )
            db.add(new_p)
            participant_id = new_p.id

<<<<<<< Updated upstream
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
=======
        # 4. Create Registration (status = pending)
>>>>>>> Stashed changes
        new_registration = RegistrationModel(
            id=str(ulid.ULID()),
            event_id=event.id,
            participant_id=participant_id,
<<<<<<< Updated upstream
            created_by_user_id=current_user_id,
=======
            created_by_user_id=current_user_id,  # Null if anonymous guest
>>>>>>> Stashed changes
            channel=RegistrationChannelEnum.online,
            status=RegistrationStatusEnum.pending,
            first_name=form_in.first_name,
            last_name=form_in.last_name,
<<<<<<< Updated upstream
            gender=UserGenderEnum[form_in.gender.value],
=======
            gender=UserGenderEnum(form_in.gender.value),
>>>>>>> Stashed changes
            date_of_birth=form_in.date_of_birth,
            phone=form_in.phone,
            address=form_in.address,
            national_id=form_in.national_id,
            income_band_code=form_in.income_band_code,
            medical_record=form_in.medical_record,
<<<<<<< Updated upstream
            marriage_status=MarriageStatusTypeEnum[form_in.marriage_status.value]
        )

        # 7. Commit transaction block directly inside worker boundary scope
        db.add(new_registration)
        await db.commit()
        await db.refresh(new_registration)
        return new_registration
=======
            marriage_status=MarriageStatusTypeEnum(
                form_in.marriage_status.value)
        )
        db.add(new_registration)

        # 5. Commit Transaction cleanly
        await db.commit()
        await db.refresh(new_registration)

        return new_registration

    @classmethod
    async def get_user_registrations(
        cls,
        db: AsyncSession,
        user_id: str,
        status: Optional[RegistrationStatus] = None
    ) -> List[RegistrationModel]:
        """
        Retrieves all registrations created by a specific user, with optional status filtering.
        """
        query = select(RegistrationModel).where(
            RegistrationModel.created_by_user_id == user_id)

        if status:
            query = query.where(RegistrationModel.status ==
                                RegistrationStatusEnum(status.value))

        # Order by newest registrations first
        query = query.order_by(RegistrationModel.created_at.desc())

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def cancel_user_registration(
        db: AsyncSession,
        registration_id: str,
        user_id: str
    ) -> RegistrationModel:
        """
        Cancels an active event registration and triggers automated FIFO queue promotion 
        based on waitlisted_at order if applicable.
        """
        # 1. Fetch target registration record
        stmt = select(RegistrationModel).where(
            RegistrationModel.id == registration_id)
        res = await db.execute(stmt)
        registration = res.scalar_one_or_none()

        # 2. Validate existence
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found."
            )

        # 3. Validate Ownership constraint
        if registration.created_by_user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not possess structural ownership permissions over this registration."
            )

        # 4. Validate Status criteria (Rejected and Cancelled cannot be changed)
        if registration.status in (RegistrationStatusEnum.rejected, RegistrationStatusEnum.cancelled):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cancellation rejected. Cannot transition from current status '{registration.status.value}'."
            )

        # Snapshot prior status condition
        was_approved = registration.status == RegistrationStatusEnum.approved
        now_utc = datetime.now(timezone.utc)

        # 5. Record the status of the registration (Update cancellation logs)
        registration.status = RegistrationStatusEnum.cancelled
        registration.cancelled_at = now_utc
        registration.cancelled_by_user_id = user_id
        registration.updated_at = now_utc
        db.add(registration)

        # 6. Check if registration was approved before to trigger queue promotion
        if was_approved:
            # Find the oldest waitlisted entry sorted strictly by waitlisted_at ascending (FIFO)
            queue_stmt = (
                select(RegistrationModel)
                .where(
                    RegistrationModel.event_id == registration.event_id,
                    RegistrationModel.status == RegistrationStatusEnum.waiting
                )
                .order_by(RegistrationModel.waitlisted_at.asc())
                .limit(1)
            )
            queue_res = await db.execute(queue_stmt)
            next_in_line = queue_res.scalar_one_or_none()

            # 7. Elevate waitlist candidate to approved
            if next_in_line:
                next_in_line.status = RegistrationStatusEnum.approved
                # next_in_line.waitlist_position = None
                # next_in_line.waitlisted_at = None
                next_in_line.updated_at = now_utc
                db.add(next_in_line)

        # 8. Commit changes transactionally
        await db.commit()
        await db.refresh(registration)

        return registration

    @classmethod
    async def get_all_registrations(
        cls,
        db: AsyncSession,
        status: Optional[RegistrationStatus] = None
    ) -> List[RegistrationModel]:
        """
        Retrieves global registration entries across all system events with optional status filtering.
        Ordered chronologically with the newest entries listed first.
        """
        query = select(RegistrationModel)

        # Apply state filtering criteria parameters if explicitly passed by client queries
        if status:
            query = query.where(RegistrationModel.status ==
                                RegistrationStatusEnum(status.value))

        # Sort chronologically: display latest requests at the top index locations
        query = query.order_by(RegistrationModel.created_at.desc())

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_registration_by_id(
        db: AsyncSession,
        registration_id: str
    ) -> RegistrationModel:
        """
        Queries and retrieves a single registration record by its specific ID.
        Raises an HTTP 404 Exception if no matching record is found in the database.
        """
        stmt = select(RegistrationModel).where(
            RegistrationModel.id == registration_id)
        res = await db.execute(stmt)
        registration = res.scalar_one_or_none()

        # Handle nonexistent data boundary states
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found."
            )

        return registration

    @staticmethod
    async def approve_registration(
        db: AsyncSession,
        registration_id: str,
        organizer_id: str
    ) -> RegistrationModel:
        """
        Executes the registration approval workflow after verifying capacity rules.
        """
        # 1. Verify registration exists
        reg_stmt = select(RegistrationModel).where(
            RegistrationModel.id == registration_id)
        reg_res = await db.execute(reg_stmt)
        registration = reg_res.scalar_one_or_none()

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found."
            )

        # 2. Verify the registrations.status = "pending", otherwise -> 409 Conflict
        if registration.status != RegistrationStatusEnum.pending:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval rejected. Action can only be executed on 'pending' records. Current state is '{registration.status.value}'."
            )

        # 3. Load event
        event_stmt = select(EventModel).where(
            EventModel.id == registration.event_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()

        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The event linked to this registration no longer exists."
            )

        # 4. Calculate capacity
        total_capacity = event.online_quota + event.offline_quota

        # 5. Calculate already approved registrations
        count_stmt = (
            select(func.count())
            .select_from(RegistrationModel)
            .where(
                RegistrationModel.event_id == registration.event_id,
                RegistrationModel.status == RegistrationStatusEnum.approved
            )
        )
        count_res = await db.execute(count_stmt)
        approved_count = count_res.scalar_one()

        # 6 & 7. Determine final status & Save review information to registrations table
        now_utc = datetime.now(timezone.utc)

        if approved_count < total_capacity:
            # Capacity Available -> Update the status = approved
            registration.status = RegistrationStatusEnum.approved
        else:
            # Full -> Update the status = waiting and waitlisted_at = NOW()
            registration.status = RegistrationStatusEnum.waiting
            registration.waitlisted_at = now_utc

            # (Optional but recommended) Calculate the next sequential waitlist position
            # position_stmt = (
            # select(func.count())
            # .select_from(RegistrationModel)
            # .where(
            # RegistrationModel.event_id == registration.event_id,
            # RegistrationModel.status == RegistrationStatusEnum.waiting
            # )
            # )
            # position_res = await db.execute(position_stmt)
            # current_waiting_count = position_res.scalar_one()
            # registration.waitlist_position = current_waiting_count + 1

        # Save universal review audit footprints
        registration.reviewed_by_user_id = organizer_id
        registration.reviewed_at = now_utc
        registration.updated_at = now_utc

        # Persist everything safely down within an atomic transaction block context boundary
        db.add(registration)
        await db.commit()
        await db.refresh(registration)

        return registration
>>>>>>> Stashed changes
