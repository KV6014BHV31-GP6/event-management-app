# src/infrastructure/scheduler.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from src.core.database import AsyncSessionLocal

from src.notifications.repo import NotificationRepository
from src.notifications.service import NotificationService

from src.reminders.repo import ReminderRepository
from src.reminders.service import ReminderService
from src.notifications.whatsapp_sender import WhatsAppSender


import logging

logger = logging.getLogger(__name__)

# Singleton scheduler instance
scheduler = AsyncIOScheduler()


async def process_due_reminders_job() -> None:
    """
    APScheduler Job

    Every 5 minutes:
        - Find due reminders
        - Create notification records
        - Mark reminders completed
    """

    logger.info("Starting reminder processing job")

    async with AsyncSessionLocal() as db:

        try:

            reminder_repo = ReminderRepository()

            notification_repo = NotificationRepository()

            notification_service = NotificationService(
                notification_repo=notification_repo
            )

            reminder_service = ReminderService(
                reminder_repo=reminder_repo,
                notification_service=notification_service
            )

            await reminder_service.process_due_reminders(
                db=db
            )

        except Exception:
            logger.exception(
                "Failed processing reminders"
            )


async def process_pending_notifications_job() -> None:
    """
    APScheduler Job

    Every 5 minutes:
        - Find pending notifications
        - Generate WhatsApp messages
        - Send WhatsApp messages
        - Update notification status
    """
    logger.info("Starting notification processing job")

    async with AsyncSessionLocal() as db:
        try:
            # Instantiate the physical downstream sender wrapper instance
            whatsapp_sender = WhatsAppSender()

            # Initialize service worker layer
            notification_service = NotificationService()

            # Execute processing batch pipeline by adding the missing whatsapp_sender parameter
            await notification_service.process_pending_notifications(
                db=db,
                whatsapp_sender=whatsapp_sender
            )

        except Exception:
            logger.exception("Failed processing notifications")


def start_scheduler() -> None:
    """
    Registers all background jobs and starts APScheduler.
    """

    if scheduler.running:
        return

    # scheduler.add_job(
    #     process_due_reminders_job,
    #     trigger=IntervalTrigger(minutes=5),
    #     id="process_due_reminders",
    #     replace_existing=True,
    #     max_instances=1,
    #     coalesce=True,
    # )

    scheduler.add_job(
        process_pending_notifications_job,
        trigger=IntervalTrigger(minutes=5),
        id="process_pending_notifications",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    scheduler.start()

    logger.info("APScheduler started successfully")


def shutdown_scheduler() -> None:
    """
    Gracefully shuts down APScheduler.
    """

    if scheduler.running:
        scheduler.shutdown(wait=False)

    logger.info("APScheduler stopped")
