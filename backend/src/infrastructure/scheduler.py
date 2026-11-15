"""Austin scheduler jobs/lifecycle adapted to stdlib asyncio (no new dependency).
Both jobs enabled; durable DB tasks survive process restart, not in-memory timers.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from src.core.database import AsyncSessionLocal
from src.notifications.service import NotificationService
from src.notifications.whatsapp_sender import configured_sender
from src.reminders.service import ReminderService

logger=logging.getLogger(__name__)

async def process_due_reminders_job(session_factory=AsyncSessionLocal):
    async with session_factory() as db:
        await ReminderService().process_due_reminders(db)

async def process_pending_notifications_job(session_factory=AsyncSessionLocal):
    async with session_factory() as db:
        await NotificationService().process_pending_notifications(db,configured_sender())

async def run_scheduler():
    interval=max(1,int(os.getenv('NU_NOTIFICATION_INTERVAL_SECONDS','60')))
    while True:
        try:
            await process_due_reminders_job()
            await process_pending_notifications_job()
        except asyncio.CancelledError:
            raise
        except Exception:
            # Provider/DB exception details may contain private values.
            logger.error('Notification scheduler cycle failed; durable tasks retained')
        await asyncio.sleep(interval)

@asynccontextmanager
async def lifespan(app):
    enabled=os.getenv('NU_NOTIFICATION_SCHEDULER','on' if os.getenv('NU_DEMO_PROFILE')=='synthetic' else 'off')=='on'
    task=asyncio.create_task(run_scheduler()) if enabled else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            try: await task
            except asyncio.CancelledError: pass
