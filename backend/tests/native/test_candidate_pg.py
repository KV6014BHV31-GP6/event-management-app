"""Native PG evidence uses the existing isolated candidate only; never create/drop/reset it."""
from pathlib import Path
import json
import os
import pytest
import ulid
from sqlalchemy import text, select, literal, insert, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from urllib.parse import quote
from src.registrations.models import RegistrationModel, RegistrationStatusEnum
from src.registrations.service import RegistrationService

pytestmark = pytest.mark.native_pg


@pytest.fixture
async def candidate():
    settings_file = os.environ.get('NU_NATIVE_SETTINGS_FILE')
    references_file = os.environ.get('NU_NATIVE_REFERENCES_FILE')
    if not settings_file or not references_file:
        pytest.skip('NOT_RUN: explicit dedicated native candidate configuration/references required')
    cfg = json.loads(Path(settings_file).read_text(encoding='utf-8'))
    refs = json.loads(Path(references_file).read_text(encoding='utf-8'))
    assert cfg['host'] == '127.0.0.1' and cfg['port'] == 5433
    assert cfg['database'] == 'nu_be_repair_20261026_181320'
    assert cfg['app_user'] == 'nu_be_repair_app_20261026_181320'
    url = f"postgresql+asyncpg://{cfg['app_user']}:{quote(cfg['app_password'], safe='')}@127.0.0.1:5433/{cfg['database']}"
    engine = create_async_engine(url, echo=False, hide_parameters=True)
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    try:
        async with factory() as db:
            row = (await db.execute(text("SELECT current_database(),current_user,current_setting('server_version_num'),rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user"))).one()
            assert row[0] == cfg['database'] and row[1] == cfg['app_user'] and row[2] == '170011'
            assert not any(row[3:])
        yield factory, refs
    finally:
        await engine.dispose()


async def test_native_schema_and_partial_unique_index(candidate):
    factory, _ = candidate
    async with factory() as db:
        index = await db.scalar(text("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_registration_non_cancelled'"))
        assert index and 'UNIQUE INDEX' in index and 'event_id, participant_id' in index
        assert 'cancelled' in index and '<>' in index
        states = (await db.scalars(text("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='registration_status'"))).all()
        assert set(states) == {'pending', 'approved', 'waiting', 'rejected', 'cancelled'}
        columns = (await db.scalars(text("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='registrations'"))).all()
        assert {'cancelled_at', 'cancelled_by_user_id', 'waitlisted_at', 'reviewed_by_user_id'} <= set(columns)
        fks = await db.scalar(text("SELECT count(*) FROM pg_constraint WHERE conrelid='registrations'::regclass AND contype='f'"))
        assert fks >= 3


async def test_native_unique_constraint_blocks_bypassed_precheck(candidate):
    factory, refs = candidate
    new_id = str(ulid.ULID())
    source_id = refs['registrations']['A_E2_RACE']['id']
    async with factory() as db:
        before = await db.scalar(select(func.count()).select_from(RegistrationModel))
        columns = list(RegistrationModel.__table__.columns)
        values = [literal(new_id) if col.name == 'id' else col for col in columns]
        statement = insert(RegistrationModel).from_select([col.name for col in columns],
            select(*values).where(RegistrationModel.id == source_id))
        with pytest.raises(IntegrityError) as error:
            await db.execute(statement)
        assert getattr(error.value.orig, 'sqlstate', None) == '23505'
        await db.rollback()
    async with factory() as fresh:
        assert await fresh.scalar(select(func.count()).select_from(RegistrationModel)) == before
        assert await fresh.get(RegistrationModel, new_id) is None


async def test_native_cancel_and_promotion_atomic_rollback(candidate, monkeypatch):
    factory, refs = candidate
    approved_id = refs['registrations']['B_E1']['id']
    waiting_id = refs['registrations']['A_E1_REAPPLY']['id']
    fields = [RegistrationModel.id, RegistrationModel.status, RegistrationModel.cancelled_at,
              RegistrationModel.cancelled_by_user_id, RegistrationModel.updated_at]
    query = select(*fields).where(RegistrationModel.id.in_([approved_id, waiting_id])).order_by(RegistrationModel.id)
    class InjectedFault(Exception): pass
    async with factory() as db:
        before = (await db.execute(query)).all()
        states = {row[0]: row[1] for row in before}
        assert states[approved_id] == RegistrationStatusEnum.approved
        assert states[waiting_id] == RegistrationStatusEnum.waiting
        async def fail_after_flush():
            await db.flush()
            raise InjectedFault('test-only failure before commit')
        monkeypatch.setattr(db, 'commit', fail_after_flush)
        with pytest.raises(InjectedFault):
            await RegistrationService.cancel_user_registration(db, approved_id, refs['users']['B']['id'])
    async with factory() as fresh:
        after = (await fresh.execute(query)).all()
        assert after == before, 'Cancellation and promotion must both roll back in the native database'
