"""Recorded attribution contracts on controlled ASGI/SQLite; not native acceptance."""
import copy
import hashlib
import json
from datetime import timedelta
from uuid import uuid4
from types import SimpleNamespace

import pytest
import ulid
from nanoid import generate
from sqlalchemy import delete, select

from src.core.database import Base
from src.events.models import EventModel, EventStatusEnum
from src.journey import allocation
from src.journey.models import JourneyOperation, JourneyState
from src.journey.policy import iso, now, put, state
from src.journey.router import new_application
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status, RegistrationChannelEnum as Channel
from src.users.models import UserModel, UserRoleEnum
from tests.test_demo_readiness import auth
from tests.test_journey import envelope

PREFIX = '/api/v2/operations'


async def seed_event(db, monkeypatch):
    """Explicit synthetic starting state; no event-create endpoint acceptance claim."""
    stamp = str(ulid.ULID())
    users = {}
    for name, role in [('owner', 'organizer'), ('foreign', 'organizer'), ('user', 'user'),
                       ('one', 'leader'), ('two', 'leader'), ('zero', 'leader'), ('unassigned', 'leader')]:
        user = UserModel(id=str(ulid.ULID()), username='attr_' + stamp + '_' + name,
                         role=UserRoleEnum(role), password_hash='unusable-synthetic-fixture')
        db.add(user)
        users[name] = user
    await db.flush()
    clock = now()
    events = []
    for _ in range(2):
        event = EventModel(id=uuid4().int % (2 ** 50), public_id=generate(size=21), organizer_id=users['owner'].id,
                           title='Synthetic attribution fixture', overview='Synthetic only', location='Synthetic',
                           online_quota=4, offline_quota=4, start_time=clock - timedelta(hours=1),
                           end_time=clock + timedelta(hours=1), status=EventStatusEnum.active)
        db.add(event)
        await db.flush()
        await put(db, 'event:' + event.public_id, 'event', {
            'state': 'published', 'timezone': 'Asia/Hong_Kong',
            'registration_opens_at': iso(clock - timedelta(days=1)),
            'registration_closes_at': iso(clock + timedelta(minutes=30)), 'change_notice': None,
            'policy': {'allocation_mode': 'separate_pools_offer', 'offer_minutes': 30, 'walkin_pool': 'offline',
                       'checkin_opens_at': iso(clock - timedelta(hours=2)),
                       'checkin_closes_at': iso(clock + timedelta(hours=2)),
                       'reminder_hours': 24, 'low_demand_ratio': 0.5}}, event.id)
        events.append(event)
    case = {'users': users, 'event': events[0], 'other_event': events[1], 'clock': clock, 'stamp': stamp}
    for name in ['two', 'zero', 'one']:
        await assignment(db, case, name)
    await assignment(db, case, 'one', events[1])
    monkeypatch.setenv('NU_DEMO_PROFILE', 'synthetic')
    monkeypatch.setenv('NU_DEMO_NAMESPACE', 'attr_')
    monkeypatch.setenv('NU_DEMO_OWNER_IDS', users['owner'].id)
    await db.commit()
    # The existing controlled client closes/rolls back its shared session per
    # request. Keep fixture references as values so denied reads cannot expire
    # the next request's identifiers or authorization header.
    case['users'] = {name: SimpleNamespace(id=user.id, username=user.username, role=user.role)
                     for name, user in users.items()}
    case['event'] = SimpleNamespace(id=events[0].id, public_id=events[0].public_id)
    case['other_event'] = SimpleNamespace(id=events[1].id, public_id=events[1].public_id)
    return case


async def assignment(db, case, name, event=None, active=True):
    event = event or case['event']
    leader = case['users'][name]
    key = 'leader:' + event.public_id + ':' + leader.id
    code = event.public_id + '-' + name
    await put(db, key, 'leader', {'leader_id': leader.id, 'active': active, 'reserved_quota': 0,
                                'referral_code': code, 'public_url': '?view=event&event=' + event.public_id}, event.id)
    await put(db, 'referral:' + code, 'referral', {'assignment': key}, event.id)


async def add_registration(db, case, status=Status.pending, leader=None, source='unknown',
                           operator='owner', event=None, channel=None, arrived=False, missing=False,
                           correction=False):
    event = event or case['event']
    form = {'first_name': 'Synthetic', 'last_name': 'Attribution', 'gender': 'female',
            'date_of_birth': '1990-01-01', 'phone': 'SYNTHETIC', 'national_id': 'ATTR-' + str(uuid4())}
    actor = case['users'].get(operator)
    src = {'kind': 'leader_referral' if leader else source,
           'referral_code': event.public_id + '-' + leader if leader else None}
    reg, meta = await new_application(db, event, form, actor, src, walkin=channel == Channel.walkin)
    # These are declared aggregate-fixture starting states, not lifecycle transition evidence.
    reg.status = status
    if channel is not None:
        reg.channel = channel
    if status == Status.waiting:
        reg.waitlisted_at = case['clock']
    meta.data = {**meta.data, 'review': 'correction_requested' if correction else
                 'eligible' if status in {Status.approved, Status.waiting} else
                 'rejected' if status == Status.rejected else 'awaiting_review'}
    if arrived:
        operation = str(uuid4())
        await put(db, 'attendance:' + operation, 'attendance', {
            'operation_id': operation, 'state': 'arrived', 'registration_id': reg.id,
            'recorded_at': iso(case['clock']), 'device_id': 'synthetic', 'actor_id': case['users']['owner'].id}, event.id)
        await put(db, 'arrival:' + reg.id, 'arrival', {'operation_id': operation}, event.id)
    if missing:
        await db.delete(meta)
    await db.flush()
    return reg


async def seed_mixed(db, monkeypatch):
    case = await seed_event(db, monkeypatch)
    regs = []
    specs = [
        {'leader': 'one'},
        {'leader': 'one', 'status': Status.approved, 'channel': Channel.online, 'arrived': True},
        {'leader': 'one', 'status': Status.cancelled},
        {'leader': 'two', 'status': Status.approved, 'operator': 'one'},
        {'leader': 'two', 'status': Status.waiting},
        {'leader': 'two', 'status': Status.rejected},
        {'source': 'direct', 'correction': True},
        {'status': Status.approved, 'channel': Channel.walkin, 'arrived': True},
        {'status': Status.cancelled, 'missing': True},
    ]
    for spec in specs:
        regs.append(await add_registration(db, case, **spec))
    case['regs'] = [SimpleNamespace(id=reg.id) for reg in regs]
    case['foreign_reg'] = await add_registration(db, case, leader='one', event=case['other_event'])
    await db.commit()
    return case


@pytest.fixture
async def attributed(db_session, monkeypatch):
    return await seed_mixed(db_session, monkeypatch)


async def read_view(client, case, name='owner', suffix='stats'):
    response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/' + suffix,
                                headers=auth(case['users'][name]))
    assert response.status_code == 200, response.text
    return response.json()


def leader_row(case, name, count, label=None):
    user = case['users'][name]
    return {'leader_id': user.id, 'leader_display_name': user.username if label is None else label,
            'applications': count}


def expected_breakdown(case):
    return {'scope': 'event', 'basis': 'all_applications',
            'leaders': sorted([leader_row(case, 'one', 3), leader_row(case, 'two', 3),
                               leader_row(case, 'zero', 0)], key=lambda row: row['leader_id']),
            'unattributed_applications': 3}


async def store_fingerprint(db):
    """Compare actual persisted rows without copying participant payload to evidence."""
    result = {}
    for table in Base.metadata.sorted_tables:
        rows = (await db.execute(select(table).order_by(*table.primary_key.columns))).all()
        payload = json.dumps([tuple(row) for row in rows], sort_keys=True, default=str)
        result[table.name] = (len(rows), hashlib.sha256(payload.encode()).hexdigest())
    return result


async def finalize(client, db, case):
    event = await db.get(EventModel, case['event'].id)
    event.end_time = now() - timedelta(seconds=1)
    await db.commit()
    version = (await state(db, 'event:' + case['event'].public_id)).version
    response = await client.post(PREFIX + '/events/' + case['event'].public_id + '/closeout',
                                 headers=auth(case['users']['owner']), json=envelope({
                                     'attendance_reconciled': True, 'no_unregistered_local_actions': True}, version))
    assert response.status_code == 200, response.text
    return response.json()


async def test_owner_all_statuses_operator_independent(client, attributed):
    stats = await read_view(client, attributed)
    assert stats['leader_breakdown'] == expected_breakdown(attributed)
    assert stats['attribution'] == {'direct': 1, 'leader_referral': 6, 'unknown': 2}
    assert stats['counts'] == {'pending': 2, 'approved': 3, 'waiting': 1, 'rejected': 1,
                               'cancelled': 2, 'applications': 9, 'correction_requested': 1, 'offer_holds': 0}


async def test_other_event_excluded(client, attributed):
    value = await read_view(client, attributed)
    assert value['counts']['applications'] == 9
    assert sum(row['applications'] for row in value['leader_breakdown']['leaders']) == 6


async def test_shared_stats_and_preview(client, attributed):
    stats = await read_view(client, attributed)
    preview = await read_view(client, attributed, suffix='closeout')
    assert stats['leader_breakdown'] == preview['leader_breakdown'] == expected_breakdown(attributed)
    assert stats['attribution'] == preview['attribution']
    assert preview['totals'] == {'capacity': 8, 'applications': 9, 'bookings': 3, 'cancelled': 2,
                                 'rejected': 1, 'pending': 2, 'waiting': 1, 'arrivals': 2,
                                 'booked_arrivals': 1, 'walkin_arrivals': 1, 'no_show': 1}
    assert stats['quota'] == {'online': {'capacity': 4, 'approved': 1, 'offer_holds': 0, 'available': 3},
                              'offline': {'capacity': 4, 'approved': 2, 'offer_holds': 0, 'available': 2}}


async def test_assignment_zero_and_sorted(client, db_session, monkeypatch):
    case = await seed_event(db_session, monkeypatch)
    value = (await read_view(client, case))['leader_breakdown']
    assert value == {'scope': 'event', 'basis': 'all_applications',
                     'leaders': sorted([leader_row(case, name, 0) for name in ['one', 'two', 'zero']],
                                       key=lambda row: row['leader_id']), 'unattributed_applications': 0}


@pytest.mark.parametrize('name,count', [('one', 3), ('two', 3), ('zero', 0)])
async def test_self_scope_and_zero(client, attributed, name, count):
    for suffix in ['stats', 'closeout']:
        value = (await read_view(client, attributed, name, suffix))['leader_breakdown']
        assert value == {'scope': 'self', 'basis': 'all_applications',
                         'leaders': [leader_row(attributed, name, count)], 'unattributed_applications': None}


@pytest.mark.parametrize('change', ['revoke', 'disable'])
async def test_revoked_disabled_history_retained(client, db_session, attributed, change):
    user = attributed['users']['two']
    if change == 'revoke':
        row = await state(db_session, 'leader:' + attributed['event'].public_id + ':' + user.id)
        row.data = {**row.data, 'active': False}
    else:
        await put(db_session, 'account:' + user.id, 'account', {'enabled': False})
    await db_session.commit()
    assert (await read_view(client, attributed))['leader_breakdown'] == expected_breakdown(attributed)
    for suffix in ['stats', 'closeout']:
        response = await client.get(PREFIX + '/events/' + attributed['event'].public_id + '/' + suffix,
                                    headers=auth(user))
        assert response.status_code == 403


@pytest.mark.parametrize('name,status', [(None, 401), ('user', 403), ('foreign', 403), ('unassigned', 403)])
async def test_unauthorized_scope(client, attributed, name, status):
    for suffix in ['stats', 'closeout']:
        response = await client.get(PREFIX + '/events/' + attributed['event'].public_id + '/' + suffix,
                                    headers=auth(attributed['users'][name]) if name else {})
        assert response.status_code == status
        assert 'leader_breakdown' not in response.json()


async def test_closeout_staff_get_owner_finalize(client, db_session, attributed):
    assert (await read_view(client, attributed, 'one', 'closeout'))['leader_breakdown']['scope'] == 'self'
    version = (await state(db_session, 'event:' + attributed['event'].public_id)).version
    response = await client.post(PREFIX + '/events/' + attributed['event'].public_id + '/closeout',
                                 headers=auth(attributed['users']['one']), json=envelope({
                                     'attendance_reconciled': True, 'no_unregistered_local_actions': True}, version))
    assert response.status_code == 403


async def test_missing_sidecar_read_only_unknown(client, db_session, attributed):
    missing = 'registration:' + attributed['regs'][-1].id
    assert await db_session.get(JourneyState, missing) is None
    before = await store_fingerprint(db_session)
    for suffix in ['stats', 'closeout']:
        value = await read_view(client, attributed, suffix=suffix)
        assert value['attribution']['unknown'] == 2
        assert value['leader_breakdown']['unattributed_applications'] == 3
    assert await db_session.get(JourneyState, missing) is None
    assert await store_fingerprint(db_session) == before


@pytest.mark.parametrize('kind', [None, 'not-recorded-kind'])
async def test_missing_id_invalid_source(client, db_session, attributed, kind):
    row = await state(db_session, 'registration:' + attributed['regs'][0].id)
    row.data = {**row.data, 'source_kind': kind, 'attributed_leader_id': None}
    await db_session.commit()
    for suffix in ['stats', 'closeout']:
        value = await read_view(client, attributed, suffix=suffix)
        assert value['attribution'] == {'direct': 1, 'leader_referral': 5, 'unknown': 3}
        assert value['leader_breakdown']['unattributed_applications'] == 4
        assert next(r for r in value['leader_breakdown']['leaders']
                    if r['leader_id'] == attributed['users']['one'].id)['applications'] == 2


async def test_missing_user_label(client, db_session, attributed):
    unknown_id = str(ulid.ULID())
    row = await state(db_session, 'registration:' + attributed['regs'][0].id)
    row.data = {**row.data, 'attributed_leader_id': unknown_id}
    await db_session.commit()
    value = (await read_view(client, attributed))['leader_breakdown']
    assert {'leader_id': unknown_id, 'leader_display_name': None, 'applications': 1} in value['leaders']
    assert sum(r['applications'] for r in value['leaders']) + value['unattributed_applications'] == 9


async def test_new_finalized_snapshot_immutable(client, db_session, attributed):
    receipt = await finalize(client, db_session, attributed)
    assert receipt['effects']['leader_breakdown'] == expected_breakdown(attributed)
    saved = await state(db_session, 'closeout:' + attributed['event'].public_id)
    original = copy.deepcopy(saved.data)
    leader = await db_session.get(UserModel, attributed['users']['one'].id)
    leader.username += '_changed'
    await db_session.commit()
    current = await read_view(client, attributed)
    assert next(row for row in current['leader_breakdown']['leaders']
                if row['leader_id'] == leader.id)['leader_display_name'].endswith('_changed')
    for _ in range(2):
        assert await read_view(client, attributed, suffix='closeout') == original
        received = await client.get(PREFIX + '/receipts/' + receipt['operation_id'],
                                    headers=auth(attributed['users']['owner']))
        assert received.json() == receipt


async def test_self_projection_does_not_mutate_saved(client, db_session, attributed):
    await finalize(client, db_session, attributed)
    saved = await state(db_session, 'closeout:' + attributed['event'].public_id)
    original = copy.deepcopy(saved.data)
    before = await store_fingerprint(db_session)
    value = await read_view(client, attributed, 'two', 'closeout')
    assert value['leader_breakdown'] == {'scope': 'self', 'basis': 'all_applications',
                                        'leaders': [leader_row(attributed, 'two', 3)],
                                        'unattributed_applications': None}
    assert {k: v for k, v in value.items() if k != 'leader_breakdown'} == {
        k: v for k, v in original.items() if k != 'leader_breakdown'}
    assert await read_view(client, attributed, suffix='closeout') == original
    assert await store_fingerprint(db_session) == before


async def test_legacy_snapshot_unchanged(client, db_session, attributed):
    original = await read_view(client, attributed, suffix='closeout')
    original.pop('leader_breakdown', None)
    original.update(state='finalized', legacy_marker='preserve')
    await put(db_session, 'closeout:' + attributed['event'].public_id, 'closeout', original, attributed['event'].id)
    await db_session.commit()
    before = await store_fingerprint(db_session)
    for name in ['owner', 'one', 'zero']:
        assert await read_view(client, attributed, name, 'closeout') == original
    assert await store_fingerprint(db_session) == before


async def test_new_snapshot_missing_own_row_zero(client, db_session, attributed):
    original = await read_view(client, attributed, suffix='closeout')
    original['state'] = 'finalized'
    original['leader_breakdown']['leaders'] = [r for r in original['leader_breakdown']['leaders']
                                               if r['leader_id'] != attributed['users']['zero'].id]
    await put(db_session, 'closeout:' + attributed['event'].public_id, 'closeout', original, attributed['event'].id)
    await db_session.commit()
    before = await store_fingerprint(db_session)
    value = await read_view(client, attributed, 'zero', 'closeout')
    assert value['leader_breakdown'] == {'scope': 'self', 'basis': 'all_applications',
                                        'leaders': [leader_row(attributed, 'zero', 0)],
                                        'unattributed_applications': None}
    assert await read_view(client, attributed, suffix='closeout') == original
    assert await store_fingerprint(db_session) == before


async def test_partial_sum_not_event_total(client, attributed):
    value = await read_view(client, attributed, 'one')
    assert value['leader_breakdown']['scope'] == 'self'
    assert sum(r['applications'] for r in value['leader_breakdown']['leaders']) < value['counts']['applications']
    assert value['leader_breakdown']['unattributed_applications'] is None


async def test_derived_get_no_writes(client, db_session, attributed):
    before = await store_fingerprint(db_session)
    for _ in range(2):
        for name in ['owner', 'one', 'zero']:
            for suffix in ['stats', 'closeout']:
                await read_view(client, attributed, name, suffix)
    assert await store_fingerprint(db_session) == before
