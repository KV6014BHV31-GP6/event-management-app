"""Opt-in native Phase2 races/rollback. Uses only the dedicated non-superuser *_test DB."""
import asyncio
import os
import uuid
from datetime import datetime,timezone
import pytest
import ulid
from fastapi import HTTPException
from sqlalchemy import select,func,text
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from src.core.database import Base
from src.users.models import UserModel,UserRoleEnum
from src.events.models import EventModel,EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel
from src.registrations.schemas import RegistrationCreate
from src.registrations.service import RegistrationService
from src.phase2.models import SyncBatchModel,SyncSubmissionModel
from src.phase2.schemas import SyncBatch
from src.phase2 import sync

@pytest.fixture
async def setup_native():
    url=os.environ.get('NU_NATIVE_TEST_DATABASE_URL')
    if not url:pytest.skip('Dedicated native test DB opt-in required.')
    assert url.startswith('postgresql+asyncpg://') and url.endswith('_test')
    engine=create_async_engine(url,echo=False,hide_parameters=True)
    async with engine.begin() as conn:
        assert not await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))
        await conn.run_sync(Base.metadata.create_all)
    sessions=async_sessionmaker(engine,expire_on_commit=False,autoflush=False)
    stamp=str(ulid.ULID());actors=[];events=[]
    async with sessions() as db:
        for index,role in enumerate(['leader','leader','organizer']):
            actor=UserModel(id=str(ulid.ULID()),username=stamp[-15:]+str(index),role=UserRoleEnum(role),password_hash='unusable-native-fixture')
            db.add(actor);actors.append(actor)
        await db.flush()
        for _ in range(3):
            event=EventModel(public_id=str(ulid.ULID())[-21:],organizer_id=actors[2].id,title='Phase2 native synthetic',location='Synthetic',online_quota=1,offline_quota=0,start_time=datetime(2030,1,1,tzinfo=timezone.utc),end_time=datetime(2030,1,2,tzinfo=timezone.utc),status=EventStatusEnum.active)
            db.add(event);events.append(event)
        await db.commit()
    try:yield sessions,actors,events,stamp
    finally:await engine.dispose()

def form(identity):return {'first_name':'Native','last_name':'Synthetic','gender':'female','date_of_birth':'1990-01-01','phone':'TEST','national_id':identity}
def payload(identity,batch_id=None,submission_id=None):
    return SyncBatch(contract_version='rose.offline-sync.v2',batch_id=batch_id or str(uuid.uuid4()),items=[{'client_submission_id':submission_id or str(uuid.uuid4()),'application':form(identity)}])
async def send(sessions,event,actor,p):
    async with sessions() as db:
        try:return await sync.submit(db,event.public_id,p,actor.id)
        except HTTPException as exc:return exc.status_code
async def counts(sessions,events,actors):
    async with sessions() as db:
        ids=[e.id for e in events];aids=[a.id for a in actors]
        return {'registrations':await db.scalar(select(func.count()).select_from(RegistrationModel).where(RegistrationModel.event_id.in_(ids))),
          'batches':await db.scalar(select(func.count()).select_from(SyncBatchModel).where(SyncBatchModel.actor_id.in_(aids))),
          'submissions':await db.scalar(select(func.count()).select_from(SyncSubmissionModel).where(SyncSubmissionModel.actor_id.in_(aids)))}

async def test_native_v2_same_id_concurrent_exactly_once(setup_native):
    sessions,actors,events,stamp=setup_native;p=payload('SAME-'+stamp)
    results=await asyncio.gather(*(send(sessions,events[0],actors[0],p) for _ in range(8)))
    assert all(r==results[0] for r in results) and results[0]['items'][0]['outcome']=='accepted'
    assert await counts(sessions,events,actors)=={'registrations':1,'batches':1,'submissions':1}
    async with sessions() as db:
        row=await db.scalar(select(RegistrationModel).where(RegistrationModel.id==results[0]['items'][0]['registration_id']))
        person=await db.get(ParticipantModel,row.participant_id)
        assert row.address is None and row.income_band_code is None and row.marriage_status is None and person.address is None

async def test_native_global_batch_collision_rolls_back_all_effects(setup_native):
    sessions,actors,events,stamp=setup_native;key=str(uuid.uuid4())
    results=await asyncio.gather(*(send(sessions,events[i],actors[i],payload('BATCH-'+stamp+str(i),batch_id=key)) for i in range(2)))
    assert sum(isinstance(r,dict) for r in results)==1 and 403 in results
    assert await counts(sessions,events,actors)=={'registrations':1,'batches':1,'submissions':1}

async def test_native_global_submission_collision_whole_batch_rollback(setup_native):
    sessions,actors,events,stamp=setup_native;key=str(uuid.uuid4());ps=[]
    for i in range(2):
        p=payload('PREFIX-'+stamp+str(i))
        p.items.append(type(p.items[0])(client_submission_id=key,application=form('COLLISION-'+stamp+str(i))))
        ps.append(p)
    results=await asyncio.gather(*(send(sessions,events[i],actors[i],ps[i]) for i in range(2)))
    assert sum(isinstance(r,dict) for r in results)==1 and 403 in results
    assert await counts(sessions,events,actors)=={'registrations':2,'batches':1,'submissions':2}

async def test_native_national_identity_cross_event_race_keeps_partial_receipts(setup_native):
    sessions,actors,events,stamp=setup_native
    results=await asyncio.gather(*(send(sessions,events[i],actors[i],payload('IDENTITY-'+stamp)) for i in range(2)))
    assert sorted(r['items'][0]['outcome'] for r in results)==['accepted','rejected']
    assert {r['items'][0]['code'] for r in results}=={'RECORDED','IDENTITY_CONFLICT'}
    assert await counts(sessions,events,actors)=={'registrations':1,'batches':2,'submissions':2}

async def test_native_batch_rollback_receipts_and_domain_effects(setup_native,monkeypatch):
    sessions,actors,events,stamp=setup_native;p=payload('ROLLBACK-'+stamp)
    async with sessions() as db:
        async def fail():raise RuntimeError('controlled pre-commit fault')
        monkeypatch.setattr(db,'commit',fail)
        with pytest.raises(RuntimeError,match='controlled pre-commit fault'):await sync.submit(db,events[0].public_id,p,actors[0].id)
    assert await counts(sessions,events,actors)=={'registrations':0,'batches':0,'submissions':0}
    async with sessions() as db:
        with pytest.raises(HTTPException) as exc:await sync.get_receipt(db,events[0].public_id,p.batch_id,actors[0].id)
        assert exc.value.status_code==404
    result=await send(sessions,events[0],actors[0],p);assert result['items'][0]['outcome']=='accepted'
    assert await counts(sessions,events,actors)=={'registrations':1,'batches':1,'submissions':1}

async def test_native_raw_fingerprint_and_actor_role_recheck(setup_native):
    sessions,actors,events,stamp=setup_native;p=payload('RAW-'+stamp)
    initial=await send(sessions,events[0],actors[0],p);assert initial['items'][0]['outcome']=='accepted'
    changed=p.model_copy(deep=True);changed.items[0].application['address']=None
    assert await send(sessions,events[0],actors[0],changed)==409
    async with sessions() as db:
        actor=await db.get(UserModel,actors[0].id);actor.role=UserRoleEnum.user;await db.commit()
    assert await send(sessions,events[0],actors[0],p)==403
    async with sessions() as db:
        with pytest.raises(HTTPException) as exc:await sync.get_receipt(db,events[0].public_id,p.batch_id,actors[0].id)
        assert exc.value.status_code==403

async def test_native_same_actor_exact_identity_reuse_no_mutation(setup_native):
    sessions,actors,events,stamp=setup_native;identity='REUSE-'+stamp
    first=await send(sessions,events[0],actors[0],payload(identity));second=await send(sessions,events[1],actors[0],payload(identity))
    assert first['items'][0]['outcome']==second['items'][0]['outcome']=='accepted'
    changed=payload(identity);changed.items[0].application['address']='Changed'
    refused=await send(sessions,events[2],actors[0],changed);assert refused['items'][0]['code']=='IDENTITY_CONFLICT'
    foreign=await send(sessions,events[2],actors[1],payload(identity));assert foreign['items'][0]['code']=='IDENTITY_CONFLICT'
    duplicate=await send(sessions,events[0],actors[1],payload(identity));assert duplicate['items'][0]['outcome']=='duplicate' and duplicate['items'][0]['registration_id'] is None
    async with sessions() as db:
        rows=(await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id.in_([e.id for e in events])))).all()
        assert len(rows)==2 and rows[0].participant_id==rows[1].participant_id
        assert (await db.get(ParticipantModel,rows[0].participant_id)).address is None

async def test_native_closed_full_replay_and_online_claim_refusal(setup_native):
    sessions,actors,events,stamp=setup_native;p=payload('CLOSE-'+stamp)
    initial=await send(sessions,events[0],actors[0],p)
    async with sessions() as db:
        event=await db.get(EventModel,events[0].id);event.status=EventStatusEnum.cancelled;await db.commit()
    assert await send(sessions,events[0],actors[0],p)==initial
    assert (await send(sessions,events[0],actors[0],payload('CLOSED-NEW-'+stamp)))['items'][0]['code']=='EVENT_CLOSED'
    async with sessions() as db:
        online=await RegistrationService.create_online_registration(db,events[1].public_id,RegistrationCreate(**form('ONLINE-'+stamp)),actors[1].id)
    async with sessions() as db:await RegistrationService.approve_registration(db,online.id,actors[2].id)
    assert (await send(sessions,events[1],actors[0],payload('FULL-'+stamp)))['items'][0]['code']=='EVENT_FULL'
    assert (await send(sessions,events[2],actors[0],payload('ONLINE-'+stamp)))['items'][0]['code']=='IDENTITY_CONFLICT'
