"""Owner DOB successor, database-driven classification; synthetic fixture only."""
from datetime import date
import pytest
from pydantic import ValidationError
from sqlalchemy import delete, select
from src.registrations.models import AgeGroupModel, IncomeBandModel, RegistrationModel
from src.registrations.schemas import RegistrationCreate
from src.participants.models import ParticipantModel
from tests.test_demo_readiness import FORM, PUBLIC, actors, auth


async def test_options_empty_is_truthful_and_no_new_application(client, db_session, actors):
    await db_session.execute(delete(IncomeBandModel))
    await db_session.execute(delete(AgeGroupModel))
    await db_session.commit()
    response = await client.get('/api/v1/registration-options')
    assert response.status_code == 200
    assert response.json() == {'age_groups': [], 'income_bands': []}
    response = await client.post('/api/v1/events/'+PUBLIC+'/registrations', json=FORM)
    assert response.status_code == 422
    assert (await db_session.scalars(select(RegistrationModel))).all() == []


async def test_database_options_order_active_and_unknown_codes(client, db_session, actors):
    db_session.add(IncomeBandModel(code='disabled', name='Synthetic disabled', display_order=0, is_active=False))
    await db_session.commit()
    options = (await client.get('/api/v1/registration-options')).json()
    assert options['age_groups'] == [{'code':'18_29','name':'Synthetic 18–29'}]
    assert 'disabled' not in [row['code'] for row in options['income_bands']]
    for patch in [{'age_group_code':'unknown'}, {'income_band_code':'unknown'}, {'income_band_code':'disabled'}]:
        result = await client.post('/api/v1/events/'+PUBLIC+'/registrations', json={**FORM,**patch})
        assert result.status_code == 422
    assert (await db_session.scalars(select(RegistrationModel))).all() == []


@pytest.mark.parametrize('income', ['omit', None, 'SYNTHETIC'])
async def test_new_application_no_dob_income_optional(client, db_session, actors, income):
    form = {key:value for key,value in FORM.items() if key != 'income_band_code'}
    if income != 'omit':
        form['income_band_code'] = income
    result = await client.post('/api/v1/events/'+PUBLIC+'/registrations', json=form, headers=auth(actors['a']))
    assert result.status_code == 201, result.text
    row = result.json()
    assert row['date_of_birth'] is None and row['age_group_code'] == '18_29'
    assert row['income_band_code'] == (None if income == 'omit' else income)
    person = await db_session.get(ParticipantModel, row['participant_id'])
    assert person.date_of_birth is None


def test_contract_refuses_dob_and_requires_age_without_default():
    for form in [{key:value for key,value in FORM.items() if key != 'age_group_code'},
                 {**FORM, 'date_of_birth':'1990-01-01'}, {**FORM,'age_group_code':''},
                 {**FORM,'income_band_code':''}]:
        with pytest.raises(ValidationError):
            RegistrationCreate.model_validate(form)


async def test_new_snapshot_preserves_historical_participant_dob(client, db_session, actors):
    from src.registrations.models import UserGenderEnum
    person = ParticipantModel(id='01J00000000000000000000099', user_id=actors['a'].id,
        first_name=FORM['first_name'],last_name=FORM['last_name'],gender=UserGenderEnum.female,
        date_of_birth=date(1980,2,3),phone='TEST',national_id=FORM['national_id'])
    db_session.add(person); await db_session.commit()
    result = await client.post('/api/v1/events/'+PUBLIC+'/registrations',json=FORM,headers=auth(actors['a']))
    assert result.status_code == 201, result.text
    person = await db_session.get(ParticipantModel, result.json()['participant_id'])
    assert result.json()['participant_id'] == person.id
    assert person.date_of_birth == date(1980,2,3) and result.json()['date_of_birth'] is None


async def test_legacy_dob_unknown_ack_reconciles_original_receipts_before_new_schema(client, db_session, actors, monkeypatch):
    """Represent a committed pre-successor receipt; never transform its raw request."""
    from tests.test_phase2 import batch, route
    from src.phase2.models import SyncBatchModel, SyncSubmissionModel
    from src.phase2.sync import digest
    from src.registrations.service import RegistrationService
    payload = batch()
    original = await client.post(route(), json=payload, headers=auth(actors['leader']))
    assert original.status_code == 200
    receipt = original.json()
    legacy = payload['items'][0]['application']
    del legacy['age_group_code']
    legacy['date_of_birth'] = '1990-01-01'
    legacy['income_band_code'] = 'HISTORICAL-FREE-TEXT'
    batch_row = await db_session.get(SyncBatchModel, payload['batch_id'])
    submission = await db_session.get(SyncSubmissionModel, payload['items'][0]['client_submission_id'])
    batch_row.fingerprint = digest(payload)
    submission.fingerprint = digest(legacy)
    await db_session.commit()
    async def forbidden_write(*args, **kwargs):
        raise AssertionError('Historical receipt recovery must not replay a domain write')
    monkeypatch.setattr(RegistrationService, 'create_offline_v2_item', forbidden_write)
    assert (await client.get(route()+'/'+payload['batch_id'],headers=auth(actors['leader']))).json() == receipt
    assert (await client.post(route(),json=payload,headers=auth(actors['leader']))).json() == receipt
    from uuid import uuid4
    payload['batch_id'] = str(uuid4())
    assert (await client.post(route(),json=payload,headers=auth(actors['leader']))).json()['items'] == receipt['items']
    assert len((await db_session.scalars(select(RegistrationModel))).all()) == 1
