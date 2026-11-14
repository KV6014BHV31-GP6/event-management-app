from sqlalchemy.ext.asyncio import AsyncSession
from src.reminders.models import EventReminderModel, ReminderStatusEnum
from src.reminders.schemas import ReminderCreateInternal
from sqlalchemy.future import select


class ReminderRepository:
    async def create(self, db: AsyncSession, reminder: ReminderCreateInternal) -> EventReminderModel:
        """
        Instantiates an EventReminderModel entity and registers it into the database session context.
        """
        db_reminder = EventReminderModel(
            registration_id=reminder.registration_id,
            reminder_type=reminder.reminder_type,
            scheduled_at=reminder.scheduled_at,
            status=ReminderStatusEnum.pending
        )
        db.add(db_reminder)
        return db_reminder

    async def get_due_reminders(
        self,
        db: AsyncSession,
        limit: int = 100
    ) -> list[EventReminderModel]:
        """
        Queries and locks the top batch of due pending reminders whose schedule window 
        has passed relative to the database server execution timeline.
        """
        from datetime import datetime, timezone

        stmt = (
            select(EventReminderModel)
            .where(
                EventReminderModel.status == ReminderStatusEnum.pending,
                EventReminderModel.scheduled_at <= datetime.now(timezone.utc)
            )
            .order_by(EventReminderModel.scheduled_at.asc())
            .limit(limit)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    async def mark_completed(
        self,
        db: AsyncSession,
        reminder_id: int
    ) -> None:
        """
        Transitions the tracking status state matrix from 'pending' directly 
        to 'sent' (completed) configuration logs.
        """
        from datetime import datetime, timezone

        stmt = select(EventReminderModel).where(
            EventReminderModel.id == reminder_id)
        res = await db.execute(stmt)
        reminder = res.scalar_one_or_none()

        if reminder:
            reminder.status = ReminderStatusEnum.sent
            reminder.sent_at = datetime.now(timezone.utc)
            reminder.completed_at = datetime.now(timezone.utc)
            db.add(reminder)

    async def cancel_by_registration(
        self,
        db: AsyncSession,
        registration_id: str
    ) -> None:
        """
        Updates pending reminder slots linked to a specific registration directly to cancelled.
        """
        from sqlalchemy import update
        from datetime import datetime, timezone

        stmt = (
            update(EventReminderModel)
            .where(
                EventReminderModel.registration_id == registration_id,
                EventReminderModel.status == ReminderStatusEnum.pending
            )
            .values(
                status=ReminderStatusEnum.cancelled,
                completed_at=datetime.now(timezone.utc)
            )
        )
        await db.execute(stmt)
