from datetime import datetime,timezone
from fastapi import APIRouter,Depends,File,Form,UploadFile,HTTPException,Query
from fastapi.responses import FileResponse
from sqlalchemy import select,func
from sqlalchemy.ext.asyncio import AsyncSession
from src.auth.deps import get_current_user,get_optional_current_user
from src.core.database import get_async_db
from src.users.models import UserModel
from src.events.models import EventModel
from src.events.service import EventService
from src.events.schemas import PaginatedEventResponse
from src.registrations.models import RegistrationModel
from src.registrations.service import RegistrationService
from src.registrations.schemas import RegistrationResponse,RegistrationStatus
from src.phase2.models import AssetModel
from src.phase2.schemas import SyncBatch,BatchReceipt,ItemReceipt
from src.files.schemas import FileReference
from src.phase2 import assets,sync

router=APIRouter(prefix='/api/v2',tags=['Phase2'])

@router.get('/me/events',response_model=PaginatedEventResponse)
async def owned_events(page:int=Query(1,ge=1),page_size:int=Query(20,ge=1,le=100,alias='pageSize'),user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    if user.role.value!='organizer':raise HTTPException(403,'Organizer required.')
    return await EventService(db).get_paginated_events(page,page_size,organizer_id=user.id)

@router.get('/me/registrations',response_model=list[RegistrationResponse])
async def owned_registrations(status:RegistrationStatus|None=Query(None),user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    if user.role.value!='organizer':raise HTTPException(403,'Organizer required.')
    query=select(RegistrationModel).join(EventModel,EventModel.id==RegistrationModel.event_id).where(EventModel.organizer_id==user.id)
    if status:query=query.where(RegistrationModel.status==status.value)
    registrations=(await db.scalars(query.order_by(RegistrationModel.created_at.desc(),RegistrationModel.id))).all()
    return [await assets.registration_payload(db,row,user.id) for row in registrations]

@router.post('/events/{public_id}/offline-batches',response_model=BatchReceipt)
async def submit_batch(public_id:str,payload:SyncBatch,user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    return await sync.submit(db,public_id,payload,user.id)
@router.get('/events/{public_id}/offline-batches/{batch_id}',response_model=BatchReceipt)
async def batch_receipt(public_id:str,batch_id:str,user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    return await sync.get_receipt(db,public_id,batch_id,user.id)
@router.get('/events/{public_id}/offline-submissions/{submission_id}',response_model=ItemReceipt)
async def submission_receipt(public_id:str,submission_id:str,user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    return await sync.get_receipt(db,public_id,submission_id,user.id,True)
@router.post('/files',status_code=201,response_model=FileReference)
async def upload_file(file:UploadFile=File(...),purpose:str=Form(...),user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    return await assets.upload(db,user,file,purpose)
@router.get('/files/{file_id}/content')
async def file_content(file_id:str,user:UserModel|None=Depends(get_optional_current_user),db:AsyncSession=Depends(get_async_db)):
    asset=await db.get(AssetModel,file_id)
    if asset is None:raise HTTPException(404,'File not found.')
    await assets.readable(db,asset,user)
    path=(assets.directory()/asset.storage_key).resolve()
    if not path.is_relative_to(assets.directory()) or not path.is_file():raise HTTPException(404,'File not found.')
    return FileResponse(path,media_type=asset.mime_type,filename=asset.name,
        content_disposition_type='inline' if asset.purpose=='event_image' else 'attachment',
        headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
@router.post('/registrations/{registration_id}/cancel')
async def organizer_cancel(registration_id:str,user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    fresh=await db.scalar(select(UserModel).where(UserModel.id==user.id).execution_options(populate_existing=True))
    if fresh.role.value!='organizer':raise HTTPException(403,'Organizer required.')
    registration=await RegistrationService.cancel_user_registration(db,registration_id,user.id,organizer_owner=True)
    return await assets.registration_payload(db,registration,user.id)
@router.get('/analytics/registrations')
async def analytics(user:UserModel=Depends(get_current_user),db:AsyncSession=Depends(get_async_db)):
    if user.role.value!='organizer':raise HTTPException(403,'Organizer required.')
    rows=(await db.execute(select(RegistrationModel.status,RegistrationModel.channel,func.count()).join(EventModel,EventModel.id==RegistrationModel.event_id).where(EventModel.organizer_id==user.id).group_by(RegistrationModel.status,RegistrationModel.channel))).all()
    statuses={key:0 for key in ['pending','approved','waiting','rejected','cancelled']};channels={key:0 for key in ['online','offline','walkin','ocr']}
    for status,channel,count in rows:statuses[status.value]+=count;channels[channel.value]+=count
    events=(await db.execute(select(EventModel.id,EventModel.public_id,EventModel.title,func.count(RegistrationModel.id)).outerjoin(RegistrationModel,RegistrationModel.event_id==EventModel.id).where(EventModel.organizer_id==user.id).group_by(EventModel.id,EventModel.public_id,EventModel.title).order_by(EventModel.id))).all()
    return {'actor_id':user.id,'as_of_utc':datetime.now(timezone.utc).isoformat(),'source':'PostgreSQL registrations/events',
        'definition':'Counts persisted registration rows across events owned by this organizer, including all statuses; not attendance, reach, conversion or ROI.',
        'totals':{'events':len(events),'registrations':sum(statuses.values())},'by_status':statuses,'by_channel':channels,
        'events':[{'public_id':public,'title':title,'registrations':count} for _,public,title,count in events]}
