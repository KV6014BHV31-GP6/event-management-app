"""Explicit additive synthetic journey migration; never runs at application startup."""
import argparse
import asyncio
from sqlalchemy import text, inspect
from src.core.config import settings
from src.core.database import async_engine
from src.journey.models import JourneyState, JourneyOperation
MIGRATION_ID='rose_demo_journey_20261103_v1'
async def migrate(expected_database):
    if settings.ENVIRONMENT!='development':raise ValueError('Development acknowledgement required.')
    if not settings.DATABASE_URL.startswith(('postgresql://','postgresql+asyncpg://')):raise ValueError('Native PostgreSQL required.')
    from src.main import app  # All base models are registered, but never bootstrap them implicitly.
    async with async_engine.begin() as conn:
        if await conn.scalar(text('SELECT current_database()'))!=expected_database:raise ValueError('Database acknowledgement mismatch.')
        if await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')):raise ValueError('Non-superuser application role required.')
        await conn.execute(text("SET LOCAL lock_timeout='5s'"))
        await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('rose_demo_journey_20261103_v1'))"))
        tables=await conn.run_sync(lambda c:set(inspect(c).get_table_names()))
        if not {'users','events','participants','registrations','phase2_files','phase2_event_images','phase2_registration_documents','phase2_sync_batches','phase2_sync_submissions'}<=tables:raise ValueError('Base and Phase2 schema prerequisites missing; use explicit fresh bootstrap or approved earlier migrations.')
        for table in (JourneyState.__table__,JourneyOperation.__table__):await conn.run_sync(lambda c,t=table:t.create(c,checkfirst=True))
        await conn.execute(text('CREATE TABLE IF NOT EXISTS journey_schema_migrations (migration_id VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)'))
        await conn.execute(text('INSERT INTO journey_schema_migrations(migration_id) VALUES(:id) ON CONFLICT(migration_id) DO NOTHING'),{'id':MIGRATION_ID})
    return {'migration_id':MIGRATION_ID,'status':'PASS'}
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--acknowledge-development',action='store_true',required=True);parser.add_argument('--database',required=True);args=parser.parse_args()
    async def run():
        try:return await migrate(args.database)
        finally:await async_engine.dispose()
    try:result=asyncio.run(run())
    except Exception as exc:print('Migration refused or rolled back ('+type(exc).__name__+'); private connection details suppressed.');return 1
    print(result['migration_id']+' PASS');return 0
if __name__=='__main__':raise SystemExit(main())
