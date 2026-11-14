from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select,  func
from sqlalchemy.ext.asyncio import AsyncSession
from src.notifications.models import NotificationModel, NotificationStatusEnum
from src.notifications.schemas import NotificationCreateInternal, RegistrationContext
from src.registrations.models import RegistrationModel
from src.participants.models import ParticipantModel
from src.events.models import EventModel


class NotificationRepository:
    @staticmethod
    def create(db: AsyncSession, schema_in: NotificationCreateInternal) -> NotificationModel:
        """
        Instantiates a NotificationModel record and attaches it to the current database session context.
        Note: Does not invoke commit; lets the calling service manage atomic transaction bounds.
        """
        scheduled_time = schema_in.scheduled_at or datetime.now(timezone.utc)

        db_notification = NotificationModel(
            notification_type=schema_in.notification_type,
            registration_id=schema_in.registration_id,
            status=NotificationStatusEnum.pending,
            scheduled_at=scheduled_time
        )
        db.add(db_notification)
        return db_notification

    @classmethod
    async def get_pending_notifications(
        cls,
        db: AsyncSession,
        limit: int = 100
    ) -> List[NotificationModel]:
        """
        Retrieves a collection of pending notifications whose execution window has arrived.
        Ordered by scheduled timestamp ascending to support FIFO execution pipelines.
        """
        now_utc = datetime.now(timezone.utc)
        stmt = (
            select(NotificationModel)
            .where(
                NotificationModel.status == NotificationStatusEnum.pending,
                NotificationModel.scheduled_at <= now_utc
            )
            .order_by(NotificationModel.scheduled_at.asc())
            .limit(limit)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @classmethod
    async def mark_processing(
        cls,
        db: AsyncSession,
        notification_id: int
    ) -> None:
        """
        Locks individual record paths by transitioning state thresholds from 'pending' to 'processing'.
        Flushes modifications immediately to isolate downstream concurrent batch collisions.
        """
        stmt = select(NotificationModel).where(
            NotificationModel.id == notification_id)
        res = await db.execute(stmt)
        notification = res.scalar_one_or_none()

        if notification and notification.status == NotificationStatusEnum.pending:
            notification.status = NotificationStatusEnum.processing
            await db.flush()

    @classmethod
    async def mark_sent(
        cls,
        db: AsyncSession,
        notification_id: int
    ) -> None:
        """
        Transitions a notification's status to 'sent' and logs the execution timestamp.
        """
        stmt = select(NotificationModel).where(
            NotificationModel.id == notification_id)
        res = await db.execute(stmt)
        notification = res.scalar_one_or_none()

        if notification:
            notification.status = NotificationStatusEnum.sent
            notification.sent_at = datetime.now(timezone.utc)
            notification.error_message = None
            await db.flush()

    @classmethod
    async def mark_failed(
        cls,
        db: AsyncSession,
        notification_id: int,
        error_message: str
    ) -> None:
        """
        Increments retry count metrics and marks the notification status threshold as 'failed'.
        """
        stmt = select(NotificationModel).where(
            NotificationModel.id == notification_id)
        res = await db.execute(stmt)
        notification = res.scalar_one_or_none()

        if notification:
            notification.status = NotificationStatusEnum.failed
            notification.retry_count += 1
            notification.error_message = error_message
            await db.flush()

    @classmethod
    async def get_registration_context(
        cls,
        db: AsyncSession,
        registration_id: str
    ) -> Optional[RegistrationContext]:
        """
        Retrieves flattened relational context for a registration profile using 
        an optimized join query across registrations, events, and participants.
        """

        stmt = (
            select(
                RegistrationModel.id.label("registration_id"),
                ParticipantModel.id.label("participant_id"),
                func.concat(RegistrationModel.first_name, " ",
                            RegistrationModel.last_name).label("participant_name"),
                RegistrationModel.phone.label("participant_phone"),
                EventModel.id.label("event_id"),
                EventModel.public_id.label("event_public_id"),
                EventModel.title.label("event_title"),
                EventModel.location.label("event_location"),
                EventModel.start_time.label("event_start_time"),
                EventModel.end_time.label("event_end_time"),
                RegistrationModel.status.label("registration_status")
            )
            .join(EventModel, RegistrationModel.event_id == EventModel.id)
            .join(ParticipantModel, RegistrationModel.participant_id == ParticipantModel.id)
            .where(RegistrationModel.id == registration_id)
        )

        res = await db.execute(stmt)
        row = res.mappings().first()

        if not row:
            return None

        return RegistrationContext.model_validate(row)
