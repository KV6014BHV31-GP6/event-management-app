"""Austin milestone generation, with explicit current-model join and UTC clock.
Reminder tasks share notification state: completion never implies external delivery.
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from fastapi import HTTPException
from src.events.models import EventModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status
from src.reminders.repo import ReminderRepository
from src.notifications.repo import NotificationRepository, delivery_status
from src.journey.models import JourneyState
from src.journey.policy import dt, iso

class ReminderService:
    def __init__(self, reminder_repo=None, notification_service=None, clock=None):
        self.reminder_repo = reminder_repo or ReminderRepository()
        self.notification_service = notification_service
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    async def create_reminders_for_approved_registration(self, db, registration_id):
        # No relationship is required or added to the existing Registration model.
        await db.flush()
        pair = (await db.execute(select(RegistrationModel,EventModel).join(
            EventModel,RegistrationModel.event_id==EventModel.id
        ).where(RegistrationModel.id==registration_id))).first()
        if not pair: raise HTTPException(404,'Registration not found')
        reg,event = pair
        event=await db.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update().execution_options(populate_existing=True))
        reg=await db.get(RegistrationModel,reg.id,populate_existing=True)
        work = await db.get(JourneyState,'event:'+event.public_id)
        start = iso(dt(event.start_time))
        await self.reminder_repo.cancel_by_registration(db,reg.id,except_start=start if reg.status==Status.approved and work and work.data['state']=='published' else None)
        if reg.status!=Status.approved or not work or work.data['state']!='published': return []
        ids=[]
        for days,kind in ((7,'7d'),(1,'1d')):
            scheduled = dt(event.start_time)-timedelta(days=days)
            # Do not create stale milestones retroactively after approval/reschedule.
            if scheduled < self.clock() or dt(event.start_time)<=self.clock(): continue
            row=await NotificationRepository.create(db,event=event,reg=reg,kind='scheduled_reminder',
                key='reminder:'+reg.id+':'+start+':'+kind,
                message='', scheduled_at=scheduled, reminder_type=kind,
                notification_type='event_reminder_7_days' if days==7 else 'event_reminder_1_day',
                event_start_at=start, expires_at=start)
            if delivery_status(row)=='cancelled' and not row.data.get('provider_id'):
                await NotificationRepository.mark(db,row,'pending',cancel_requested=False)
            ids.append(row.data['id'])
        return ids

    async def process_due_reminders(self, db):
        # Rebuild missing future tasks and invalidate old/cancelled work after restarts.
        events = list((await db.scalars(select(EventModel).join(JourneyState,JourneyState.event_id==EventModel.id).where(JourneyState.kind=='event').order_by(EventModel.id))).all())
        for event in events:
            event=await db.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update().execution_options(populate_existing=True))
            regs=await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id==event.id))
            for reg in list(regs):
                await self.create_reminders_for_approved_registration(db,reg.id)
            await db.commit()

    async def cancel_registration_reminders(self, db, registration_id):
        await self.reminder_repo.cancel_by_registration(db,registration_id)
