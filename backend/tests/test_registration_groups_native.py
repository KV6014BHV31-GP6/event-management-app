"""Explicit disposable PostgreSQL migration rehearsal; no runtime taxonomy seed."""
import os
from datetime import date, datetime, timezone
import pytest
from sqlalchemy import text, select, event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.engine import make_url
from src.core.database import Base
from src.registrations.models import RegistrationModel, UserGenderEnum, RegistrationChannelEnum, RegistrationStatusEnum
from src.participants.models import ParticipantModel
from src.users.models import UserModel, UserRoleEnum
from src.events.models import EventModel, EventStatusEnum
from src.registrations.schemas import RegistrationCreate
from src.registrations.service import RegistrationService
from tests.group_fixtures import seed_group_options


async def test_native_history_first_repeat_reverse_fault_and_new_contract(monkeypatch):
    url = os.getenv('NU_GROUPS_MIGRATION_TEST_URL')
    if not url:
        pytest.skip('Dedicated classification migration database opt-in required.')
    parsed = make_url(url)
    assert parsed.host == '127.0.0.1' and parsed.database.endswith('_migration_be_test')
    engine = create_async_engine(url, hide_parameters=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    from scripts import migrate_registration_groups as migration
    monkeypatch.setattr(migration, 'async_engine', engine)
    monkeypatch.setattr(migration.settings, 'DATABASE_URL', url)
    monkeypatch.setattr(migration.settings, 'ENVIRONMENT', 'development')
    try:
        async with engine.begin() as conn:
            assert not await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))
            assert int(await conn.scalar(text("SELECT current_setting('server_version_num')"))) // 10000 == 17
            await conn.run_sync(Base.metadata.create_all)
        async with sessions() as db:
            user = UserModel(id='01J00000000000000000000091',username='groups_migration',role=UserRoleEnum.organizer,password_hash='unusable-synthetic')
            db.add(user); await db.flush()
            fixture_event = EventModel(public_id='GROUPS_MIGRATION_TEST',organizer_id=user.id,title='Synthetic migration',location='Synthetic',start_time=datetime(2030,1,1,tzinfo=timezone.utc),end_time=datetime(2030,1,2,tzinfo=timezone.utc),online_quota=10,offline_quota=10,status=EventStatusEnum.active)
            person = ParticipantModel(id='01J00000000000000000000092',user_id=None,first_name='History',last_name='Synthetic',gender=UserGenderEnum.female,date_of_birth=date(1980,2,3),phone='TEST',national_id='SYNTHETIC-GROUP-HISTORY')
            db.add_all([fixture_event,person]); await db.flush()
            reg = RegistrationModel(id='01J00000000000000000000093',event_id=fixture_event.id,participant_id=person.id,channel=RegistrationChannelEnum.online,status=RegistrationStatusEnum.pending,first_name=person.first_name,last_name=person.last_name,gender=person.gender,date_of_birth=person.date_of_birth,phone=person.phone,national_id=person.national_id,income_band_code='HISTORICAL-FREE-TEXT')
            db.add(reg); await db.commit()
            public = fixture_event.public_id
        async with engine.begin() as conn:
            await conn.execute(text('ALTER TABLE registrations DROP COLUMN age_group_code'))
            await conn.execute(text('DROP TABLE age_groups, income_bands'))
            await conn.execute(text('ALTER TABLE registrations ALTER COLUMN date_of_birth SET NOT NULL'))
            await conn.execute(text('ALTER TABLE participants ALTER COLUMN date_of_birth SET NOT NULL'))
            before = (await conn.execute(text('SELECT id,participant_id,date_of_birth,income_band_code FROM registrations'))).all()
        with pytest.raises(ValueError, match='acknowledgement'):
            await migration.migrate('wrong_database')
        def injected(conn, cursor, statement, parameters, context, executemany):
            if statement.startswith('INSERT INTO registration_group_schema_migrations'):
                raise RuntimeError('synthetic injected migration fault')
        event.listen(engine.sync_engine, 'before_cursor_execute', injected)
        try:
            with pytest.raises(RuntimeError, match='injected'):
                await migration.migrate(parsed.database)
        finally:
            event.remove(engine.sync_engine, 'before_cursor_execute', injected)
        async with engine.connect() as conn:
            assert await conn.scalar(text("SELECT to_regclass('age_groups')")) is None
            assert await conn.scalar(text("SELECT is_nullable FROM information_schema.columns WHERE table_name='participants' AND column_name='date_of_birth'")) == 'NO'
        await migration.migrate(parsed.database)
        await migration.migrate(parsed.database)
        async with engine.connect() as conn:
            assert (await conn.execute(text('SELECT id,participant_id,date_of_birth,income_band_code FROM registrations'))).all() == before
            assert await conn.scalar(text('SELECT count(*) FROM age_groups')) == 0
            assert await conn.scalar(text('SELECT count(*) FROM income_bands')) == 0
            assert await conn.scalar(text('SELECT age_group_code FROM registrations')) is None
        await migration.migrate(parsed.database, reverse=True)
        await migration.migrate(parsed.database)
        async with sessions() as db:
            await seed_group_options(db); await db.commit()  # Explicit isolated test fixture only.
            created = await RegistrationService.create_online_registration(db, public, RegistrationCreate(first_name='New',last_name='Synthetic',gender='female',age_group_code='18_29',phone='TEST',national_id='SYNTHETIC-GROUP-NEW'), None)
            assert created.date_of_birth is None and created.income_band_code is None
            assert (await db.get(ParticipantModel,created.participant_id)).date_of_birth is None
        with pytest.raises(ValueError, match='Rollback refused'):
            await migration.migrate(parsed.database, reverse=True)
        async with engine.connect() as conn:
            assert await conn.scalar(text('SELECT count(*) FROM registrations')) == 2
            assert (await conn.execute(text("SELECT id,participant_id,date_of_birth,income_band_code FROM registrations WHERE id='01J00000000000000000000093'"))).all() == before
    finally:
        await engine.dispose()
