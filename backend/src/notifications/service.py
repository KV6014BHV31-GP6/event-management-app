"""Austin notification processing/templates adapted to one durable Journey outbox.
Claims commit before I/O; cancellation rechecks under the event lock. Unknown never retries.
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from src.notifications.repo import NotificationRepository, delivery_status
from src.notifications.schemas import RegistrationContext
from src.notifications.whatsapp_sender import DeliveryResult
from src.journey.models import JourneyState
from src.journey.policy import dt, iso
from src.events.models import EventModel
from src.registrations.models import RegistrationModel
import logging
from zoneinfo import ZoneInfo
logger=logging.getLogger(__name__)

class NotificationService:
    def __init__(self, notification_repo=None, clock=None):
        self.repo=notification_repo or NotificationRepository()
        self.clock=clock or (lambda: datetime.now(timezone.utc))

    async def recover_stale_claims(self,db):
        rows=list((await db.scalars(select(JourneyState).where(JourneyState.kind=='outbox').order_by(JourneyState.event_id,JourneyState.key))).all())
        for row in rows:
            if delivery_status(row)=='processing' and dt(row.data['claimed_at'])<self.clock()-timedelta(minutes=10):
                await db.scalar(select(EventModel).where(EventModel.id==row.event_id).with_for_update())
                await db.refresh(row)
                if delivery_status(row)=='processing' and dt(row.data['claimed_at'])<self.clock()-timedelta(minutes=10):
                    await self.repo.mark(db,row,'unknown',error_code='INTERRUPTED_SEND_RECONCILE_FIRST')
        await db.commit()

    async def process_pending_notifications(self,db,whatsapp_sender):
        await self.recover_stale_claims(db)
        rows=await self.repo.get_pending_notifications(db,limit=10000)
        due=sorted((r for r in rows if dt(r.data.get('due_at') or r.data['scheduled_at'])<=self.clock()),key=lambda r:(r.data['scheduled_at'],r.key))[:100]
        for notification in due:
            await self.process_notification(db,notification,whatsapp_sender)

    async def _eligible(self,db,row):
        event=await db.scalar(select(EventModel).where(EventModel.id==row.event_id).with_for_update().execution_options(populate_existing=True))
        await db.refresh(row)
        # A stale pending snapshot may now be an unresolved/completed provider
        # attempt. Recheck after the lock/refresh before eligibility mutates it.
        if delivery_status(row) not in {'pending','processing'}: return False
        if not event: return False
        if row.data.get('cancel_requested'):
            await self.repo.mark(db,row,'cancelled');return False
        expiry=dt(row.data['expires_at']) if row.data.get('expires_at') else None
        if expiry and (expiry<self.clock() or expiry==self.clock() and row.data['kind']!='reminder'):
            await self.repo.mark(db,row,'expired');return False
        if row.data.get('reminder_type') or row.data['kind']=='reminder':
            reg=await db.get(RegistrationModel,row.data['registration_id'],populate_existing=True)
            work=await db.get(JourneyState,'event:'+event.public_id,populate_existing=True)
            if not reg or reg.status.value!='approved' or not work or work.data['state']!='published' or (row.data.get('event_start_at') or row.data.get('expires_at'))!=iso(dt(event.start_time)):
                await self.repo.mark(db,row,'cancelled');return False
        elif row.data['kind'] in {'confirmation','waitlist_offer','waitlisted'}:
            reg=await db.get(RegistrationModel,row.data['registration_id'],populate_existing=True)
            if not reg or reg.status.value != ('approved' if row.data['kind']=='confirmation' else 'waiting'):
                await self.repo.mark(db,row,'cancelled');return False
            if row.data['kind']=='waitlist_offer':
                offer=await db.get(JourneyState,row.key.removeprefix('outbox:'),populate_existing=True)
                if not offer or offer.data['state']!='offered':
                    await self.repo.mark(db,row,'cancelled');return False
        return True

    async def process_notification(self,db,notification,whatsapp_sender):
        if delivery_status(notification) not in {'pending','processing'}:
            return
        if not await self._eligible(db,notification):
            await db.commit();return
        if not await self.repo.claim(db,notification,self.clock()):
            await db.commit();return
        await db.commit()  # durable claim BEFORE any provider call
        if not await self._eligible(db,notification) or delivery_status(notification)!='processing':
            await db.commit();return
        # Keep the event lock through send/result persistence, serializing cancellation.
        context=await self.repo.get_registration_context(db,notification.data['registration_id']) if notification.data['registration_id'] else None
        if not context:
            await self.repo.mark(db,notification,'dry_run',error_code='INTERNAL_ONLY_NO_RECIPIENT');await db.commit();return
        notification_type=notification.data.get('notification_type') or {
            'application_received':'registration_submitted','confirmation':'registration_approved',
            'cancellation':'registration_cancelled','waitlisted':'registration_waitlisted',
        }.get(notification.data['kind'])
        message=await self.build_message(notification_type,context) if notification_type else notification.data['message']
        try:
            result=await whatsapp_sender.send(phone_number=context.participant_phone,message=message)
        except Exception:
            result=DeliveryResult('unknown',code='PROVIDER_RESULT_UNKNOWN')
        await self.repo.mark(db,notification,result.status,provider_id=result.provider_id,
            provider='TWILIO' if result.status in {'accepted','delivered','unknown'} else 'DEMO_OUTBOX',
            external_delivery=result.status=='delivered', error_code=result.code, processed_at=iso(self.clock()))
        await db.commit()

    async def record_provider_receipt(self,db,key,provider_id,status):
        if status not in {'accepted','delivered','failed','unknown'}: raise ValueError('Invalid provider status')
        row=await db.get(JourneyState,key)
        if not row or delivery_status(row) not in {'accepted','unknown','delivered','failed'}: raise ValueError('No provider attempt to reconcile')
        await db.scalar(select(EventModel).where(EventModel.id==row.event_id).with_for_update())
        await db.refresh(row)
        existing=row.data.get('provider_id')
        if existing and existing!=provider_id: raise ValueError('Provider reference mismatch')
        if delivery_status(row)=='delivered' and status!='delivered': return
        await self.repo.mark(db,row,status,provider_id=provider_id,external_delivery=status=='delivered')
        await db.commit()
    async def build_message(
        self,
        notification_type: str,
        context: RegistrationContext
    ) -> str:
        """
        Compiles and renders a highly tailored WhatsApp string payload based on the targeted
        notification type using the pre-fetched flattened registration context data.
        """
        attendee_name = context.participant_name or "Valued Guest"
        event_title = context.event_title or "our upcoming event"

        event_date = ""
        if context.event_start_time:
            event_date = dt(context.event_start_time).astimezone(ZoneInfo(context.event_timezone)).strftime("%Y-%m-%d %H:%M %Z")

        # Comprehensive type matrix rendering rules driven by contextual parameters
        if notification_type == "registration_submitted":
            return f"Hello {attendee_name}, your application for '{event_title}' was received. Receipt does not confirm a place; check your current application status for the review outcome."

        elif notification_type == "registration_approved":
            return f"Great news {attendee_name}! Your registration for '{event_title}' on {event_date} has been APPROVED. See you there!"

        elif notification_type == "registration_waitlisted":
            return f"Hello {attendee_name}, '{event_title}' is currently full. You have been added to the waitlist. We will notify you if a slot opens up."

        elif notification_type == "registration_cancelled":
            return f"Hello {attendee_name}, your registration for '{event_title}' has been officially cancelled."

        elif notification_type == "waitlist_promoted":
            return f"Good news {attendee_name}! You have been promoted from the waitlist for '{event_title}'. A place is offered; accept the offer before its expiry to confirm your booking."

        elif notification_type == "event_reminder_7_days":
            return f"Hi {attendee_name}, this is your 7-day reminder for '{event_title}', scheduled on {event_date}. Get ready!"

        elif notification_type == "event_reminder_1_day":
            return f"Hi {attendee_name}, this is your 1-day reminder for '{event_title}', scheduled on {event_date}. See you there!"

        else:
            logger.warning(
                f"Unrecognized notification type mapping requested: {notification_type}")
            return f"Hello {attendee_name}, this is a status update regarding your registration for '{event_title}'."
