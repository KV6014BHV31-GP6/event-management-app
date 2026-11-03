"""Phase2 additive contracts; initial RED retained externally before implementation."""
import uuid
import pytest
from sqlalchemy import select,func
from tests.test_demo_readiness import actors,FORM,PUBLIC,auth
from src.registrations.models import RegistrationModel
from src.users.models import UserRoleEnum
from src.users.models import UserModel
from src.events.models import EventModel,EventStatusEnum
from src.participants.models import ParticipantModel
from datetime import datetime,timezone

def batch(form=None,submission=None,batch_id=None):
    return {'contract_version':'rose.offline-sync.v2','batch_id':batch_id or str(uuid.uuid4()),
            'items':[{'client_submission_id':submission or str(uuid.uuid4()),'application':form or FORM.copy()}]}
def route(public=PUBLIC):return '/api/v2/events/'+public+'/offline-batches'

async def test_sync_replay_reconcile_and_modified_payload(client,db_session,actors):
    payload=batch(); headers=auth(actors['leader'])
    r=await client.post(route(),json=payload,headers=headers); assert r.status_code==200
    result=r.json(); assert result['items'][0]['outcome']=='accepted' and result['items'][0]['registration_status_at_recording']=='pending'
    assert (await client.post(route(),json=payload,headers=headers)).json()==result
    assert (await client.get(route()+'/'+payload['batch_id'],headers=headers)).json()==result
    item=payload['items'][0]
    own=await client.get('/api/v2/events/'+PUBLIC+'/offline-submissions/'+item['client_submission_id'],headers=headers)
    assert own.status_code==200 and own.json()==result['items'][0]
    payload['items'][0]['application']['phone']='Modified'
    assert (await client.post(route(),json=payload,headers=headers)).status_code==409
    assert await db_session.scalar(select(func.count()).select_from(RegistrationModel))==1

async def test_sync_partial_schema_duplicate_closed_and_replay(client,db_session,actors):
    p=batch(); p['items'].append({'client_submission_id':str(uuid.uuid4()),'application':{'first_name':'Invalid'}})
    r=await client.post(route(),json=p,headers=auth(actors['leader'])); assert r.status_code==200
    assert [i['outcome'] for i in r.json()['items']]==['accepted','rejected']
    duplicate=await client.post(route(),json=batch(),headers=auth(actors['other']))
    assert duplicate.status_code==200 and duplicate.json()['items'][0]['outcome']=='duplicate'
    assert duplicate.json()['items'][0]['registration_id'] is None
    assert (await client.patch('/api/v1/events/'+PUBLIC,json={'status':'cancelled'},headers=auth(actors['org']))).status_code==200
    assert (await client.post(route(),json=p,headers=auth(actors['leader']))).json()==r.json()
    closed=await client.post(route(),json=batch({**FORM,'national_id':'CLOSED-NEW'}),headers=auth(actors['leader']))
    assert closed.json()['items'][0]['code']=='EVENT_CLOSED'
    assert await db_session.scalar(select(func.count()).select_from(RegistrationModel))==1

async def test_sync_auth_crossactor_role_revocation(client,db_session,actors):
    p=batch()
    headers={key:auth(value) for key,value in actors.items()};leader_id=actors['leader'].id
    assert (await client.post(route(),json=p)).status_code==401
    assert (await client.post(route(),json=p,headers=headers['a'])).status_code==403
    assert (await client.post(route(),json=p,headers=headers['leader'])).status_code==200
    assert (await client.get(route()+'/'+p['batch_id'],headers=headers['other'])).status_code==403
    assert (await client.post(route(),json=p,headers=headers['other'])).status_code==403
    leader=await db_session.get(UserModel,leader_id);leader.role=UserRoleEnum.user; await db_session.commit()
    assert (await client.get(route()+'/'+p['batch_id'],headers=headers['leader'])).status_code==403

async def test_simplified_online_form_stores_nulls(client,db_session,actors):
    form={k:v for k,v in FORM.items() if k not in {'address','income_band_code','marriage_status','medical_record'}}
    r=await client.post('/api/v1/events/'+PUBLIC+'/registrations',json=form,headers=auth(actors['a']))
    assert r.status_code==201
    assert all(r.json()[key] is None for key in ['address','income_band_code','marriage_status','medical_record'])

PNG=b'\x89PNG\r\n\x1a\n'+b'SYNTHETIC-TEST'
async def upload(client,actor,purpose='event_image',name='synthetic.png'):
    r=await client.post('/api/v2/files',headers=auth(actor),data={'purpose':purpose},files={'file':(name,PNG,'image/png')})
    assert r.status_code==201
    return r.json()

async def test_gallery_association_reload_and_private_unattached(client,actors,tmp_path,monkeypatch):
    monkeypatch.chdir(tmp_path)
    files=[await upload(client,actors['org']) for _ in range(3)]
    assert (await client.get(files[0]['url'])).status_code==401
    r=await client.patch('/api/v1/events/'+PUBLIC,json={'image_file_ids':[f['id'] for f in files]},headers=auth(actors['org']))
    assert r.status_code==200 and len(r.json()['image_files'])==3
    fresh=(await client.get('/api/v1/events/'+PUBLIC)).json(); assert [f['id'] for f in fresh['image_files']]==[f['id'] for f in files]
    assert (await client.get(files[0]['url'])).status_code==200
    assert (await client.patch('/api/v1/events/'+PUBLIC,json={'image_file_ids':[f['id'] for f in files]+['X']},headers=auth(actors['org']))).status_code==422

async def test_document_ownership_association_and_read_access(client,actors,tmp_path,monkeypatch):
    monkeypatch.chdir(tmp_path)
    doc=await upload(client,actors['a'],'supporting_document')
    assert (await client.get(doc['url'])).status_code==401
    assert (await client.get(doc['url'],headers=auth(actors['b']))).status_code==403
    assert (await client.get(doc['url'],headers=auth(actors['org']))).status_code==403
    bad=await client.post('/api/v1/events/'+PUBLIC+'/registrations',json={**FORM,'file_ids':[doc['id']]},headers=auth(actors['b']))
    assert bad.status_code==403
    r=await client.post('/api/v1/events/'+PUBLIC+'/registrations',json={**FORM,'file_ids':[doc['id']]},headers=auth(actors['a']))
    assert r.status_code==201 and r.json()['supporting_documents'][0]['id']==doc['id']
    assert (await client.get(doc['url'],headers=auth(actors['org']))).status_code==200
    assert (await client.get(doc['url'],headers=auth(actors['other']))).status_code==403
    own=(await client.get('/api/v1/me/registrations',headers=auth(actors['a']))).json()
    assert own[0]['supporting_documents'][0]['id']==doc['id']

async def test_owner_analytics_and_organizer_cancel(client,actors):
    a=(await client.post('/api/v1/events/'+PUBLIC+'/registrations',json=FORM,headers=auth(actors['a']))).json()
    b=(await client.post('/api/v1/events/'+PUBLIC+'/registrations',json={**FORM,'national_id':'OTHER'},headers=auth(actors['b']))).json()
    for r in [a,b]: assert (await client.post('/api/v1/registrations/'+r['id']+'/approve',headers=auth(actors['org']))).status_code==200
    path='/api/v2/registrations/'+a['id']+'/cancel'
    assert (await client.post(path,headers=auth(actors['other']))).status_code==403
    assert (await client.post(path,headers=auth(actors['org']))).status_code==200
    assert (await client.get('/api/v1/registrations/'+b['id'],headers=auth(actors['org']))).json()['status']=='approved'
    r=await client.get('/api/v2/analytics/registrations',headers=auth(actors['org']))
    assert r.status_code==200
    data=r.json(); assert data['totals']['registrations']==2 and data['by_status']['approved']==1 and data['by_status']['cancelled']==1
    assert data['actor_id']==actors['org'].id and data['as_of_utc'] and data['source']=='PostgreSQL registrations/events'
    assert (await client.get('/api/v2/analytics/registrations',headers=auth(actors['a']))).status_code==403

async def test_owned_registration_index(client,db_session,actors,tmp_path,monkeypatch):
    monkeypatch.chdir(tmp_path);headers={key:auth(value) for key,value in actors.items()}
    db_session.add(EventModel(id=3,public_id='F'*21,organizer_id=actors['other'].id,title='Foreign fixture',location='Synthetic',online_quota=1,offline_quota=0,start_time=datetime(2030,1,1,tzinfo=timezone.utc),end_time=datetime(2030,1,2,tzinfo=timezone.utc),status=EventStatusEnum.active));await db_session.commit()
    a_doc=await upload(client,actors['a'],'supporting_document');b_doc=await upload(client,actors['b'],'supporting_document')
    a=await client.post('/api/v1/events/'+PUBLIC+'/registrations',headers=headers['a'],json={**FORM,'file_ids':[a_doc['id']]});assert a.status_code==201
    b=await client.post('/api/v1/events/'+'F'*21+'/registrations',headers=headers['b'],json={**FORM,'national_id':'FOREIGN','file_ids':[b_doc['id']]});assert b.status_code==201
    path='/api/v2/me/registrations'
    r=await client.get(path,headers=headers['org']);assert r.status_code==200
    assert [row['id'] for row in r.json()]==[a.json()['id']]
    assert r.json()[0]['supporting_documents'][0]['id']==a_doc['id']
    foreign=await client.get(path,headers=headers['other']);assert foreign.status_code==200 and [row['id'] for row in foreign.json()]==[b.json()['id']]
    assert foreign.json()[0]['supporting_documents'][0]['id']==b_doc['id']
    assert (await client.get(path+'?status=approved',headers=headers['org'])).json()==[]
    assert (await client.get(path+'?status=unknown',headers=headers['org'])).status_code==422
    assert (await client.get(path,headers=headers['a'])).status_code==403
    assert (await client.get(path)).status_code==401

async def test_omitted_address_does_not_erase_legacy_participant(client,db_session,actors):
    headers=auth(actors['a'])
    first=await client.post('/api/v1/events/'+PUBLIC+'/registrations',headers=headers,json=FORM);assert first.status_code==201
    omitted={key:value for key,value in FORM.items() if key!='address'}
    second=await client.post('/api/v1/events/'+'E'*20+'2/registrations',headers=headers,json=omitted);assert second.status_code==201
    assert second.json()['address'] is None
    person=await db_session.get(ParticipantModel,first.json()['participant_id'])
    assert person.address==FORM['address']
