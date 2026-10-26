"""Synthetic SQLite/ASGI regressions; these are not native PostgreSQL evidence."""
from datetime import datetime, timedelta, timezone
import jwt
import pytest
import ulid
from pydantic import ValidationError
from sqlalchemy import select, func
from src.core.config import settings
from src.core.security import create_access_token, hash_password
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel, EventStatusEnum
from src.events.schemas import EventCreate
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum
from src.registrations.service import RegistrationService

FORM = dict(first_name="Synthetic", last_name="Component", gender="female", date_of_birth="1990-01-01",
            phone="", address="Synthetic fixture only", national_id="COMPONENT-A", income_band_code="",
            marriage_status="single", medical_record=None)


@pytest.mark.parametrize('start,end', [
    ('2027-01-01T00:00:00', '2027-01-02T00:00:00Z'),
    ('2027-01-01T00:00:00Z', '2027-01-02T00:00:00'),
    ('2027-01-01T00:00:00', '2027-01-02T00:00:00'),
])
def test_event_input_requires_explicit_timezone(start, end):
    with pytest.raises(ValidationError):
        EventCreate(title='Synthetic', location='Synthetic', start_time=start, end_time=end)


@pytest.fixture
async def fixture_users(db_session):
    password_hash = hash_password("component-only password")
    users = {}
    for name, role in [('A', 'user'), ('B', 'user'), ('O', 'organizer'), ('L', 'leader')]:
        user = UserModel(id=str(ulid.ULID()), username='component_' + name, password_hash=password_hash,
                         role=UserRoleEnum(role))
        db_session.add(user); users[name] = user
    await db_session.commit()
    event = EventModel(id=1, public_id='C' * 21, organizer_id=users['O'].id, title="Component keyword",
        overview="Search fixture", location="Synthetic", online_quota=1, offline_quota=0,
        start_time=datetime(2027, 1, 1, tzinfo=timezone.utc), end_time=datetime(2027, 1, 2, tzinfo=timezone.utc),
        status=EventStatusEnum.active)
    db_session.add(event); await db_session.commit()
    return {name: {'id': u.id, 'username': u.username, 'headers': {
        'Authorization': 'Bearer ' + create_access_token({'sub': u.username, 'role': 'organizer'})}}
        for name, u in users.items()}


async def counts(db):
    return [await db.scalar(select(func.count()).select_from(model)) for model in (UserModel, ParticipantModel, RegistrationModel)]


@pytest.mark.parametrize('role', ['organizer', 'leader'])
async def test_public_privileged_signup_has_no_row(client, db_session, role):
    response = await client.post('/api/v1/users', json={'username': 'role_rejected', 'password': 'component-only', 'role': role})
    assert response.status_code == 422
    assert await counts(db_session) == [0, 0, 0]


@pytest.mark.parametrize('authorization', ['', 'Basic synthetic', 'Bearer', 'Bearer ', 'Bearer invalid', 'Bearer a b'])
async def test_optional_auth_never_downgrades_bad_header(client, db_session, authorization):
    response = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', json=FORM,
                                 headers={'Authorization': authorization})
    assert response.status_code == 401
    assert await counts(db_session) == [0, 0, 0]


@pytest.mark.parametrize('patch', [{'sub': 'unknown'}, {'sub': 'unknown', 'type': 'refresh'},
                                   {'sub': 'unknown', 'exp': 1}, {'sub': 123}, {'sub': '   '}])
async def test_optional_auth_rejects_signed_bad_identity(client, db_session, patch):
    claims = {'exp': datetime.now(timezone.utc) + timedelta(minutes=5), **patch}
    token = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm='HS256')
    response = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', json=FORM,
                                 headers={'Authorization': 'Bearer ' + token})
    assert response.status_code == 401
    assert await counts(db_session) == [0, 0, 0]


@pytest.mark.parametrize('name', ['A', 'L'])
async def test_management_uses_db_role_with_and_without_status(client, fixture_users, name):
    headers = fixture_users[name]['headers']  # JWT role is deliberately organizer; DB role wins.
    for path in ['/registrations', '/registrations?status=pending', '/registrations/' + '0' * 26]:
        assert (await client.get('/api/v1' + path, headers=headers)).status_code == 403
    assert (await client.post('/api/v1/registrations/' + '0' * 26 + '/approve', headers=headers)).status_code == 403
    event = dict(title='Denied', location='Synthetic', start_time='2027-01-01T00:00:00Z', end_time='2027-01-02T00:00:00Z')
    assert (await client.post('/api/v1/events', headers=headers, json=event)).status_code == 403


async def test_guest_first_application_null_identity_and_strict_pending(client, fixture_users, db_session):
    response = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', json=FORM)
    assert response.status_code == 201
    data = response.json()
    assert data['status'] == 'pending' and data['channel'] == 'online' and data['created_by_user_id'] is None
    participant = await db_session.get(ParticipantModel, data['participant_id'])
    assert participant.user_id is None and participant.updated_by_user_id is None
    assert (await client.get('/api/v1/me/registrations')).status_code == 401


async def test_ownership_duplicate_and_snapshot_protection(client, fixture_users, db_session):
    headers = fixture_users['A']['headers']
    first = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=headers, json=FORM)
    assert first.status_code == 201
    original = first.json()
    duplicate = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=headers, json={**FORM, 'first_name': 'Changed'})
    assert duplicate.status_code == 400
    assert duplicate.json()['detail'] == 'This participant already holds an active registration record for this event.'
    for attacker in [{}, fixture_users['B']['headers']]:
        assert (await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=attacker,
                                   json={**FORM, 'first_name': 'Attacker'})).status_code == 403
    assert (await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=headers,
                               json={**FORM, 'national_id': 'OTHER'})).status_code == 403
    participant = await db_session.get(ParticipantModel, original['participant_id'])
    assert participant.first_name == FORM['first_name'] and participant.user_id == fixture_users['A']['id']
    row = await db_session.get(RegistrationModel, original['id'])
    assert row.first_name == FORM['first_name'] and await counts(db_session) == [4, 1, 1]


async def test_user_cannot_claim_guest_identity(client, fixture_users, db_session):
    guest = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', json=FORM)
    assert guest.status_code == 201
    claimed = await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=fixture_users['A']['headers'], json=FORM)
    assert claimed.status_code == 403
    participant = await db_session.get(ParticipantModel, guest.json()['participant_id'])
    assert participant.user_id is None and await counts(db_session) == [4, 1, 1]


async def test_lifecycle_readback_and_repeat_cancel(client, fixture_users, db_session):
    a = (await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=fixture_users['A']['headers'], json=FORM)).json()
    b = (await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=fixture_users['B']['headers'], json={**FORM, 'national_id': 'COMPONENT-B'})).json()
    for record, expected in [(a, 'approved'), (b, 'waiting')]:
        response = await client.post('/api/v1/registrations/' + record['id'] + '/approve', headers=fixture_users['O']['headers'])
        assert response.status_code == 200 and response.json()['status'] == expected
    denied = await client.post('/api/v1/me/registrations/' + a['id'] + '/cancel', headers=fixture_users['B']['headers'])
    assert denied.status_code == 403
    cancelled = await client.post('/api/v1/me/registrations/' + a['id'] + '/cancel', headers=fixture_users['A']['headers'])
    assert cancelled.status_code == 200 and cancelled.json()['status'] == 'cancelled'
    assert (await client.post('/api/v1/me/registrations/' + a['id'] + '/cancel', headers=fixture_users['A']['headers'])).status_code == 400
    own_b = (await client.get('/api/v1/me/registrations', headers=fixture_users['B']['headers'])).json()
    assert len(own_b) == 1 and own_b[0]['id'] == b['id'] and own_b[0]['status'] == 'approved'
    event = (await client.get('/api/v1/events/' + 'C' * 21)).json()
    assert event['quota']['online'] == {'approved': 1, 'capacity': 1}
    assert event['quota']['waitingCount'] == 0


async def test_event_search_count_detail_and_status_validation(client, fixture_users):
    for query, count in [('keyword=keyword', 1), ('keyword=no-result', 0), ('page=2&pageSize=1', 1)]:
        response = await client.get('/api/v1/events?' + query)
        assert response.status_code == 200 and response.json()['total_count'] == count
        if 'page=2' in query:
            assert response.json()['data'] == []
    assert (await client.get('/api/v1/events?status=invalid')).status_code == 422
    assert (await client.get('/api/v1/me/registrations?status=invalid', headers=fixture_users['A']['headers'])).status_code == 422


async def test_cancel_and_promotion_rollback_together(client, fixture_users, db_session, monkeypatch):
    a = (await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=fixture_users['A']['headers'], json=FORM)).json()
    b = (await client.post('/api/v1/events/' + 'C' * 21 + '/registrations', headers=fixture_users['B']['headers'], json={**FORM, 'national_id': 'COMPONENT-B'})).json()
    for record in [a, b]:
        assert (await client.post('/api/v1/registrations/' + record['id'] + '/approve', headers=fixture_users['O']['headers'])).status_code == 200
    class InjectedFault(Exception): pass
    async def fail_commit():
        await db_session.flush()
        raise InjectedFault()
    monkeypatch.setattr(db_session, 'commit', fail_commit)
    with pytest.raises(InjectedFault):
        await RegistrationService.cancel_user_registration(db_session, a['id'], fixture_users['A']['id'])
    rows = (await db_session.scalars(select(RegistrationModel).order_by(RegistrationModel.created_at))).all()
    assert [row.status for row in rows] == [RegistrationStatusEnum.approved, RegistrationStatusEnum.waiting]
    assert rows[0].cancelled_at is None
