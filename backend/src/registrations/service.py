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
from src.notifications.service import NotificationService
from src.reminders.service import ReminderService

reminder_service = ReminderService()


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
                db_participant.phone != form_in.phone or
                db_participant.address != form_in.address
            )

            if has_changes:
                # Update participant details if personal demographics have shifted
                db_participant.first_name = form_in.first_name
                db_participant.last_name = form_in.last_name
                db_participant.gender = UserGenderEnum(form_in.gender.value)
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
            age_group_code=form_in.age_group_code,
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

        # --- NOTIFICATION TRIGGER HERE ---
        await NotificationService.create_notification(
            db=db,
            notification_type="registration_submitted",
            registration_id=registration_id
        )

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
                selectinload(RegistrationModel.age_group),
                selectinload(RegistrationModel.income_band),
                selectinload(RegistrationModel.file_assignments).selectinload(
                    RegistrationFileModel.file)
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

    @staticmethod
    async def cancel_user_registration(
        db: AsyncSession,
        registration_id: str,
        user_id: str
    ) -> dict:
        """
        Cancels an active event registration belonging to the currently authenticated user.
        If the prior status was 'approved', it searches and elevates the oldest 'waiting' 
        candidate inside the same dynamic channel using a row-level locking matrix strategy.
        """
        now_utc = datetime.now(timezone.utc)

        # 1. Verify target registration existence context
        stmt = (
            select(RegistrationModel)
            .options(selectinload(RegistrationModel.event))
            .where(RegistrationModel.id == registration_id)
        )
        res = await db.execute(stmt)
        registration = res.scalar_one_or_none()

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found."
            )

        # 2. Validate ownership constraint metrics
        if registration.created_by_user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not possess structural ownership permissions over this registration."
            )

        # 3. Validate status criteria parameters (reject already cancelled or rejected slots)
        if registration.status in (RegistrationStatusEnum.rejected, RegistrationStatusEnum.cancelled):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cancellation rejected. Cannot transition from current status '{registration.status.value}'."
            )

        # 5. Take snapshots of required context fields before mutating records
        old_status = registration.status
        target_channel = registration.channel
        event_id = registration.event_id
        event = registration.event

        # 6. Perform database update updates to cancel current registration
        registration.status = RegistrationStatusEnum.cancelled
        registration.cancelled_at = now_utc
        registration.cancelled_by_user_id = user_id
        registration.updated_at = now_utc
        db.add(registration)

        # Atomic clean up execution of all pending reminder slots for this registration
        # await reminder_service.cancel_registration_reminders(
        #     db=db,
        #     registration_id=registration.id
        # )

        # 7. Evaluate queue auto-promotion conditions independently by isolated channels
        promotion_triggered = False
        promoted_reg_id = None

        if old_status == RegistrationStatusEnum.approved:
            # Query the oldest waiting candidate within the same exact isolated channel scope
            # Utilizing with_for_update() ensures strict transactional concurrency safety
            queue_stmt = (
                select(RegistrationModel)
                .where(
                    RegistrationModel.event_id == event_id,
                    RegistrationModel.channel == target_channel,
                    RegistrationModel.status == RegistrationStatusEnum.waiting
                )
                .order_by(RegistrationModel.waitlisted_at.asc())
                .limit(1)
                .with_for_update()
            )
            queue_res = await db.execute(queue_stmt)
            next_in_line = queue_res.scalar_one_or_none()

            # 8. Update the discovered waitlisted item and modify registration table structures
            if next_in_line:
                next_in_line.status = RegistrationStatusEnum.approved
                next_in_line.updated_at = datetime.now(timezone.utc)
                db.add(next_in_line)

                promotion_triggered = True
                promoted_reg_id = next_in_line.id

                # --- Scenario 5: Trigger waitlist promotion notification ---
                await NotificationService.create_notification(
                    db=db,
                    notification_type="waitlist_promoted",
                    registration_id=next_in_line.id
                )

                # SCHEDULE REMINDERS FOR THE PROMOTED PARTICIPANT
                # await reminder_service.create_reminders_for_approved_registration(
                #     db=db,
                #     registration_id=next_in_line.id
                # )

        # --- Scenario 4: Trigger registration cancellation notification ---
        await NotificationService.create_notification(
            db=db,
            notification_type="registration_cancelled",
            registration_id=registration.id
        )

        # Commit transactional states down onto server engines safely
        await db.commit()
        await db.refresh(registration)

        # 9. Formulate response dictionary matching envelope specifications exactly
        return {
            "registration_id": registration.id,
            "event": {
                "public_id": event.public_id if event else "unknown",
                "title": event.title if event else "unknown"
            },
            "channel": target_channel.value,
            "status": registration.status.value,
            "cancelled_at": registration.cancelled_at,
            "message": "Registration cancelled successfully.",
            "waitlist_promotion": {
                "triggered": promotion_triggered,
                "promoted_registration_id": promoted_reg_id
            }
        }

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
                selectinload(RegistrationModel.age_group),
                selectinload(RegistrationModel.income_band),
                selectinload(RegistrationModel.reviewer),
                selectinload(RegistrationModel.canceller),
                selectinload(RegistrationModel.file_assignments).selectinload(
                    RegistrationFileModel.file)
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

    @staticmethod
    async def approve_registration(
        db: AsyncSession,
        registration_id: str,
        payload: any,  # Accepts RegistrationApproveInput schema
        organizer_id: str
    ) -> dict:
        """
        Processes a pending registration and moves it to 'approved' or 'waiting' status.
        Quotas are tracked independently for 'online' and 'offline' channels.
        The 'decision' attribute is generated dynamically in the response.
        """
        now_utc = datetime.now(timezone.utc)

        # 1. Fetch targeted registration entry alongside its linked event metadata
        reg_stmt = (
            select(RegistrationModel)
            .options(selectinload(RegistrationModel.event))
            .where(RegistrationModel.id == registration_id)
        )
        reg_res = await db.execute(reg_stmt)
        registration = reg_res.scalar_one_or_none()

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration record with identifier '{registration_id}' was not found."
            )

        # 2. Verify pre-condition: Only 'pending' status records can be processed
        if registration.status != RegistrationStatusEnum.pending:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval rejected. Action can only be executed on 'pending' records. Current state is '{registration.status.value}'."
            )

        event = registration.event
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The event linked to this registration no longer exists."
            )

        # 3. Load independent channel quotas
        target_channel = registration.channel  # RegistrationChannelEnum property

        if target_channel == RegistrationChannelEnum.online:
            quota_limit = event.online_quota
        elif target_channel == RegistrationChannelEnum.offline:
            quota_limit = event.offline_quota
        else:
            quota_limit = 0

        # 4. Calculate current approved counters for this specific channel
        count_stmt = (
            select(func.count())
            .select_from(RegistrationModel)
            .where(
                RegistrationModel.event_id == registration.event_id,
                RegistrationModel.status == RegistrationStatusEnum.approved,
                RegistrationModel.channel == target_channel
            )
        )
        count_res = await db.execute(count_stmt)
        approved_count = count_res.scalar_one()

        # 5. Determine final status based on available capacity thresholds
        waitlisted_timestamp = None
        message_detail = "Registration approved successfully. "

        if approved_count < quota_limit:
            # Capacity Available -> Set to approved
            final_status = RegistrationStatusEnum.approved
        else:
            # Capacity Full -> Set to waiting queue
            final_status = RegistrationStatusEnum.waiting
            waitlisted_timestamp = now_utc
            message_detail = f"{payload.review_remarks.strip()} {target_channel.value.capitalize()} quota full. Added to waiting list."

        # 6. Save persistent modifications to database records
        registration.status = final_status
        registration.reviewed_by_user_id = organizer_id
        registration.reviewed_at = now_utc
        registration.review_remarks = payload.review_remarks
        registration.waitlisted_at = waitlisted_timestamp
        registration.updated_at = now_utc

        db.add(registration)

        # --- NOTIFICATION TRIGGER HERE ---

        if final_status == RegistrationStatusEnum.approved:
            await NotificationService.create_notification(
                db=db,
                notification_type="registration_approved",
                registration_id=registration.id
            )

        # SCHEDULE REMINDERS FOR THE NEWLY APPROVED REGISTRATION
        #     await reminder_service.create_reminders_for_approved_registration(
        #         db=db,
        #         registration_id=registration.id
        #     )

        elif final_status == RegistrationStatusEnum.waiting:
            await NotificationService.create_notification(
                db=db,
                notification_type="registration_waitlisted",
                registration_id=registration.id
            )

        await db.commit()
        await db.refresh(registration)

        # 7. Map fields into a plain dictionary response to pass dynamic transient data to Pydantic
        return {
            "registration_id": registration.id,
            "event": {
                "public_id": event.public_id,
                "title": event.title
            },
            "decision": "approved",  # Transient field returned on-the-fly to match response specs
            "status": final_status.value,
            "channel": target_channel.value,
            "review": {
                "reviewed_by_user_id": organizer_id,
                "reviewed_at": now_utc,
                "remarks": payload.review_remarks
            },
            "waitlisted_at": waitlisted_timestamp,
            "message": message_detail.strip()
        }

    @staticmethod
    async def create_from_offline(
        db: AsyncSession,
        event_id: int,
        # Accepts list elements forwarded from offline_sync module layers
        applications: List[any],
        leader_id: str
    ) -> int:
        """
        Handles database matching lookups and builds registration records 
        using a channel='offline' layout.
        """
        processed_count = 0
        now_utc = datetime.now(timezone.utc)

        for app in applications:
            # Step 3: Search the participants table via national_id
            part_stmt = select(ParticipantModel).where(
                ParticipantModel.national_id == app.national_id)
            part_res = await db.execute(part_stmt)
            db_participant = part_res.scalar_one_or_none()

            if db_participant:
                participant_id = db_participant.id

                # Evaluate field updates if profile characteristics changed
                has_changes = (
                    db_participant.first_name != app.first_name or
                    db_participant.last_name != app.last_name or
                    db_participant.gender.value != app.gender.value or
                    db_participant.phone != app.phone or
                    db_participant.address != app.address
                )

                if has_changes:
                    db_participant.first_name = app.first_name
                    db_participant.last_name = app.last_name
                    db_participant.gender = app.gender
                    db_participant.phone = app.phone
                    db_participant.address = app.address
                    db_participant.updated_at = now_utc
                    db_participant.updated_by_user_id = leader_id
                    db.add(db_participant)
            else:
                # If national_id is not found, instantiate a new record in participants table
                new_p = ParticipantModel(
                    id=str(ulid.ULID()),
                    user_id=None,  # Offline registrants do not have system access tokens initially
                    first_name=app.first_name,
                    last_name=app.last_name,
                    gender=app.gender,
                    phone=app.phone,
                    address=app.address,
                    national_id=app.national_id,
                    created_at=now_utc,
                    updated_at=now_utc
                )
                db.add(new_p)
                participant_id = new_p.id

            # Step 4: Create a record in registrations table
            new_registration = RegistrationModel(
                id=str(ulid.ULID()),
                event_id=event_id,
                participant_id=participant_id,
                created_by_user_id=leader_id,
                channel=RegistrationChannelEnum.offline,  # channel = 'offline'
                status=RegistrationStatusEnum.pending,    # status = 'pending'
                created_at=now_utc,
                updated_at=now_utc,
                first_name=app.first_name,
                last_name=app.last_name,
                gender=app.gender,
                age_group=app.age_group,
                phone=app.phone,
                address=app.address,
                national_id=app.national_id,
                income_band_code=app.income_level,  # Field maps to schema storage row definitions
                medical_record=app.medical_record,
                marriage_status=app.marriage_status
            )
            db.add(new_registration)
            processed_count += 1

        # Commit transactional states down onto server engines safely
        await db.commit()
        return processed_count
