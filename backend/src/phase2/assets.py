"""Private bounded uploads and purpose-checked associations; no filesystem paths in responses."""
from pathlib import Path
import re
import ulid
from fastapi import HTTPException, UploadFile
from sqlalchemy import select, delete
from src.core.config import settings
from src.phase2.models import AssetModel, EventImageModel, RegistrationDocumentModel
from src.events.models import EventModel
from src.registrations.models import RegistrationModel

MAX_BYTES=8*1024*1024
def directory(): return Path(settings.PRIVATE_UPLOAD_DIR).resolve()
def summary(asset):
    return {'id':asset.id,'name':asset.name,'mime_type':asset.mime_type,'size':asset.size,
            'purpose':asset.purpose,'url':f'/api/v2/files/{asset.id}/content'}
def sniff(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):return 'image/png','png'
    if data.startswith(b'\xff\xd8\xff'):return 'image/jpeg','jpg'
    if data.startswith((b'GIF87a',b'GIF89a')):return 'image/gif','gif'
    if data.startswith(b'RIFF') and data[8:12]==b'WEBP':return 'image/webp','webp'
    if data.startswith(b'%PDF-'):return 'application/pdf','pdf'
    raise HTTPException(422,'Unsupported or mismatched file content.')

async def upload(db,user,file:UploadFile,purpose):
    if purpose not in {'event_image','supporting_document'}:raise HTTPException(422,'Invalid file purpose.')
    name=file.filename or ''
    if not name or len(name)>160 or '/' in name or '\\' in name or any(ord(c)<32 for c in name):raise HTTPException(422,'Invalid file name.')
    chunks=[]; size=0
    try:
        while chunk:=await file.read(65536):
            size+=len(chunk)
            if size>MAX_BYTES:raise HTTPException(413,'File exceeds8MiB.')
            chunks.append(chunk)
    finally:await file.close()
    data=b''.join(chunks); mime,extension=sniff(data)
    accepted_extensions={'jpg','jpeg'} if extension=='jpg' else {extension}
    if name.rsplit('.',1)[-1].lower() not in accepted_extensions or file.content_type!=mime:raise HTTPException(422,'File extension, MIME and content must agree.')
    if purpose=='event_image' and not mime.startswith('image/'):raise HTTPException(422,'Event image purpose requires an image.')
    file_id=str(ulid.ULID()); key=file_id+'.'+extension
    root=directory(); root.mkdir(parents=True,exist_ok=True); path=root/key
    assert path.resolve().is_relative_to(root)
    try:
        with path.open('xb') as output:output.write(data)
        asset=AssetModel(id=file_id,owner_id=user.id,purpose=purpose,name=name,mime_type=mime,size=size,storage_key=key)
        db.add(asset); await db.commit(); await db.refresh(asset)
        return summary(asset)
    except Exception:
        await db.rollback()
        path.unlink(missing_ok=True)
        raise

async def validate(db,ids,actor_id,purpose):
    if len(ids)>3 or len(set(ids))!=len(ids):raise HTTPException(422,'Use at most3 distinct file IDs.')
    result=[]
    for file_id in ids:
        if not re.fullmatch(r'[0-9A-HJKMNP-TV-Z]{26}',file_id):raise HTTPException(422,'Invalid file identifier.')
        asset=await db.get(AssetModel,file_id)
        if not asset or asset.owner_id!=actor_id:raise HTTPException(403,'File is unavailable to this actor.')
        if asset.purpose!=purpose:raise HTTPException(422,'File purpose does not match association.')
        result.append(asset)
    return result

async def images(db,event_id):
    rows=(await db.scalars(select(AssetModel).join(EventImageModel,EventImageModel.file_id==AssetModel.id).where(EventImageModel.event_id==event_id).order_by(EventImageModel.position))).all()
    return [summary(row) for row in rows]
async def documents(db,registration_id):
    rows=(await db.scalars(select(AssetModel).join(RegistrationDocumentModel,RegistrationDocumentModel.file_id==AssetModel.id).where(RegistrationDocumentModel.registration_id==registration_id).order_by(RegistrationDocumentModel.position))).all()
    return [summary(row) for row in rows]
async def attach_images(db,event_id,ids,actor_id):
    await validate(db,ids,actor_id,'event_image')
    await db.execute(delete(EventImageModel).where(EventImageModel.event_id==event_id))
    await db.flush()
    for index,file_id in enumerate(ids):db.add(EventImageModel(event_id=event_id,file_id=file_id,position=index))
async def attach_documents(db,registration_id,ids,actor_id):
    await validate(db,ids,actor_id,'supporting_document')
    for index,file_id in enumerate(ids):db.add(RegistrationDocumentModel(registration_id=registration_id,file_id=file_id,position=index))
async def readable(db,asset,user):
    if asset.purpose=='event_image' and await db.scalar(select(EventImageModel.file_id).where(EventImageModel.file_id==asset.id).limit(1)):return True
    if user is None:raise HTTPException(401,'Authentication required.')
    if asset.owner_id==user.id:return True
    if user.role.value=='organizer' and asset.purpose=='supporting_document':
        permitted=await db.scalar(select(RegistrationDocumentModel.file_id).join(RegistrationModel,RegistrationDocumentModel.registration_id==RegistrationModel.id).join(EventModel,EventModel.id==RegistrationModel.event_id).where(RegistrationDocumentModel.file_id==asset.id,EventModel.organizer_id==user.id).limit(1))
        if permitted:return True
    raise HTTPException(403,'File is unavailable to this actor.')

async def registration_payload(db,registration,actor_id):
    result={c.name:getattr(registration,c.name) for c in registration.__table__.columns}
    docs=await documents(db,registration.id)
    owner=await db.scalar(select(EventModel.organizer_id).where(EventModel.id==registration.event_id)) if docs else None
    visible=[]
    for doc in docs:
        asset=await db.get(AssetModel,doc['id'])
        if actor_id is not None and (asset.owner_id==actor_id or owner==actor_id):visible.append(doc)
    result['supporting_documents']=visible
    return result
