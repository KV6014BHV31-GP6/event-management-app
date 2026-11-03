"""Versioned synthetic operations; one transaction includes domain, outbox and receipt."""
import hashlib
import hmac
import base64
import re
import json
import os
import secrets
from datetime import timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import ulid
from nanoid import generate
from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError, DBAPIError
from src.auth.deps import get_optional_current_user
from src.core.database import get_async_db
from src.core.config import settings
from src.core.security import hash_password
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel, EventStatusEnum
from src.events.schemas import EventCreate, EventUpdate
from src.events.service import EventService
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status, RegistrationChannelEnum as Channel, UserGenderEnum, MarriageStatusTypeEnum
from src.registrations.schemas import RegistrationCreate
from src.participants.models import ParticipantModel
from src.phase2 import assets
from src.phase2.models import RegistrationDocumentModel
from src.journey.models import JourneyState, JourneyOperation
from src.journey.policy import *
from src.journey import allocation as alloc

VERSION='rose.demo-journey.v1'
router=APIRouter(prefix='/api/v2/operations',tags=['Demo journey'])
class Envelope(BaseModel):
    model_config=ConfigDict(extra='forbid')
    contract_version:str
    operation_id:str
    expected_version:int|None=None
    data:dict
    def check(self):
        if self.contract_version!=VERSION or str(UUID(self.operation_id))!=self.operation_id:fail('INVALID_INPUT',422)
        if self.expected_version is not None and (isinstance(self.expected_version,bool) or self.expected_version<0):fail('INVALID_INPUT',422)
class Policy(BaseModel):
    model_config=ConfigDict(extra='forbid')
    allocation_mode:str
    offer_minutes:int=Field(ge=1,le=1440)
    walkin_pool:str
    checkin_opens_at:str
    checkin_closes_at:str
    reminder_hours:int=Field(ge=0,le=168)
    low_demand_ratio:float=Field(ge=0,le=1)

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()
def profile():
    if os.getenv('NU_DEMO_PROFILE')!='synthetic' or not os.getenv('NU_DEMO_NAMESPACE'):fail('DEMO_PROFILE_REQUIRED',403)
def application_actor(request):
    key=request.headers.get('X-Application-Key','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}',key):fail('FORBIDDEN',403)
    raw=base64.urlsafe_b64decode(key+'=')
    if len(raw)!=32 or base64.urlsafe_b64encode(raw).decode().rstrip('=')!=key:fail('FORBIDDEN',403)
    return 'application-key:'+hashlib.sha256(key.encode()).hexdigest()

def owners():return set(filter(None,os.getenv('NU_DEMO_OWNER_IDS','').split(',')))
async def owner_profile(db,user):
    profile();actor=await fresh(db,user.id if user else None)
    if actor.id not in owners() or actor.role.value!='organizer':fail('FORBIDDEN',403)
    return actor
async def event_get(db,public):
    event=await db.scalar(select(EventModel).where(EventModel.public_id==public).with_for_update().execution_options(populate_existing=True))
    if not event or not await workflow(db,event):fail('NOT_FOUND',404)
    return event
async def guest(db,request,registration):
    token=request.headers.get('X-Guest-Grant','')
    row=await state(db,'grant:'+hashlib.sha256(token.encode()).hexdigest()) if token else None
    if not row or row.data['registration_id']!=registration.id or dt(row.data['expires_at'])<=now():fail('FORBIDDEN',403)
    return row.key
async def reg_access(db,event,reg,user,request,staff=True):
    if user:
        actor=await fresh(db,user.id)
        participant=await db.get(ParticipantModel,reg.participant_id)
        if participant.user_id==actor.id:return actor.id
        if staff:
            await authorize_staff(db,event,actor.id)
            if actor.role.value=='organizer' or reg.created_by_user_id==actor.id:return actor.id
        fail('FORBIDDEN',403)
    return await guest(db,request,reg)
def expect(row,env):
    if env.expected_version is None or env.expected_version!=row.version:fail('STALE_VERSION')
def text(value,maxlen=4000):
    if not isinstance(value,str) or not value.strip() or len(value)>maxlen:fail('INVALID_INPUT',422)
    return value.strip()
def bounded_int(value,minimum=0,maximum=100000):
    if isinstance(value,bool) or not isinstance(value,int) or not minimum<=value<=maximum:fail('INVALID_INPUT',422)
    return value
async def operation_old(db,env,actor,path):
    old=await db.get(JourneyOperation,env.operation_id,populate_existing=True)
    fp=digest({'path':path,**env.model_dump()})
    if old:
        if old.actor!=actor:fail('FORBIDDEN',403)
        if old.fingerprint!=fp:fail('IMMUTABLE_CONFLICT')
        return old.receipt,fp
    return None,fp
async def receipt(db,env,actor,path,kind,resource_id,row,effects,event=None):
    value={'contract_version':VERSION,'operation_id':env.operation_id,'kind':kind,'resource_id':resource_id,'resource_version':row.version if row else 1,'recorded_at':iso(),'outcome':'applied','effects':effects}
    db.add(JourneyOperation(operation_id=env.operation_id,actor=actor,event_id=event.id if event else None,fingerprint=digest({'path':path,**env.model_dump()}),receipt=jsonable_encoder(value)))
    await db.commit();return value
async def new_application(db,event,data,user,source=None,walkin=False):
    form=RegistrationCreate.model_validate(data)
    await assets.validate(db,form.file_ids,user.id if user else None,'supporting_document')
    # Operator is independent from participant ownership and referral attribution.
    own_user=user.id if user and user.role.value=='user' else None
    person=await db.scalar(select(ParticipantModel).where(ParticipantModel.national_id==form.national_id))
    own=await db.scalar(select(ParticipantModel).where(ParticipantModel.user_id==own_user)) if own_user else None
    if own and own.national_id!=form.national_id:fail('IMMUTABLE_CONFLICT')
    if person:
        if not own_user or person.user_id!=own_user:fail('IMMUTABLE_CONFLICT')
        if await db.scalar(select(RegistrationModel.id).where(RegistrationModel.event_id==event.id,RegistrationModel.participant_id==person.id)):fail('IMMUTABLE_CONFLICT')
    else:
        person=ParticipantModel(id=str(ulid.ULID()),user_id=own_user,**{k:getattr(form,k) for k in ('first_name','last_name','date_of_birth','phone','address','national_id')},gender=UserGenderEnum(form.gender.value));db.add(person);await db.flush()
    reg=RegistrationModel(id=str(ulid.ULID()),event_id=event.id,participant_id=person.id,created_by_user_id=user.id if user else None,channel=Channel.walkin if walkin else Channel.offline if user and user.role.value in {'leader','organizer'} else Channel.online,status=Status.approved if walkin else Status.pending,**{k:getattr(form,k) for k in ('first_name','last_name','date_of_birth','phone','address','national_id','income_band_code','medical_record')},gender=UserGenderEnum(form.gender.value),marriage_status=MarriageStatusTypeEnum(form.marriage_status.value) if form.marriage_status else None)
    db.add(reg);await db.flush();await assets.attach_documents(db,reg.id,form.file_ids,user.id if user else None)
    m=await alloc.meta(db,reg);src=source or {'kind':'unknown','referral_code':None};kind=src.get('kind');leader=None
    if kind not in {'direct','leader_referral','unknown'}:fail('INVALID_INPUT',422)
    if kind=='leader_referral':
        ref=await state(db,'referral:'+str(src.get('referral_code')))
        assignment=await state(db,ref.data['assignment']) if ref else None
        if not assignment or assignment.event_id!=event.id or not assignment.data['active']:fail('INVALID_INPUT',422)
        await enabled(db,assignment.data['leader_id']);leader=assignment.data['leader_id']
    elif src.get('referral_code') is not None:fail('INVALID_INPUT',422)
    m.data={**m.data,'attributed_leader_id':leader,'source_kind':kind,'source_evidence':{'direct':'explicit_direct','leader_referral':'public_referral','unknown':'unknown'}[kind]}
    return reg,m
async def registration_view(db,event,reg,actor):
    m=await alloc.meta(db,reg,False);offer=next((o for o in await alloc.offers(db,event) if o.data['registration_id']==reg.id and o.data['state']=='offered' and dt(o.data['expires_at'])>now()),None)
    payload=await assets.registration_payload(db,reg,actor.id if actor else None)
    book={'pending':'pending','approved':'confirmed','waiting':'offered' if offer else 'waitlisted','cancelled':'cancelled','rejected':'rejected'}[reg.status.value]
    actions=[]
    work=await workflow(db,event);open_state=work.data['state'] not in {'cancelled','completed'}
    participant=await db.get(ParticipantModel,reg.participant_id)
    participant_access=not actor or actor.id==participant.user_id
    owner_access=actor and actor.role.value=='organizer' and actor.id==event.organizer_id
    if open_state and owner_access and reg.status==Status.pending and work.data['state']=='published':actions=['approve','reject','request_correction']
    if open_state and (participant_access or owner_access) and reg.status in {Status.pending,Status.approved,Status.waiting}:actions+=['cancel']
    assisted_access=owner_access or (actor and actor.role.value=='leader' and reg.created_by_user_id==actor.id)
    if open_state and (participant_access or assisted_access) and reg.status in {Status.pending,Status.approved,Status.waiting}:actions+=['correct']
    if open_state and participant_access and offer:actions+=['accept_offer','decline_offer']
    return {'registration':jsonable_encoder(payload),'version':m.version,'review':{'state':m.data['review'],'reason':m.data['reason'],'updated_at':m.data['updated_at']},'booking_state':book,'offer':{**offer.data,'version':offer.version} if offer else None,'attribution':{k:m.data[k] for k in ('entry_operator_id','attributed_leader_id','source_kind','source_evidence')},'allowed_actions':actions}
async def statistics(db,event):
    rows=await alloc.registrations(db,event);quota=await alloc.counts(db,event)
    for q in quota.values():q['available']=max(0,q['capacity']-q['approved']-q['offer_holds'])
    counts={s.value:sum(r.status==s for r in rows) for s in Status};counts['applications']=len(rows);counts['correction_requested']=0;counts['offer_holds']=sum(q['offer_holds'] for q in quota.values());attribution={'direct':0,'leader_referral':0,'unknown':0}
    for r in rows:
        m=await alloc.meta(db,r,False);attribution[m.data['source_kind']]+=1;counts['correction_requested']+=r.status==Status.pending and m.data['review']=='correction_requested'
    work=await workflow(db,event);threshold=work.data['policy']['low_demand_ratio'];ratio=counts['approved']/(event.online_quota+event.offline_quota)
    instruction=await state(db,'instruction:'+event.public_id)
    return {'event_public_id':event.public_id,'as_of_utc':iso(),'source':'native_postgresql' if db.bind.dialect.name=='postgresql' else db.bind.dialect.name,'counts':counts,'quota':quota,'attribution':attribution,'alert':{'policy_id':'demo-low-demand-v1','state':'below_threshold' if ratio<threshold else 'normal','threshold':threshold,'observed_ratio':ratio,'definition':'approved / total capacity'},'instruction':{**instruction.data,'version':instruction.version} if instruction else {'text':'','version':0,'updated_at':None}}
async def closeout(db,event):
    work=await workflow(db,event);saved=await state(db,'closeout:'+event.public_id)
    if saved:return saved.data
    rows=await alloc.registrations(db,event);attendance=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='attendance'))).all()
    arrivals={r.data['registration_id'] for r in attendance if r.data['state']=='arrived'};pending=sum(r.data['state']=='pending' for r in attendance);active=sum(o.data['state']=='offered' and dt(o.data['expires_at'])>now() for o in await alloc.offers(db,event));booked=[r for r in rows if r.status==Status.approved and r.channel!=Channel.walkin];walkins=[r for r in rows if r.status==Status.approved and r.channel==Channel.walkin]
    totals={'capacity':event.online_quota+event.offline_quota,'applications':len(rows),'bookings':len(booked)+len(walkins),'cancelled':sum(r.status==Status.cancelled for r in rows),'rejected':sum(r.status==Status.rejected for r in rows),'pending':sum(r.status==Status.pending for r in rows),'waiting':sum(r.status==Status.waiting for r in rows),'arrivals':len(arrivals),'booked_arrivals':sum(r.id in arrivals for r in booked),'walkin_arrivals':sum(r.id in arrivals for r in walkins),'no_show':sum(r.id not in arrivals for r in booked)}
    attribution={'direct':0,'leader_referral':0,'unknown':0}
    for r in rows:attribution[(await alloc.meta(db,r,False)).data['source_kind']]+=1
    blockers=(['PENDING_ATTENDANCE'] if pending else [])+(['ACTIVE_OFFERS'] if active else [])+(['EVENT_NOT_ENDED'] if now()<dt(event.end_time) else [])
    return {'version':work.version,'state':'preview','as_of_utc':iso(),'pending_attendance_count':pending,'active_offer_count':active,'totals':totals,'attribution':attribution,'definitions':{'bookings':'all approved including walk-ins','arrivals':'unique arrived registrations','no_show':'approved non-walkin minus booked arrivals','source':'native_postgresql' if db.bind.dialect.name=='postgresql' else db.bind.dialect.name},'blockers':blockers}

@router.get('/{path:path}')
async def read(path:str,request:Request,db=Depends(get_async_db),user=Depends(get_optional_current_user)):
    try:
        profile();parts=path.strip('/').split('/');head=parts[0];identifier=parts[1] if len(parts)>1 else None;suffix='/'.join(parts[2:])
        if head=='accounts':
            scope=request.query_params.get('scope')
            if scope is None:await owner_profile(db,user)
            elif scope=='assignable_leaders':
                actor=await fresh(db,user.id if user else None)
                if actor.role.value!='organizer':fail('FORBIDDEN',403)
            else:fail('INVALID_INPUT',422)
            rows=(await db.scalars(select(UserModel).where(UserModel.username.startswith(os.environ['NU_DEMO_NAMESPACE'])))).all();result=[]
            for actor in rows:
                access=await state(db,'account:'+actor.id)
                if access and (scope is None or actor.role.value=='leader' and access.data['enabled']):result.append({'id':actor.id,'username':actor.username,'role':actor.role.value,'enabled':access.data['enabled'],'version':access.version})
            return {'accounts':result,'as_of_utc':iso()}
        if head=='referrals':
            ref=await state(db,'referral:'+str(identifier));assignment=await state(db,ref.data['assignment']) if ref else None
            if not assignment:fail('NOT_FOUND',404)
            leader=await db.get(UserModel,assignment.data['leader_id']);event=await db.get(EventModel,assignment.event_id);work=await workflow(db,event)
            return {'event_public_id':event.public_id,'attribution_kind':'leader_referral','leader_display_name':leader.username,'active':assignment.data['active'] and work.data['state']=='published'}
        if head=='guest-access' and identifier=='challenges' and suffix.endswith('/demo-message'):
            row=await challenge_authorize(db,suffix.split('/')[0],request)
            return {'provider':'DEMO_OTP','code':demo_code(request.headers.get('X-Demo-Challenge',''),suffix.split('/')[0]),'phone_ownership_verified':False}
        if head=='receipts':
            row=await db.get(JourneyOperation,identifier)
            if not row:fail('NOT_FOUND',404)
            if row.event_id:
                event=await db.get(EventModel,row.event_id)
                if row.actor.startswith('grant:'):
                    resource=row.receipt['effects'].get('registration_id',row.receipt['resource_id']);reg=await db.get(RegistrationModel,resource)
                    if not reg or await guest(db,request,reg)!=row.actor:fail('FORBIDDEN',403)
                elif row.actor.startswith('application-key:'):
                    if not secrets.compare_digest(application_actor(request),row.actor):fail('FORBIDDEN',403)
                elif row.actor.startswith('guest-create:'):fail('FORBIDDEN',403)
                else:
                    await fresh(db,user.id if user else None)
                    if row.actor!=user.id:fail('FORBIDDEN',403)
                    if user.role.value in {'leader','organizer'}:await authorize_staff(db,event,user.id)
            else:
                await owner_profile(db,user)
                if row.actor!=user.id:fail('FORBIDDEN',403)
            return row.receipt
        if head=='registrations':
            reg=await db.get(RegistrationModel,identifier)
            if not reg:fail('NOT_FOUND',404)
            event=await event_get(db,(await db.get(EventModel,reg.event_id)).public_id)
            await reg_access(db,event,reg,user,request)
            reg=await db.scalar(select(RegistrationModel).where(RegistrationModel.id==reg.id).with_for_update().execution_options(populate_existing=True))
            return await registration_view(db,event,reg,user)
        if head=='outbox':
            public=request.query_params.get('event_public_id');event=await event_get(db,public) if public else None
            if not event:fail('INVALID_INPUT',422)
            rows=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='outbox'))).all();result=[]
            for row in rows:
                reg=await db.get(RegistrationModel,row.data['registration_id']) if row.data['registration_id'] else None
                if user and user.id==event.organizer_id:await authorize_staff(db,event,user.id,True)
                elif reg:
                    try:await reg_access(db,event,reg,user,request,False)
                    except HTTPException:continue
                else:continue
                result.append({**row.data,'version':row.version})
            if not user and not request.headers.get('X-Guest-Grant'):fail('AUTH_REQUIRED',401)
            return {'messages':result,'as_of_utc':iso()}
        if head!='events':fail('NOT_FOUND',404)
        event=await event_get(db,identifier);await authorize_staff(db,event,user.id if user else None);work=await workflow(db,event)
        if not suffix:
            payload=await EventService(db).get_event_by_public_id(identifier,include_drafts=True)
            return {'contract_version':VERSION,'event':jsonable_encoder(payload),'workflow':{'version':work.version,**{k:work.data.get(k) for k in ('state','timezone','registration_opens_at','registration_closes_at','change_notice')}},'policy':{**work.data['policy'],'owner':'proposal','synthetic_only':True},'as_of_utc':iso()}
        if suffix=='leaders':
            rows=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='leader'))).all()
            return {'leaders':[{**r.data,'version':r.version} for r in rows if user.id==event.organizer_id or r.data['leader_id']==user.id],'as_of_utc':iso()}
        if suffix=='promotion':
            public_url='?view=event&event='+identifier
            selected=user.id if user.role.value=='leader' else request.query_params.get('leader_id')
            if selected:
                assignment=await state(db,'leader:'+identifier+':'+selected)
                if not assignment or not assignment.data['active']:fail('FORBIDDEN',403)
                public_url=assignment.data['public_url']
            row=await state(db,'promotion:'+identifier);data=row.data if row else {'state':'draft','text':'','approved_text':None,'approved_at':None,'paused':False}
            return {**data,'version':row.version if row else 0,'provider':'DEMO_TEMPLATE','public_url':public_url,'flyer_data':{'title':event.title,'overview':event.overview,'location':event.location,'start_time':iso(dt(event.start_time)),'end_time':iso(dt(event.end_time)),'timezone':work.data['timezone'],'image_files':await assets.images(db,event.id),'public_url':public_url,'text':data.get('approved_text')}}
        if suffix=='outreach':
            rows=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='outreach'))).all()
            return {'reports':[r.data for r in rows if user.id==event.organizer_id or r.data['leader_id']==user.id],'as_of_utc':iso()}
        if suffix=='stats':return await statistics(db,event)
        if suffix=='closeout':return await closeout(db,event)
        if suffix=='roster':
            query=request.query_params.get('query','').strip().lower()
            if len(query)>100:fail('INVALID_INPUT',422)
            rows=[]
            for r in await alloc.registrations(db,event):
                if r.status!=Status.approved or query and not any(query in v.lower() for v in (r.first_name,r.last_name,r.phone)):continue
                arrival=await state(db,'arrival:'+r.id)
                rows.append({'registration_id':r.id,'first_name':r.first_name,'last_name':r.last_name,'phone_hint':'***'+r.phone[-2:],'status':'approved','arrived':bool(arrival),'attendance_operation_id':arrival.data['operation_id'] if arrival else None})
            return {'event_public_id':event.public_id,'version':work.version,'rows':rows[:200],'as_of_utc':iso()}
        if suffix.startswith('attendance/'):
            row=await state(db,'attendance:'+suffix.split('/')[1])
            if not row or row.event_id!=event.id:fail('NOT_FOUND',404)
            return {k:row.data[k] for k in ('operation_id','state','registration_id','recorded_at')}
        fail('NOT_FOUND',404)
    except Exception:
        await db.rollback();raise

def demo_code(access,identifier):
    value=hmac.new(settings.JWT_SECRET_KEY.encode(),(access+":"+identifier).encode(),hashlib.sha256).digest()
    return f"{int.from_bytes(value[:8],"big")%1000000:06d}"

async def challenge_authorize(db,identifier,request):
    profile();row=await state(db,'challenge:'+identifier);token=request.headers.get('X-Demo-Challenge','')
    if not row or not secrets.compare_digest(row.data['access_hash'],hashlib.sha256(token.encode()).hexdigest()):fail('FORBIDDEN',403)
    if dt(row.data['expires_at'])<=now():fail('OTP_EXPIRED',403)
    if row.data['used']:fail('OTP_USED',403)
    if row.data['attempts']>=5:fail('RATE_LIMITED',429)
    return row
async def otp(db,path,body,request):
    profile();parts=path.split('/')
    if path=='guest-access/challenges':
        if set(body)!={'registration_id','phone','purpose'} or body.get('purpose')!='manage_booking':fail('INVALID_INPUT',422)
        reg=await db.get(RegistrationModel,body['registration_id'])
        if not reg:fail('FORBIDDEN',403)
        await db.scalar(select(EventModel).where(EventModel.id==reg.event_id).with_for_update())
        reg=await db.scalar(select(RegistrationModel).where(RegistrationModel.id==reg.id).with_for_update().execution_options(populate_existing=True))
        if not reg or reg.created_by_user_id is not None or reg.phone!=body['phone']:fail('FORBIDDEN',403)
        event=await db.get(EventModel,reg.event_id)
        if not await workflow(db,event):fail('FORBIDDEN',403)
        throttle=await state(db,'otp-rate:'+reg.id)
        attempts=throttle.data['count'] if throttle and dt(throttle.data['since'])>now()-timedelta(hours=1) else 0
        if attempts>=5:fail('RATE_LIMITED',429)
        await put(db,'otp-rate:'+reg.id,'otp_rate',{'since':throttle.data['since'] if attempts else iso(),'count':attempts+1},event.id)
        access=secrets.token_urlsafe(32);identifier=str(uuid4());code=demo_code(access,identifier);expiry=iso(now()+timedelta(minutes=5))
        await put(db,'challenge:'+identifier,'challenge',{'registration_id':reg.id,'code_hash':hashlib.sha256(code.encode()).hexdigest(),'access_hash':hashlib.sha256(access.encode()).hexdigest(),'expires_at':expiry,'attempts':0,'used':False},event.id)
        await db.commit();return {'challenge_id':identifier,'expires_at':expiry,'provider':'DEMO_OTP','delivery_state':'demo_recorded','demo_access_token':access}
    if len(parts)==4 and parts[3]=='verify':
        # Lock event before challenge so concurrent verification cannot issue two grants.
        row=await state(db,'challenge:'+parts[2])
        if not row:fail('FORBIDDEN',403)
        await db.scalar(select(EventModel).where(EventModel.id==row.event_id).with_for_update())
        row=await challenge_authorize(db,parts[2],request)
        valid=isinstance(body.get('code'),str) and secrets.compare_digest(row.data['code_hash'],hashlib.sha256(body['code'].encode()).hexdigest())
        row.data={**row.data,'attempts':row.data['attempts']+1}
        if not valid:await db.commit();fail('OTP_INVALID',403)
        row.data={**row.data,'used':True};token=secrets.token_urlsafe(32);expiry=iso(now()+timedelta(minutes=15))
        await put(db,'grant:'+hashlib.sha256(token.encode()).hexdigest(),'grant',{'registration_id':row.data['registration_id'],'expires_at':expiry},row.event_id)
        await db.commit();return {'grant_token':token,'expires_at':expiry,'registration_id':row.data['registration_id'],'provider':'DEMO_OTP','phone_ownership_verified':False}
    fail('NOT_FOUND',404)

@router.post('/{path:path}')
async def mutate(path:str,request:Request,db=Depends(get_async_db),user=Depends(get_optional_current_user)):
    try:
        profile();body=await request.json()
        if path.startswith('guest-access/'):return await otp(db,path,body,request)
        env=Envelope.model_validate(body);env.check();data=env.data;parts=path.strip('/').split('/');head=parts[0];identifier=parts[1] if len(parts)>1 else None;suffix='/'.join(parts[2:]);event=None;resource=None
        if head=='accounts':
            actor=await owner_profile(db,user);actor_id=actor.id
            old,_=await operation_old(db,env,actor_id,path)
            if old:return old
            if identifier:
                target=await db.scalar(select(UserModel).where(UserModel.id==identifier).with_for_update().execution_options(populate_existing=True));row=await state(db,'account:'+identifier)
                if suffix!='access' or not target or not row or not target.username.startswith(os.environ['NU_DEMO_NAMESPACE']) or identifier in owners() or identifier==actor.id:fail('FORBIDDEN',403)
                expect(row,env)
                if set(data)!={'enabled'} or not isinstance(data['enabled'],bool):fail('INVALID_INPUT',422)
                row.data={**row.data,'enabled':data['enabled']};row.version+=1
            else:
                if set(data)!={'username','password','role','synthetic'} or data['synthetic'] is not True or data['role'] not in {'user','leader','organizer'} or not isinstance(data['username'],str) or not data['username'].startswith(os.environ['NU_DEMO_NAMESPACE']) or not 3<=len(data['username'])<=20 or not isinstance(data['password'],str) or not 8<=len(data['password'].encode())<=72:fail('INVALID_INPUT',422)
                target=UserModel(id=str(ulid.ULID()),username=data['username'],role=UserRoleEnum(data['role']),password_hash=hash_password(data['password']));db.add(target);await db.flush();row=await put(db,'account:'+target.id,'account',{'enabled':True})
            return await receipt(db,env,actor_id,path,'account_access' if identifier else 'account_create',target.id,row,{'account_id':target.id,'role':target.role.value,'enabled':row.data['enabled']})
        if head=='events' and identifier is None:
            actor=await fresh(db,user.id if user else None)
            if actor.role.value!='organizer':fail('FORBIDDEN',403)
            old,_=await operation_old(db,env,actor.id,path)
            if old:return old
            event_in=EventCreate.model_validate(data['event']);policy=Policy.model_validate(data['policy']);ZoneInfo(data['timezone'])
            if policy.allocation_mode!='separate_pools_offer' or policy.walkin_pool!='offline' or event_in.online_quota+event_in.offline_quota<=0:fail('INVALID_INPUT',422)
            if not dt(data['registration_opens_at'])<dt(data['registration_closes_at'])<=dt(event_in.end_time) or not dt(policy.checkin_opens_at)<dt(policy.checkin_closes_at):fail('INVALID_INPUT',422)
            values=event_in.model_dump();images=values.pop('image_file_ids');await assets.validate(db,images,actor.id,'event_image')
            # SQLite BigInteger primary keys require explicit test identity; native uses its sequence.
            if db.bind.dialect.name=='sqlite':values['id']=(await db.scalar(select(func.coalesce(func.max(EventModel.id),0))))+1
            event=EventModel(**values,public_id=generate(size=21),organizer_id=actor.id,status=EventStatusEnum.active);db.add(event);await db.flush();await assets.attach_images(db,event.id,images,actor.id)
            row=await put(db,'event:'+event.public_id,'event',{'state':'draft','timezone':data['timezone'],'registration_opens_at':iso(dt(data['registration_opens_at'])),'registration_closes_at':iso(dt(data['registration_closes_at'])),'policy':policy.model_dump(),'change_notice':None},event.id)
            return await receipt(db,env,actor.id,path,'event_create',event.public_id,row,{'event_public_id':event.public_id,'state':'draft'},event)
        if head=='events':event=await event_get(db,identifier)
        elif head=='registrations':
            resource=await db.get(RegistrationModel,identifier)
            if not resource:fail('NOT_FOUND',404)
            event=await event_get(db,(await db.get(EventModel,resource.event_id)).public_id)
        elif head=='offers':
            resource=await state(db,'offer:'+str(identifier))
            if not resource:fail('NOT_FOUND',404)
            event=await event_get(db,(await db.get(EventModel,resource.event_id)).public_id)
        elif head=='outbox':
            resource=next((r for r in (await db.scalars(select(JourneyState).where(JourneyState.kind=='outbox'))).all() if r.data['id']==identifier),None)
            if not resource:fail('NOT_FOUND',404)
            event=await event_get(db,(await db.get(EventModel,resource.event_id)).public_id)
        else:fail('NOT_FOUND',404)
        work=await workflow(db,event)
        if user:user=await fresh(db,user.id)
        # Establish fresh event-scoped authorization before replay; replay never bypasses revoked staff.
        if head=='events' and suffix=='applications':
            if user:
                await fresh(db,user.id)
                if user.role.value in {'organizer','leader'}:await authorize_staff(db,event,user.id)
            actor_id=user.id if user else application_actor(request)
        elif head=='registrations':
            if suffix=='review':await authorize_staff(db,event,user.id if user else None,True);actor_id=user.id
            else:
                actor_id=await reg_access(db,event,resource,user,request,staff=bool(user and (user.id==event.organizer_id or suffix=='correction')))
        elif head=='offers':
            reg=await db.get(RegistrationModel,resource.data['registration_id']);actor_id=await reg_access(db,event,reg,user,request,False)
        else:
            await authorize_staff(db,event,user.id if user else None,owner=not (suffix in {'promotion','outreach','attendance','attendance/intents'} or suffix.startswith('attendance/')));actor_id=user.id
        if head=='registrations':
            resource=await db.scalar(select(RegistrationModel).where(RegistrationModel.id==resource.id).with_for_update().execution_options(populate_existing=True))
        elif head in {'offers','outbox'}:
            resource=await state(db,resource.key)
        old,_=await operation_old(db,env,actor_id,path)
        if old:return old
        await mutable(db,event)
        if head=='outbox':
            expect(resource,env)
            if suffix!='retry' or resource.data['state']!='failed':fail('INVALID_TRANSITION')
            resource.data={**resource.data,'state':'demo_recorded','retry_at':iso()};resource.version+=1
            return await receipt(db,env,actor_id,path,'outbox_retry',identifier,resource,{'outbox_id':identifier,'state':'demo_recorded'},event)
        if head=='offers':
            expect(resource,env)
            if resource.data['state']!='offered' or dt(resource.data['expires_at'])<=now():fail('OFFER_EXPIRED')
            await admission(db,event);m=await alloc.meta(db,reg)
            if reg.status!=Status.waiting or m.data['review']!='eligible':fail('INVALID_TRANSITION')
            if suffix=='accept':
                resource.data={**resource.data,'state':'accepted'};resource.version+=1;reg.status=Status.approved;m.version+=1
                await alloc.message(db,event,reg,'confirmation','confirm:'+reg.id,'Your synthetic booking is confirmed.')
            elif suffix=='decline':
                resource.data={**resource.data,'state':'declined'};resource.version+=1;await alloc.cancel(db,event,reg,user.id if user else None)
            else:fail('NOT_FOUND',404)
            await bump(db,event)
            return await receipt(db,env,actor_id,path,'offer_'+suffix,identifier,resource,{'registration_id':reg.id,'status':reg.status.value},event)
        if head=='registrations':
            reg=resource;m=await alloc.meta(db,reg);expect(m,env)
            if suffix=='review':
                decision=data.get('decision')
                if decision=='approve':await alloc.allocate(db,event,reg,user.id)
                else:
                    await admission(db,event)
                    if reg.status!=Status.pending or decision not in {'reject','request_correction'}:fail('INVALID_TRANSITION')
                    reason=text(data.get('reason'));m.data={**m.data,'review':'rejected' if decision=='reject' else 'correction_requested','reason':reason,'updated_at':iso()};m.version+=1
                    reg.reviewed_by_user_id=user.id;reg.reviewed_at=now();reg.review_remarks=reason
                    if decision=='reject':reg.status=Status.rejected
                    else:await alloc.message(db,event,reg,'correction','correction:'+reg.id+':'+str(m.version),'Please review the requested synthetic correction.')
            elif suffix=='correction':
                if await state(db,'arrival:'+reg.id):fail('INVALID_TRANSITION')
                # Staff operator is never participant identity ownership.
                await reg_access(db,event,reg,user,request,True)
                if reg.status not in {Status.pending,Status.approved,Status.waiting}:fail('INVALID_TRANSITION')
                if user and user.role.value=='leader' and reg.created_by_user_id!=user.id:fail('FORBIDDEN',403)
                text(data.get('note'))
                if 'phone' in data:reg.phone=text(data['phone'],20)
                if 'file_ids' in data:
                    if not user and data['file_ids']:fail('FORBIDDEN',403)
                    await assets.validate(db,data['file_ids'],user.id if user else None,'supporting_document');await db.execute(delete(RegistrationDocumentModel).where(RegistrationDocumentModel.registration_id==reg.id));await assets.attach_documents(db,reg.id,data['file_ids'],user.id if user else None)
                was_occupied=reg.status in {Status.approved,Status.waiting};reg.status=Status.pending
                for offer in await alloc.offers(db,event):
                    if offer.data['registration_id']==reg.id and offer.data['state']=='offered':offer.data={**offer.data,'state':'invalidated'};offer.version+=1
                m.data={**m.data,'review':'awaiting_review','reason':None,'updated_at':iso()};m.version+=1
                await alloc.message(db,event,reg,'correction','correction-updated:'+reg.id+':'+str(m.version),'Synthetic application updated; awaiting review.')
                if was_occupied and work.data['state']=='published':await alloc.reconcile(db,event)
            elif suffix=='cancel':await alloc.cancel(db,event,reg,user.id if user else None)
            else:fail('NOT_FOUND',404)
            await bump(db,event)
            return await receipt(db,env,actor_id,path,'registration_'+suffix,reg.id,m,{'registration_id':reg.id,'status':reg.status.value},event)
        if suffix=='applications':
            await admission(db,event,user.id if user else None,staff=bool(user and user.role.value in {'organizer','leader'}))
            reg,m=await new_application(db,event,data['application'],user,data['source']);await bump(db,event)
            return await receipt(db,env,actor_id,path,'application_create',reg.id,m,{'registration_id':reg.id,'status':'pending'},event)
        # Sidecar-specific versions are checked below; everything else uses current event version.
        side_specific=suffix in {'promotion','promotion/approve','promotion/pause'} or suffix.startswith('leaders/')
        if not side_specific and suffix!='outreach':expect(work,env)
        effects={};row=work;resource_id=event.public_id
        if suffix=='edit':
            if work.data['state'] not in {'draft','published'}:fail('INVALID_TRANSITION')
            updates=EventUpdate.model_validate(data.get('event',{})).model_dump(exclude_unset=True)
            if 'status' in updates:fail('INVALID_INPUT',422)
            quota=await alloc.counts(db,event)
            for p in ('online','offline'):
                if updates.get(p+'_quota',getattr(event,p+'_quota'))<quota[p]['approved']+quota[p]['offer_holds']:fail('CAPACITY_UNAVAILABLE')
            if updates.get('online_quota',event.online_quota)+updates.get('offline_quota',event.offline_quota)<=0:fail('INVALID_INPUT',422)
            assignments=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='leader'))).all()
            if sum(a.data['reserved_quota'] for a in assignments if a.data['active'])>updates.get('offline_quota',event.offline_quota):fail('CAPACITY_UNAVAILABLE')
            if dt(updates.get('end_time',event.end_time))<=dt(updates.get('start_time',event.start_time)):fail('INVALID_INPUT',422)
            images=updates.pop('image_file_ids',None)
            if images is not None:await assets.attach_images(db,event.id,images,user.id)
            for k,v in updates.items():setattr(event,k,v)
            changed={k:data[k] for k in ('timezone','registration_opens_at','registration_closes_at') if k in data}
            if 'timezone' in changed:ZoneInfo(changed['timezone'])
            work.data={**work.data,**changed}
            if not dt(work.data['registration_opens_at'])<dt(work.data['registration_closes_at'])<=dt(event.end_time):fail('INVALID_INPUT',422)
        elif suffix=='publish':
            if work.data['state']!='draft':fail('INVALID_TRANSITION')
            if not event.title.strip() or not event.location.strip() or not event.overview or not 1<=len(await assets.images(db,event.id))<=3:fail('INVALID_INPUT',422)
            if dt(event.end_time)<=now():fail('EVENT_CLOSED')
            work.data={**work.data,'state':'published'}
        elif suffix=='postpone':
            if work.data['state']!='published':fail('INVALID_TRANSITION')
            start,end=dt(data['start_time']),dt(data['end_time']);opens,closes=dt(data['checkin_opens_at']),dt(data['checkin_closes_at'])
            if start>=end or opens>=closes or dt(data['registration_closes_at'])>end:fail('INVALID_INPUT',422)
            event.start_time=start;event.end_time=end;notice=text(data.get('notice'));work.data={**work.data,'state':'postponed','change_notice':notice,'registration_closes_at':iso(dt(data['registration_closes_at'])),'policy':{**work.data['policy'],'checkin_opens_at':iso(opens),'checkin_closes_at':iso(closes)}}
            for o in await alloc.offers(db,event):
                if o.data['state']=='offered':o.data={**o.data,'state':'invalidated'};o.version+=1
            for r in await alloc.registrations(db,event):
                if r.status in {Status.pending,Status.approved,Status.waiting}:await alloc.message(db,event,r,'event_changed','postpone:'+str(work.version)+':'+r.id,notice)
        elif suffix=='resume':
            if work.data['state']!='postponed':fail('INVALID_TRANSITION')
            work.data={**work.data,'state':'published','change_notice':text(data.get('notice'))};await alloc.reconcile(db,event)
        elif suffix=='cancel':
            if any([await state(db,'arrival:'+r.id) for r in await alloc.registrations(db,event)]):fail('INVALID_TRANSITION')
            reason=text(data.get('reason'));work.data={**work.data,'state':'cancelled','change_notice':reason};event.status=EventStatusEnum.cancelled
            for r in await alloc.registrations(db,event):
                if r.status in {Status.pending,Status.approved,Status.waiting}:r.status=Status.cancelled;r.cancelled_at=now();r.cancelled_by_user_id=user.id;await alloc.message(db,event,r,'cancellation','event-cancel:'+r.id,reason);(await alloc.meta(db,r)).version+=1
            for o in await alloc.offers(db,event):
                if o.data['state']=='offered':o.data={**o.data,'state':'invalidated'};o.version+=1
        elif suffix=='leaders' or suffix.startswith('leaders/'):
            leader_id=suffix.split('/')[1] if '/' in suffix else data.get('leader_id');leader=await fresh(db,leader_id)
            if leader.role.value!='leader':fail('FORBIDDEN',403)
            key='leader:'+identifier+':'+leader_id;assignment=await state(db,key)
            if '/' in suffix:
                if not assignment:fail('NOT_FOUND',404)
                expect(assignment,env)
            active=data.get('active',assignment.data['active'] if assignment else True)
            if not isinstance(active,bool):fail('INVALID_INPUT',422)
            reserved=bounded_int(data.get('reserved_quota',assignment.data['reserved_quota'] if assignment else 0))
            occupied=0
            for r in await alloc.registrations(db,event):
                if alloc.pool(r)=='offline' and r.created_by_user_id==leader_id and (r.status==Status.approved or any(o.data['registration_id']==r.id and o.data['state']=='offered' and dt(o.data['expires_at'])>now() for o in await alloc.offers(db,event))):occupied+=1
            assignments=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='leader'))).all()
            occupied_reserved=min(occupied,assignment.data['reserved_quota']) if assignment else 0
            if reserved<occupied_reserved or sum(a.data['reserved_quota'] for a in assignments if a.key!=key and a.data['active'])+(reserved if active else 0)>event.offline_quota:fail('CAPACITY_UNAVAILABLE')
            code=assignment.data['referral_code'] if assignment else secrets.token_urlsafe(18)
            row=await put(db,key,'leader',{'leader_id':leader_id,'reserved_quota':reserved,'active':active,'referral_code':code,'public_url':'?view=event&event='+identifier+'&ref='+code},event.id)
            if not assignment:await put(db,'referral:'+code,'referral',{'assignment':key},event.id)
            effects=dict(row.data);resource_id=leader_id
        elif suffix in {'promotion','promotion/approve','promotion/pause'}:
            promotion=await state(db,'promotion:'+identifier)
            if env.expected_version!=(promotion.version if promotion else 0):fail('STALE_VERSION')
            if suffix=='promotion/pause':
                if not promotion or not isinstance(data.get('paused'),bool):fail('INVALID_INPUT',422)
                await authorize_staff(db,event,user.id,True);row=await put(db,'promotion:'+identifier,'promotion',{**promotion.data,'paused':data['paused']},event.id)
            elif suffix=='promotion/approve':
                if not promotion:fail('INVALID_TRANSITION')
                await authorize_staff(db,event,user.id,True);row=await put(db,'promotion:'+identifier,'promotion',{**promotion.data,'state':'approved','approved_text':promotion.data['text'],'approved_at':iso()},event.id)
            else:row=await put(db,'promotion:'+identifier,'promotion',{'text':text(data.get('text')),'state':'draft','approved_text':None,'approved_at':None,'paused':promotion.data.get('paused',False) if promotion else False},event.id)
            effects={'state':row.data['state']}
        elif suffix=='instruction':
            instruction=await put(db,'instruction:'+identifier,'instruction',{'text':text(data.get('text')),'updated_at':iso()},event.id);effects={'instruction_version':instruction.version}
        elif suffix=='outreach':
            if user.role.value!='leader' or data.get('channel') not in {'flyer','whatsapp_manual','community_visit'}:fail('FORBIDDEN',403)
            reported=dt(data['reported_at'])
            if reported>now():fail('INVALID_INPUT',422)
            quantity=bounded_int(data.get('quantity'),1);report_id=str(uuid4());row=await put(db,'outreach:'+report_id,'outreach',{'id':report_id,'leader_id':user.id,'channel':data['channel'],'reported_at':iso(reported),'quantity':quantity,'notes':text(data.get('notes'),2000)},event.id);effects={'report_id':report_id};resource_id=report_id
        elif suffix=='offers/reconcile':await alloc.reconcile(db,event)
        elif suffix=='alerts':
            stats=await statistics(db,event)
            if stats['alert']['state']=='below_threshold':
                revision=digest({'approved':stats['counts']['approved'],'capacity':event.online_quota+event.offline_quota,'threshold':stats['alert']['threshold']});alert=await alloc.message(db,event,None,'alert','alert:'+identifier+':'+revision,'Synthetic demand below configured threshold.');effects={'outbox_id':alert.data['id']}
        elif suffix=='reminders':
            ids=[]
            if now()>=dt(event.start_time)-timedelta(hours=work.data['policy']['reminder_hours']) and now()<=dt(event.start_time) and work.data['state']=='published':
                for r in await alloc.registrations(db,event):
                    if r.status==Status.approved:out=await alloc.message(db,event,r,'reminder','reminder:'+r.id+':'+iso(dt(event.start_time)),'Synthetic event reminder.',iso(dt(event.start_time)));ids.append(out.data['id'])
            effects={'outbox_ids':ids}
        elif suffix=='attendance' or suffix=='attendance/intents' or suffix.startswith('attendance/'):
            if work.data['state']!='published':fail('EVENT_CLOSED')
            operation_id=data.get('attendance_operation_id') if suffix in {'attendance','attendance/intents'} else suffix.split('/')[1]
            if str(UUID(operation_id))!=operation_id:fail('INVALID_INPUT',422)
            key='attendance:'+operation_id;attendance=await state(db,key)
            if suffix.endswith('/discard'):
                if not attendance or attendance.event_id!=event.id or attendance.data['state']!='pending':fail('INVALID_TRANSITION')
                text(data.get('reason'));attendance.data={**attendance.data,'state':'cancelled','recorded_at':iso()};attendance.version+=1
            else:
                device=text(data.get('device_id'),100);reg=await db.get(RegistrationModel,data.get('registration_id'))
                if not reg or reg.event_id!=event.id or reg.status!=Status.approved:fail('INVALID_TRANSITION')
                if not dt(work.data['policy']['checkin_opens_at'])<=now()<=dt(work.data['policy']['checkin_closes_at']):fail('WINDOW_CLOSED')
                if attendance and (attendance.event_id!=event.id or attendance.data['registration_id']!=reg.id or attendance.data['device_id']!=device):fail('IMMUTABLE_CONFLICT')
                if await state(db,'arrival:'+reg.id):fail('ALREADY_ARRIVED')
                if suffix=='attendance/intents':
                    if attendance:fail('IMMUTABLE_CONFLICT')
                    pending=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='attendance'))).all()
                    if any(a.data['registration_id']==reg.id and a.data['state']=='pending' for a in pending):fail('PENDING_ATTENDANCE')
                    attendance=await put(db,key,'attendance',{'operation_id':operation_id,'state':'pending','registration_id':reg.id,'recorded_at':iso(),'device_id':device,'actor_id':user.id},event.id)
                else:
                    if not attendance or attendance.data['state']!='pending' or attendance.data['actor_id']!=user.id:fail('INVALID_TRANSITION')
                    attendance.data={**attendance.data,'state':'arrived','recorded_at':iso()};attendance.version+=1;await put(db,'arrival:'+reg.id,'arrival',{'operation_id':operation_id},event.id)
            effects={k:attendance.data[k] for k in ('operation_id','state','registration_id')}
        elif suffix=='walkins':
            if data.get('eligibility_confirmed') is not True:fail('INVALID_INPUT',422)
            text(data.get('eligibility_note'))
            if work.data['state']!='published':fail('EVENT_CLOSED')
            if not dt(work.data['policy']['checkin_opens_at'])<=now()<=dt(work.data['policy']['checkin_closes_at']):fail('WINDOW_CLOSED')
            if await alloc.available(db,event,'offline')<=0:fail('CAPACITY_UNAVAILABLE')
            reg,m=await new_application(db,event,data['application'],user,walkin=True);m.data={**m.data,'review':'eligible'};attendance_id=str(uuid4())
            await put(db,'attendance:'+attendance_id,'attendance',{'operation_id':attendance_id,'state':'arrived','registration_id':reg.id,'recorded_at':iso(),'device_id':'walkin','actor_id':user.id},event.id);await put(db,'arrival:'+reg.id,'arrival',{'operation_id':attendance_id},event.id);await alloc.message(db,event,reg,'confirmation','confirm:'+reg.id,'Synthetic walk-in recorded.');effects={'registration_id':reg.id,'attendance_operation_id':attendance_id,'status':'approved'}
        elif suffix=='closeout':
            if data.get('attendance_reconciled') is not True or data.get('no_unregistered_local_actions') is not True:fail('PENDING_ATTENDANCE')
            preview=await closeout(db,event)
            if preview['blockers']:fail(preview['blockers'][0])
            preview={**preview,'state':'finalized','version':work.version+1};await put(db,'closeout:'+identifier,'closeout',preview,event.id);work.data={**work.data,'state':'completed'};event.status=EventStatusEnum.completed;effects=preview
        else:fail('NOT_FOUND',404)
        await bump(db,event)
        if not effects:effects={'event_public_id':identifier,'state':work.data['state']}
        return await receipt(db,env,actor_id,path,suffix.replace('/','_'),resource_id,row,effects,event)
    except (ValidationError,ValueError,KeyError,TypeError,ZoneInfoNotFoundError):
        await db.rollback();fail('INVALID_INPUT',422)
    except IntegrityError:
        await db.rollback();fail('IMMUTABLE_CONFLICT')
    except DBAPIError as exc:
        await db.rollback();state_code=getattr(exc.orig,'sqlstate',None) or getattr(getattr(exc.orig,'__cause__',None),'sqlstate',None)
        if state_code in {'40P01','40001'}:fail('TRANSACTION_CONFLICT')
        raise
    except Exception:
        await db.rollback();raise
