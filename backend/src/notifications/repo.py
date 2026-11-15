"""Austin repository/context join adapted to canonical JourneyState storage.
Creation holds the event lock; claims compare persisted versions. No helper commits.
"""
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import select, update
from src.notifications.models import NotificationModel
from src.notifications.schemas import RegistrationContext
from src.registrations.models import RegistrationModel
from src.participants.models import ParticipantModel
from src.events.models import EventModel
from src.journey.policy import dt, iso, state, put

def delivery_status(row):
    return row.data.get('delivery_status', 'failed' if row.data.get('state')=='failed' else 'legacy_recorded')

def compatibility_view(row):
    status = delivery_status(row)
    display = 'demo_recorded' if status in {'pending','dry_run','legacy_recorded'} else status
    return {**row.data, 'state':display}

class NotificationRepository:
    @staticmethod
    async def create(db, *, event, reg, kind, key, message, scheduled_at=None, **extra):
        existing = await state(db, 'outbox:'+key)
        if existing:
            # The caller holds the event lock. Reapproval may reuse a lifecycle notice
            # cancelled before any claim, but must never replay a provider attempt.
            if kind in {'confirmation','waitlisted'} and existing.data.get('kind')==kind and delivery_status(existing)=='cancelled' and not existing.data.get('external_delivery') and all(existing.data.get(field) is None for field in ('claimed_at','processed_at','provider_id')):
                await NotificationRepository.mark(db,existing,'pending',cancel_requested=False,
                    due_at=iso(),requeued_at=iso(),recipient_hint='***'+reg.phone[-2:])
            return existing
        current = datetime.now(timezone.utc)
        data = {'id':str(uuid4()), 'event_public_id':event.public_id,
                'registration_id':reg.id if reg else None, 'kind':kind,
                'recipient_binding':'registration', 'recipient_hint':'***'+reg.phone[-2:] if reg else 'Organizer',
                'provider':'DEMO_OUTBOX', 'delivery_status':'pending',
                'created_at':iso(current), 'scheduled_at':iso(dt(scheduled_at)) if scheduled_at else iso(current),
                'message':message, 'external_delivery':False, 'notification_version':1, **extra}
        return await put(db, 'outbox:'+key, 'outbox', data, event.id)

    @staticmethod
    async def get_pending_notifications(db, limit=100):
        rows = await db.scalars(select(NotificationModel).where(NotificationModel.kind=='outbox').order_by(NotificationModel.key))
        return [row for row in rows if delivery_status(row)=='pending'][:limit]

    @staticmethod
    async def claim(db, notification, current):
        if delivery_status(notification) != 'pending': return False
        data = {**notification.data, 'delivery_status':'processing', 'claimed_at':iso(current)}
        old_version = notification.version
        await db.flush()
        result = await db.execute(update(NotificationModel).where(
            NotificationModel.key==notification.key, NotificationModel.version==old_version
        ).values(data=data, version=old_version+1).execution_options(synchronize_session=False))
        await db.refresh(notification)
        return result.rowcount == 1

    @staticmethod
    async def mark(db, notification, status, **extra):
        data={k:v for k,v in notification.data.items() if k!='state'}
        notification.data = {**data, 'delivery_status':status, **extra}
        notification.version += 1
        await db.flush()

    @staticmethod
    async def get_registration_context(db, registration_id):
        stmt = select(
            RegistrationModel.id.label('registration_id'), ParticipantModel.id.label('participant_id'),
            (RegistrationModel.first_name+' '+RegistrationModel.last_name).label('participant_name'),
            RegistrationModel.phone.label('participant_phone'), EventModel.id.label('event_id'),
            EventModel.public_id.label('event_public_id'), EventModel.title.label('event_title'),
            EventModel.location.label('event_location'), EventModel.start_time.label('event_start_time'),
            EventModel.end_time.label('event_end_time'), RegistrationModel.status.label('registration_status'),
        ).join(EventModel,RegistrationModel.event_id==EventModel.id).join(
            ParticipantModel,RegistrationModel.participant_id==ParticipantModel.id
        ).where(RegistrationModel.id==registration_id)
        row = (await db.execute(stmt)).mappings().first()
        if not row: return None
        values = dict(row)
        values['registration_status'] = values['registration_status'].value
        work=await db.get(NotificationModel,'event:'+values['event_public_id'])
        values['event_timezone']=work.data.get('timezone','UTC') if work else 'UTC'
        return RegistrationContext.model_validate(values)
