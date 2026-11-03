"""Account API acceptance; SQLite contracts, not native locking evidence."""
from uuid import uuid4
import pytest
from sqlalchemy import select
from tests.test_demo_readiness import actors, auth
from src.journey.models import JourneyState

P='/api/v2/operations'
PASSWORD='synthetic-new-password'
def envelope(data,version=None,op=None):
    value={'contract_version':'rose.demo-journey.v1','operation_id':op or str(uuid4()),'data':data}
    if version is not None:value['expected_version']=version
    return value

@pytest.fixture
async def accounts(client,db_session,actors,monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setenv('NU_DEMO_PROFILE','synthetic');monkeypatch.setenv('NU_DEMO_NAMESPACE','test_');monkeypatch.setenv('NU_DEMO_OWNER_IDS',actors['org'].id)
    for user in actors.values():db_session.add(JourneyState(key='account:'+user.id,kind='account',version=1,data={'enabled':True}))
    await db_session.commit()
    # HTTP requests close/rollback the shared SQLite fixture session. Keep the
    # caller's immutable identity independent from SQLAlchemy expiration.
    return {key:SimpleNamespace(id=user.id,username=user.username,role=user.role) for key,user in actors.items()}

async def test_profile_persisted_stale_and_identity_forbidden(client,accounts):
    user=accounts['a'];headers=auth(user)
    before=await client.get(P+'/me/profile',headers=headers)
    assert before.status_code==200
    assert before.json()['profile']['version']==0
    payload=envelope({'display_name':'  Synthetic Display  ','preferred_language':'ms'},0)
    saved=await client.post(P+'/me/profile',headers=headers,json=payload)
    assert saved.status_code==200
    assert (await client.post(P+'/me/profile',headers=headers,json=payload)).json()==saved.json()
    read=(await client.get(P+'/me/profile',headers=headers)).json()
    assert read['profile']['display_name']=='Synthetic Display' and read['profile']['version']==1
    assert (await client.post(P+'/me/profile',headers=headers,json=envelope(payload['data'],0))).status_code==409
    assert (await client.post(P+'/me/profile',headers=headers,json=envelope({**payload['data'],'role':'organizer'},1))).status_code==422
    assert (await client.get(P+'/me/profile/receipts/'+payload['operation_id'],headers=auth(accounts['b']))).status_code==403

async def test_signup_enters_actual_owner_recovery_directory(client,accounts,db_session):
    created=await client.post('/api/v1/users',json={'username':'test_signup','password':PASSWORD})
    assert created.status_code==201
    account=created.json()['id']
    assert await db_session.get(JourneyState,'account:'+account) is not None
    directory=await client.get(P+'/accounts',headers=auth(accounts['org']))
    assert account in [row['id'] for row in directory.json()['accounts']]

async def test_recovery_real_reset_invalidates_access_and_refresh(client,accounts):
    user=accounts['a'];owner=auth(accounts['org'])
    login=await client.post('/api/v1/auth/login',json={'username':user.username,'password':'test-only-password'})
    assert login.status_code==200
    old_access=login.json()['access_token'];old_refresh=login.cookies['refresh_token']
    issue=await client.post(P+'/account-recovery/challenges',headers=owner,json=envelope({'account_id':user.id,'synthetic':True}))
    assert issue.status_code==200
    challenge=issue.json()['effects']['challenge_id'];base=P+'/account-recovery/challenges/'+challenge
    message=await client.get(base+'/demo-message',headers=owner)
    secret=message.json()['recovery_secret'];cap={'X-Account-Recovery':secret}
    payload=envelope({'new_password':PASSWORD})
    reset=await client.post(base+'/reset',headers=cap,json=payload)
    assert reset.status_code==200
    assert (await client.get(base+'/receipts/'+payload['operation_id'],headers=cap)).json()==reset.json()
    assert (await client.post(base+'/reset',headers=cap,json=payload)).json()==reset.json()
    changed={**payload,'data':{'new_password':PASSWORD+'-changed'}}
    assert (await client.post(base+'/reset',headers=cap,json=changed)).status_code==409
    assert (await client.get('/api/v1/users/me',headers={'Authorization':'Bearer '+old_access})).status_code==401
    assert (await client.post('/api/v1/auth/refresh',headers={'Cookie':'refresh_token='+old_refresh})).status_code==401
    for path,data,kwargs in [('/api/v1/auth/login',{'username':user.username,'password':PASSWORD},{'json':True}),('/api/v1/auth/token',{'username':user.username,'password':PASSWORD},{'data':True})]:
        result=await client.post(path,**({'json':data} if 'json' in kwargs else {'data':data}))
        assert result.status_code==200
    assert (await client.post('/api/v1/auth/login',json={'username':user.username,'password':'test-only-password'})).status_code==401


async def issue(client, accounts, target='a'):
    headers=auth(accounts['org']);payload=envelope({'account_id':accounts[target].id,'synthetic':True})
    response=await client.post(P+'/account-recovery/challenges',headers=headers,json=payload)
    assert response.status_code==200
    base=P+'/account-recovery/challenges/'+response.json()['effects']['challenge_id']
    message=await client.get(base+'/demo-message',headers=headers)
    assert message.status_code==200
    return base,{'X-Account-Recovery':message.json()['recovery_secret']},payload,response.json()


@pytest.mark.parametrize('data',[
    {'display_name':'','preferred_language':'en'},
    {'display_name':'x\n','preferred_language':'en'},
    {'display_name':'x'*81,'preferred_language':'en'},
    {'display_name':'x','preferred_language':'zh'},
    {'display_name':'x','preferred_language':'en','username':'takeover'},
])
async def test_profile_malformed_and_secret_free_errors(client,accounts,data):
    result=await client.post(P+'/me/profile',headers=auth(accounts['a']),json=envelope(data,0))
    assert result.status_code==422
    assert result.json()=={'detail':{'code':'INVALID_INPUT','message':'Invalid account input.'}}
    assert result.headers['cache-control']=='no-store'


@pytest.mark.parametrize('role',['a','org','leader'])
async def test_profile_all_roles_and_historical_replay(client,accounts,role):
    headers=auth(accounts[role]);payload=envelope({'display_name':'First','preferred_language':'en'},0)
    first=await client.post(P+'/me/profile',headers=headers,json=payload);assert first.status_code==200
    second=await client.post(P+'/me/profile',headers=headers,json=envelope({'display_name':'Second','preferred_language':'ms'},1));assert second.status_code==200
    assert (await client.post(P+'/me/profile',headers=headers,json=payload)).json()==first.json()
    changed={**payload,'data':{'display_name':'Changed','preferred_language':'en'}}
    assert (await client.post(P+'/me/profile',headers=headers,json=changed)).status_code==409
    assert (await client.get(P+'/me/profile/receipts/'+payload['operation_id'],headers=headers)).json()==first.json()
    assert (await client.get(P+'/me/profile',headers=headers)).json()['profile']['display_name']=='Second'


@pytest.mark.parametrize('invalid',[True,-1,'0',None])
async def test_malformed_token_generation_rejected(client,accounts,invalid):
    from src.core.security import create_access_token
    token=create_access_token({'sub':accounts['a'].username,'token_version':invalid})
    result=await client.get('/api/v1/users/me',headers={'Authorization':'Bearer '+token})
    assert result.status_code==401


async def test_unused_receipt404_used_other403_and_24h_both_methods(client,accounts,db_session):
    from datetime import timedelta
    from src.accounts.models import RecoveryChallenge
    from src.journey.policy import now
    base,cap,_,_=await issue(client,accounts);payload=envelope({'new_password':PASSWORD})
    assert (await client.get(base+'/receipts/'+payload['operation_id'],headers=cap)).status_code==404
    reset=await client.post(base+'/reset',headers=cap,json=payload);assert reset.status_code==200
    assert (await client.get(base+'/receipts/'+str(uuid4()),headers=cap)).status_code==403
    row=await db_session.get(RecoveryChallenge,base.rsplit('/',1)[1]);row.used_at=now()-timedelta(hours=25);await db_session.commit()
    assert (await client.get(base+'/receipts/'+payload['operation_id'],headers=cap)).status_code==403
    assert (await client.post(base+'/reset',headers=cap,json=payload)).status_code==403


async def test_attempt_cap_expiry_and_generic_privacy(client,accounts,db_session):
    from src.accounts.models import RecoveryChallenge
    base,cap,_,_=await issue(client,accounts)
    for _ in range(5):
        result=await client.post(base+'/reset',headers={'X-Account-Recovery':'wrong'},json=envelope({'new_password':PASSWORD}))
        assert result.status_code==403 and result.json()['detail']['code']=='RECOVERY_INVALID'
    row=await db_session.get(RecoveryChallenge,base.rsplit('/',1)[1],populate_existing=True);assert row.attempts==5
    assert (await client.post(base+'/reset',headers=cap,json=envelope({'new_password':PASSWORD}))).status_code==403
    unknown=await client.post(P+'/account-recovery/challenges/'+str(uuid4())+'/reset',headers=cap,json=envelope({'new_password':PASSWORD}))
    assert unknown.json()==result.json() and unknown.headers['cache-control']=='no-store'
    from datetime import timedelta
    from src.journey.policy import now
    base2,cap2,_,_=await issue(client,accounts,target='b');row=await db_session.get(RecoveryChallenge,base2.rsplit('/',1)[1]);row.expires_at=now()-timedelta(seconds=1);row.created_at=now()-timedelta(minutes=6);await db_session.commit()
    assert (await client.post(base2+'/reset',headers=cap2,json=envelope({'new_password':PASSWORD}))).status_code==403


async def test_issuance_replay_replacement_and_rate(client,accounts,db_session):
    from sqlalchemy import func
    from src.accounts.models import RecoveryChallenge
    base,cap,payload,receipt=await issue(client,accounts)
    assert (await client.post(P+'/account-recovery/challenges',headers=auth(accounts['org']),json=payload)).json()==receipt
    assert await db_session.scalar(select(func.count()).select_from(RecoveryChallenge))==1
    modified={**payload,'data':{'account_id':accounts['b'].id,'synthetic':True}}
    assert (await client.post(P+'/account-recovery/challenges',headers=auth(accounts['org']),json=modified)).status_code==409
    await issue(client,accounts);await issue(client,accounts)
    assert (await client.post(base+'/reset',headers=cap,json=envelope({'new_password':PASSWORD}))).status_code==403
    result=await client.post(P+'/account-recovery/challenges',headers=auth(accounts['org']),json=envelope(payload['data']))
    assert result.status_code==429
    assert (await client.post(P+'/account-recovery/challenges',headers=auth(accounts['org']),json=payload)).json()==receipt


@pytest.mark.parametrize('which',['issuer','target'])
async def test_current_revocation_blocks_reset_and_readback(client,accounts,db_session,which):
    base,cap,_,_=await issue(client,accounts)
    user=accounts['org' if which=='issuer' else 'a'];sidecar=await db_session.get(JourneyState,'account:'+user.id);sidecar.data={'enabled':False};await db_session.commit()
    result=await client.post(base+'/reset',headers=cap,json=envelope({'new_password':PASSWORD}))
    assert result.status_code==403 and result.json()['detail']['code']=='RECOVERY_INVALID'
    assert (await client.get(base+'/demo-message',headers=auth(accounts['other']))).status_code==403


async def test_recovery_scope_no_plaintext_and_profile_snapshot(client,accounts,db_session,monkeypatch):
    import json
    from src.journey.models import JourneyOperation
    from src.accounts.models import RecoveryChallenge
    from src.registrations.models import RegistrationModel
    from tests.test_demo_readiness import FORM,PUBLIC
    registration=await client.post('/api/v1/events/'+PUBLIC+'/registrations',headers=auth(accounts['a']),json=FORM)
    assert registration.status_code==201
    reg=await db_session.get(RegistrationModel,registration.json()['id']);before={c.name:str(getattr(reg,c.name)) for c in reg.__table__.columns}
    await client.post(P+'/me/profile',headers=auth(accounts['a']),json=envelope({'display_name':'Another name','preferred_language':'ms'},0))
    reg=await db_session.get(RegistrationModel,registration.json()['id']);assert before=={c.name:str(getattr(reg,c.name)) for c in reg.__table__.columns}
    base,cap,_,_=await issue(client,accounts)
    rows=(await db_session.scalars(select(JourneyOperation))).all();serialized=json.dumps([{'fingerprint':r.fingerprint,'receipt':r.receipt} for r in rows])
    assert cap['X-Account-Recovery'] not in serialized and PASSWORD not in serialized
    row=await db_session.get(RecoveryChallenge,base.rsplit('/',1)[1]);assert cap['X-Account-Recovery'] not in json.dumps({c.name:str(getattr(row,c.name)) for c in row.__table__.columns})
    monkeypatch.setenv('NU_DEMO_PROFILE','off')
    assert (await client.post(base+'/reset',headers=cap,json=envelope({'new_password':PASSWORD}))).status_code==403


async def test_signup_nonnamespace_and_atomic_sidecar_failure(client,accounts,db_session,monkeypatch):
    from sqlalchemy import event,func
    from src.users.models import UserModel
    plain=await client.post('/api/v1/users',json={'username':'plain_signup','password':PASSWORD,'synthetic':True});assert plain.status_code==201
    assert await db_session.get(JourneyState,'account:'+plain.json()['id']) is None
    def reject(mapper,connection,target):
        if target.kind=='account':raise RuntimeError('Injected synthetic sidecar failure')
    event.listen(JourneyState,'before_insert',reject)
    try:
        with pytest.raises(RuntimeError):await client.post('/api/v1/users',json={'username':'test_atomic','password':PASSWORD})
    finally:
        event.remove(JourneyState,'before_insert',reject);await db_session.rollback()
    assert await db_session.scalar(select(func.count()).select_from(UserModel).where(UserModel.username=='test_atomic'))==0


async def test_issuer_rate_and_disabled_profile_and_nonnamespace(client,accounts,db_session):
    from src.accounts.models import RecoveryChallenge
    from src.journey.policy import now
    from datetime import timedelta
    for _ in range(30):
        db_session.add(RecoveryChallenge(id=str(uuid4()),target_id=accounts['a'].id,issuer_id=accounts['org'].id,namespace='test_',secret_hash='0'*64,nonce='A'*43,issued_token_version=0,created_at=now(),expires_at=now()+timedelta(minutes=5),attempts=0,invalidated=True))
    await db_session.commit()
    result=await client.post(P+'/account-recovery/challenges',headers=auth(accounts['org']),json=envelope({'account_id':accounts['b'].id,'synthetic':True}))
    assert result.status_code==429
    row=await db_session.get(JourneyState,'account:'+accounts['a'].id);row.data={'enabled':False};await db_session.commit()
    assert (await client.get(P+'/me/profile',headers=auth(accounts['a']))).status_code==403
    assert (await client.get(P+'/me/profile')).status_code==401
    plain=await client.post('/api/v1/users',json={'username':'foreign_user','password':PASSWORD});assert plain.status_code==201
    assert (await client.post(P+'/account-recovery/challenges',headers=auth(accounts['org']),json=envelope({'account_id':plain.json()['id'],'synthetic':True}))).status_code==403


async def test_post_success_revocation_and_unrelated_generation(client,accounts,db_session):
    base,cap,_,_=await issue(client,accounts);payload=envelope({'new_password':PASSWORD})
    reset=await client.post(base+'/reset',headers=cap,json=payload);assert reset.status_code==200
    # Issuer generation0 must not be compared with unrelated target generation1.
    await issue(client,accounts)
    row=await db_session.get(JourneyState,'account:'+accounts['org'].id);row.data={'enabled':False};await db_session.commit()
    assert (await client.get(base+'/receipts/'+payload['operation_id'],headers=cap)).status_code==403
    assert (await client.post(base+'/reset',headers=cap,json=payload)).status_code==403
