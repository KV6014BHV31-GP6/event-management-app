import logging
from datetime import timedelta
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from src.registrations.models import RegistrationModel
from src.reminders.repo import ReminderRepository
from src.reminders.schemas import ReminderCreateInternal
from src.reminders.models import EventReminderModel, ReminderTypeEnum
from src.notifications.service import NotificationService

logger = logging.getLogger(__name__)


class ReminderService:
    def __init__(self):
        self.reminder_repo = ReminderRepository()

    async def create_reminders_for_approved_registration(
        self,
        db: AsyncSession,
        registration_id: str
    ) -> None:
        """
        Calculates target 7-day and 1-day milestone offsets and saves reminder instances.
        """
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

        event = registration.event
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The event linked to this registration no longer exists."
            )

        event_start = event.start_time
        scheduled_7d = event_start - timedelta(days=7)
        scheduled_1d = event_start - timedelta(days=1)

        # Uses explicit models enum value mapping configurations
        reminder_7d_schema = ReminderCreateInternal(
            registration_id=registration.id,
            reminder_type=ReminderTypeEnum.seven_days.value,
            scheduled_at=scheduled_7d
        )
        await self.reminder_repo.create(db=db, reminder=reminder_7d_schema)

        reminder_1d_schema = ReminderCreateInternal(
            registration_id=registration.id,
            reminder_type=ReminderTypeEnum.one_day.value,
            scheduled_at=scheduled_1d
        )
        await self.reminder_repo.create(db=db, reminder=reminder_1d_schema)
        await db.flush()

    async def process_due_reminders(self, db: AsyncSession) -> None:
        """
        Fetches the current batch of active due reminders from the data store repository 
        and iterates over them for execution block generation.
        """
        due_reminders = await self.reminder_repo.get_due_reminders(db=db, limit=100)

        for reminder in due_reminders:
            try:
                await self.process_reminder(db=db, reminder=reminder)
            except Exception as exc:
                logger.error(
                    f"Failed processing execution pipeline over reminder ID {reminder.id}: {exc}")

    async def process_reminder(self, db: AsyncSession, reminder: EventReminderModel) -> None:
        """
        Processes a single reminder, maps the enum types to appropriate notification layout categories,
        dispatches a decoupled tracking footprint record, and completes the status log.
        """
        # Compares utilizing explicit Model column Enum declarations safely
        if reminder.reminder_type == ReminderTypeEnum.seven_days.value:
            notification_type = "event_reminder_7_days"
        elif reminder.reminder_type == ReminderTypeEnum.one_day.value:
            notification_type = "event_reminder_1_day"
        else:
            logger.warning(
                f"Skipping reminder ID {reminder.id}: Unknown type layout context '{reminder.reminder_type}'.")
            return

        await NotificationService.create_notification(
            db=db,
            notification_type=notification_type,
            registration_id=reminder.registration_id
        )

        await self.reminder_repo.mark_completed(db=db, reminder_id=reminder.id)
        await db.commit()

    async def cancel_registration_reminders(
        self,
        db: AsyncSession,
        registration_id: str
    ) -> None:
        """
        Cascades execution signals down to repository data storage structures to drop
        7d and 1d active tracking rows for a cancelled registration.
        """
        await self.reminder_repo.cancel_by_registration(db=db, registration_id=registration_id)
        await db.flush()
