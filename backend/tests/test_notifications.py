"""Synthetic transport and explicit virtual UTC clock; no external sends."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from sqlalchemy import select
from src.notifications.repo import NotificationRepository
from src.notifications.service import NotificationService
from src.notifications.whatsapp_sender import DeliveryResult, SyntheticSender, WhatsAppSender
from src.reminders.service import ReminderService
from src.journey.models import JourneyState
from src.journey.policy import put
from tests.test_journey import managed, mutation, application, review
from tests.test_demo_readiness import actors

T = datetime(2030, 1, 1, 12, tzinfo=timezone.utc)

async def fixture_registration(client, db, managed):
    public, actors = managed
    await mutation(client, public, actors['org'], 'publish', {})
    rid = await application(client, public, 'TEST-NOTIFY-001', actors['a'])
    await review(client, rid, actors['org'])
    from src.registrations.models import RegistrationModel
    from src.events.models import EventModel
    reg = await db.get(RegistrationModel, rid)
    event = await db.get(EventModel, reg.event_id)
    event.start_time = T + timedelta(days=10)
    event.end_time = event.start_time + timedelta(hours=1)
    await db.flush()
    return reg, event

async def tasks(db):
    await db.flush()
    return list((await db.scalars(select(JourneyState).where(JourneyState.kind=='outbox'))).all())

async def test_7d_1d_dedup_timezone_and_reschedule(client, db_session, managed):
    reg,event = await fixture_registration(client, db_session, managed)
    service = ReminderService(clock=lambda:T)
    await service.create_reminders_for_approved_registration(db_session, reg.id)
    await service.create_reminders_for_approved_registration(db_session, reg.id)
    rows = [r for r in await tasks(db_session) if r.data.get('reminder_type')]
    assert len(rows)==2
    assert {r.data['scheduled_at'] for r in rows}=={'2030-01-04T12:00:00Z','2030-01-10T12:00:00Z'}
    event.start_time = (T + timedelta(days=20)).astimezone(timezone(timedelta(hours=8)))
    await service.create_reminders_for_approved_registration(db_session, reg.id)
    rows = [r for r in await tasks(db_session) if r.data.get('reminder_type')]
    assert len(rows)==4
    assert sum(r.data['delivery_status']=='cancelled' for r in rows)==2
    event.start_time=T+timedelta(days=10)
    await service.create_reminders_for_approved_registration(db_session,reg.id)
    assert len([r for r in await tasks(db_session) if r.data.get('reminder_type')])==4
    assert sum(r.data['delivery_status']=='pending' for r in rows)==2

async def test_due_dry_run_expiry_and_pending_cancel(client, db_session, managed):
    reg,event = await fixture_registration(client, db_session, managed)
    service=ReminderService(clock=lambda:T)
    await service.create_reminders_for_approved_registration(db_session,reg.id)
    worker=NotificationService(clock=lambda:T+timedelta(days=3))
    await worker.process_pending_notifications(db_session,SyntheticSender())
    rows=[r for r in await tasks(db_session) if r.data.get('reminder_type')]
    assert sorted(r.data['delivery_status'] for r in rows)==['dry_run','pending']
    reg.status=__import__('src.registrations.models',fromlist=['RegistrationStatusEnum']).RegistrationStatusEnum.pending
    await service.process_due_reminders(db_session)
    assert all(r.data['delivery_status'] in {'dry_run','cancelled'} for r in rows)
    reg.status=__import__('src.registrations.models',fromlist=['RegistrationStatusEnum']).RegistrationStatusEnum.approved
    event.start_time=T-timedelta(days=1)
    await service.create_reminders_for_approved_registration(db_session,reg.id)
    assert not any(r.data['delivery_status']=='pending' for r in rows)

async def test_unknown_is_never_retried_and_receipt_reconciliation(client,db_session,managed):
    reg,event=await fixture_registration(client,db_session,managed)
    row=next(r for r in await tasks(db_session) if r.data['kind']=='confirmation')
    class TimeoutSender:
        calls=0
        async def send(self,**kwargs):
            self.calls+=1
            raise TimeoutError('sensitive provider text must not persist')
    sender=TimeoutSender();worker=NotificationService(clock=lambda:T)
    await worker.process_pending_notifications(db_session,sender)
    assert row.data['delivery_status']=='unknown'
    assert 'sensitive' not in str(row.data)
    await worker.process_pending_notifications(db_session,sender)
    assert sender.calls==2  # submitted + confirmation, exactly once each
    await worker.record_provider_receipt(db_session,row.key,'SM-SYNTHETIC','delivered')
    assert row.data['delivery_status']=='delivered'
    with pytest.raises(ValueError):
        await worker.record_provider_receipt(db_session,row.key,'DIFFERENT','delivered')

async def test_provider_accepted_is_not_delivered():
    client=SimpleNamespace(messages=SimpleNamespace(create=lambda **kw:SimpleNamespace(sid='SM-TEST',status='queued')))
    sender=WhatsAppSender(client=client,source_number='+10000000000',test_recipient='+10000000001',enabled=True)
    result=await sender.send(phone_number='+10000000001',message='Synthetic only')
    assert result==DeliveryResult('accepted','SM-TEST')
    assert (await sender.send(phone_number='+10000000002',message='Synthetic only')).status=='failed'

async def test_claim_compare_and_swap_and_restart(client,db_session,managed):
    reg,event=await fixture_registration(client,db_session,managed)
    row=next(r for r in await tasks(db_session) if r.data['kind']=='confirmation')
    repo=NotificationRepository()
    assert await repo.claim(db_session,row,T)
    assert not await repo.claim(db_session,row,T)
    await db_session.commit()
    await NotificationService(clock=lambda:T+timedelta(minutes=11)).recover_stale_claims(db_session)
    await db_session.refresh(row)
    assert row.data['delivery_status']=='unknown'

async def test_scheduler_lifespan_runs_both_jobs_and_stops(monkeypatch):
    import asyncio
    from src.infrastructure import scheduler
    called=[];done=asyncio.Event()
    async def reminders():called.append('reminders')
    async def notifications():called.append('notifications');done.set()
    monkeypatch.setenv('NU_DEMO_PROFILE','synthetic')
    monkeypatch.delenv('NU_NOTIFICATION_SCHEDULER',raising=False)
    monkeypatch.setattr(scheduler,'process_due_reminders_job',reminders)
    monkeypatch.setattr(scheduler,'process_pending_notifications_job',notifications)
    async with scheduler.lifespan(None):
        await asyncio.wait_for(done.wait(),1)
    assert called==['reminders','notifications']

async def test_expired_reminders_never_send_and_explicit_clock(client,db_session,managed):
    reg,event=await fixture_registration(client,db_session,managed)
    await ReminderService(clock=lambda:T).create_reminders_for_approved_registration(db_session,reg.id)
    class Sender:
        async def send(self,**kwargs): raise AssertionError('Expired milestone must not send')
    worker=NotificationService(clock=lambda:T+timedelta(days=11))
    for row in [r for r in await tasks(db_session) if r.data.get('reminder_type')]:
        await worker.process_notification(db_session,row,Sender())
        assert row.data['delivery_status']=='expired'

async def test_manual_24h_shares_automatic_identity(client,db_session,managed,monkeypatch):
    import importlib
    reg,event=await fixture_registration(client,db_session,managed)
    await ReminderService(clock=lambda:T).create_reminders_for_approved_registration(db_session,reg.id)
    await db_session.commit()
    module=importlib.import_module('src.journey.router')
    monkeypatch.setattr(module,'now',lambda:T+timedelta(days=9))
    public,a=managed
    await mutation(client,public,a['org'],'reminders',{})
    reminders=[r for r in await tasks(db_session) if r.data.get('reminder_type')]
    assert len(reminders)==2
    assert len([r for r in await tasks(db_session) if r.data['kind']=='reminder'])==0

async def test_unconfigured_sender_and_phone_mask(monkeypatch,client,db_session,managed):
    monkeypatch.delenv('NU_NOTIFICATION_EXTERNAL_SEND',raising=False)
    sender=WhatsAppSender()
    result=await sender.send(phone_number='SYNTHETIC',message='Private synthetic body')
    assert result.code=='EXTERNAL_DELIVERY_NOT_CONFIGURED'
    reg,event=await fixture_registration(client,db_session,managed)
    rows=await tasks(db_session)
    assert all(row.data['recipient_hint'].startswith('***') for row in rows)
    assert {r.data['kind'] for r in rows}=={'application_received','confirmation'}
