"""Shared managed policy used by both legacy and versioned operations."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from src.journey.models import JourneyState
from src.users.models import UserModel

def now(): return datetime.now(timezone.utc)
def iso(value=None): return (value or now()).astimezone(timezone.utc).isoformat().replace('+00:00','Z')
def dt(value):
    if isinstance(value, str): value=datetime.fromisoformat(value.replace('Z','+00:00'))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
def fail(code, status=409, message=None): raise HTTPException(status, {'code':code,'message':message or code.replace('_',' ').capitalize()})
async def state(db,key):
    # Autoflush is intentionally disabled globally. Preserve this transaction's own changes before fresh reads under the event lock.
    await db.flush()
    return await db.get(JourneyState,key,populate_existing=True)
async def put(db,key,kind,data,event_id=None,version=1):
    row=await state(db,key)
    if row:row.data=dict(data);row.version+=1
    else:row=JourneyState(key=key,kind=kind,event_id=event_id,version=version,data=dict(data));db.add(row)
    await db.flush();return row
async def enabled(db,actor_id):
    access=await state(db,'account:'+actor_id)
    if access and not access.data.get('enabled',True):fail('FORBIDDEN',403)
async def fresh(db,actor_id):
    if not actor_id:fail('AUTH_REQUIRED',401)
    user=await db.scalar(select(UserModel).where(UserModel.id==actor_id).with_for_update().execution_options(populate_existing=True))
    if not user:fail('AUTH_REQUIRED',401)
    await enabled(db,actor_id);return user
async def workflow(db,event):return await state(db,'event:'+event.public_id)
async def authorize_staff(db,event,actor_id,owner=False):
    actor=await fresh(db,actor_id)
    if actor.role.value=='organizer' and event.organizer_id==actor_id:return actor
    assignment=await state(db,'leader:'+event.public_id+':'+actor_id)
    if not owner and actor.role.value=='leader' and assignment and assignment.data['active']:return actor
    fail('FORBIDDEN',403)
async def admission(db,event,actor_id=None,staff=False):
    work=await workflow(db,event)
    actor=await fresh(db,actor_id) if actor_id else None
    if work:
        if staff or actor and actor.role.value in {"leader","organizer"}:await authorize_staff(db,event,actor_id)
        if work.data['state']!='published':fail('EVENT_CLOSED')
        if not dt(work.data['registration_opens_at'])<=now()<=dt(work.data['registration_closes_at']):fail('WINDOW_CLOSED')
    return work
async def mutable(db,event):
    work=await workflow(db,event)
    if work and work.data['state'] in {'cancelled','completed'}:fail('EVENT_CLOSED')
    return work
async def bump(db,event):
    work=await workflow(db,event)
    if work:work.version+=1;await db.flush()
    return work
