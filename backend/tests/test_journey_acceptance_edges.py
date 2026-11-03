"""Original AC edge assertions; controlled fixture evidence, no provider delivery."""
import copy
import importlib
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from src.events.models import EventModel, EventStatusEnum
from src.journey import allocation, policy
from src.journey.models import JourneyOperation, JourneyState
from src.journey.policy import iso, put, state
from src.registrations.models import RegistrationModel, RegistrationStatusEnum as Status, RegistrationChannelEnum as Channel
from tests.test_demo_readiness import auth
from tests.test_journey import envelope
from tests.test_journey_attribution import PREFIX, seed_event, add_registration, store_fingerprint

journey_router = importlib.import_module('src.journey.router')


def clock_at(monkeypatch, instant):
    for module in [journey_router, policy, allocation]:
        monkeypatch.setattr(module, 'now', lambda: instant)


async def send(client, db, case, suffix, data, name='owner'):
    version = (await state(db, 'event:' + case['event'].public_id)).version
    return await client.post(PREFIX + '/events/' + case['event'].public_id + '/' + suffix,
                             headers=auth(case['users'][name]), json=envelope(data, version))


async def outbox(db, case, kind):
    rows = (await db.scalars(select(JourneyState).where(
        JourneyState.event_id == case['event'].id, JourneyState.kind == 'outbox'))).all()
    return [copy.deepcopy(row.data) for row in rows if row.data['kind'] == kind]


async def bound_messages(db, case, kind, expected_ids, message, expected_hint=None):
    rows = await outbox(db, case, kind)
    assert {row['registration_id'] for row in rows} == set(expected_ids)
    assert len(rows) == len(expected_ids)
    for row in rows:
        assert row['event_public_id'] == case['event'].public_id
        assert row['recipient_binding'] == 'registration'
        assert row['recipient_hint'].startswith('***')
        if expected_hint is not None:
            assert row['recipient_hint'] == expected_hint
        assert row['message'] == message
        assert row['provider'] == 'DEMO_OUTBOX' and row['external_delivery'] is False
    return rows


async def reminder_case(client, db, monkeypatch, position):
    case = await seed_event(db, monkeypatch)
    event = await db.get(EventModel, case['event'].id)
    start = case['clock'] + timedelta(hours=2)
    event.start_time = start
    event.end_time = start + timedelta(hours=1)
    work = await state(db, 'event:' + event.public_id)
    work.data = {**work.data, 'policy': {**work.data['policy'], 'reminder_hours': 1}}
    regs = [await add_registration(db, case, status=status) for status in Status]
    await add_registration(db, case, status=Status.approved, event=case['other_event'])
    await db.commit()
    times = {'before': start - timedelta(hours=1, microseconds=1), 'due': start - timedelta(hours=1),
             'start': start, 'after': start + timedelta(microseconds=1)}
    clock_at(monkeypatch, times[position])
    first = await send(client, db, case, 'reminders', {})
    assert first.status_code == 200, first.text
    expected = [reg.id for reg, status in zip(regs, Status) if status == Status.approved] if position in {'due', 'start'} else []
    rows = await bound_messages(db, case, 'reminder', expected, 'Synthetic event reminder.')
    assert all(row['scheduled_at'] == iso(start) for row in rows)
    count = len(rows)
    replay = await client.post(first.request.url, headers=auth(case['users']['owner']),
                               content=first.request.content)
    assert replay.status_code == 200 and replay.json() == first.json()
    again = await send(client, db, case, 'reminders', {})
    assert again.status_code == 200
    assert len(await outbox(db, case, 'reminder')) == count
    for mode in ['postponed', 'cancelled']:
        work = await state(db, 'event:' + case['event'].public_id)
        work.data = {**work.data, 'state': mode}
        await db.commit()
        response = await send(client, db, case, 'reminders', {})
        if mode == 'postponed':
            assert response.status_code == 200 and response.json()['effects']['outbox_ids'] == []
        else:
            assert response.status_code == 409 and response.json()['detail']['code'] == 'EVENT_CLOSED'
        assert len(await outbox(db, case, 'reminder')) == count


@pytest.mark.parametrize('position', ['before', 'due', 'start', 'after'])
async def test_reminders_schedule_recipients_and_dedupe(client, db_session, monkeypatch, position):
    await reminder_case(client, db_session, monkeypatch, position)


async def registration_bindings(db, case):
    rows = (await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id == case['event'].id)
                             .execution_options(populate_existing=True))).all()
    result = {}
    for row in rows:
        meta = await state(db, 'registration:' + row.id)
        result[row.id] = {'status': row.status.value, 'event_id': row.event_id, 'participant_id': row.participant_id,
                          'channel': row.channel.value, 'operator': row.created_by_user_id,
                          'attribution': {k: meta.data[k] for k in ['attributed_leader_id', 'source_kind', 'entry_operator_id']}}
    return result


async def event_notice_case(client, db, monkeypatch):
    case = await seed_event(db, monkeypatch)
    regs = [await add_registration(db, case, status=status, leader='one') for status in Status]
    await db.commit()
    original = await registration_bindings(db, case)
    waiting = next(key for key, value in original.items() if value['status'] == 'waiting')
    offer_id = str(uuid4())
    await put(db, 'offer:' + offer_id, 'offer', {'id': offer_id, 'registration_id': waiting,
              'pool': 'offline', 'state': 'offered', 'expires_at': iso(case['clock'] + timedelta(hours=1))}, case['event'].id)
    await db.commit()
    data = {'start_time': iso(case['clock'] + timedelta(days=1)), 'end_time': iso(case['clock'] + timedelta(days=1, hours=1)),
            'registration_closes_at': iso(case['clock'] + timedelta(hours=20)),
            'checkin_opens_at': iso(case['clock'] + timedelta(hours=23)),
            'checkin_closes_at': iso(case['clock'] + timedelta(days=1, hours=2)), 'notice': 'Synthetic revised schedule'}
    response = await send(client, db, case, 'postpone', data)
    assert response.status_code == 200, response.text
    assert await registration_bindings(db, case) == original
    assert (await state(db, 'offer:' + offer_id)).data['state'] == 'invalidated'
    affected = [key for key, value in original.items() if value['status'] in {'pending', 'approved', 'waiting'}]
    await bound_messages(db, case, 'event_changed', affected, data['notice'])
    replay = await client.post(response.request.url, headers=auth(case['users']['owner']), content=response.request.content)
    assert replay.status_code == 200 and replay.json() == response.json()
    await bound_messages(db, case, 'event_changed', affected, data['notice'])
    assert await registration_bindings(db, case) == original
    resumed = await send(client, db, case, 'resume', {'notice': 'Synthetic resumed schedule'})
    assert resumed.status_code == 200, resumed.text
    resumed_receipt = resumed.json()
    view = await client.get(PREFIX + '/events/' + case['event'].public_id, headers=auth(case['users']['owner']))
    assert view.status_code == 200
    value = view.json()
    assert value['workflow']['state'] == resumed_receipt['effects']['state'] == 'published'
    assert value['workflow']['version'] == resumed_receipt['resource_version']
    assert value['workflow']['change_notice'] == 'Synthetic resumed schedule'
    for key in ['start_time', 'end_time']:
        assert policy.dt(value['event'][key]) == policy.dt(data[key])
    assert value['workflow']['registration_closes_at'] == data['registration_closes_at']
    assert await registration_bindings(db, case) == original
    await bound_messages(db, case, 'event_changed', affected, data['notice'])
    await bound_messages(db, case, 'waitlist_offer', [waiting],
                         'A synthetic booking place is offered; accept before expiry.', expected_hint='***IC')
    counts = await allocation.counts(db, await db.get(EventModel, case['event'].id, populate_existing=True))
    assert counts['offline'] == {'capacity': 4, 'approved': 1, 'offer_holds': 1}
    assert counts['online'] == {'capacity': 4, 'approved': 0, 'offer_holds': 0}
    before_resume_replay = await store_fingerprint(db)
    replay = await client.post(resumed.request.url, headers=auth(case['users']['owner']), content=resumed.request.content)
    assert replay.status_code == 200 and replay.json() == resumed_receipt
    assert await store_fingerprint(db) == before_resume_replay
    receipt_read = await client.get(PREFIX + '/receipts/' + resumed_receipt['operation_id'],
                                    headers=auth(case['users']['owner']))
    assert receipt_read.status_code == 200 and receipt_read.json() == resumed_receipt
    await bound_messages(db, case, 'waitlist_offer', [waiting],
                         'A synthetic booking place is offered; accept before expiry.', expected_hint='***IC')
    cancelled = await send(client, db, case, 'cancel', {'reason': 'Synthetic cancelled event'})
    assert cancelled.status_code == 200, cancelled.text
    after = await registration_bindings(db, case)
    assert set(after) == set(original)
    for key, row in original.items():
        assert {k: v for k, v in after[key].items() if k != 'status'} == {k: v for k, v in row.items() if k != 'status'}
        assert after[key]['status'] == ('cancelled' if key in affected else row['status'])
    await bound_messages(db, case, 'cancellation', affected, 'Synthetic cancelled event')
    replay = await client.post(cancelled.request.url, headers=auth(case['users']['owner']), content=cancelled.request.content)
    assert replay.status_code == 200 and replay.json() == cancelled.json()
    await bound_messages(db, case, 'cancellation', affected, 'Synthetic cancelled event')


async def test_postpone_and_cancel_preserve_bindings_and_notices(client, db_session, monkeypatch):
    await event_notice_case(client, db_session, monkeypatch)


async def test_arrived_booking_blocks_event_cancel(client, db_session, monkeypatch):
    case = await seed_event(db_session, monkeypatch)
    await add_registration(db_session, case, status=Status.approved, arrived=True)
    await db_session.commit()
    before = await store_fingerprint(db_session)
    response = await send(client, db_session, case, 'cancel', {'reason': 'Synthetic refusal'})
    assert response.status_code == 409 and response.json()['detail']['code'] == 'INVALID_TRANSITION'
    assert await store_fingerprint(db_session) == before


async def fifo_case(client, db, monkeypatch):
    case = await seed_event(db, monkeypatch)
    event = await db.get(EventModel, case['event'].id)
    event.online_quota = 1
    regs = [await add_registration(db, case, status=Status.waiting, channel=Channel.online) for _ in range(4)]
    ids = [reg.id for reg in regs]
    for index, reg in enumerate(regs):
        reg.waitlisted_at = case['clock'] - timedelta(minutes=10 - index)
    bad = await state(db, 'registration:' + ids[1])
    bad.data = {**bad.data, 'review': 'correction_requested'}
    offer = str(uuid4())
    await put(db, 'offer:' + offer, 'offer', {'id': offer, 'registration_id': ids[0], 'pool': 'online',
              'state': 'offered', 'expires_at': iso(case['clock'])}, case['event'].id)
    await db.commit()
    clock_at(monkeypatch, case['clock'])
    first = await send(client, db, case, 'offers/reconcile', {})
    assert first.status_code == 200, first.text
    rows = (await db.scalars(select(JourneyState).where(JourneyState.event_id == case['event'].id,
                                                       JourneyState.kind == 'offer'))).all()
    offers = [copy.deepcopy(row.data) for row in rows]
    assert next(row for row in offers if row['id'] == offer)['state'] == 'expired'
    assert [row['registration_id'] for row in offers if row['state'] == 'offered'] == [ids[2]]
    assert (await state(db, 'registration:' + ids[0])).data['offer_expired'] is True
    await bound_messages(db, case, 'offer_expired', [ids[0]], 'Your synthetic offer expired.')
    await bound_messages(db, case, 'waitlist_offer', [ids[2]], 'A synthetic booking place is offered; accept before expiry.')
    again = await send(client, db, case, 'offers/reconcile', {})
    assert again.status_code == 200
    rows = (await db.scalars(select(JourneyState).where(JourneyState.event_id == case['event'].id,
                                                       JourneyState.kind == 'offer'))).all()
    assert len(rows) == 2 and sum(row.data['state'] == 'offered' for row in rows) == 1
    assert all(row.status == Status.waiting for row in (await db.scalars(
        select(RegistrationModel).where(RegistrationModel.id.in_(ids)))).all())
    counts = await allocation.counts(db, await db.get(EventModel, case['event'].id))
    assert counts['online']['approved'] + counts['online']['offer_holds'] <= counts['online']['capacity']


async def test_expired_offer_moves_to_next_eligible_fifo(client, db_session, monkeypatch):
    await fifo_case(client, db_session, monkeypatch)


async def window_case(client, db, monkeypatch, operation, edge):
    case = await seed_event(db, monkeypatch)
    opening = case['clock']
    closing = opening + timedelta(minutes=10)
    work = await state(db, 'event:' + case['event'].public_id)
    work.data = {**work.data, 'registration_opens_at': iso(opening), 'registration_closes_at': iso(closing),
                 'policy': {**work.data['policy'], 'checkin_opens_at': iso(opening), 'checkin_closes_at': iso(closing)}}
    form = {'first_name': 'Synthetic', 'last_name': 'Window', 'gender': 'female', 'date_of_birth': '1990-01-01',
            'phone': 'SYNTHETIC', 'national_id': 'EDGE-' + str(uuid4())}
    attendance_id = str(uuid4())
    if operation == 'applications':
        data = {'application': form, 'source': {'kind': 'direct', 'referral_code': None}}
    elif operation == 'walkins':
        data = {'application': form, 'eligibility_confirmed': True, 'eligibility_note': 'Synthetic eligibility'}
    else:
        reg = await add_registration(db, case, status=Status.approved)
        data = {'device_id': 'synthetic', 'attendance_operation_id': attendance_id, 'registration_id': reg.id}
        if operation == 'attendance':
            await put(db, 'attendance:' + attendance_id, 'attendance', {'operation_id': attendance_id,
                      'state': 'pending', 'registration_id': reg.id, 'recorded_at': iso(opening),
                      'device_id': 'synthetic', 'actor_id': case['users']['owner'].id}, case['event'].id)
    await db.commit()
    instant = {'before': opening - timedelta(microseconds=1), 'open': opening,
               'close': closing, 'after': closing + timedelta(microseconds=1)}[edge]
    clock_at(monkeypatch, instant)
    before = await store_fingerprint(db)
    response = await send(client, db, case, operation, data)
    if edge in {'before', 'after'}:
        assert response.status_code == 409 and response.json()['detail']['code'] == 'WINDOW_CLOSED'
        assert await store_fingerprint(db) == before
    else:
        assert response.status_code == 200, response.text
        if operation.startswith('attendance'):
            assert (await state(db, 'attendance:' + attendance_id)).data['state'] == ('arrived' if operation == 'attendance' else 'pending')
        elif operation == 'walkins':
            assert response.json()['effects']['status'] == 'approved'
        else:
            assert response.json()['effects']['status'] == 'pending'


@pytest.mark.parametrize('operation', ['applications', 'attendance/intents', 'attendance', 'walkins'])
@pytest.mark.parametrize('edge', ['before', 'open', 'close', 'after'])
async def test_registration_and_checkin_window_edges(client, db_session, monkeypatch, operation, edge):
    await window_case(client, db_session, monkeypatch, operation, edge)


async def scope_case(client, db, monkeypatch, suffix, caller):
    case = await seed_event(db, monkeypatch)
    name = caller
    if caller == 'revoked':
        name = 'one'
        row = await state(db, 'leader:' + case['event'].public_id + ':' + case['users'][name].id)
        row.data = {**row.data, 'active': False}
    elif caller == 'disabled':
        name = 'one'
        await put(db, 'account:' + case['users'][name].id, 'account', {'enabled': False})
    await db.commit()
    before = await store_fingerprint(db)
    response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/' + suffix,
                                headers=auth(case['users'][name]) if name else {})
    assert response.status_code == (401 if name is None else 403)
    assert await store_fingerprint(db) == before


@pytest.mark.parametrize('suffix', ['stats', 'roster', 'closeout'])
@pytest.mark.parametrize('caller', [None, 'foreign', 'user', 'unassigned', 'revoked', 'disabled'])
async def test_staff_read_denials(client, db_session, monkeypatch, suffix, caller):
    await scope_case(client, db_session, monkeypatch, suffix, caller)


async def test_roster_search_approved_event_scope(client, db_session, monkeypatch):
    case = await seed_event(db_session, monkeypatch)
    approved = await add_registration(db_session, case, status=Status.approved)
    approved.first_name = 'Searchable'
    approved.last_name = 'SyntheticSurname'
    approved.phone = 'SYNTHETIC77'
    reg_id = approved.id
    await add_registration(db_session, case)
    await add_registration(db_session, case, status=Status.approved, event=case['other_event'])
    await db_session.commit()
    for query in ['SEARCHABLE', 'syntheticsurname', '77', '']:
        response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/roster',
                                    params={'query': query}, headers=auth(case['users']['one']))
        assert response.status_code == 200
        rows = response.json()['rows']
        assert [row['registration_id'] for row in rows] == [reg_id]
        assert rows[0]['phone_hint'] == '***77'
        assert set(rows[0]) == {'registration_id', 'first_name', 'last_name', 'phone_hint',
                                'status', 'arrived', 'attendance_operation_id'}
    response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/roster',
                                params={'query': 'x' * 101}, headers=auth(case['users']['one']))
    assert response.status_code == 422


async def roster_limit_case(client, db, monkeypatch):
    case = await seed_event(db, monkeypatch)
    ids = {reg.id for reg in [await add_registration(db, case, status=Status.approved) for _ in range(201)]}
    await db.commit()
    response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/roster',
                                headers=auth(case['users']['one']))
    assert response.status_code == 200
    returned = [row['registration_id'] for row in response.json()['rows']]
    assert len(returned) == len(set(returned)) == 200
    assert set(returned) < ids


async def test_roster_response_limit(client, db_session, monkeypatch):
    await roster_limit_case(client, db_session, monkeypatch)


async def promotion_approval_denial_case(client, db, monkeypatch, approved):
    case = await seed_event(db, monkeypatch)
    url = PREFIX + '/events/' + case['event'].public_id + '/promotion'
    draft = await client.post(url, headers=auth(case['users']['one']),
                              json=envelope({'text': 'Synthetic promotion draft'}, 0))
    assert draft.status_code == 200, draft.text
    original_receipt = draft.json()
    if approved:
        owner = await client.post(url + '/approve', headers=auth(case['users']['owner']),
                                  json=envelope({}, original_receipt['resource_version']))
        assert owner.status_code == 200, owner.text
        original_receipt = owner.json()
    before_view = await client.get(url, headers=auth(case['users']['owner']))
    assert before_view.status_code == 200
    original = before_view.json()
    assert original['state'] == ('approved' if approved else 'draft')
    before = await store_fingerprint(db)
    attempted = envelope({}, original['version'])
    denied = await client.post(url + '/approve', headers=auth(case['users']['one']), json=attempted)
    assert denied.status_code == 403, denied.text
    assert (await client.get(url, headers=auth(case['users']['owner']))).json() == original
    assert await db.get(JourneyOperation, attempted['operation_id']) is None
    stored = await db.get(JourneyOperation, original_receipt['operation_id'], populate_existing=True)
    assert stored.receipt == original_receipt
    assert await store_fingerprint(db) == before


@pytest.mark.parametrize('approved', [False, True])
async def test_promotion_approval_denial(client, db_session, monkeypatch, approved):
    await promotion_approval_denial_case(client, db_session, monkeypatch, approved)


async def demand_threshold_case(client, db, monkeypatch, approved):
    case = await seed_event(db, monkeypatch)
    for index in range(approved):
        await add_registration(db, case, status=Status.approved,
                               channel=Channel.online if index < 4 else Channel.offline)
    await db.commit()
    before = await store_fingerprint(db)
    response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/stats',
                                headers=auth(case['users']['owner']))
    assert response.status_code == 200
    alert = response.json()['alert']
    assert alert == {'policy_id': 'demo-low-demand-v1', 'threshold': 0.5, 'observed_ratio': approved / 8,
                     'definition': 'approved / total capacity',
                     'state': 'below_threshold' if approved == 3 else 'normal'}
    rows = (await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id == case['event'].id)
                             .execution_options(populate_existing=True))).all()
    assert sum(row.status == Status.approved for row in rows) == approved
    assert await store_fingerprint(db) == before
    first = await send(client, db, case, 'alerts', {})
    assert first.status_code == 200, first.text
    rows = await outbox(db, case, 'alert')
    assert len(rows) == (1 if approved == 3 else 0)
    if approved == 3:
        row = rows[0]
        assert row['id'] == first.json()['effects']['outbox_id']
        assert row['event_public_id'] == case['event'].public_id and row['registration_id'] is None
        assert row['recipient_binding'] == 'registration' and row['recipient_hint'] == 'Organizer'
        assert row['provider'] == 'DEMO_OUTBOX' and row['external_delivery'] is False
        assert row['message'] == 'Synthetic demand below configured threshold.'
    else:
        assert 'outbox_id' not in first.json()['effects']
    replay = await client.post(first.request.url, headers=auth(case['users']['owner']), content=first.request.content)
    assert replay.status_code == 200 and replay.json() == first.json()
    again = await send(client, db, case, 'alerts', {})
    assert again.status_code == 200
    assert await outbox(db, case, 'alert') == rows
    if approved == 3:
        assert again.json()['effects']['outbox_id'] == first.json()['effects']['outbox_id']


@pytest.mark.parametrize('approved', [3, 4, 5])
async def test_demand_threshold(client, db_session, monkeypatch, approved):
    await demand_threshold_case(client, db_session, monkeypatch, approved)


async def corrected_outcome_case(client, db, monkeypatch, actor):
    case = await seed_event(db, monkeypatch)
    reg = await add_registration(db, case, status=Status.approved, leader='one', operator='one')
    reg.phone = 'SYNTHETIC11'
    reg_id = reg.id
    await add_registration(db, case)
    await db.commit()
    url = PREFIX + '/registrations/' + reg_id
    before_view = await client.get(url, headers=auth(case['users'][actor]))
    assert before_view.status_code == 200
    original = before_view.json()
    corrected = await client.post(url + '/correction', headers=auth(case['users'][actor]),
                                  json=envelope({'phone': 'SYNTHETIC22', 'note': 'Synthetic contact correction'},
                                                original['version']))
    assert corrected.status_code == 200, corrected.text
    receipt = corrected.json()
    view = await client.get(url, headers=auth(case['users'][actor]))
    assert view.status_code == 200
    value = view.json()
    assert value['booking_state'] == 'pending' and value['review']['state'] == 'awaiting_review'
    assert value['attribution'] == original['attribution']
    updated = await db.get(RegistrationModel, reg_id, populate_existing=True)
    assert updated.phone == 'SYNTHETIC22' and updated.event_id == case['event'].id
    await bound_messages(db, case, 'correction', [reg_id],
                         'Synthetic application updated; awaiting review.', expected_hint='***22')
    operation = await db.get(JourneyOperation, receipt['operation_id'], populate_existing=True)
    assert operation.actor == case['users'][actor].id and operation.event_id == case['event'].id
    assert operation.receipt == receipt
    assert receipt['kind'] == 'registration_correction' and receipt['resource_id'] == reg_id
    assert receipt['effects'] == {'registration_id': reg_id, 'status': 'pending'}
    before_replay = await store_fingerprint(db)
    replay = await client.post(corrected.request.url, headers=auth(case['users'][actor]), content=corrected.request.content)
    assert replay.status_code == 200 and replay.json() == receipt
    await bound_messages(db, case, 'correction', [reg_id],
                         'Synthetic application updated; awaiting review.', expected_hint='***22')
    assert await store_fingerprint(db) == before_replay


@pytest.mark.parametrize('actor', ['one', 'owner'])
async def test_corrected_outcome(client, db_session, monkeypatch, actor):
    await corrected_outcome_case(client, db_session, monkeypatch, actor)
