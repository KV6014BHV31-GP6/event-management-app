"""Explicit development-only, history-preserving registration classification migration."""
import argparse
import asyncio
from sqlalchemy import text
from src.core.config import settings
from src.core.database import async_engine
from src.registrations.models import AgeGroupModel, IncomeBandModel

MIGRATION_ID = 'registration_groups_20261117_v1'


async def migrate(expected_database, reverse=False):
    if settings.ENVIRONMENT != 'development':
        raise ValueError('Development environment required.')
    if not settings.DATABASE_URL.startswith(('postgresql://', 'postgresql+asyncpg://')):
        raise ValueError('Native PostgreSQL required.')
    async with async_engine.begin() as conn:
        if await conn.scalar(text('SELECT current_database()')) != expected_database:
            raise ValueError('Database acknowledgement does not match connection.')
        if await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')):
            raise ValueError('Non-superuser application role required.')
        await conn.execute(text("SET LOCAL lock_timeout='5s'"))
        await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('registration_groups_20261117_v1'))"))
        await conn.execute(text('LOCK TABLE registrations, participants IN ACCESS EXCLUSIVE MODE'))
        if reverse:
            # Never fabricate DOB, erase selected groups, or destroy lookup data to roll back.
            if await conn.scalar(text('SELECT EXISTS(SELECT 1 FROM registrations WHERE date_of_birth IS NULL OR age_group_code IS NOT NULL) OR EXISTS(SELECT 1 FROM participants WHERE date_of_birth IS NULL)')):
                raise ValueError('Rollback refused: new applications require the nullable history schema. Restore a reviewed pre-migration snapshot instead.')
            await conn.execute(text('ALTER TABLE registrations ALTER COLUMN date_of_birth SET NOT NULL'))
            await conn.execute(text('ALTER TABLE participants ALTER COLUMN date_of_birth SET NOT NULL'))
            # Keep additive tables/column and provenance; the old application ignores them.
        else:
            for table in [AgeGroupModel.__table__, IncomeBandModel.__table__]:
                await conn.run_sync(lambda sync_conn, table=table: table.create(sync_conn, checkfirst=True))
            await conn.execute(text('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS age_group_code VARCHAR(20) REFERENCES age_groups(code)'))
            await conn.execute(text('ALTER TABLE registrations ALTER COLUMN date_of_birth DROP NOT NULL'))
            await conn.execute(text('ALTER TABLE participants ALTER COLUMN date_of_birth DROP NOT NULL'))
        await conn.execute(text('CREATE TABLE IF NOT EXISTS registration_group_schema_migrations (migration_id VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)'))
        await conn.execute(text('INSERT INTO registration_group_schema_migrations(migration_id) VALUES(:id) ON CONFLICT DO NOTHING'), {'id': MIGRATION_ID + ('_reverse' if reverse else '')})
    return {'migration_id': MIGRATION_ID, 'status': 'PASS', 'reverse': reverse}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acknowledge-development', action='store_true', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--reverse', action='store_true')
    args = parser.parse_args()
    async def run():
        try:
            return await migrate(args.database, args.reverse)
        finally:
            await async_engine.dispose()
    try:
        asyncio.run(run())
    except ValueError as exc:
        print(str(exc)); return 1
    except Exception as exc:
        print(f'Migration failed ({type(exc).__name__}); transaction rolled back.'); return 1
    print('Registration classification migration PASS.'); return 0


if __name__ == '__main__':
    raise SystemExit(main())
