"""Controlled ASGI/SQLite checks for W9 application identity refusals."""
from sqlalchemy import func, select

from src.journey.models import JourneyOperation
from src.participants.models import ParticipantModel
from src.registrations.models import RegistrationModel, RegistrationStatusEnum
from tests.test_demo_readiness import FORM, PUBLIC, actors, auth
from tests.test_journey import P, envelope, managed, mutation


async def application_counts(db):
    return tuple([
        await db.scalar(select(func.count()).select_from(model))
        for model in (ParticipantModel, RegistrationModel, JourneyOperation)
    ])


async def test_existing_identity_refusal_allows_a_new_corrected_application(client, db_session, managed):
    public, users = managed
    await mutation(client, public, users['org'], 'publish', {})
    headers = auth(users['a'])
    original = await client.post(f'/api/v1/events/{PUBLIC}/registrations', headers=headers, json=FORM)
    assert original.status_code == 201, original.text
    participant_id = original.json()['participant_id']
    baseline = await application_counts(db_session)

    url = f'{P}/events/{public}/applications'
    data = {'application': FORM, 'source': {'kind': 'direct', 'referral_code': None}}
    refused = envelope({**data, 'application': {**FORM, 'national_id': 'TEST-W9-MISMATCH'}})
    rejected = await client.post(url, headers=headers, json=refused)
    refused_receipt = await client.get(f"{P}/receipts/{refused['operation_id']}", headers=headers)
    assert refused_receipt.status_code == 404
    assert await application_counts(db_session) == baseline
    assert rejected.status_code == 422, rejected.text
    assert rejected.json()['detail'] == {'code': 'INVALID_INPUT', 'message': 'Invalid input'}

    corrected = envelope(data)
    assert corrected['operation_id'] != refused['operation_id']
    applied = await client.post(url, headers=headers, json=corrected)
    assert applied.status_code == 200, applied.text
    receipt = applied.json()
    registration_id = receipt['resource_id']
    assert receipt['operation_id'] == corrected['operation_id']
    assert receipt['effects'] == {'registration_id': registration_id, 'status': 'pending'}
    corrected_receipt_url = f"{P}/receipts/{corrected['operation_id']}"
    readback = await client.get(corrected_receipt_url, headers=headers)
    assert readback.status_code == 200 and readback.json() == receipt

    changed = {**corrected, 'data': {**data, 'application': {**FORM, 'first_name': 'Changed'}}}
    collision = await client.post(url, headers=headers, json=changed)
    assert collision.status_code == 409
    assert collision.json()['detail']['code'] == 'IMMUTABLE_CONFLICT'
    duplicate = await client.post(url, headers=headers, json=envelope(data))
    assert duplicate.status_code == 409
    assert duplicate.json()['detail']['code'] == 'IMMUTABLE_CONFLICT'
    foreign = await client.post(url, headers=auth(users['b']), json=envelope(data))
    assert foreign.status_code == 409
    assert foreign.json()['detail']['code'] == 'IMMUTABLE_CONFLICT'

    assert (await client.get(corrected_receipt_url, headers=headers)).json() == receipt
    assert await application_counts(db_session) == (baseline[0], baseline[1] + 1, baseline[2] + 1)
    registration = await db_session.get(RegistrationModel, registration_id)
    assert registration.participant_id == participant_id
    assert registration.created_by_user_id == users['a'].id
    assert registration.status == RegistrationStatusEnum.pending
    assert registration.first_name == FORM['first_name']
    assert registration.national_id == FORM['national_id']
    assert (await db_session.get(ParticipantModel, participant_id)).user_id == users['a'].id
