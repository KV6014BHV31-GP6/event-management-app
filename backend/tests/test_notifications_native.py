"""PostgreSQL claim/rollback evidence on exclusive synthetic *_test DB only."""
import asyncio
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from tests.test_phase2_native import setup_native, form
from src.journey.router import new_application
from src.journey.policy import put, iso
from src.journey.models import JourneyState
from src.events.models import EventModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status
from src.notifications.service import NotificationService
from src.notifications.whatsapp_sender import DeliveryResult
from src.reminders.service import ReminderService

T=datetime(2030,1,1,tzinfo=timezone.utc)

@pytest.fixture
async def notification_native(setup_native):
    sessions,actors,events,stamp=setup_native
    async with sessions() as db:
        event=await db.scalar(select(EventModel).where(EventModel.id==events[0].id).with_for_update())
        event.start_time=T+timedelta(days=10)
        event.end_time=event.start_time+timedelta(hours=1)
        await put(db,'event:'+event.public_id,'event',{'state':'published'},event.id)
        reg,_=await new_application(db,event,form('NOTIFY-'+stamp),None)
        reg.status=Status.approved
        await ReminderService(clock=lambda:T).create_reminders_for_approved_registration(db,reg.id)
        await db.commit()
    return sessions,event,reg

async def test_native_parallel_workers_claim_once(notification_native):
    sessions,event,reg=notification_native
    key='outbox:submitted:'+reg.id
    ready=asyncio.Event();loaded=0
    class Sender:
        calls=0
        async def send(self,**kwargs):
            self.calls+=1
            await asyncio.sleep(.05)
            return DeliveryResult('accepted','SM-NATIVE')
    sender=Sender()
    async def worker():
        nonlocal loaded
        async with sessions() as db:
            row=await db.get(JourneyState,key)
            loaded+=1
            if loaded==2:ready.set()
            await ready.wait()
            await NotificationService(clock=lambda:T).process_notification(db,row,sender)
    await asyncio.wait_for(asyncio.gather(worker(),worker()),10)
    assert sender.calls==1
    async with sessions() as db:
        row=await db.get(JourneyState,key)
        assert row.data['delivery_status']=='accepted'
        assert row.data['external_delivery'] is False

async def test_native_cancellation_during_claim_gap_prevents_send(notification_native):
    sessions,event,reg=notification_native
    key='outbox:reminder:'+reg.id+':'+iso(event.start_time)+':7d'
    async with sessions() as db:
        row=await db.get(JourneyState,key)
        worker=NotificationService(clock=lambda:T+timedelta(days=3))
        assert await worker.repo.claim(db,row,T+timedelta(days=3))
        await db.commit()
    async with sessions() as db:
        await db.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        registration=await db.get(RegistrationModel,reg.id)
        registration.status=Status.cancelled
        await ReminderService().cancel_registration_reminders(db,reg.id)
        await db.commit()
    class Sender:
        async def send(self,**kwargs): raise AssertionError('Cancelled reminder must not send')
    async with sessions() as db:
        await worker.process_notification(db,await db.get(JourneyState,key),Sender())
        assert (await db.get(JourneyState,key)).data['delivery_status']=='cancelled'

async def test_native_reminder_creation_rollback_and_repeat(notification_native):
    sessions,event,reg=notification_native
    async with sessions() as db:
        locked=await db.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        locked.start_time=T+timedelta(days=20)
        await ReminderService(clock=lambda:T).create_reminders_for_approved_registration(db,reg.id)
        await db.rollback()
    async with sessions() as db:
        rows=list((await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='outbox'))).all())
        reminders=[r for r in rows if r.data.get('reminder_type')]
        assert len(reminders)==2 and all(r.data['delivery_status']=='pending' for r in reminders)
        locked=await db.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        await ReminderService(clock=lambda:T).create_reminders_for_approved_registration(db,reg.id)
        await db.commit()
        assert len(list((await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='outbox'))).all()))==3

async def test_native_crashed_claim_cancel_remains_unknown(notification_native):
    sessions,event,reg=notification_native
    key='outbox:reminder:'+reg.id+':'+iso(event.start_time)+':7d'
    async with sessions() as db:
        row=await db.get(JourneyState,key)
        assert await NotificationService().repo.claim(db,row,T)
        await db.commit()
    async with sessions() as db:
        await db.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        await ReminderService().cancel_registration_reminders(db,reg.id)
        await db.commit()
        row=await db.get(JourneyState,key)
        assert row.data['delivery_status']=='processing' and row.data['cancel_requested']
        await NotificationService(clock=lambda:T+timedelta(minutes=11)).recover_stale_claims(db)
        await db.refresh(row)
        assert row.data['delivery_status']=='unknown'
