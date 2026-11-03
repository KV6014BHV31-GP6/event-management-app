"""Native PG17 event-lock races; scoped only to explicitly opted-in *_be_test DB."""
import asyncio
import json
from datetime import timedelta
from uuid import uuid4
import pytest
from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import select, func
from tests.test_phase2_native import setup_native, form
from tests.test_journey import envelope
from src.journey.router import mutate, new_application
from src.journey.policy import put, now, iso, state
from src.journey.models import JourneyOperation, JourneyState
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status
from src.registrations.service import RegistrationService
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel

@pytest.fixture
async def journey_native(setup_native,monkeypatch):
    sessions,actors,events,stamp=setup_native
    monkeypatch.setenv('NU_DEMO_PROFILE','synthetic');monkeypatch.setenv('NU_DEMO_NAMESPACE','native_');monkeypatch.setenv('NU_DEMO_OWNER_IDS',actors[2].id)
    async with sessions() as db:
        event=await db.get(EventModel,events[0].id);event.online_quota=1;event.offline_quota=1
        await put(db,'event:'+event.public_id,'event',{'state':'published','timezone':'Asia/Hong_Kong','registration_opens_at':iso(now()-timedelta(days=1)),'registration_closes_at':iso(now()+timedelta(days=1)),'change_notice':None,'policy':{'allocation_mode':'separate_pools_offer','offer_minutes':30,'walkin_pool':'offline','checkin_opens_at':iso(now()-timedelta(days=1)),'checkin_closes_at':iso(now()+timedelta(days=1)),'reminder_hours':24,'low_demand_ratio':0.5}},event.id)
        registrations=[]
        for i in range(3):
            reg,_=await new_application(db,event,form('J-'+stamp+'-'+str(i)),None);registrations.append(reg)
        await db.commit()
    return sessions,actors,events[0],registrations
async def invoke(sessions,path,actor,data,version=None,operation=None):
    body=json.dumps(envelope(data,version,operation)).encode()
    async def receive():return {'type':'http.request','body':body,'more_body':False}
    request=Request({'type':'http','method':'POST','path':'/api/v2/operations/'+path,'headers':[]},receive)
    async with sessions() as db:
        try:return await mutate(path,request,db,actor)
        except HTTPException as exc:return {'error':exc.status_code,'code':exc.detail.get('code') if isinstance(exc.detail,dict) else exc.detail}
async def current(sessions,event,key=None):
    async with sessions() as db:return (await state(db,key or 'event:'+event.public_id)).version
async def test_native_managed_last_place_approval_race(journey_native):
    sessions,a,event,regs=journey_native
    result=await asyncio.gather(*(invoke(sessions,'registrations/'+r.id+'/review',a[2],{'decision':'approve','reason':''},1) for r in regs[:2]))
    assert all('error' not in r for r in result),result
    async with sessions() as db:
        rows=(await db.scalars(select(RegistrationModel).where(RegistrationModel.id.in_([r.id for r in regs[:2]])))).all()
        assert sorted(r.status.value for r in rows)==['approved','waiting']
        assert len((await db.scalars(select(JourneyOperation).where(JourneyOperation.operation_id.in_([r['operation_id'] for r in result])))).all())==2
async def test_native_legacy_owner_refresh_after_lock(journey_native):
    sessions,a,event,regs=journey_native
    async with sessions() as blocker:
        await blocker.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        async def approve():
            async with sessions() as db:
                try:await RegistrationService.approve_registration(db,regs[0].id,a[2].id);return 200
                except HTTPException as exc:return exc.status_code
        pending=asyncio.create_task(approve());await asyncio.sleep(.2)
        actor=await blocker.get(UserModel,a[2].id);actor.role=UserRoleEnum.user;await blocker.commit()
        assert await pending==403
    async with sessions() as db:assert (await db.get(RegistrationModel,regs[0].id)).status==Status.pending
async def test_native_pending_attendance_blocks_closeout_and_cancel_race(journey_native):
    sessions,a,event,regs=journey_native
    await invoke(sessions,'registrations/'+regs[0].id+'/review',a[2],{'decision':'approve','reason':''},1)
    attendance=str(uuid4());data={'device_id':'native-device','attendance_operation_id':attendance,'registration_id':regs[0].id};v=await current(sessions,event)
    intent=await invoke(sessions,'events/'+event.public_id+'/attendance/intents',a[2],data,v);assert 'error' not in intent,intent
    v=await current(sessions,event)
    async with sessions() as db:
        e=await db.get(EventModel,event.id);e.end_time=now()-timedelta(seconds=1);await db.commit()
    close=await invoke(sessions,'events/'+event.public_id+'/closeout',a[2],{'attendance_reconciled':True,'no_unregistered_local_actions':True},v);assert close['code']=='PENDING_ATTENDANCE'
    async with sessions() as db:assert not await state(db,'closeout:'+event.public_id)
    # Apply and cancel serialize. Either arrival prevents cancellation, or cancellation prevents arrival.
    version=await current(sessions,event);regversion=await current(sessions,event,'registration:'+regs[0].id)
    results=await asyncio.gather(invoke(sessions,'events/'+event.public_id+'/attendance',a[2],data,version),invoke(sessions,'registrations/'+regs[0].id+'/cancel',a[2],{'reason':'Native synthetic'},regversion))
    assert sum('error' not in r for r in results)==1,results
    async with sessions() as db:
        reg=await db.get(RegistrationModel,regs[0].id);arrival=await state(db,'arrival:'+reg.id)
        assert not (reg.status==Status.cancelled and arrival)
async def test_native_walkin_last_place_and_operation_replay(journey_native):
    sessions,a,event,regs=journey_native;version=await current(sessions,event)
    results=await asyncio.gather(*(invoke(sessions,'events/'+event.public_id+'/walkins',a[2],{'application':form('WALK-'+event.public_id+str(i)),'eligibility_confirmed':True,'eligibility_note':'Synthetic'},version) for i in range(2)))
    assert sum('error' not in r for r in results)==1,results
    winner=next(r for r in results if 'error' not in r)
    async with sessions() as db:
        arrivals=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='arrival'))).all();assert len(arrivals)==1
        reg=await db.get(RegistrationModel,winner['effects']['registration_id']);assert reg.status==Status.approved

async def test_native_reserved_unknown_and_independent_referral(journey_native):
    sessions,a,event,regs=journey_native
    async with sessions() as db:
        e=await db.get(EventModel,event.id);e.offline_quota=2
        await put(db,'leader:'+event.public_id+':'+a[0].id,'leader',{'leader_id':a[0].id,'active':True,'reserved_quota':2,'referral_code':'NATIVE-'+event.public_id,'public_url':'?view=event&event='+event.public_id},event.id)
        await put(db,'referral:NATIVE-'+event.public_id,'referral',{'assignment':'leader:'+event.public_id+':'+a[0].id},event.id)
        first,_=await new_application(db,e,form('RES-ENTRY-'+event.public_id),a[0],{'kind':'unknown','referral_code':None})
        other,_=await new_application(db,e,form('RES-ATTR-'+event.public_id),a[2],{'kind':'leader_referral','referral_code':'NATIVE-'+event.public_id});await db.commit()
    results=[]
    for reg in (first,other):results.append(await invoke(sessions,'registrations/'+reg.id+'/review',a[2],{'decision':'approve','reason':''},1))
    assert all('error' not in r for r in results),results
    async with sessions() as db:
        one=await db.get(RegistrationModel,first.id);two=await db.get(RegistrationModel,other.id);m=await state(db,'registration:'+one.id)
        assert one.status==Status.approved and two.status==Status.waiting
        assert m.data['source_kind']=='unknown' and m.data['attributed_leader_id'] is None and m.data['entry_operator_id']==a[0].id
async def test_native_offer_accept_cancel_and_identical_replay(journey_native):
    sessions,a,event,regs=journey_native
    async with sessions() as db:
        participant_actor=UserModel(id=str(__import__('ulid').ULID()),username='p'+str(uuid4())[:15],role=UserRoleEnum.user,password_hash='unusable-test');db.add(participant_actor);await db.flush()
        participant=await db.get(__import__('src.participants.models',fromlist=['ParticipantModel']).ParticipantModel,regs[1].participant_id);participant.user_id=participant_actor.id;await db.commit()
    for reg in regs[:2]:assert 'error' not in await invoke(sessions,'registrations/'+reg.id+'/review',a[2],{'decision':'approve','reason':''},1)
    mver=await current(sessions,event,'registration:'+regs[0].id)
    assert 'error' not in await invoke(sessions,'registrations/'+regs[0].id+'/cancel',a[2],{'reason':'Native release'},mver)
    async with sessions() as db:
        offer=next(o for o in (await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='offer'))).all() if o.data['registration_id']==regs[1].id);offer_id=offer.data['id'];v=offer.version
    operation=str(uuid4());accepted=await asyncio.gather(*(invoke(sessions,'offers/'+offer_id+'/accept',participant_actor,{},v,operation) for _ in range(2)))
    assert accepted[0]==accepted[1] and 'error' not in accepted[0],accepted
    # Correction of an accepted booking releases it atomically; stale accept cannot recreate capacity.
    regver=await current(sessions,event,'registration:'+regs[1].id)
    corrected=await invoke(sessions,'registrations/'+regs[1].id+'/correction',a[2],{'phone':'NATIVE-CORRECTION','note':'Synthetic'},regver);assert 'error' not in corrected,corrected
    stale=await invoke(sessions,'offers/'+offer_id+'/accept',participant_actor,{},v);assert stale['error']==409
    async with sessions() as db:
        assert (await db.get(RegistrationModel,regs[1].id)).status==Status.pending
async def test_native_stale_offline_actor_assignment_after_wait(journey_native):
    sessions,a,event,regs=journey_native
    async with sessions() as db:
        await put(db,'leader:'+event.public_id+':'+a[0].id,'leader',{'leader_id':a[0].id,'active':True,'reserved_quota':0,'referral_code':'unused','public_url':'unused'},event.id)
        reg=await db.get(RegistrationModel,regs[0].id);reg.status=Status.approved;await db.commit()
    async with sessions() as blocker:
        await blocker.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        v=await current(sessions,event);attendance=str(uuid4());pending=asyncio.create_task(invoke(sessions,'events/'+event.public_id+'/attendance/intents',a[0],{'device_id':'offline-restored','attendance_operation_id':attendance,'registration_id':regs[0].id},v))
        await asyncio.sleep(.2)
        assignment=await state(blocker,'leader:'+event.public_id+':'+a[0].id);assignment.data={**assignment.data,'active':False};assignment.version+=1;await blocker.commit()
        result=await pending;assert result['error']==403,result
    async with sessions() as db:assert not await state(db,'attendance:'+attendance)
