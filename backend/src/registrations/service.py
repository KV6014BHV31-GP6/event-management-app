import ulid
from datetime import datetime, timezone
from fastapi import HTTPException, status
from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from src.events.models import EventModel, EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum, UserGenderEnum, RegistrationFileModel
from src.registrations.schemas import RegistrationCreate, RegistrationStatus


class RegistrationService:
    @staticmethod
    async def create_online_registration(
        db: AsyncSession,
        event_public_id: str,
        form_in: RegistrationCreate,
        current_user_id: str | None
    ) -> RegistrationModel:
        """
        Executes the online registration business workflow within an atomic database transaction context.
        """
        # 1. Enforce validation constraint on uploaded supporting document files
        if len(form_in.file_ids) > 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration rejected. You can upload a maximum of 3 supporting documents."
            )

        # 2. Validate Event Entity Existence
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()

        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event with public identifier '{event_public_id}' was not found."
            )

        if event.status != EventStatusEnum.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration rejected. This event is not currently accepting entries."
            )

        # 3. Search Participant strictly by national_id
        part_stmt = select(ParticipantModel).where(
            ParticipantModel.national_id == form_in.national_id)
        part_res = await db.execute(part_stmt)
        db_participant = part_res.scalar_one_or_none()

        # 4. Evaluate Participant Records Layout (Update or Create)
        if db_participant:
            participant_id = db_participant.id

            # Compare incoming request information against past records
            has_changes = (
                db_participant.first_name != form_in.first_name or
                db_participant.last_name != form_in.last_name or
                db_participant.gender.value != form_in.gender.value or
                db_participant.date_of_birth != form_in.date_of_birth or
                db_participant.phone != form_in.phone or
                db_participant.address != form_in.address
            )

            if has_changes:
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
            new_p = ParticipantModel(
                id=str(ulid.ULID()),
                user_id=current_user_id,
                first_name=form_in.first_name,
                last_name=form_in.last_name,
                gender=UserGenderEnum(form_in.gender.value),
                date_of_birth=form_in.date_of_birth,
                phone=form_in.phone,
                address=form_in.address,
                national_id=form_in.national_id
            )
            db.add(new_p)
            participant_id = new_p.id

        # 5. Check for duplicate active registrations (status != 'cancelled')
        dup_stmt = select(RegistrationModel).where(
            RegistrationModel.event_id == event.id,
            RegistrationModel.participant_id == participant_id,
            RegistrationModel.status != RegistrationStatusEnum.cancelled
        )
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration rejected. An active registration already exists for this participant."
            )

        # 6. Create Registration (channel = online, status = pending)
        registration_id = str(ulid.ULID())
        new_registration = RegistrationModel(
            id=registration_id,
            event_id=event.id,
            participant_id=participant_id,
            created_by_user_id=current_user_id,  # Null if anonymous guest
            channel=RegistrationChannelEnum.online,
            status=RegistrationStatusEnum.pending,
            first_name=form_in.first_name,
            last_name=form_in.last_name,
            gender=UserGenderEnum(form_in.gender.value),
            date_of_birth=form_in.date_of_birth,
            phone=form_in.phone,
            address=form_in.address,
            national_id=form_in.national_id,
            income_band_code=form_in.income_band_code
        )
        db.add(new_registration)

        # 7. Create records in registration_files mapping entities
        for fid in form_in.file_ids:
            reg_file = RegistrationFileModel(
                registration_id=registration_id,
                file_id=fid
            )
            db.add(reg_file)

        # 8. Commit Transaction cleanly
        await db.commit()

        # 9. Load registration object with event relationship loaded eagerly to satisfy response mapping schema layout without extra lazy-loading
        final_stmt = (
            select(RegistrationModel)
            .options(selectinload(RegistrationModel.event))
            .where(RegistrationModel.id == registration_id)
        )
        final_res = await db.execute(final_stmt)
        return final_res.scalar_one()

    @classmethod
    async def get_user_registrations(
        cls,
        db: AsyncSession,
        user_id: str,
        status: Optional[RegistrationStatus] = None,
        keyword: Optional[str] = None
    ) -> dict:
        """
        Retrieves all registrations created by a specific user with filtering parameters.
        Returns a dictionary formatted for UserRegistrationsListResponse.
        """
        # Base query joining the EventModel for filtering and eager loading
        query = (
            select(RegistrationModel)
            .join(RegistrationModel.event)
            .options(selectinload(RegistrationModel.event))
            .where(RegistrationModel.created_by_user_id == user_id)
        )

        # Apply registration status filtering if provided
        if status:
            query = query.where(RegistrationModel.status ==
                                RegistrationStatusEnum(status.value))

        # Apply keyword search on event title (case-insensitive) if provided
        if keyword:
            query = query.where(EventModel.title.ilike(f"%{keyword}%"))

        # Order chronologically by newest registrations first
        query = query.order_by(RegistrationModel.created_at.desc())

        result = await db.execute(query)
        registrations = list(result.scalars().all())

        # Construct envelope-wrapped response structure
        return {
            "data": registrations,
            "total_count": len(registrations)
        }

    @staticmethod
    async def get_user_registration_detail(
        db: AsyncSession,
        registration_id: str,
        user_id: str
    ) -> RegistrationModel:
        """
        Queries and retrieves a single registration record created by the authenticated user.
        Eagerly loads event, income band, and uploaded file objects to prevent lazy-loading issues.
        """
        stmt = (
            select(RegistrationModel)
            .options(
                selectinload(RegistrationModel.event),
                selectinload(RegistrationModel.income_band),
                selectinload(RegistrationModel.file_assignments).selectinload(RegistrationFileModel.file)
            )
            .where(
                RegistrationModel.id == registration_id,
                RegistrationModel.created_by_user_id == user_id
            )
        )
        
        res = await db.execute(stmt)
        registration = res.scalar_one_or_none()

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found or access is denied."
            )

        return registration


    @staticmethod
    async def get_event_registrations_for_organizer(
        db: AsyncSession,
        event_public_id: str,
        status: Optional[RegistrationStatus] = None
    ) -> dict:
        """
        Queries and retrieves all registration entries assigned to a specific event for system organizers.
        Validates event existence and eagerly loads document assignments.
        """
        # 1. Verify target event entity existence via its public NanoID
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()

        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event with public identifier '{event_public_id}' was not found."
            )

        # 2. Build registration index query with eager loading for document counting
        query = (
            select(RegistrationModel)
            .options(selectinload(RegistrationModel.file_assignments))
            .where(RegistrationModel.event_id == event.id)
        )

        # 3. Apply state filtering criterion query parameters if explicitly passed
        if status:
            query = query.where(RegistrationModel.status ==
                                RegistrationStatusEnum(status.value))

        # 4. Sort chronologically: display latest registration requests first
        query = query.order_by(RegistrationModel.created_at.desc())

        result = await db.execute(query)
        registrations = list(result.scalars().all())

        # 5. Pack structured nested envelope output matching response layout requirements
        return {
            "event": event,
            "data": registrations,
            "total_count": len(registrations)
        }

    # @staticmethod
    # async def cancel_user_registration(
    #     db: AsyncSession,
    #     registration_id: str,
    #     user_id: str
    # ) -> RegistrationModel:
    #     """
    #     Cancels an active event registration and triggers automated FIFO queue promotion 
    #     based on waitlisted_at order if applicable.
    #     """
    #     # 1. Fetch target registration record
    #     stmt = select(RegistrationModel).where(
    #         RegistrationModel.id == registration_id)
    #     res = await db.execute(stmt)
    #     registration = res.scalar_one_or_none()

    #     # 2. Validate existence
    #     if not registration:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=f"Registration record with identifier '{registration_id}' was not found."
    #         )

    #     # 3. Validate Ownership constraint
    #     if registration.created_by_user_id != user_id:
    #         raise HTTPException(
    #             status_code=status.HTTP_403_FORBIDDEN,
    #             detail="Access denied. You do not possess structural ownership permissions over this registration."
    #         )

    #     # 4. Validate Status criteria (Rejected and Cancelled cannot be changed)
    #     if registration.status in (RegistrationStatusEnum.rejected, RegistrationStatusEnum.cancelled):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=f"Cancellation rejected. Cannot transition from current status '{registration.status.value}'."
    #         )

    #     # Snapshot prior status condition
    #     was_approved = registration.status == RegistrationStatusEnum.approved
    #     now_utc = datetime.now(timezone.utc)

    #     # 5. Record the status of the registration (Update cancellation logs)
    #     registration.status = RegistrationStatusEnum.cancelled
    #     registration.cancelled_at = now_utc
    #     registration.cancelled_by_user_id = user_id
    #     registration.updated_at = now_utc
    #     db.add(registration)

    #     # 6. Check if registration was approved before to trigger queue promotion
    #     if was_approved:
    #         # Find the oldest waitlisted entry sorted strictly by waitlisted_at ascending (FIFO)
    #         queue_stmt = (
    #             select(RegistrationModel)
    #             .where(
    #                 RegistrationModel.event_id == registration.event_id,
    #                 RegistrationModel.status == RegistrationStatusEnum.waiting
    #             )
    #             .order_by(RegistrationModel.waitlisted_at.asc())
    #             .limit(1)
    #         )
    #         queue_res = await db.execute(queue_stmt)
    #         next_in_line = queue_res.scalar_one_or_none()

    #         # 7. Elevate waitlist candidate to approved
    #         if next_in_line:
    #             next_in_line.status = RegistrationStatusEnum.approved
    #             # next_in_line.waitlist_position = None
    #             # next_in_line.waitlisted_at = None
    #             next_in_line.updated_at = now_utc
    #             db.add(next_in_line)

    #     # 8. Commit changes transactionally
    #     await db.commit()
    #     await db.refresh(registration)

    #     return registration

    # @classmethod
    # async def get_all_registrations(
    #     cls,
    #     db: AsyncSession,
    #     status: Optional[RegistrationStatus] = None
    # ) -> List[RegistrationModel]:
    #     """
    #     Retrieves global registration entries across all system events with optional status filtering.
    #     Ordered chronologically with the newest entries listed first.
    #     """
    #     query = select(RegistrationModel)

    #     # Apply state filtering criteria parameters if explicitly passed by client queries
    #     if status:
    #         query = query.where(RegistrationModel.status ==
    #                             RegistrationStatusEnum(status.value))

    #     # Sort chronologically: display latest requests at the top index locations
    #     query = query.order_by(RegistrationModel.created_at.desc())

    #     result = await db.execute(query)
    #     return list(result.scalars().all())

    # @staticmethod
    # async def get_registration_by_id(
    #     db: AsyncSession,
    #     registration_id: str
    # ) -> RegistrationModel:
    #     """
    #     Queries and retrieves a single registration record by its specific ID.
    #     Raises an HTTP 404 Exception if no matching record is found in the database.
    #     """
    #     stmt = select(RegistrationModel).where(
    #         RegistrationModel.id == registration_id)
    #     res = await db.execute(stmt)
    #     registration = res.scalar_one_or_none()

    #     # Handle nonexistent data boundary states
    #     if not registration:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=f"Registration record with identifier '{registration_id}' was not found."
    #         )

    #     return registration

    @staticmethod
    async def get_registration_detail_for_organizer(
        db: AsyncSession,
        registration_id: str
    ) -> RegistrationModel:
        """
        Queries and retrieves a single registration record by its ID for administrators.
        Eagerly loads income bands, auditors, and files while omitting event loading overhead.
        """
        stmt = (
            select(RegistrationModel)
            .options(
                selectinload(RegistrationModel.income_band),
                selectinload(RegistrationModel.reviewer),
                selectinload(RegistrationModel.canceller),
                selectinload(RegistrationModel.file_assignments).selectinload(RegistrationFileModel.file)
            )
            .where(RegistrationModel.id == registration_id)
        )
        
        res = await db.execute(stmt)
        registration = res.scalar_one_or_none()

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found."
            )

        return registration


    # @staticmethod
    # async def approve_registration(
    #     db: AsyncSession,
    #     registration_id: str,
    #     organizer_id: str
    # ) -> RegistrationModel:
    #     """
    #     Executes the registration approval workflow after verifying capacity rules.
    #     """
    #     # 1. Verify registration exists
    #     reg_stmt = select(RegistrationModel).where(
    #         RegistrationModel.id == registration_id)
    #     reg_res = await db.execute(reg_stmt)
    #     registration = reg_res.scalar_one_or_none()

    #     if not registration:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=f"Registration record with identifier '{registration_id}' was not found."
    #         )

    #     # 2. Verify the registrations.status = "pending", otherwise -> 409 Conflict
    #     if registration.status != RegistrationStatusEnum.pending:
    #         raise HTTPException(
    #             status_code=status.HTTP_409_CONFLICT,
    #             detail=f"Approval rejected. Action can only be executed on 'pending' records. Current state is '{registration.status.value}'."
    #         )

    #     # 3. Load event
    #     event_stmt = select(EventModel).where(
    #         EventModel.id == registration.event_id)
    #     event_res = await db.execute(event_stmt)
    #     event = event_res.scalar_one_or_none()

    #     if not event:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail="The event linked to this registration no longer exists."
    #         )

    #     # 4. Calculate capacity
    #     total_capacity = event.online_quota + event.offline_quota

    #     # 5. Calculate already approved registrations
    #     count_stmt = (
    #         select(func.count())
    #         .select_from(RegistrationModel)
    #         .where(
    #             RegistrationModel.event_id == registration.event_id,
    #             RegistrationModel.status == RegistrationStatusEnum.approved
    #         )
    #     )
    #     count_res = await db.execute(count_stmt)
    #     approved_count = count_res.scalar_one()

    #     # 6 & 7. Determine final status & Save review information to registrations table
    #     now_utc = datetime.now(timezone.utc)

    #     if approved_count < total_capacity:
    #         # Capacity Available -> Update the status = approved
    #         registration.status = RegistrationStatusEnum.approved
    #     else:
    #         # Full -> Update the status = waiting
    #         registration.status = RegistrationStatusEnum.waiting
    #         registration.waitlisted_at = now_utc

    #     # Save universal review audit footprints
    #     registration.reviewed_by_user_id = organizer_id
    #     registration.reviewed_at = now_utc
    #     registration.updated_at = now_utc

    #     # Persist everything safely down within an atomic transaction block context boundary
    #     db.add(registration)
    #     await db.commit()
    #     await db.refresh(registration)

    #     return registration

    # @staticmethod
    # async def create_from_offline(
    #     db: AsyncSession,
    #     event_id: int,
    #     # Accepts list elements forwarded from offline_sync module layers
    #     applications: List[any],
    #     leader_id: str
    # ) -> int:
    #     """
    #     Handles database matching lookups and builds registration records 
    #     using a channel='offline' layout.
    #     """
    #     processed_count = 0
    #     now_utc = datetime.now(timezone.utc)

    #     for app in applications:
    #         # Step 3: Search the participants table via national_id
    #         part_stmt = select(ParticipantModel).where(
    #             ParticipantModel.national_id == app.national_id)
    #         part_res = await db.execute(part_stmt)
    #         db_participant = part_res.scalar_one_or_none()

    #         if db_participant:
    #             participant_id = db_participant.id

    #             # Evaluate field updates if profile characteristics changed
    #             has_changes = (
    #                 db_participant.first_name != app.first_name or
    #                 db_participant.last_name != app.last_name or
    #                 db_participant.gender.value != app.gender.value or
    #                 db_participant.date_of_birth != app.date_of_birth or
    #                 db_participant.phone != app.phone or
    #                 db_participant.address != app.address
    #             )

    #             if has_changes:
    #                 db_participant.first_name = app.first_name
    #                 db_participant.last_name = app.last_name
    #                 db_participant.gender = app.gender
    #                 db_participant.date_of_birth = app.date_of_birth
    #                 db_participant.phone = app.phone
    #                 db_participant.address = app.address
    #                 db_participant.updated_at = now_utc
    #                 db_participant.updated_by_user_id = leader_id
    #                 db.add(db_participant)
    #         else:
    #             # If national_id is not found, instantiate a new record in participants table
    #             new_p = ParticipantModel(
    #                 id=str(ulid.ULID()),
    #                 user_id=None,  # Offline registrants do not have system access tokens initially
    #                 first_name=app.first_name,
    #                 last_name=app.last_name,
    #                 gender=app.gender,
    #                 date_of_birth=app.date_of_birth,
    #                 phone=app.phone,
    #                 address=app.address,
    #                 national_id=app.national_id,
    #                 created_at=now_utc,
    #                 updated_at=now_utc
    #             )
    #             db.add(new_p)
    #             participant_id = new_p.id

    #         # Step 4: Create a record in registrations table
    #         new_registration = RegistrationModel(
    #             id=str(ulid.ULID()),
    #             event_id=event_id,
    #             participant_id=participant_id,
    #             created_by_user_id=leader_id,
    #             channel=RegistrationChannelEnum.offline,  # channel = 'offline'
    #             status=RegistrationStatusEnum.pending,    # status = 'pending'
    #             created_at=now_utc,
    #             updated_at=now_utc,
    #             first_name=app.first_name,
    #             last_name=app.last_name,
    #             gender=app.gender,
    #             date_of_birth=app.date_of_birth,
    #             phone=app.phone,
    #             address=app.address,
    #             national_id=app.national_id,
    #             income_band_code=app.income_level,  # Field maps to schema storage row definitions
    #             medical_record=app.medical_record,
    #             marriage_status=app.marriage_status
    #         )
    #         db.add(new_registration)
    #         processed_count += 1

    #     # Commit transactional states down onto server engines safely
    #     await db.commit()
    #     return processed_count
