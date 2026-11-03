"""Atomic managed allocation. Caller holds event lock; no helper commits."""
from datetime import timedelta
from uuid import uuid4
from sqlalchemy import select
from src.journey.policy import *
from src.journey.models import JourneyState
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status

async def registrations(db,event):return list((await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id==event.id).order_by(RegistrationModel.waitlisted_at.asc(),RegistrationModel.created_at.asc(),RegistrationModel.id.asc()))).all())
def pool(reg):return 'online' if reg.channel.value=='online' else 'offline'
async def meta(db,reg,create=True):
    row=await state(db,'registration:'+reg.id)
    if not row and not create:return JourneyState(key='registration:'+reg.id,kind='registration',event_id=reg.event_id,version=0,data={'review':'awaiting_review','reason':None,'updated_at':iso(),'entry_operator_id':reg.created_by_user_id,'attributed_leader_id':None,'source_kind':'unknown','source_evidence':'unknown'})
    if not row:row=await put(db,'registration:'+reg.id,'registration',{'review':'awaiting_review','reason':None,'updated_at':iso(),'entry_operator_id':reg.created_by_user_id,'attributed_leader_id':None,'source_kind':'unknown','source_evidence':'unknown'},reg.event_id)
    return row
async def offers(db,event):return list((await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='offer'))).all())
async def counts(db,event):
    rows=await registrations(db,event);held=[r for r in await offers(db,event) if r.data['state']=='offered' and dt(r.data['expires_at'])>now()]
    return {p:{'capacity':getattr(event,p+'_quota'),'approved':sum(r.status==Status.approved and pool(r)==p for r in rows),'offer_holds':sum(r.data['pool']==p for r in held)} for p in ('online','offline')}
async def available(db,event,p,reg=None):
    c=(await counts(db,event))[p];available=c['capacity']-c['approved']-c['offer_holds']
    # Reserved offline slots are held for each active assignment; attribution never grants staff permission.
    if p=='offline':
        rows=await registrations(db,event);holds=await offers(db,event)
        own=reg.created_by_user_id if reg else None
        assignments=(await db.scalars(select(JourneyState).where(JourneyState.event_id==event.id,JourneyState.kind=='leader'))).all()
        for a in assignments:
            if not a.data['active'] or a.data['leader_id']==own:continue
            occupied=0
            for r in rows:
                if pool(r)=='offline' and (r.status==Status.approved or any(o.data['registration_id']==r.id and o.data['state']=='offered' and dt(o.data['expires_at'])>now() for o in holds)):
                    if r.created_by_user_id==a.data['leader_id']:occupied+=1
            available-=max(0,a.data['reserved_quota']-occupied)
    return max(0,available)
async def message(db,event,reg,kind,key,text,scheduled=None):
    existing=await state(db,'outbox:'+key)
    if existing:return existing
    return await put(db,'outbox:'+key,'outbox',{'id':str(uuid4()),'event_public_id':event.public_id,'registration_id':reg.id if reg else None,'kind':kind,'recipient_binding':'registration','recipient_hint':'***'+reg.phone[-2:] if reg else 'Organizer','provider':'DEMO_OUTBOX','state':'failed' if kind in __import__('os').getenv('NU_DEMO_OUTBOX_FAIL_KINDS','').split(',') else 'demo_recorded','created_at':iso(),'scheduled_at':scheduled,'message':text,'external_delivery':False},event.id)
async def allocate(db,event,reg,actor_id):
    work=await admission(db,event)
    await reconcile(db,event)
    if reg.status!=Status.pending:fail('INVALID_TRANSITION')
    m=await meta(db,reg)
    if m.data['review']=='correction_requested':fail('INVALID_TRANSITION')
    reg.status=Status.approved if await available(db,event,pool(reg),reg)>0 else Status.waiting
    reg.reviewed_by_user_id=actor_id;reg.reviewed_at=now()
    if reg.status==Status.waiting:reg.waitlisted_at=now()
    m.data={**m.data,'review':'eligible','reason':None,'updated_at':iso()};m.version+=1
    if reg.status==Status.approved:await message(db,event,reg,'confirmation','confirm:'+reg.id,'Your synthetic booking is confirmed.')
    await db.flush()
async def reconcile(db,event):
    work=await mutable(db,event)
    if work.data['state']!='published':fail('EVENT_CLOSED')
    for offer in await offers(db,event):
        if offer.data['state']=='offered' and dt(offer.data['expires_at'])<=now():
            offer.data={**offer.data,'state':'expired'};offer.version+=1
            reg=await db.get(RegistrationModel,offer.data['registration_id'])
            # Expired candidates cannot immediately reacquire a hold before FIFO peers.
            m=await meta(db,reg);m.data={**m.data,'offer_expired':True};m.version+=1
            await message(db,event,reg,'offer_expired','expired:'+offer.key,'Your synthetic offer expired.')
    for reg in await registrations(db,event):
        m=await meta(db,reg)
        if reg.status!=Status.waiting or m.data['review']!='eligible' or m.data.get('offer_expired'):continue
        if reg.created_by_user_id:
            actor=await db.get(__import__('src.users.models',fromlist=['UserModel']).UserModel,reg.created_by_user_id)
            if actor and actor.role.value=='leader':
                assignment=await state(db,'leader:'+event.public_id+':'+actor.id)
                access=await state(db,'account:'+actor.id)
                if not assignment or not assignment.data['active'] or access and not access.data['enabled']:continue
        if any(o.data['registration_id']==reg.id and o.data['state']=='offered' and dt(o.data['expires_at'])>now() for o in await offers(db,event)):continue
        if await available(db,event,pool(reg),reg)<=0:continue
        identifier=str(uuid4());expiry=iso(now()+timedelta(minutes=work.data['policy']['offer_minutes']))
        await put(db,'offer:'+identifier,'offer',{'id':identifier,'registration_id':reg.id,'pool':pool(reg),'state':'offered','expires_at':expiry},event.id)
        await message(db,event,reg,'waitlist_offer','offer:'+identifier,'A synthetic booking place is offered; accept before expiry.',expiry)
    await db.flush()
async def cancel(db,event,reg,actor_id):
    await mutable(db,event)
    arrival=await state(db,'arrival:'+reg.id)
    if arrival:fail('INVALID_TRANSITION')
    if reg.status==Status.cancelled:return
    if reg.status==Status.rejected:fail('INVALID_TRANSITION')
    reg.status=Status.cancelled;reg.cancelled_at=now();reg.cancelled_by_user_id=actor_id
    m=await meta(db,reg);m.version+=1
    for offer in await offers(db,event):
        if offer.data['registration_id']==reg.id and offer.data['state']=='offered':offer.data={**offer.data,'state':'invalidated'};offer.version+=1
    await message(db,event,reg,'cancellation','cancel:'+reg.id,'Your synthetic booking is cancelled.')
    await db.flush()
    work=await workflow(db,event)
    if work.data['state']=='published':await reconcile(db,event)
