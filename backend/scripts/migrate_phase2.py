"""Additive Phase2 migration with exact development DB acknowledgement; no business row INSERT."""
import argparse
import asyncio
from sqlalchemy import text
from src.core.config import settings
from src.core.database import Base,async_engine

MIGRATION_ID='rose_phase2_20261102_v1'
async def migrate(expected_database):
    if settings.ENVIRONMENT!='development':raise ValueError('Development environment required.')
    if not settings.DATABASE_URL.startswith(('postgresql://','postgresql+asyncpg://')):raise ValueError('Native PostgreSQL required.')
    from src.main import app  # noqa: F401; registers every metadata table
    async with async_engine.begin() as conn:
        actual=await conn.scalar(text('SELECT current_database()'))
        if actual!=expected_database:raise ValueError('Database acknowledgement does not match connection.')
        if await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')):raise ValueError('Non-superuser application role required.')
        await conn.execute(text("SET LOCAL lock_timeout='5s'"))
        await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('rose_phase2_20261102_v1'))"))
        await conn.execute(text('LOCK TABLE registrations IN ACCESS EXCLUSIVE MODE'))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text('ALTER TABLE registrations ALTER COLUMN income_band_code DROP NOT NULL'))
        await conn.execute(text('ALTER TABLE registrations ALTER COLUMN marriage_status DROP NOT NULL'))
        await conn.execute(text('ALTER TABLE registrations ALTER COLUMN address DROP NOT NULL'))
        await conn.execute(text('ALTER TABLE participants ALTER COLUMN address DROP NOT NULL'))
        await conn.execute(text('CREATE TABLE IF NOT EXISTS phase2_schema_migrations (migration_id VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)'))
        await conn.execute(text('INSERT INTO phase2_schema_migrations(migration_id) VALUES(:id) ON CONFLICT(migration_id) DO NOTHING'),{'id':MIGRATION_ID})
    return {'migration_id':MIGRATION_ID,'database':expected_database,'status':'PASS'}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acknowledge-development',action='store_true',required=True)
    parser.add_argument('--database',required=True); args=parser.parse_args()
    async def run():
        try:return await migrate(args.database)
        finally:await async_engine.dispose()
    try:result=asyncio.run(run())
    except ValueError as exc:print(str(exc));return 1
    except Exception as exc:print(f'Migration failed ({type(exc).__name__}); transaction rolled back, sensitive details suppressed.');return 1
    print(f"Migration {result['migration_id']} ready for {result['database']}.");return 0
if __name__=='__main__':raise SystemExit(main())
