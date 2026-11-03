"""Controlled ASGI/SQLite journey behavior; never a native concurrency claim."""
from datetime import timedelta
from uuid import uuid4
import pytest
from sqlalchemy import select
from tests.test_demo_readiness import actors, auth, FORM
from src.journey.policy import now, iso, put
from src.journey.models import JourneyState
from src.events.models import EventModel
from src.phase2.models import AssetModel

V='rose.demo-journey.v1';P='/api/v2/operations'
def envelope(data,version=None,op=None):
    result={'contract_version':V,'operation_id':op or str(uuid4()),'data':data}
    if version is not None:result['expected_version']=version
    return result
@pytest.fixture
async def managed(client,db_session,actors,monkeypatch):
    monkeypatch.setenv('NU_DEMO_PROFILE','synthetic');monkeypatch.setenv('NU_DEMO_NAMESPACE','test_');monkeypatch.setenv('NU_DEMO_OWNER_IDS',actors['org'].id)
    image=AssetModel(id='01ARZ3NDEKTSV4RRFFQ69G5FAV',owner_id=actors['org'].id,purpose='event_image',name='Synthetic.png',mime_type='image/png',size=8,storage_key='synthetic.png');db_session.add(image);await db_session.commit()
    event={'title':'Synthetic community Demo','overview':'Explicit synthetic demonstration','location':'Synthetic hall','start_time':iso(now()-timedelta(minutes=1)),'end_time':iso(now()+timedelta(hours=1)),'online_quota':1,'offline_quota':2,'image_file_ids':[image.id]}
    data={'event':event,'timezone':'Asia/Hong_Kong','registration_opens_at':iso(now()-timedelta(days=1)),'registration_closes_at':iso(now()+timedelta(minutes=45)),'policy':{'allocation_mode':'separate_pools_offer','offer_minutes':30,'walkin_pool':'offline','checkin_opens_at':iso(now()-timedelta(hours=1)),'checkin_closes_at':iso(now()+timedelta(hours=2)),'reminder_hours':24,'low_demand_ratio':0.5}}
    response=await client.post(P+'/events',json=envelope(data),headers=auth(actors['org']))
    assert response.status_code==200,response.text
    public=response.json()['resource_id']
    return public,actors
async def version(client,public,actor):return (await client.get(P+'/events/'+public,headers=auth(actor))).json()['workflow']['version']
async def mutation(client,public,actor,suffix,data,ver=None):
    if ver is None:ver=await version(client,public,actor)
    result=await client.post(P+'/events/'+public+'/'+suffix,headers=auth(actor),json=envelope(data,ver))
    assert result.status_code==200,result.text
    return result.json()
async def application(client,public,identity,actor=None,source=None):
    result=await client.post(P+'/events/'+public+'/applications',headers=auth(actor) if actor else {},json=envelope({'application':{**FORM,'national_id':identity},'source':source or {'kind':'direct','referral_code':None}}))
    assert result.status_code==200,result.text
    return result.json()['resource_id']
async def review(client,reg,actor,decision='approve',reason='Synthetic correction'):
    value=(await client.get(P+'/registrations/'+reg,headers=auth(actor))).json()
    result=await client.post(P+'/registrations/'+reg+'/review',headers=auth(actor),json=envelope({'decision':decision,'reason':reason},value['version']))
    assert result.status_code==200,result.text
    return result.json()
async def test_draft_publish_immutable_and_legacy_bypass(client,db_session,managed):
    public,a=managed
    assert (await client.get('/api/v1/events/'+public)).status_code==404
    assert public not in [r['public_id'] for r in (await client.get('/api/v1/events')).json()['data']]
    assert public in [r['public_id'] for r in (await client.get('/api/v2/me/events',headers=auth(a['org']))).json()['data']]
    denied=await client.post('/api/v1/events/'+public+'/registrations',json=FORM);assert denied.status_code==409
    payload=envelope({},await version(client,public,a['org']))
    first=await client.post(P+'/events/'+public+'/publish',headers=auth(a['org']),json=payload);assert first.status_code==200,first.text
    assert (await client.post(P+'/events/'+public+'/publish',headers=auth(a['org']),json=payload)).json()==first.json()
    assert (await client.post(P+'/events/'+public+'/publish',headers=auth(a['other']),json=payload)).status_code==403
    payload['data']={'modified':True};assert (await client.post(P+'/events/'+public+'/publish',headers=auth(a['org']),json=payload)).status_code==409
    assert (await client.patch('/api/v1/events/'+public,headers=auth(a['org']),json={'status':'completed'})).status_code==409
    assert (await client.get(P+'/receipts/'+first.json()['operation_id'],headers=auth(a['org']))).json()==first.json()
async def test_pool_offer_guest_otp_outbox(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    one=await application(client,public,'TEST-JOURNEY-A',a['a']);two=await application(client,public,'TEST-JOURNEY-B')
    await review(client,one,a['org']);await review(client,two,a['org'])
    assert (await client.get(P+'/registrations/'+two,headers=auth(a['org']))).json()['booking_state']=='waitlisted'
    challenge=await client.post(P+'/guest-access/challenges',json={'registration_id':two,'phone':FORM['phone'],'purpose':'manage_booking'});assert challenge.status_code==200
    c=challenge.json();h={'X-Demo-Challenge':c['demo_access_token']}
    assert (await client.get(P+'/guest-access/challenges/'+c['challenge_id']+'/demo-message',headers={'X-Demo-Challenge':'wrong'})).status_code==403
    code=(await client.get(P+'/guest-access/challenges/'+c['challenge_id']+'/demo-message',headers=h)).json()['code']
    assert (await client.post(P+'/guest-access/challenges/'+c['challenge_id']+'/verify',headers=h,json={'code':'invalid'})).status_code==403
    verified=await client.post(P+'/guest-access/challenges/'+c['challenge_id']+'/verify',headers=h,json={'code':code});assert verified.status_code==200
    assert (await client.post(P+'/guest-access/challenges/'+c['challenge_id']+'/verify',headers=h,json={'code':code})).status_code==403
    grant={'X-Guest-Grant':verified.json()['grant_token']}
    assert (await client.get(P+'/registrations/'+one,headers=grant)).status_code==403
    view=(await client.get(P+'/registrations/'+one,headers=auth(a['a']))).json();cancel=envelope({'reason':'Synthetic'},view['version'])
    assert (await client.post(P+'/registrations/'+one+'/cancel',json=cancel,headers=auth(a['a']))).status_code==200
    offered=(await client.get(P+'/registrations/'+two,headers=grant)).json();assert offered['booking_state']=='offered'
    accept=envelope({},offered['offer']['version']);url=P+'/offers/'+offered['offer']['id']+'/accept'
    accepted=await client.post(url,headers=grant,json=accept);assert accepted.status_code==200,accepted.text
    assert (await client.post(url,headers=grant,json=accept)).json()==accepted.json()
    out=(await client.get(P+'/outbox?event_public_id='+public,headers=grant)).json()['messages'];assert out and all(m['registration_id']==two and m['external_delivery'] is False and 'version' in m for m in out)
    stats=(await client.get(P+'/events/'+public+'/stats',headers=auth(a['org']))).json();assert stats['source']=='sqlite';assert stats['quota']['online']['approved']==1;assert stats['quota']['offline']['approved']==0
async def test_assignment_promotion_correction_attendance_closeout(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    assignment=await mutation(client,public,a['org'],'leaders',{'leader_id':a['leader'].id,'reserved_quota':1,'active':True})
    ref=assignment['effects']['referral_code'];assert (await client.get(P+'/referrals/'+ref)).json()['active'] is True
    first=await client.post(P+'/events/'+public+'/promotion',headers=auth(a['leader']),json=envelope({'text':'Synthetic promotion text'},0));assert first.status_code==200,first.text
    approved=await client.post(P+'/events/'+public+'/promotion/approve',headers=auth(a['org']),json=envelope({},first.json()['resource_version']));assert approved.status_code==200
    await mutation(client,public,a['org'],'instruction',{'text':'Synthetic instruction'})
    report=await client.post(P+'/events/'+public+'/outreach',headers=auth(a['leader']),json=envelope({'channel':'flyer','reported_at':iso(now()-timedelta(minutes=1)),'quantity':3,'notes':'Synthetic self-report'}));assert report.status_code==200
    reg=await application(client,public,'TEST-JOURNEY-LEADER',a['leader'],{'kind':'leader_referral','referral_code':ref});await review(client,reg,a['org'])
    view=(await client.get(P+'/registrations/'+reg,headers=auth(a['leader']))).json();assert view['attribution']['entry_operator_id']==a['leader'].id and view['attribution']['attributed_leader_id']==a['leader'].id
    attendance_id=str(uuid4());data={'device_id':'synthetic-device','attendance_operation_id':attendance_id,'registration_id':reg}
    intent=await mutation(client,public,a['leader'],'attendance/intents',data)
    assert (await client.get(P+'/events/'+public+'/closeout',headers=auth(a['org']))).json()['pending_attendance_count']==1
    await mutation(client,public,a['leader'],'attendance',data)
    assert (await client.get(P+'/events/'+public+'/attendance/'+attendance_id,headers=auth(a['leader']))).json()['state']=='arrived'
    second=await client.post(P+'/events/'+public+'/attendance/intents',headers=auth(a['leader']),json=envelope({**data,'attendance_operation_id':str(uuid4())},await version(client,public,a['leader'])));assert second.status_code==409
    await mutation(client,public,a['org'],'walkins',{'application':{**FORM,'national_id':'TEST-WALKIN'},'eligibility_confirmed':True,'eligibility_note':'Synthetic approval'})
    event=await db_session.scalar(select(EventModel).where(EventModel.public_id==public));event.end_time=now()-timedelta(seconds=1);await db_session.commit()
    preview=(await client.get(P+'/events/'+public+'/closeout',headers=auth(a['org']))).json();assert preview['totals']['arrivals']==2 and preview['totals']['walkin_arrivals']==1 and preview['totals']['no_show']==0
    result=await mutation(client,public,a['org'],'closeout',{'attendance_reconciled':True,'no_unregistered_local_actions':True});assert result['effects']['state']=='finalized'
    assert (await client.post(P+'/events/'+public+'/instruction',headers=auth(a['org']),json=envelope({'text':'Must refuse'},await version(client,public,a['org'])))).status_code==409

async def test_account_admin_only_disable_retained_bearer(client,db_session,managed):
    public,a=managed
    for role in ['user','leader','organizer']:
        data={'username':'test_new_'+role,'password':'synthetic-only-password','role':role,'synthetic':True};payload=envelope(data)
        denied=await client.post(P+'/accounts',headers=auth(a['other']),json=payload);assert denied.status_code==403
        created=await client.post(P+'/accounts',headers=auth(a['org']),json=payload);assert created.status_code==200,created.text
        account_id=created.json()['effects']['account_id']
        assert (await client.post(P+'/accounts',headers=auth(a['org']),json=payload)).json()==created.json()
        from src.users.models import UserModel
        actor=await db_session.get(UserModel,account_id);retained=auth(actor)
        assert (await client.get('/api/v1/users/me',headers=retained)).status_code==200
        access=envelope({'enabled':False},1)
        assert (await client.post(P+'/accounts/'+account_id+'/access',headers=auth(a['org']),json=access)).status_code==200
        assert (await client.get('/api/v1/users/me',headers=retained)).status_code==403
        assert (await client.post('/api/v1/auth/login',json={'username':data['username'],'password':data['password']})).status_code==403
    assert (await client.post(P+'/accounts/'+a['org'].id+'/access',headers=auth(a['org']),json=envelope({'enabled':False},1))).status_code==403
async def test_correction_snapshot_rejection_and_actor_actions(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    reg=await application(client,public,'TEST-CORRECTION',a['a']);await review(client,reg,a['org'],'request_correction')
    view=(await client.get(P+'/registrations/'+reg,headers=auth(a['a']))).json();assert 'correct' in view['allowed_actions'] and 'approve' not in view['allowed_actions']
    assert (await client.post(P+'/registrations/'+reg+'/correction',headers=auth(a['b']),json=envelope({'phone':'SYNTH-02','note':'Correction'},view['version']))).status_code==403
    from src.participants.models import ParticipantModel
    person=await db_session.get(ParticipantModel,view['registration']['participant_id']);original_phone=person.phone
    corrected=await client.post(P+'/registrations/'+reg+'/correction',headers=auth(a['a']),json=envelope({'phone':'SYNTH-02','file_ids':[],'note':'Correction'},view['version']));assert corrected.status_code==200
    person=await db_session.get(ParticipantModel,view['registration']['participant_id']);assert person.phone==original_phone
    await review(client,reg,a['org'],'reject','Synthetic rejection')
    view=(await client.get(P+'/registrations/'+reg,headers=auth(a['a']))).json();assert view['booking_state']=='rejected' and view['allowed_actions']==[]
async def test_window_assignment_revoke_and_legacy_sync(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    assignment=await mutation(client,public,a['org'],'leaders',{'leader_id':a['leader'].id,'reserved_quota':1,'active':True})
    from tests.test_phase2 import batch
    payload=batch({**FORM,'national_id':'TEST-SYNC-MANAGED'})
    accepted=await client.post('/api/v2/events/'+public+'/offline-batches',headers=auth(a['leader']),json=payload);assert accepted.status_code==200 and accepted.json()['items'][0]['outcome']=='accepted'
    revoke=await client.post(P+'/events/'+public+'/leaders/'+a['leader'].id,headers=auth(a['org']),json=envelope({'active':False},assignment['resource_version']));assert revoke.status_code==200
    assert (await client.get(P+'/events/'+public,headers=auth(a['leader']))).status_code==403
    assert (await client.post('/api/v2/events/'+public+'/offline-batches',headers=auth(a['leader']),json=payload)).status_code==403
    await mutation(client,public,a['org'],'edit',{'registration_closes_at':iso(now()-timedelta(seconds=1))})
    assert (await client.post('/api/v1/events/'+public+'/registrations',json={**FORM,'national_id':'TEST-CLOSED'})).status_code==409
    assert (await client.post(P+'/events/'+public+'/applications',json=envelope({'application':{**FORM,'national_id':'TEST-CLOSED-NEW'},'source':{'kind':'direct','referral_code':None}}))).status_code==409
async def test_otp_expiry_rate_shared_phone_and_no_secret_storage(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    one=await application(client,public,'TEST-OTP-ONE');two=await application(client,public,'TEST-OTP-TWO')
    body={'registration_id':one,'phone':FORM['phone'],'purpose':'manage_booking'}
    result=await client.post(P+'/guest-access/challenges',json=body);c=result.json();h={'X-Demo-Challenge':c['demo_access_token']}
    row=await db_session.get(JourneyState,'challenge:'+c['challenge_id']);assert 'demo_code' not in row.data and c['demo_access_token'] not in str(row.data)
    row.data={**row.data,'expires_at':iso(now()-timedelta(seconds=1))};await db_session.commit()
    assert (await client.post(P+'/guest-access/challenges/'+c['challenge_id']+'/verify',headers=h,json={'code':'invalid'})).status_code==403
    for _ in range(4):assert (await client.post(P+'/guest-access/challenges',json=body)).status_code==200
    assert (await client.post(P+'/guest-access/challenges',json=body)).status_code==429
    assert (await client.post(P+'/guest-access/challenges',json={**body,'registration_id':two})).status_code==200
async def test_outbox_dedupe_alert_retry_and_postpone_cancel(client,db_session,managed,monkeypatch):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    monkeypatch.setenv('NU_DEMO_OUTBOX_FAIL_KINDS','confirmation')
    reg=await application(client,public,'TEST-FAILED-OUTBOX',a['a']);await review(client,reg,a['org'])
    await mutation(client,public,a['org'],'alerts',{});await mutation(client,public,a['org'],'alerts',{})
    out=(await client.get(P+'/outbox?event_public_id='+public,headers=auth(a['org']))).json()['messages'];assert sum(m['kind']=='alert' for m in out)==1
    failed=next(m for m in out if m['kind']=='confirmation');assert failed['state']=='failed'
    retry=await client.post(P+'/outbox/'+failed['id']+'/retry',headers=auth(a['org']),json=envelope({},failed['version']));assert retry.status_code==200
    assert (await client.post(P+'/outbox/'+failed['id']+'/retry',headers=auth(a['org']),json=envelope({},retry.json()['resource_version']))).status_code==409
    await mutation(client,public,a['org'],'postpone',{'start_time':iso(now()+timedelta(hours=1)),'end_time':iso(now()+timedelta(hours=2)),'registration_closes_at':iso(now()+timedelta(minutes=30)),'checkin_opens_at':iso(now()+timedelta(minutes=45)),'checkin_closes_at':iso(now()+timedelta(hours=3)),'notice':'Synthetic postponement'})
    assert (await client.post('/api/v1/events/'+public+'/registrations',json={**FORM,'national_id':'TEST-PAUSE'})).status_code==409
    await mutation(client,public,a['org'],'resume',{'notice':'Synthetic resume'})
    await mutation(client,public,a['org'],'cancel',{'reason':'Synthetic cancellation'})
    view=(await client.get(P+'/registrations/'+reg,headers=auth(a['a']))).json();assert view['booking_state']=='cancelled'

async def test_assisted_correction_releases_offer_preserves_source_and_promotion_pause(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    await mutation(client,public,a['org'],'leaders',{'leader_id':a['leader'].id,'reserved_quota':0,'active':True})
    first=await application(client,public,'TEST-ASSIST-FIRST',a['leader']);second=await application(client,public,'TEST-ASSIST-SECOND',a['leader']);third=await application(client,public,'TEST-ASSIST-THIRD',a['leader'])
    for reg in (first,second,third):await review(client,reg,a['org'])
    before=(await client.get(P+'/registrations/'+first,headers=auth(a['leader']))).json();assert 'correct' in before['allowed_actions'] and 'cancel' not in before['allowed_actions']
    fixed=await client.post(P+'/registrations/'+first+'/correction',headers=auth(a['leader']),json=envelope({'phone':'SYNTH-ASSIST','note':'Assisted synthetic correction'},before['version']));assert fixed.status_code==200,fixed.text
    after=(await client.get(P+'/registrations/'+first,headers=auth(a['leader']))).json();assert after['booking_state']=='pending' and after['attribution']==before['attribution']
    offered=(await client.get(P+'/registrations/'+third,headers=auth(a['org']))).json();assert offered['booking_state']=='offered'
    draft=await client.post(P+'/events/'+public+'/promotion',headers=auth(a['leader']),json=envelope({'text':'Synthetic paused campaign'},0));assert draft.status_code==200
    paused=await client.post(P+'/events/'+public+'/promotion/pause',headers=auth(a['org']),json=envelope({'paused':True},draft.json()['resource_version']));assert paused.status_code==200
    promo=(await client.get(P+'/events/'+public+'/promotion',headers=auth(a['leader']))).json();assert promo['paused'] is True
    assert (await client.get(P+'/events/'+public,headers=auth(a['org']))).json()['workflow']['state']=='published'
    await application(client,public,'TEST-PAUSED-STILL-OPEN')
    out=(await client.get(P+'/outbox?event_public_id='+public,headers=auth(a['org']))).json()['messages'];assert any(m['kind']=='correction' and m['registration_id']==first for m in out)

async def test_reserved_quota_uses_entry_operator_never_referral(client,db_session,managed):
    public,a=managed;await mutation(client,public,a['org'],'publish',{})
    assignment=await mutation(client,public,a['org'],'leaders',{'leader_id':a['leader'].id,'reserved_quota':2,'active':True})
    unknown=await application(client,public,'TEST-RESERVED-UNKNOWN',a['leader'],{'kind':'unknown','referral_code':None})
    await review(client,unknown,a['org'])
    view=(await client.get(P+'/registrations/'+unknown,headers=auth(a['org']))).json();assert view['booking_state']=='confirmed';assert view['attribution']['source_kind']=='unknown' and view['attribution']['attributed_leader_id'] is None
    # Organizer entry attributed to the leader still cannot consume that leader's remaining reserved slot.
    other=await application(client,public,'TEST-RESERVED-REFERRAL',a['org'],{'kind':'leader_referral','referral_code':assignment['effects']['referral_code']})
    await review(client,other,a['org']);view=(await client.get(P+'/registrations/'+other,headers=auth(a['org']))).json();assert view['booking_state']=='waitlisted'
    assert view['attribution']['entry_operator_id']==a['org'].id and view['attribution']['attributed_leader_id']==a['leader'].id
