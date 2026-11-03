"""Ordinary sequential native AC fixtures; not the two denied supplemental probes."""
import pytest

from tests.test_journey_attribution_native import attribution_native_sessions, native_client
from tests.test_journey_acceptance_edges import reminder_case, event_notice_case, fifo_case, window_case, scope_case, roster_limit_case


@pytest.mark.parametrize('position', ['before', 'due', 'start', 'after'])
async def test_native_reminder_edges(attribution_native_sessions, monkeypatch, position):
    async with attribution_native_sessions() as db:
        async with native_client(attribution_native_sessions) as client:
            await reminder_case(client, db, monkeypatch, position)


async def test_native_event_notice_bindings(attribution_native_sessions, monkeypatch):
    async with attribution_native_sessions() as db:
        async with native_client(attribution_native_sessions) as client:
            await event_notice_case(client, db, monkeypatch)


async def test_native_fifo_expiry(attribution_native_sessions, monkeypatch):
    async with attribution_native_sessions() as db:
        async with native_client(attribution_native_sessions) as client:
            await fifo_case(client, db, monkeypatch)


@pytest.mark.parametrize('operation', ['applications', 'attendance/intents', 'attendance', 'walkins'])
@pytest.mark.parametrize('edge', ['before', 'open', 'close', 'after'])
async def test_native_registration_checkin_windows(attribution_native_sessions, monkeypatch, operation, edge):
    async with attribution_native_sessions() as db:
        async with native_client(attribution_native_sessions) as client:
            await window_case(client, db, monkeypatch, operation, edge)


@pytest.mark.parametrize('suffix', ['stats', 'roster', 'closeout'])
@pytest.mark.parametrize('caller', [None, 'foreign', 'user', 'unassigned', 'revoked', 'disabled'])
async def test_native_staff_get_denials(attribution_native_sessions, monkeypatch, suffix, caller):
    async with attribution_native_sessions() as db:
        async with native_client(attribution_native_sessions) as client:
            await scope_case(client, db, monkeypatch, suffix, caller)


async def test_native_roster_response_limit(attribution_native_sessions, monkeypatch):
    async with attribution_native_sessions() as db:
        async with native_client(attribution_native_sessions) as client:
            await roster_limit_case(client, db, monkeypatch)
