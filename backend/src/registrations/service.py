import ulid
from datetime import datetime, timezone
from fastapi import HTTPException, status
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from functools import wraps
from src.users.models import UserModel

from src.events.models import EventModel, EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum, RegistrationChannelEnum, UserGenderEnum, MarriageStatusTypeEnum
from src.registrations.schemas import RegistrationCreate, RegistrationStatus


DUPLICATE = "This participant already holds an active registration record for this event."


def rollback_write(operation):
    """Auth may already have begun this session; commit once inside each operation."""
    @wraps(operation)
    async def wrapped(db, *args, **kwargs):
        try:
            return await operation(db, *args, **kwargs)
        except IntegrityError as exc:
            await db.rollback()
            if getattr(exc.orig, "sqlstate", None) == "23505" or "UNIQUE constraint failed" in str(exc.orig):
                raise HTTPException(status_code=409, detail="A conflicting participant or registration already exists.") from None
            raise
        except Exception:
            await db.rollback()
            raise
    return wrapped


async def lock_registration(db, registration_id):
    event_id = await db.scalar(select(RegistrationModel.event_id).where(RegistrationModel.id == registration_id))
    if event_id is None:
        raise HTTPException(status_code=404, detail="Registration record was not found.")
    event = await db.scalar(select(EventModel).where(EventModel.id == event_id)
                            .with_for_update().execution_options(populate_existing=True))
    registration = await db.scalar(select(RegistrationModel).where(RegistrationModel.id == registration_id)
                                   .with_for_update().execution_options(populate_existing=True))
    return event, registration


class RegistrationService:
    @staticmethod
    @rollback_write
    async def create_online_registration(
        db: AsyncSession,
        event_public_id: str,
        form_in: RegistrationCreate,
        current_user_id: str | None
    ) -> RegistrationModel:
        """
        Executes the online registration business workflow within an atomic database transaction context.
        """
        # 1. Validate Event Entity Existence
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id).with_for_update().execution_options(populate_existing=True)
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

        # Serialize the first participant creation for this user across different events.
        if current_user_id:
            await db.execute(select(UserModel.id).where(UserModel.id == current_user_id).with_for_update())
        own = await db.scalar(select(ParticipantModel).where(ParticipantModel.user_id == current_user_id)) if current_user_id else None
        by_identity = await db.scalar(select(ParticipantModel).where(ParticipantModel.national_id == form_in.national_id))
        if own and own.national_id != form_in.national_id:
            raise HTTPException(status_code=409, detail="Participant identity does not match this account.")
        if by_identity and (not current_user_id or by_identity.user_id != current_user_id):
            raise HTTPException(status_code=409, detail="This participant identity cannot be claimed by this request.")
        db_participant = own or by_identity
        if db_participant:
            duplicate = await db.scalar(select(RegistrationModel.id).where(
                RegistrationModel.event_id == event.id, RegistrationModel.participant_id == db_participant.id))
            if duplicate:
                raise HTTPException(status_code=400, detail=DUPLICATE)
            # Only a verified owner may change demographics, after duplicate checks.
            for field in ("first_name", "last_name", "date_of_birth", "phone", "address"):
                setattr(db_participant, field, getattr(form_in, field))
            db_participant.gender = UserGenderEnum(form_in.gender.value)
            db_participant.updated_by_user_id = current_user_id
        else:
            db_participant = ParticipantModel(
                id=str(ulid.ULID()), user_id=current_user_id,
                first_name=form_in.first_name, last_name=form_in.last_name,
                gender=UserGenderEnum(form_in.gender.value), date_of_birth=form_in.date_of_birth,
                phone=form_in.phone, address=form_in.address, national_id=form_in.national_id)
            db.add(db_participant)
        await db.flush()  # FK target must exist; the session intentionally has autoflush=False.
        participant_id = db_participant.id

        # 4. Create Registration (status = pending)
        new_registration = RegistrationModel(
            id=str(ulid.ULID()),
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
            income_band_code=form_in.income_band_code,
            medical_record=form_in.medical_record,
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
    @rollback_write
    async def cancel_user_registration(
        db: AsyncSession,
        registration_id: str,
        user_id: str
    ) -> RegistrationModel:
        """
        Cancels an active event registration and triggers automated FIFO queue promotion
        based on waitlisted_at order if applicable.
        """
        event, registration = await lock_registration(db, registration_id)

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
        if was_approved and event.status == EventStatusEnum.active:
            await db.flush()
            # Find the oldest waitlisted entry sorted strictly by waitlisted_at ascending (FIFO)
            queue_stmt = (
                select(RegistrationModel)
                .where(
                    RegistrationModel.event_id == registration.event_id,
                    RegistrationModel.status == RegistrationStatusEnum.waiting
                )
                .order_by(RegistrationModel.waitlisted_at.asc(), RegistrationModel.created_at.asc(), RegistrationModel.id.asc())
                .with_for_update().execution_options(populate_existing=True)
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
    @rollback_write
    async def approve_registration(
        db: AsyncSession,
        registration_id: str,
        organizer_id: str
    ) -> RegistrationModel:
        """
        Executes the registration approval workflow after verifying capacity rules.
        """
        event, registration = await lock_registration(db, registration_id)

        # 2. Verify the registrations.status = "pending", otherwise -> 409 Conflict
        if registration.status != RegistrationStatusEnum.pending:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval rejected. Action can only be executed on 'pending' records. Current state is '{registration.status.value}'."
            )

        if event.status != EventStatusEnum.active:
            raise HTTPException(status_code=409, detail="Approval requires an active event.")

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

    @staticmethod
    @rollback_write
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
        event = await db.scalar(select(EventModel).where(EventModel.id == event_id)
                                .with_for_update().execution_options(populate_existing=True))
        if not event or event.status != EventStatusEnum.active:
            raise HTTPException(status_code=400, detail="Offline registration requires an active event.")
        identities = [item.national_id for item in applications]
        if len(identities) != len(set(identities)):
            raise HTTPException(status_code=409, detail="Duplicate participant identities in this batch.")
        processed_count = 0
        now_utc = datetime.now(timezone.utc)

        for app in applications:
            # Step 3: Search the participants table via national_id
            part_stmt = select(ParticipantModel).where(
                ParticipantModel.national_id == app.national_id)
            part_res = await db.execute(part_stmt)
            db_participant = part_res.scalar_one_or_none()

            if db_participant:
                # No verified identity-claim route exists for previously recorded people.
                raise HTTPException(status_code=409, detail="An existing participant cannot be claimed by offline sync.")
            else:
                # If national_id is not found, instantiate a new record in participants table
                new_p = ParticipantModel(
                    id=str(ulid.ULID()),
                    user_id=None,  # Offline registrants do not have system access tokens initially
                    first_name=app.first_name,
                    last_name=app.last_name,
                    gender=app.gender,
                    date_of_birth=app.date_of_birth,
                    phone=app.phone,
                    address=app.address,
                    national_id=app.national_id,
                    created_at=now_utc,
                    updated_at=now_utc
                )
                db.add(new_p)
                await db.flush()
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
                date_of_birth=app.date_of_birth,
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
