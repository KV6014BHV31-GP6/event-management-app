"""Opt-in account transactions on the three exact R3 task-owned native databases."""
import asyncio
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4
import httpx
import pytest
import ulid
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.main import app
from src.core.database import Base, get_async_db
from src.core.security import hash_password
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel, EventStatusEnum
from src.journey.models import JourneyState, JourneyOperation
from src.accounts.models import AccountSecurity, AccountProfile, RecoveryChallenge
from tests.test_accounts import P, PASSWORD, envelope

DATABASE='nu_demo_20261103_132629_r3_accounts_be_test'
MIGRATION_DATABASE='nu_demo_20261103_132629_r3_accounts_migration_be_test'
SHAPE_DATABASE='nu_demo_20261103_132629_r3_accounts_shape_be_test'


def evidence(name, value):
    target=os.getenv('NU_ACCOUNTS_EVIDENCE_DIR')
    if target:
        path=Path(target);path.mkdir(parents=True,exist_ok=True)
        (path/(name+'.json')).write_text(json.dumps(value,indent=2,default=str)+'\n',encoding='utf-8')


@pytest.fixture
async def native_accounts(monkeypatch):
    url=os.getenv('NU_NATIVE_TEST_DATABASE_URL')
    if not url:pytest.skip('Exact assigned native database opt-in required.')
    assert url.rsplit('/',1)[-1]==DATABASE and ':5441/' in url
    engine=create_async_engine(url,echo=False,hide_parameters=True)
    async with engine.begin() as conn:
        identity=(await conn.execute(text("SELECT current_database(),current_setting('server_version_num'),inet_server_port(),rolsuper FROM pg_roles WHERE rolname=current_user"))).one()
        assert identity[0]==DATABASE and identity[1]=='170011' and identity[2]==5441 and not identity[3]
        await conn.run_sync(Base.metadata.create_all)
    sessions=async_sessionmaker(engine,expire_on_commit=False,autoflush=False)
    stamp=str(ulid.ULID())[-10:].lower();prefix='ar'+stamp
    digest=hash_password('test-only-password');actors={}
    async with sessions() as db:
        for key,role in [('a','user'),('b','user'),('org','organizer'),('other','organizer'),('leader','leader')]:
            actor=UserModel(id=str(ulid.ULID()),username=prefix+key,role=UserRoleEnum(role),password_hash=digest)
            db.add(actor);actors[key]=actor
        await db.flush()
        for actor in actors.values():db.add(JourneyState(key='account:'+actor.id,kind='account',version=1,data={'enabled':True}))
        event=EventModel(public_id=str(ulid.ULID())[-21:],organizer_id=actors['org'].id,title='Account native synthetic',location='Synthetic only',online_quota=2,offline_quota=2,start_time=datetime(2030,1,1,tzinfo=timezone.utc),end_time=datetime(2030,1,2,tzinfo=timezone.utc),status=EventStatusEnum.active)
        db.add(event);await db.commit()
    monkeypatch.setenv('NU_DEMO_PROFILE','synthetic');monkeypatch.setenv('NU_DEMO_NAMESPACE',prefix);monkeypatch.setenv('NU_DEMO_OWNER_IDS',actors['org'].id)
    async def dependency():
        async with sessions() as db:
            yield db
    app.dependency_overrides[get_async_db]=dependency
    transport=httpx.ASGITransport(app=app,raise_app_exceptions=False)
    try:
        async with httpx.AsyncClient(transport=transport,base_url='https://account-native.test') as client:
            headers={}
            for key,actor in actors.items():
                response=await client.post('/api/v1/auth/login',json={'username':actor.username,'password':'test-only-password'})
                assert response.status_code==200
                headers[key]={'Authorization':'Bearer '+response.json()['access_token']}
            yield client,sessions,actors,headers,event
    finally:
        app.dependency_overrides.clear();await engine.dispose()


async def issue(native, target='a', operation=None):
    client,sessions,actors,headers,event=native
    payload=envelope({'account_id':actors[target].id,'synthetic':True},op=operation)
    response=await client.post(P+'/account-recovery/challenges',headers=headers['org'],json=payload)
    assert response.status_code==200
    base=P+'/account-recovery/challenges/'+response.json()['effects']['challenge_id']
    message=await client.get(base+'/demo-message',headers=headers['org']);assert message.status_code==200
    return base,{'X-Account-Recovery':message.json()['recovery_secret']},payload,response.json()


async def test_native_same_id_issuance_reset_and_lost_ack(native_accounts):
    client,sessions,actors,headers,event=native_accounts
    payload=envelope({'account_id':actors['a'].id,'synthetic':True})
    issued=await asyncio.gather(*(client.post(P+'/account-recovery/challenges',headers=headers['org'],json=payload) for _ in range(8)))
    assert [r.status_code for r in issued]==[200]*8
    assert all(r.json()==issued[0].json() for r in issued)
    base=P+'/account-recovery/challenges/'+issued[0].json()['effects']['challenge_id']
    secret=(await client.get(base+'/demo-message',headers=headers['org'])).json()['recovery_secret'];cap={'X-Account-Recovery':secret}
    reset=envelope({'new_password':PASSWORD})
    outcomes=await asyncio.gather(*(client.post(base+'/reset',headers=cap,json=reset) for _ in range(8)))
    assert [r.status_code for r in outcomes]==[200]*8
    assert all(r.json()==outcomes[0].json() for r in outcomes)
    async with sessions() as db:
        before=(await db.get(UserModel,actors['a'].id)).password_hash
        security=await db.get(AccountSecurity,actors['a'].id);assert security.token_version==1
        row=await db.get(RecoveryChallenge,base.rsplit('/',1)[1]);assert row.used_operation_id==reset['operation_id'] and row.attempts==0
        receipt=await db.get(JourneyOperation,reset['operation_id']);receipt_before=json.dumps(receipt.receipt,sort_keys=True)
    # Discarded original response, then receipt GET only: native DB readback before any replay.
    recovered=await client.get(base+'/receipts/'+reset['operation_id'],headers=cap);assert recovered.json()==outcomes[0].json()
    changed={**reset,'data':{'new_password':PASSWORD+'-changed'}}
    assert (await client.post(base+'/reset',headers=cap,json=changed)).status_code==409
    async with sessions() as db:
        assert (await db.get(UserModel,actors['a'].id)).password_hash==before
        assert (await db.get(AccountSecurity,actors['a'].id)).token_version==1
        assert json.dumps((await db.get(JourneyOperation,reset['operation_id'])).receipt,sort_keys=True)==receipt_before
        assert (await db.get(RecoveryChallenge,row.id)).attempts==0
    evidence('same-id-and-lost-ack',{'issuance_requests':8,'reset_requests':8,'generation_increments':1,'receipt_get_only_after_discarded_ack':True,'unchanged_password_hash_receipt_attempts_on_readback':True,'transport':'ASGI on nativePG; not TCP/browser loss'})


async def test_native_competing_reset_profile_race_and_rollback(native_accounts,monkeypatch):
    from src.accounts import service
    client,sessions,actors,headers,event=native_accounts
    profile=[envelope({'display_name':'Native '+str(n),'preferred_language':'en'},0) for n in range(2)]
    result=await asyncio.gather(*(client.post(P+'/me/profile',headers=headers['a'],json=p) for p in profile))
    assert sorted(r.status_code for r in result)==[200,409]
    base,cap,_,_=await issue(native_accounts)
    original=service.commit_receipt
    async def fault(db,env,actor,path,kind,*args,**kwargs):
        if kind=='account_password_reset':
            await db.flush();raise RuntimeError('Injected pre-commit rollback')
        return await original(db,env,actor,path,kind,*args,**kwargs)
    monkeypatch.setattr(service,'commit_receipt',fault)
    failed=envelope({'new_password':PASSWORD})
    assert (await client.post(base+'/reset',headers=cap,json=failed)).status_code==500
    async with sessions() as db:
        assert await db.get(AccountSecurity,actors['a'].id) is None
        assert (await db.get(RecoveryChallenge,base.rsplit('/',1)[1])).used_operation_id is None
        assert await db.get(JourneyOperation,failed['operation_id']) is None
    monkeypatch.setattr(service,'commit_receipt',original)
    outcomes=await asyncio.gather(*(client.post(base+'/reset',headers=cap,json=envelope({'new_password':PASSWORD+str(i)})) for i in range(2)))
    assert sorted(r.status_code for r in outcomes)==[200,403]
    async with sessions() as db:assert (await db.get(AccountSecurity,actors['a'].id)).token_version==1
    base2,cap2,_,_=await issue(native_accounts,target='b');lost=envelope({'new_password':PASSWORD})
    async def lose_after_commit(db,env,actor,path,kind,*args,**kwargs):
        value=await original(db,env,actor,path,kind,*args,**kwargs)
        if kind=='account_password_reset':raise ConnectionError('Injected lost commit acknowledgement')
        return value
    monkeypatch.setattr(service,'commit_receipt',lose_after_commit)
    unknown=await client.post(base2+'/reset',headers=cap2,json=lost)
    assert unknown.status_code==500 and unknown.json()['detail']['code']=='OPERATION_OUTCOME_UNKNOWN'
    assert unknown.headers['cache-control']=='no-store'
    monkeypatch.setattr(service,'commit_receipt',original)
    async with sessions() as db:
        assert (await db.get(AccountSecurity,actors['b'].id)).token_version==1
        durable=(await db.get(JourneyOperation,lost['operation_id'])).receipt
    assert (await client.get(base2+'/receipts/'+lost['operation_id'],headers=cap2)).json()==durable
    async with sessions() as db:assert (await db.get(AccountSecurity,actors['b'].id)).token_version==1
    evidence('races-and-rollback',{'profile_zero_version_winners':1,'competing_reset_winners':1,'precommit_password_generation_used_marker_receipt_rollback':True,'postcommit_injected_lost_ack_500_then_durable_get':True})


@pytest.mark.parametrize('route',['cancel','approve','phase2'])
async def test_native_http_generation_rechecked_after_domain_lock(native_accounts,monkeypatch,route):
    from src.auth import deps
    from src.registrations.models import RegistrationModel
    from tests.test_demo_readiness import FORM
    client,sessions,actors,headers,event=native_accounts
    actor_key={'cancel':'a','approve':'org','phase2':'leader'}[route]
    target=actors[actor_key]
    form={**FORM,'national_id':'GEN-'+str(uuid4())}
    created=await client.post('/api/v1/events/'+event.public_id+'/registrations',headers=headers['a'],json=form);assert created.status_code==201
    reg_id=created.json()['id']
    base,cap,_,_=await issue(native_accounts,target=actor_key)
    authenticated=asyncio.Event();original=deps.validate_generation
    async def observed(db,user_id,value):
        await original(db,user_id,value)
        if user_id==target.id:authenticated.set()
    monkeypatch.setattr(deps,'validate_generation',observed)
    async with sessions() as blocker:
        await blocker.scalar(select(EventModel).where(EventModel.id==event.id).with_for_update())
        if route=='cancel':
            task=asyncio.create_task(client.post('/api/v1/me/registrations/'+reg_id+'/cancel',headers=headers['a']))
        elif route=='approve':
            task=asyncio.create_task(client.post('/api/v1/registrations/'+reg_id+'/approve',headers=headers['org']))
        else:
            body={'contract_version':'rose.offline-sync.v2','batch_id':str(uuid4()),'items':[{'client_submission_id':str(uuid4()),'application':{**form,'national_id':'OFF-'+str(uuid4())}}]}
            task=asyncio.create_task(client.post('/api/v2/events/'+event.public_id+'/offline-batches',headers=headers['leader'],json=body))
        try:
            await asyncio.wait_for(authenticated.wait(),5)
            await asyncio.sleep(.1)
            assert not task.done()
            reset=await client.post(base+'/reset',headers=cap,json=envelope({'new_password':PASSWORD}));assert reset.status_code==200
        finally:
            await blocker.rollback()
        response=await asyncio.wait_for(task,10)
        assert response.status_code==401
    async with sessions() as db:
        assert (await db.get(RegistrationModel,reg_id)).status.value=='pending'
    evidence('generation-lock-'+route,{'http_authenticated_before_wait':True,'native_event_lock_wait':True,'reset_committed_before_unlock':True,'stale_request_status':401,'business_row_unchanged':True})


async def test_native_login_refresh_serialize_and_revocation(native_accounts,monkeypatch):
    client,sessions,actors,headers,event=native_accounts
    user=actors['a'];base,cap,_,_=await issue(native_accounts)
    login=await client.post('/api/v1/auth/login',json={'username':user.username,'password':'test-only-password'});cookie=login.cookies['refresh_token']
    async with sessions() as blocker:
        await blocker.scalar(select(UserModel).where(UserModel.id==user.id).with_for_update())
        pending_login=asyncio.create_task(client.post('/api/v1/auth/login',json={'username':user.username,'password':'test-only-password'}))
        pending_refresh=asyncio.create_task(client.post('/api/v1/auth/refresh',headers={'Cookie':'refresh_token='+cookie}))
        await asyncio.sleep(.15)
        assert not pending_login.done() and not pending_refresh.done()
        # Commit reset through the same locked transaction to impose deterministic ordering.
        from src.accounts.service import reset
        await reset(blocker,base.rsplit('/',1)[1],cap['X-Account-Recovery'],__import__('src.accounts.schemas',fromlist=['Envelope']).Envelope.model_validate(envelope({'new_password':PASSWORD})))
        outcomes=await asyncio.gather(pending_login,pending_refresh)
        assert [r.status_code for r in outcomes]==[401,401]
    for path,body_key in [('/api/v1/auth/login','json'),('/api/v1/auth/token','data')]:
        result=await client.post(path,**{body_key:{'username':user.username,'password':PASSWORD}});assert result.status_code==200
    base2,cap2,_,_=await issue(native_accounts,target='b')
    async with sessions() as db:
        await db.scalar(select(UserModel).where(UserModel.id==actors['b'].id).with_for_update())
        pending_reset=asyncio.create_task(client.post(base2+'/reset',headers=cap2,json=envelope({'new_password':PASSWORD})))
        await asyncio.sleep(.1)
        assert not pending_reset.done()
        row=await db.get(JourneyState,'account:'+actors['b'].id);row.data={'enabled':False};await db.commit()
    assert (await pending_reset).status_code==403
    evidence('credential-and-disable-races',{'blocked_old_password_login':401,'blocked_actual_cookie_refresh':401,'new_json_and_form_login':200,'disabled_target_reset':403})


async def test_native_migration_first_repeat_shape_and_rows(native_accounts,monkeypatch):
    from scripts import migrate_accounts as migration
    client,sessions,actors,headers,event=native_accounts
    url=os.environ['NU_NATIVE_TEST_DATABASE_URL'];base=url.rsplit('/',1)[0]+'/'
    engine=create_async_engine(base+MIGRATION_DATABASE,echo=False,hide_parameters=True)
    try:
        async with engine.begin() as conn:
            assert await conn.scalar(text('SELECT current_database()'))==MIGRATION_DATABASE
            assert not await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))
            tables=[t for t in Base.metadata.sorted_tables if t.name not in {'account_security','account_profiles','account_recovery_challenges'}]
            await conn.run_sync(lambda c:Base.metadata.create_all(c,tables=tables))
            await conn.execute(text("INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES('01ARZ3NDEKTSV4RRFFQ69G5FAV','legacy_migration','unusable-synthetic','user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING"))
            before=await conn.scalar(text('SELECT md5(row_to_json(u)::text) FROM users u'))
        monkeypatch.setattr(migration,'async_engine',engine)
        first=await migration.migrate(MIGRATION_DATABASE);second=await migration.migrate(MIGRATION_DATABASE)
        assert first==second
        with pytest.raises(ValueError):await migration.migrate('wrong_acknowledgement')
        async with engine.connect() as conn:
            assert await conn.scalar(text('SELECT md5(row_to_json(u)::text) FROM users u'))==before
            assert await conn.scalar(text('SELECT count(*) FROM accounts_schema_migrations'))==1
            assert await conn.scalar(text('SELECT count(*) FROM account_security'))==0
    finally:await engine.dispose()
    shape=create_async_engine(base+SHAPE_DATABASE,echo=False,hide_parameters=True)
    try:
        async with shape.begin() as conn:
            tables=[t for t in Base.metadata.sorted_tables if t.name not in {'account_security','account_profiles','account_recovery_challenges'}]
            await conn.run_sync(lambda c:Base.metadata.create_all(c,tables=tables))
            await conn.execute(text('CREATE TABLE IF NOT EXISTS account_security(user_id VARCHAR(26) PRIMARY KEY,token_version INTEGER)'))
        monkeypatch.setattr(migration,'async_engine',shape)
        with pytest.raises(ValueError):await migration.migrate(SHAPE_DATABASE)
        async with shape.connect() as conn:
            assert not await conn.scalar(text("SELECT to_regclass('account_profiles')"))
            assert not await conn.scalar(text("SELECT to_regclass('accounts_schema_migrations')"))
    finally:await shape.dispose()
    evidence('migration',{'identity':migration.MIGRATION_ID,'first':'PASS','repeat':'PASS','wrong_ack_refusal':True,'malformed_shape_refusal':True,'legacy_row_hash_unchanged':True,'no_backfill':True})


async def test_native_cross_owner_sorted_locks_and_signup_rollback(native_accounts,monkeypatch):
    from sqlalchemy import event as mapper_event
    client,sessions,actors,headers,event=native_accounts
    monkeypatch.setenv('NU_DEMO_OWNER_IDS',actors['org'].id+','+actors['other'].id)
    tasks=[client.post(P+'/account-recovery/challenges',headers=headers[issuer],json=envelope({'account_id':actors[target].id,'synthetic':True})) for issuer,target in [('org','other'),('other','org')]]
    result=await asyncio.gather(*tasks);assert [r.status_code for r in result]==[200,200]
    prefix=os.environ['NU_DEMO_NAMESPACE'];username=prefix+'signup'
    signup=await client.post('/api/v1/users',json={'username':username,'password':PASSWORD});assert signup.status_code==201
    account_id=signup.json()['id']
    directory=await client.get(P+'/accounts',headers=headers['org']);assert account_id in [row['id'] for row in directory.json()['accounts']]
    leaders=await client.get(P+'/accounts?scope=assignable_leaders',headers=headers['org']);assert account_id not in [row['id'] for row in leaders.json()['accounts']]
    def failure(mapper,connection,target):
        if target.kind=='account':raise RuntimeError('Injected native signup rollback')
    mapper_event.listen(JourneyState,'before_insert',failure)
    failed_name=prefix+'fail'
    try:assert (await client.post('/api/v1/users',json={'username':failed_name,'password':PASSWORD})).status_code==500
    finally:mapper_event.remove(JourneyState,'before_insert',failure)
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(UserModel).where(UserModel.username==failed_name))==0
        assert await db.get(JourneyState,'account:'+account_id) is not None
    evidence('sorted-issuance-signup',{'cross_owner_issuances':[200,200],'signup_owner_directory':True,'leader_directory_excludes_participant':True,'signup_atomic_failure_no_user':True})
