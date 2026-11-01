"""Opt-in native Phase2 races/rollback. Uses only the dedicated non-superuser *_test DB."""
import asyncio
import os
import uuid
import json
from pathlib import Path
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

def native_evidence(name,data):
    target=os.environ.get('NU_PHASE2_NATIVE_EVIDENCE_DIR')
    if target:
        path=Path(target);path.mkdir(parents=True,exist_ok=True)
        label=os.environ.get('NU_PHASE2_EVIDENCE_LABEL','native')
        (path/(label+'-'+name+'.json')).write_text(json.dumps(data,indent=2,default=str)+'\n',encoding='utf-8')

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

async def test_native_organizer_cancel_role_change_while_event_locked(setup_native):
    sessions,actors,events,stamp=setup_native;event=events[0];org_id=actors[2].id;regs=[]
    for i in range(2):
        async with sessions() as db:regs.append(await RegistrationService.create_online_registration(db,event.public_id,RegistrationCreate(**form('CANCEL-ROLE-'+stamp+str(i))),actors[i].id))
        async with sessions() as db:await RegistrationService.approve_registration(db,regs[-1].id,org_id)
    async with sessions() as blocker, sessions() as cancel_db:
        await blocker.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        before=await cancel_db.scalar(select(UserModel).where(UserModel.id==org_id).execution_options(populate_existing=True));assert before.role==UserRoleEnum.organizer
        cancel_pid=await cancel_db.scalar(text('SELECT pg_backend_pid()'))
        async def cancel():
            try:return (await RegistrationService.cancel_user_registration(cancel_db,regs[0].id,org_id,organizer_owner=True)).status.value
            except HTTPException as exc:return exc.status_code
        task=asyncio.create_task(cancel());waiting=False
        for _ in range(300):
            async with sessions() as monitor:waiting=await monitor.scalar(text("SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=:pid"),{'pid':cancel_pid})
            if waiting:break
            await asyncio.sleep(.01)
        assert waiting,'Cancel never reached the held event lock.'
        async with sessions() as demoter:
            actor=await demoter.get(UserModel,org_id);actor.role=UserRoleEnum.user;await demoter.commit()
        await blocker.commit();result=await asyncio.wait_for(task,10)
    async with sessions() as db:
        a=await db.get(RegistrationModel,regs[0].id);b=await db.get(RegistrationModel,regs[1].id)
        status={'A':a.status.value,'B':b.status.value,'cancelled_at':a.cancelled_at,'cancelled_by':a.cancelled_by_user_id}
    native_evidence('BE-R1',{'event_lock_wait_observed':waiting,'role_before_wait':'organizer','demotion_committed_before_unlock':True,'result':result,'state_after':status,'expected_result':403})
    assert result==403 and status=={'A':'approved','B':'waiting','cancelled_at':None,'cancelled_by':None}
    async with sessions() as db:
        actor=await db.get(UserModel,org_id);actor.role=UserRoleEnum.organizer;await db.commit()
    async with sessions() as db:assert (await RegistrationService.cancel_user_registration(db,regs[0].id,org_id,organizer_owner=True)).status.value=='cancelled'
    async with sessions() as db:
        a=await db.get(RegistrationModel,regs[0].id);b=await db.get(RegistrationModel,regs[1].id)
        assert a.cancelled_by_user_id==org_id and b.status.value=='approved'
    native_evidence('BE-R1',{'event_lock_wait_observed':True,'role_before_wait':'organizer','demotion_committed_before_unlock':True,'result':403,'state_after_refusal':status,'restored_role_authorized_cancel_and_promotion':'PASS'})

@pytest.mark.parametrize('collision',['submission','identity'])
async def test_native_reverse_order_deadlock_controlled_whole_batch(setup_native,monkeypatch,collision):
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.exc import DBAPIError
    sessions,actors,events,stamp=setup_native;ids=[str(uuid.uuid4()),str(uuid.uuid4())];ps=[]
    for i in range(2):
        order=[0,1] if i==0 else [1,0]
        items=[]
        for n in order:
            sub=ids[n] if collision=='submission' else str(uuid.uuid4())
            identity=('REVERSE-'+stamp+str(n)) if collision=='identity' else ('REVERSE-'+stamp+str(i)+str(n))
            items.append({'client_submission_id':sub,'application':form(identity)})
        ps.append(SyncBatch(contract_version='rose.offline-sync.v2',batch_id=str(uuid.uuid4()),items=items))
    original=AsyncSession.flush;arrivals=set();gate=asyncio.Event();classified=[]
    async def flush(self,*args,**kwargs):
        receipt=any(isinstance(row,SyncSubmissionModel) and row.actor_id in [a.id for a in actors[:2]] for row in self.new)
        try:result=await original(self,*args,**kwargs)
        except DBAPIError as exc:
            classified.append({'type':type(exc).__name__,'sqlstate':getattr(exc.orig,'sqlstate',None) or getattr(getattr(exc.orig,'__cause__',None),'sqlstate',None),'stage':'receipt' if receipt else 'business'})
            raise
        if receipt and id(self) not in arrivals:
            arrivals.add(id(self))
            if len(arrivals)==2:gate.set()
            await asyncio.wait_for(gate.wait(),10)
        return result
    monkeypatch.setattr(AsyncSession,'flush',flush)
    results=await asyncio.gather(*(send(sessions,events[i],actors[i],ps[i]) for i in range(2)),return_exceptions=True)
    actual_counts=await counts(sessions,events,actors)
    kinds=[r if isinstance(r,int) else ('receipt' if isinstance(r,dict) else type(r).__name__) for r in results]
    native_evidence('BE-R2-'+collision,{'barrier_after_first_receipt_flush':len(arrivals)==2,'classified':classified,'results':kinds,'counts':actual_counts,'expected_loser':409,'expected_counts':{'registrations':2,'batches':1,'submissions':2}})
    assert len(arrivals)==2 and any(c['sqlstate']=='40P01' for c in classified),(kinds,classified)
    assert sum(isinstance(r,dict) for r in results)==1 and 409 in results,(kinds,classified,actual_counts)
    assert actual_counts=={'registrations':2,'batches':1,'submissions':2}
