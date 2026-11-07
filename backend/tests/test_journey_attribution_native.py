"""Opt-in ordinary attribution fixtures; no supplemental token/migration probes."""
import copy
import os
from collections import Counter
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from src.core.database import Base, get_async_db
from src.main import app
from src.events.models import EventModel
from src.journey.models import JourneyState
from src.journey.policy import put, state
from src.registrations.models import RegistrationModel
from tests.test_demo_readiness import auth
from tests.test_journey_attribution import (
    PREFIX, seed_mixed, read_view, expected_breakdown, store_fingerprint, finalize,
)
from tests.test_phase2_native import native_evidence


@pytest.fixture
async def attribution_native_sessions():
    url = os.environ.get('NU_NATIVE_TEST_DATABASE_URL')
    if not url:
        pytest.skip('Dedicated native test DB opt-in required.')
    target = make_url(url)
    assert target.drivername == 'postgresql+asyncpg' and target.database.endswith('_test')
    assert target.host in {'127.0.0.1', 'localhost', '::1'}
    engine = create_async_engine(url, echo=False, hide_parameters=True)
    try:
        async with engine.begin() as connection:
            row = (await connection.execute(text(
                "SELECT current_database(), current_setting('server_version_num')::int, "
                "host(inet_server_addr()), (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)"))).one()
            assert row[0] == target.database and row[1] // 10000 == 17
            assert row[2] in {'127.0.0.1', '::1'} and row[3] is False
            await connection.run_sync(Base.metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    finally:
        await engine.dispose()


@asynccontextmanager
async def native_client(sessions):
    async def database():
        async with sessions() as db:
            yield db
    previous = app.dependency_overrides.get(get_async_db)
    app.dependency_overrides[get_async_db] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://native.test') as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_async_db, None)
        else:
            app.dependency_overrides[get_async_db] = previous


async def actual_aggregates(sessions, case):
    """Fresh READ ONLY SELECTs, independent of the product aggregation helper."""
    async with sessions() as db:
        await db.execute(text('SET TRANSACTION READ ONLY'))
        event = await db.get(EventModel, case['event'].id)
        rows = (await db.scalars(select(RegistrationModel).where(RegistrationModel.event_id == event.id))).all()
        states = (await db.scalars(select(JourneyState).where(JourneyState.event_id == event.id))).all()
        metadata = {row.key.removeprefix('registration:'): row.data for row in states if row.kind == 'registration'}
        by_status = Counter(row.status.value for row in rows)
        sources = Counter()
        leaders = Counter()
        correction = 0
        for row in rows:
            item = metadata.get(row.id, {})
            kind = item.get('source_kind')
            sources[kind if kind in {'direct', 'leader_referral', 'unknown'} else 'unknown'] += 1
            if item.get('attributed_leader_id'):
                leaders[item['attributed_leader_id']] += 1
            correction += row.status.value == 'pending' and item.get('review') == 'correction_requested'
        arrived = {row.data['registration_id'] for row in states
                   if row.kind == 'attendance' and row.data['state'] == 'arrived'}
        booked = [row for row in rows if row.status.value == 'approved' and row.channel.value != 'walkin']
        walkins = [row for row in rows if row.status.value == 'approved' and row.channel.value == 'walkin']
        quota = {}
        for pool in ['online', 'offline']:
            approved = sum(row.status.value == 'approved' and
                           ('online' if row.channel.value == 'online' else 'offline') == pool for row in rows)
            capacity = getattr(event, pool + '_quota')
            quota[pool] = {'capacity': capacity, 'approved': approved, 'offer_holds': 0, 'available': capacity - approved}
        return {
            'sources': {kind: sources[kind] for kind in ['direct', 'leader_referral', 'unknown']},
            'leaders': dict(leaders), 'unattributed': len(rows) - sum(leaders.values()),
            'counts': {**{status: by_status[status] for status in ['pending', 'approved', 'waiting', 'rejected', 'cancelled']},
                       'applications': len(rows), 'correction_requested': correction, 'offer_holds': 0},
            'quota': quota,
            'totals': {'capacity': event.online_quota + event.offline_quota, 'applications': len(rows),
                       'bookings': len(booked) + len(walkins), 'cancelled': by_status['cancelled'],
                       'rejected': by_status['rejected'], 'pending': by_status['pending'], 'waiting': by_status['waiting'],
                       'arrivals': len(arrived), 'booked_arrivals': sum(row.id in arrived for row in booked),
                       'walkin_arrivals': sum(row.id in arrived for row in walkins),
                       'no_show': sum(row.id not in arrived for row in booked)}}


async def fingerprint(sessions):
    async with sessions() as db:
        await db.execute(text('SET TRANSACTION READ ONLY'))
        return await store_fingerprint(db)


async def saved_bytes(sessions, case):
    async with sessions() as db:
        await db.execute(text('SET TRANSACTION READ ONLY'))
        return (await db.execute(text('SELECT version, data::text FROM journey_state WHERE key=:key'),
                                 {'key': 'closeout:' + case['event'].public_id})).one()


async def test_native_mixed_stats_preview_actual_rows(attribution_native_sessions, monkeypatch):
    sessions = attribution_native_sessions
    async with sessions() as db:
        case = await seed_mixed(db, monkeypatch)
    actual = await actual_aggregates(sessions, case)
    assert actual['counts']['applications'] == 9 and actual['totals']['no_show'] == 1
    assert actual['sources'] == {'direct': 1, 'leader_referral': 6, 'unknown': 2}
    before = await fingerprint(sessions)
    async with native_client(sessions) as client:
        stats = await read_view(client, case)
        preview = await read_view(client, case, suffix='closeout')
        assert stats['source'] == preview['definitions']['source'] == 'native_postgresql'
        assert stats['counts'] == actual['counts']
        assert stats['quota'] == actual['quota']
        assert preview['totals'] == actual['totals']
        assert stats['attribution'] == preview['attribution'] == actual['sources']
        assert stats['leader_breakdown'] == preview['leader_breakdown'] == expected_breakdown(case)
        for row in stats['leader_breakdown']['leaders']:
            assert row['applications'] == actual['leaders'].get(row['leader_id'], 0)
        assert stats['leader_breakdown']['unattributed_applications'] == actual['unattributed']
        assert preview['pending_attendance_count'] == preview['active_offer_count'] == 0
        for name in ['one', 'two', 'zero']:
            own = await read_view(client, case, name)
            assert own['leader_breakdown']['scope'] == 'self'
            assert [row['leader_id'] for row in own['leader_breakdown']['leaders']] == [case['users'][name].id]
            assert own['leader_breakdown']['unattributed_applications'] is None
    assert await fingerprint(sessions) == before
    native_evidence('attribution-aggregate', {'status': 'PASS', 'actual_native_rows': actual,
                                            'owner_breakdown': stats['leader_breakdown'], 'get_no_writes': True})


async def test_native_recorded_history_revoked_and_disabled(attribution_native_sessions, monkeypatch):
    sessions = attribution_native_sessions
    async with sessions() as db:
        case = await seed_mixed(db, monkeypatch)
        row = await state(db, 'leader:' + case['event'].public_id + ':' + case['users']['two'].id)
        row.data = {**row.data, 'active': False}
        await put(db, 'account:' + case['users']['one'].id, 'account', {'enabled': False})
        await db.commit()
    before = await fingerprint(sessions)
    async with native_client(sessions) as client:
        assert (await read_view(client, case))['leader_breakdown'] == expected_breakdown(case)
        for name in ['one', 'two', 'foreign', 'unassigned', 'user']:
            for suffix in ['stats', 'roster', 'closeout']:
                response = await client.get(PREFIX + '/events/' + case['event'].public_id + '/' + suffix,
                                            headers=auth(case['users'][name]))
                assert response.status_code == 403
    assert await fingerprint(sessions) == before


async def test_native_finalized_snapshot_owner_self_immutable(attribution_native_sessions, monkeypatch):
    sessions = attribution_native_sessions
    async with sessions() as db:
        case = await seed_mixed(db, monkeypatch)
    async with native_client(sessions) as client:
        async with sessions() as db:
            receipt = await finalize(client, db, case)
        original = await read_view(client, case, suffix='closeout')
        raw = await saved_bytes(sessions, case)
        actual = await actual_aggregates(sessions, case)
        assert original['totals'] == actual['totals']
        assert original['leader_breakdown'] == receipt['effects']['leader_breakdown'] == expected_breakdown(case)
        for name in ['one', 'two', 'zero']:
            projected = await read_view(client, case, name, 'closeout')
            assert projected['leader_breakdown']['scope'] == 'self'
            assert [row['leader_id'] for row in projected['leader_breakdown']['leaders']] == [case['users'][name].id]
            assert {k: v for k, v in projected.items() if k != 'leader_breakdown'} == {
                k: v for k, v in original.items() if k != 'leader_breakdown'}
        assert await read_view(client, case, suffix='closeout') == original
        assert await saved_bytes(sessions, case) == raw
        replay = await client.get(PREFIX + '/receipts/' + receipt['operation_id'], headers=auth(case['users']['owner']))
        assert replay.status_code == 200 and replay.json() == receipt
    native_evidence('attribution-finalized', {'status': 'PASS', 'totals': actual['totals'],
                                            'saved_json_and_version_unchanged': True})


async def test_native_legacy_snapshot_no_backfill(attribution_native_sessions, monkeypatch):
    sessions = attribution_native_sessions
    async with sessions() as db:
        case = await seed_mixed(db, monkeypatch)
    async with native_client(sessions) as client:
        original = await read_view(client, case, suffix='closeout')
        original = copy.deepcopy(original)
        original.pop('leader_breakdown')
        original['state'] = 'finalized'
        async with sessions() as db:
            await put(db, 'closeout:' + case['event'].public_id, 'closeout', original, case['event'].id)
            await db.commit()
        raw = await saved_bytes(sessions, case)
        before = await fingerprint(sessions)
        for name in ['owner', 'one', 'zero']:
            assert await read_view(client, case, name, 'closeout') == original
        assert await saved_bytes(sessions, case) == raw
        assert await fingerprint(sessions) == before
