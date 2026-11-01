"""Durable item receipts and atomic batch effects. No request payload is stored or logged."""
import hashlib
from datetime import datetime,timezone
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select,func
from sqlalchemy.exc import IntegrityError
from src.users.models import UserModel
from src.events.models import EventModel,EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel,RegistrationStatusEnum
from src.registrations.service import RegistrationService
from src.phase2.models import SyncBatchModel,SyncSubmissionModel
from src.phase2.schemas import SyncApplication,canonical,VERSION,FINGERPRINT_VERSION

def digest(value):return hashlib.sha256((FINGERPRINT_VERSION+'\n'+canonical(value)).encode('utf-8')).hexdigest()
async def fresh_actor(db,actor_id):
    actor=await db.scalar(select(UserModel).where(UserModel.id==actor_id).with_for_update().execution_options(populate_existing=True))
    if actor is None:raise HTTPException(401,'Account is no longer available.')
    if actor.role.value not in {'leader','organizer'}:raise HTTPException(403,'Current leader or organizer role required.')
    return actor
def authorize(record,actor_id,event_id,fingerprint=None):
    if record.actor_id!=actor_id:raise HTTPException(403,'Receipt is unavailable to this actor.')
    if record.event_id!=event_id or (fingerprint is not None and record.fingerprint!=fingerprint):raise HTTPException(409,'Immutable synchronization identifier conflict.')
async def event_lookup(db,public,lock=False):
    if len(public)!=21:raise HTTPException(400,'Invalid event identifier.')
    query=select(EventModel).where(EventModel.public_id==public)
    if lock:query=query.with_for_update().execution_options(populate_existing=True)
    event=await db.scalar(query)
    if event is None:raise HTTPException(404,'Event not found.')
    return event
async def get_receipt(db,public,identifier,actor_id,submission=False):
    try:
        await fresh_actor(db,actor_id)
        event=await event_lookup(db,public)
        model=SyncSubmissionModel if submission else SyncBatchModel
        record=await db.get(model,identifier)
        if record is None:raise HTTPException(404,'No committed receipt for this identifier.')
        authorize(record,actor_id,event.id)
        result=dict(record.receipt);await db.commit();return result
    except Exception:
        await db.rollback();raise
async def submit(db,public,payload,actor_id):
    fingerprint=digest(payload.model_dump())
    try:
        # Match the legacy event->user lock order, avoiding a new cycle with online registration.
        event=await event_lookup(db,public,True)
        await fresh_actor(db,actor_id)
        old=await db.get(SyncBatchModel,payload.batch_id)
        if old:
            authorize(old,actor_id,event.id,fingerprint)
            result=dict(old.receipt);await db.commit();return result
        # Preflight all global IDs before applying any item; every collision is an envelope conflict.
        prior={}
        for item in payload.items:
            existing=await db.get(SyncSubmissionModel,item.client_submission_id)
            if existing:authorize(existing,actor_id,event.id,digest(item.application));prior[item.client_submission_id]=existing
        results=[]
        for item in payload.items:
            if item.client_submission_id in prior:
                results.append(dict(prior[item.client_submission_id].receipt));continue
            recorded=datetime.now(timezone.utc).isoformat()
            outcome={'client_submission_id':item.client_submission_id,'outcome':'rejected','code':'INVALID_APPLICATION',
                     'registration_id':None,'registration_status_at_recording':None,'recorded_at':recorded}
            try:form=SyncApplication.model_validate(item.application)
            except ValidationError:form=None
            if form is not None:
                if event.status!=EventStatusEnum.active:outcome['code']='EVENT_CLOSED'
                else:
                    approved=await db.scalar(select(func.count()).select_from(RegistrationModel).where(RegistrationModel.event_id==event.id,RegistrationModel.status==RegistrationStatusEnum.approved))
                    if approved>=event.online_quota+event.offline_quota:outcome['code']='EVENT_FULL'
                    else:
                        try:
                            async with db.begin_nested():
                                registration,duplicate=await RegistrationService.create_offline_v2_item(db,event,form,actor_id)
                                await db.flush()
                            if duplicate:outcome.update(duplicate)
                            else:outcome.update(outcome='accepted',code='RECORDED',registration_id=registration.id,registration_status_at_recording='pending')
                        except HTTPException as exc:
                            outcome['code']='FILE_NOT_OWNED' if exc.status_code in {403,422} else 'IDENTITY_CONFLICT'
                        except IntegrityError:
                            # The savepoint is rolled back. Inspect the winner from a new READ COMMITTED statement;
                            # never retry the domain insert after an ambiguous uniqueness race.
                            person=await db.scalar(select(ParticipantModel).where(ParticipantModel.national_id==form.national_id))
                            existing=await db.scalar(select(RegistrationModel).where(RegistrationModel.event_id==event.id,RegistrationModel.participant_id==person.id)) if person else None
                            outcome['code']='ALREADY_REGISTERED' if existing else 'IDENTITY_CONFLICT'
                            if existing:outcome['outcome']='duplicate'
            db.add(SyncSubmissionModel(client_submission_id=item.client_submission_id,actor_id=actor_id,event_id=event.id,
                fingerprint=digest(item.application),receipt=outcome))
            # Global receipt collisions escape the item savepoint and abort the WHOLE batch.
            await db.flush();results.append(outcome)
        receipt={'contract_version':VERSION,'fingerprint_version':FINGERPRINT_VERSION,'batch_id':payload.batch_id,
                 'event_public_id':public,'actor_id':actor_id,'recorded_at':datetime.now(timezone.utc).isoformat(),'items':results}
        db.add(SyncBatchModel(batch_id=payload.batch_id,actor_id=actor_id,event_id=event.id,fingerprint=fingerprint,receipt=receipt))
        await db.commit()
        return receipt
    except IntegrityError:
        await db.rollback()
        # Fresh transaction: reconcile a globally unique receipt winner; do not replay business operations.
        await fresh_actor(db,actor_id)
        event=await event_lookup(db,public)
        old=await db.get(SyncBatchModel,payload.batch_id)
        if old:
            authorize(old,actor_id,event.id,fingerprint)
            result=dict(old.receipt);await db.commit();return result
        for item in payload.items:
            existing=await db.get(SyncSubmissionModel,item.client_submission_id)
            if existing:authorize(existing,actor_id,event.id,digest(item.application))
        await db.rollback()
        raise HTTPException(409,'Concurrent synchronization conflict; reconcile the original identifiers.') from None
    except Exception:
        await db.rollback();raise
