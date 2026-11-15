"""Austin 7d/1d repository adapted to the canonical notification task store."""
from sqlalchemy import select
from src.journey.models import JourneyState
from src.journey.policy import dt
from src.notifications.repo import NotificationRepository, delivery_status

class ReminderRepository:
    async def cancel_by_registration(self, db, registration_id, *, except_start=None):
        rows = await db.scalars(select(JourneyState).where(JourneyState.kind=='outbox'))
        for row in rows:
            if row.data.get('registration_id')!=registration_id or not (row.data.get('reminder_type') or row.data.get('kind')=='reminder'): continue
            if except_start and (row.data.get('event_start_at') or row.data.get('expires_at'))==except_start: continue
            if delivery_status(row)=='processing':
                # A crashed worker may already have contacted the provider. Preserve
                # its claim until that worker stops before I/O or recovery says UNKNOWN.
                await NotificationRepository.mark(db,row,'processing',cancel_requested=True)
            elif delivery_status(row)=='pending':
                await NotificationRepository.mark(db,row,'cancelled')

    async def get_due_reminders(self, db, current, limit=100):
        rows = await NotificationRepository.get_pending_notifications(db,limit=10000)
        return [r for r in rows if r.data.get('reminder_type') and dt(r.data['scheduled_at'])<=current][:limit]
