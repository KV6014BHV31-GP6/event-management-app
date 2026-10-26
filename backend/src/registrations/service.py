from datetime import datetime, timezone
import ulid
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from src.events.models import EventModel, EventStatusEnum
from src.participants.service import ParticipantService
from src.registrations.models import (RegistrationModel, RegistrationStatusEnum as State,
    RegistrationChannelEnum as Channel, UserGenderEnum, MarriageStatusTypeEnum)

DUPLICATE = "This participant already holds an active registration record for this event."


class RegistrationService:
    @staticmethod
    async def create_online_registration(db, event_public_id, form_in, current_user_id):
        try:
            event = await db.scalar(select(EventModel).where(EventModel.public_id == event_public_id)
                .with_for_update().execution_options(populate_existing=True))
            if event is None:
                raise HTTPException(404, f"Event with public identifier '{event_public_id}' was not found.")
            if event.status != EventStatusEnum.active:
                raise HTTPException(400, "Registration rejected. This event is not currently accepting entries.")
            participant = await ParticipantService.resolve_for_registration(db, form_in, current_user_id)
            existing = await db.scalar(select(RegistrationModel.id).where(
                RegistrationModel.event_id == event.id, RegistrationModel.participant_id == participant.id,
                RegistrationModel.status != State.cancelled))
            if existing is not None:
                raise HTTPException(400, DUPLICATE)
            data = form_in.model_dump()
            data.update(gender=UserGenderEnum(form_in.gender.value), marriage_status=MarriageStatusTypeEnum(form_in.marriage_status.value))
            registration = RegistrationModel(**data, id=str(ulid.ULID()), event_id=event.id,
                participant_id=participant.id, created_by_user_id=current_user_id,
                channel=Channel.online, status=State.pending)
            db.add(registration)
            await db.flush()
            await db.commit()
            await db.refresh(registration)
            return registration
        except IntegrityError as error:
            await db.rollback()
            # Do not expose DB messages or personal parameters. Only this known
            # constraint is the frontend's safe duplicate rejection contract.
            constraint = getattr(getattr(error.orig, "__cause__", None), "constraint_name", None)
            if constraint == "uq_registration_non_cancelled":
                raise HTTPException(400, DUPLICATE) from None
            raise HTTPException(409, "Registration conflicts with existing data. No changes were saved.") from None
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def get_user_registrations(db, user_id, status=None):
        query = select(RegistrationModel).where(RegistrationModel.created_by_user_id == user_id)
        if status is not None:
            query = query.where(RegistrationModel.status == State(status.value))
        return list((await db.scalars(query.order_by(RegistrationModel.created_at.desc(), RegistrationModel.id.desc()))).all())

    @staticmethod
    async def get_all_registrations(db, status=None):
        query = select(RegistrationModel)
        if status is not None:
            query = query.where(RegistrationModel.status == State(status.value))
        return list((await db.scalars(query.order_by(RegistrationModel.created_at.desc(), RegistrationModel.id.desc()))).all())

    @staticmethod
    async def get_registration_by_id(db, registration_id):
        registration = await db.get(RegistrationModel, registration_id)
        if registration is None:
            raise HTTPException(404, "Registration was not found.")
        return registration

    @staticmethod
    async def _locked_target(db, registration_id):
        event_id = await db.scalar(select(RegistrationModel.event_id).where(RegistrationModel.id == registration_id))
        if event_id is None:
            raise HTTPException(404, "Registration was not found.")
        event = await db.scalar(select(EventModel).where(EventModel.id == event_id).with_for_update()
            .execution_options(populate_existing=True))
        registration = await db.scalar(select(RegistrationModel).where(RegistrationModel.id == registration_id)
            .with_for_update().execution_options(populate_existing=True))
        if event is None or registration is None:
            raise HTTPException(404, "Registration was not found.")
        return event, registration

    @staticmethod
    async def _supported_allocation(db, event, registration):
        unmapped = await db.scalar(select(func.count()).select_from(RegistrationModel).where(
            RegistrationModel.event_id == event.id, RegistrationModel.channel != Channel.online))
        if event.offline_quota != 0 or registration.channel != Channel.online or unmapped:
            raise HTTPException(409, "Mixed-pool allocation is not supported by this candidate.")

    @staticmethod
    async def _approved_count(db, event_id):
        return await db.scalar(select(func.count()).select_from(RegistrationModel).where(
            RegistrationModel.event_id == event_id, RegistrationModel.status == State.approved))

    @classmethod
    async def approve_registration(cls, db, registration_id, organizer_id):
        # Own the existing request transaction, including auth SELECT autobegin.
        # Every controlled allocation writer locks event before registration.
        try:
            event, registration = await cls._locked_target(db, registration_id)
            if registration.status != State.pending:
                raise HTTPException(409, "Only pending registrations can be reviewed.")
            if event.status != EventStatusEnum.active:
                raise HTTPException(400, "This event is not accepting approvals.")
            await cls._supported_allocation(db, event, registration)
            now = datetime.now(timezone.utc)
            if await cls._approved_count(db, event.id) < event.online_quota:
                registration.status = State.approved
            else:
                registration.status = State.waiting
                registration.waitlisted_at = now
            registration.reviewed_by_user_id = organizer_id
            registration.reviewed_at = now
            registration.updated_at = now
            await db.flush()
            await db.commit()
            await db.refresh(registration)
            return registration
        except Exception:
            await db.rollback()
            raise

    @classmethod
    async def cancel_user_registration(cls, db, registration_id, user_id):
        try:
            event, registration = await cls._locked_target(db, registration_id)
            if registration.created_by_user_id != user_id:
                raise HTTPException(403, "You cannot cancel this registration.")
            if registration.status not in (State.pending, State.approved, State.waiting):
                raise HTTPException(400, "This registration cannot be cancelled in its current state.")
            occupied = registration.status == State.approved
            if occupied:
                await cls._supported_allocation(db, event, registration)
            now = datetime.now(timezone.utc)
            registration.status = State.cancelled
            registration.cancelled_at = now
            registration.cancelled_by_user_id = user_id
            registration.updated_at = now
            await db.flush()  # Count must see cancellation with autoflush=False.
            if occupied and await cls._approved_count(db, event.id) < event.online_quota:
                waiting = await db.scalar(select(RegistrationModel).where(
                    RegistrationModel.event_id == event.id, RegistrationModel.status == State.waiting,
                    RegistrationModel.channel == Channel.online).order_by(
                        RegistrationModel.waitlisted_at, RegistrationModel.id).limit(1)
                    .with_for_update().execution_options(populate_existing=True))
                if waiting is not None:
                    waiting.status = State.approved
                    waiting.updated_at = now
            await db.flush()
            await db.commit()  # Cancel and promotion are one atomic commit.
            await db.refresh(registration)
            return registration
        except Exception:
            await db.rollback()
            raise
