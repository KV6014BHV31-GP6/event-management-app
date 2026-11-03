"""Explicit additive account migration; exact dedicated development DB only."""
import argparse
import asyncio
import re
from sqlalchemy import inspect, text
from src.core.config import settings
from src.core.database import async_engine
from src.accounts.models import AccountSecurity, AccountProfile, RecoveryChallenge

MIGRATION_ID = 'rose_account_recovery_20261103_v1'
TABLES = (AccountSecurity.__table__, AccountProfile.__table__, RecoveryChallenge.__table__)


def expression(value):
    value = value.lower()
    value = re.sub(r'::(?:character varying|text)(?:\[\])?', '', value)
    value = re.sub(r'(\w+(?:\([^)]*\))?)\s+between\s+(\d+)\s+and\s+(\d+)', r'\1 >= \2 and \1 <= \3', value)
    value = value.replace("in ('en', 'ms')", "= any (array['en', 'ms'])")
    return re.sub(r'[\s()"]', '', value)


def validate(conn, table):
    view = inspect(conn)
    columns = {c['name']: c for c in view.get_columns(table.name)}
    if set(columns) != set(table.columns.keys()):
        raise ValueError('Account table columns do not match.')
    for column in table.columns:
        actual = columns[column.name]
        if (actual['nullable'] != column.nullable or
                actual['type'].compile(dialect=conn.dialect) != column.type.compile(dialect=conn.dialect)):
            raise ValueError('Account column shape does not match.')
    if view.get_pk_constraint(table.name)['constrained_columns'] != [c.name for c in table.primary_key]:
        raise ValueError('Account primary key does not match.')
    actual_checks = {c['name']: expression(c['sqltext']) for c in view.get_check_constraints(table.name)}
    expected_checks = {c.name: expression(str(c.sqltext)) for c in table.constraints if hasattr(c, 'sqltext')}
    if actual_checks != expected_checks:
        raise ValueError('Account check constraints do not match.')
    actual_fks = {(tuple(c['constrained_columns']), c['referred_table'], tuple(c['referred_columns']),
                   c.get('options', {}).get('ondelete', 'NO ACTION')) for c in view.get_foreign_keys(table.name)}
    expected_fks = {(tuple(c.parent.name for c in constraint.elements), constraint.elements[0].column.table.name,
                     tuple(c.column.name for c in constraint.elements), constraint.ondelete or 'NO ACTION')
                    for constraint in table.foreign_key_constraints}
    if actual_fks != expected_fks:
        raise ValueError('Account foreign keys do not match.')
    actual_unique = {tuple(c['column_names']) for c in view.get_unique_constraints(table.name)}
    expected_unique = {tuple(c.name for c in constraint.columns) for constraint in table.constraints
                       if constraint.__class__.__name__ == 'UniqueConstraint'}
    if actual_unique != expected_unique:
        raise ValueError('Account uniqueness does not match.')
    actual_indexes = {c['name']: (tuple(c['column_names']), c['unique']) for c in view.get_indexes(table.name)
                       if not c.get('duplicates_constraint')}
    expected_indexes = {c.name: (tuple(col.name for col in c.columns), c.unique) for c in table.indexes}
    if actual_indexes != expected_indexes:
        raise ValueError('Account indexes do not match.')


async def migrate(expected_database):
    if settings.ENVIRONMENT != 'development' or not settings.DATABASE_URL.startswith(('postgresql://', 'postgresql+asyncpg://')):
        raise ValueError('Native development database required.')
    from src.main import app  # Register referenced model metadata, never bootstrap existing data.
    async with async_engine.begin() as conn:
        if await conn.scalar(text('SELECT current_database()')) != expected_database:
            raise ValueError('Database acknowledgement mismatch.')
        if await conn.scalar(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')):
            raise ValueError('Non-superuser role required.')
        await conn.execute(text("SET LOCAL lock_timeout='5s'"))
        await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:identity))"), {'identity': MIGRATION_ID})
        names = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
        if not {'users', 'journey_state', 'journey_operations'} <= names:
            raise ValueError('Base and journey prerequisites missing.')
        for table in TABLES:
            await conn.run_sync(lambda c, t=table: t.create(c, checkfirst=True))
            await conn.run_sync(lambda c, t=table: validate(c, t))
        await conn.execute(text('CREATE TABLE IF NOT EXISTS accounts_schema_migrations (migration_id VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)'))
        ledger = await conn.run_sync(lambda c: inspect(c).get_columns('accounts_schema_migrations'))
        if [(c['name'], c['nullable'], c['type'].compile(dialect=conn.dialect)) for c in ledger] != [('migration_id', False, 'VARCHAR(80)'), ('applied_at', False, 'TIMESTAMP WITH TIME ZONE')]:
            raise ValueError('Migration ledger shape mismatch.')
        if await conn.run_sync(lambda c: inspect(c).get_pk_constraint('accounts_schema_migrations')['constrained_columns']) != ['migration_id']:
            raise ValueError('Migration ledger primary key mismatch.')
        await conn.execute(text('INSERT INTO accounts_schema_migrations(migration_id) VALUES(:id) ON CONFLICT(migration_id) DO NOTHING'), {'id': MIGRATION_ID})
    return {'migration_id': MIGRATION_ID, 'status': 'PASS'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acknowledge-development', action='store_true', required=True)
    parser.add_argument('--database', required=True)
    args = parser.parse_args()
    async def run():
        try:
            return await migrate(args.database)
        finally:
            await async_engine.dispose()
    try:
        result = asyncio.run(run())
    except Exception:
        print('Account migration refused or rolled back; private connection details suppressed.')
        return 1
    print(result['migration_id'] + ' PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
