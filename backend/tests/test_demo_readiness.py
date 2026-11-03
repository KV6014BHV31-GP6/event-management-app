"""ASGI/SQLite contract regressions. Native concurrency is tested separately."""
from datetime import datetime, timedelta, timezone
import jwt
import pytest
import ulid
from sqlalchemy import select, func

from src.core.config import settings
from src.core.security import hash_password, create_access_token
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel, EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel

PUBLIC = 'E' * 20 + '1'
FORM = dict(first_name='Synthetic', last_name='Person', gender='female', date_of_birth='1990-01-01',
            phone='TEST-000', address='Synthetic test only', national_id='TEST-IDENTITY-A',
            income_band_code='SYNTHETIC', marriage_status='single', medical_record=None)


@pytest.fixture
async def actors(db_session):
    users = {}
    for name, role in [('a','user'),('b','user'),('org','organizer'),('other','organizer'),('leader','leader')]:
        user = UserModel(id=str(ulid.ULID()), username='test_'+name, role=UserRoleEnum(role),
                         password_hash=hash_password('test-only-password'))
        db_session.add(user); users[name] = user
    await db_session.flush()
    for n in (1, 2):
        db_session.add(EventModel(id=n, public_id='E'*20+str(n), organizer_id=users['org'].id,
            title='Synthetic '+str(n), location='Test only', overview='Preserve this', online_quota=1, offline_quota=0,
            start_time=datetime(2030,1,1,tzinfo=timezone.utc), end_time=datetime(2030,1,2,tzinfo=timezone.utc),
            image_path='/uploads/events/test.png', status=EventStatusEnum.active))
    await db_session.commit()
    return users


def auth(user):
    return {'Authorization':'Bearer '+create_access_token({'sub':user.username})}


@pytest.mark.parametrize('payload,expected', [
    ({'username':'   ','password':'test-only-password'},422),
    ({'username':'valid','password':'界'*25},422),
    ({'username':'valid','password':'short'},422),
    ({'username':'valid','password':'test-only-password','role':'organizer'},403),
    ({'username':'valid','password':'test-only-password','role':'leader'},403)])
async def test_signup_rejects_invalid_or_privileged(client,db_session,payload,expected):
    assert (await client.post('/api/v1/users',json=payload)).status_code == expected
    assert await db_session.scalar(select(func.count()).select_from(UserModel)) == 0


async def test_signup_login_profile(client):
    payload={'username':'new_user','password':'test-only-password'}
    created=await client.post('/api/v1/users',json=payload)
    assert created.status_code==201
    login=await client.post('/api/v1/auth/login',json=payload)
    assert login.status_code==200
    profile=await client.get('/api/v1/users/me',headers={'Authorization':'Bearer '+login.json()['access_token']})
    assert profile.status_code==200
    assert profile.json()==created.json()
    assert profile.json()['role']=='user'


@pytest.mark.parametrize('header',['','Basic bogus','Bearer','Bearer x y','Bearer corrupt'])
async def test_present_invalid_auth_never_becomes_guest(client,db_session,actors,header):
    response=await client.post(f'/api/v1/events/{PUBLIC}/registrations',json=FORM,headers={'Authorization':header})
    assert response.status_code==401
    assert await db_session.scalar(select(func.count()).select_from(RegistrationModel))==0


@pytest.mark.parametrize('kind',['expired','refresh','missing_exp'])
async def test_unusable_token_rejected(client,db_session,actors,kind):
    claims={'sub':actors['a'].username,'exp':datetime.now(timezone.utc)+timedelta(minutes=5),'type':'access'}
    if kind=='expired': claims['exp']=datetime.now(timezone.utc)-timedelta(minutes=1)
    if kind=='refresh': claims['type']='refresh'
    if kind=='missing_exp': del claims['exp']
    token=jwt.encode(claims,settings.JWT_SECRET_KEY,algorithm='HS256')
    headers={'Authorization':'Bearer '+token}
    assert (await client.get('/api/v1/users/me',headers=headers)).status_code==401
    assert (await client.post(f'/api/v1/events/{PUBLIC}/registrations',json=FORM,headers=headers)).status_code==401


async def test_registration_ownership_duplicate_guest_and_cross_event(client,db_session,actors):
    first=await client.post(f'/api/v1/events/{PUBLIC}/registrations',json=FORM,headers=auth(actors['a']))
    assert first.status_code==201
    assert first.json()['status']=='pending' and first.json()['created_by_user_id']==actors['a'].id
    for headers in [auth(actors['b']),{}]:
        denied=await client.post('/api/v1/events/'+'E'*20+'2/registrations',json={**FORM,'first_name':'Changed'},headers=headers)
        assert denied.status_code==409
    duplicate=await client.post(f'/api/v1/events/{PUBLIC}/registrations',json={**FORM,'first_name':'Changed'},headers=auth(actors['a']))
    assert duplicate.status_code==400
    second=await client.post('/api/v1/events/'+'E'*20+'2/registrations',json=FORM,headers=auth(actors['a']))
    assert second.status_code==201 and second.json()['participant_id']==first.json()['participant_id']
    mismatch=await client.post('/api/v1/events/'+'E'*20+'2/registrations',json={**FORM,'national_id':'OTHER'},headers=auth(actors['a']))
    assert mismatch.status_code==409
    guest=await client.post(f'/api/v1/events/{PUBLIC}/registrations',json={**FORM,'national_id':'GUEST-NEW'})
    assert guest.status_code==201 and guest.json()['created_by_user_id'] is None
    assert (await db_session.get(ParticipantModel,guest.json()['participant_id'])).user_id is None
    person=await db_session.get(ParticipantModel,first.json()['participant_id'])
    assert person.first_name==FORM['first_name'] and person.user_id==actors['a'].id
    assert len((await client.get('/api/v1/me/registrations',headers=auth(actors['a']))).json())==2
    assert (await client.get('/api/v1/me/registrations',headers=auth(actors['b']))).json()==[]


async def test_lifecycle_ownership_roles_capacity_and_pending_cancel(client,db_session,actors):
    a=(await client.post(f'/api/v1/events/{PUBLIC}/registrations',json=FORM,headers=auth(actors['a']))).json()
    b=(await client.post(f'/api/v1/events/{PUBLIC}/registrations',json={**FORM,'national_id':'B'},headers=auth(actors['b']))).json()
    prefix='/api/v1/registrations/'
    assert (await client.get('/api/v1/registrations',headers=auth(actors['a']))).status_code==403
    assert (await client.post(prefix+a['id']+'/approve',headers=auth(actors['a']))).status_code==403
    assert (await client.post('/api/v1/me/registrations/'+a['id']+'/cancel',headers=auth(actors['b']))).status_code==403
    assert (await client.post(prefix+a['id']+'/approve',headers=auth(actors['org']))).json()['status']=='approved'
    assert (await client.post(prefix+b['id']+'/approve',headers=auth(actors['org']))).json()['status']=='waiting'
    assert (await client.post(prefix+a['id']+'/approve',headers=auth(actors['org']))).status_code==409
    assert (await client.patch(f'/api/v1/events/{PUBLIC}',json={'online_quota':0},headers=auth(actors['org']))).status_code==409
    pending_other=(await client.post('/api/v1/events/'+'E'*20+'2/registrations',json=FORM,headers=auth(actors['a']))).json()
    assert (await client.post('/api/v1/me/registrations/'+pending_other['id']+'/cancel',headers=auth(actors['a']))).json()['status']=='cancelled'
    quota=(await client.get('/api/v1/events/'+'E'*20+'2')).json()['quota']
    assert quota['total']['approved']==0
    cancel='/api/v1/me/registrations/'+a['id']+'/cancel'
    assert (await client.post(cancel,headers=auth(actors['a']))).json()['status']=='cancelled'
    assert (await client.post(cancel,headers=auth(actors['a']))).status_code==400
    assert (await client.get(prefix+b['id'],headers=auth(actors['org']))).json()['status']=='approved'
    quota=(await client.get(f'/api/v1/events/{PUBLIC}')).json()['quota']
    assert quota['total']['approved']==1 and quota['waitingCount']==0


@pytest.mark.parametrize('patch',[{'title':None},{'online_quota':None},{'status':None},{'start_time':None},{'end_time':'2029-01-01T00:00:00Z'}])
async def test_patch_rejects_null_or_invalid_timeline(client,actors,patch):
    assert (await client.patch(f'/api/v1/events/{PUBLIC}',json=patch,headers=auth(actors['org']))).status_code==422


async def test_event_reads_patch_preserve_fields_roles_and_offline(client,actors):
    old=(await client.get(f'/api/v1/events/{PUBLIC}')).json()
    assert (await client.get('/api/v1/events?keyword=Synthetic')).json()['total_count']==2
    assert (await client.get('/api/v1/events?status=unknown')).status_code==422
    for who in ['a','leader','other']:
        assert (await client.patch(f'/api/v1/events/{PUBLIC}',json={'title':'Changed'},headers=auth(actors[who]))).status_code==403
    changed=await client.patch(f'/api/v1/events/{PUBLIC}',json={'title':'Changed'},headers=auth(actors['org']))
    assert changed.status_code==200
    fresh=(await client.get(f'/api/v1/events/{PUBLIC}')).json()
    assert fresh['title']=='Changed'
    for key in ['public_id','overview','image_path','start_time','end_time','online_quota','offline_quota']:
        assert fresh[key]==old[key]
    payload={**FORM,'national_id':'OFFLINE-NEW','income_level':'SYNTHETIC'};del payload['income_band_code']
    batch={'leader_id':actors['leader'].id,'applications':[payload]}
    result=await client.post(f'/api/v1/events/{PUBLIC}/offline-registrations',json=batch,headers=auth(actors['leader']))
    assert result.status_code==201 and result.json()['synced_records']==1
    assert (await client.post(f'/api/v1/events/{PUBLIC}/offline-registrations',json=batch,headers=auth(actors['leader']))).status_code==409
    records=(await client.get('/api/v1/registrations',headers=auth(actors['org']))).json()
    assert len(records)==1 and records[0]['channel']=='offline'


@pytest.mark.parametrize('event_status',['cancelled','completed'])
async def test_inactive_event_cancellation_does_not_promote(client,actors,event_status):
    records=[]
    for who in ['a','b']:
        reg=await client.post(f'/api/v1/events/{PUBLIC}/registrations',json={**FORM,'national_id':who},headers=auth(actors[who]))
        assert reg.status_code==201;records.append(reg.json())
        approved=await client.post('/api/v1/registrations/'+reg.json()['id']+'/approve',headers=auth(actors['org']))
        assert approved.status_code==200
    assert (await client.patch(f'/api/v1/events/{PUBLIC}',json={'status':event_status},headers=auth(actors['org']))).status_code==200
    assert (await client.post('/api/v1/me/registrations/'+records[0]['id']+'/cancel',headers=auth(actors['a']))).json()['status']=='cancelled'
    assert (await client.get('/api/v1/registrations/'+records[1]['id'],headers=auth(actors['org']))).json()['status']=='waiting'
    quota=(await client.get(f'/api/v1/events/{PUBLIC}')).json()['quota']
    assert quota['total']['approved']==0 and quota['waitingCount']==1
