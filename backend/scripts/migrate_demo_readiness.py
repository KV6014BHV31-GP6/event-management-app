"""Explicit development-only PostgreSQL migration; never run by the launcher."""
import argparse
import asyncio
import asyncpg

from src.core.config import settings


async def migrate(expected_database: str) -> dict:
    if settings.ENVIRONMENT != "development":
        raise ValueError("Development environment required.")
    dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
    if not dsn.startswith("postgresql://"):
        raise ValueError("Native PostgreSQL required.")
    conn = await asyncpg.connect(dsn)
    try:
        async with conn.transaction():
            if await conn.fetchval("SELECT current_database()") != expected_database:
                raise ValueError("Database acknowledgement does not match the connection.")
            await conn.execute("SET LOCAL lock_timeout = '5s'")
            await conn.execute("LOCK TABLE public.registrations IN ACCESS EXCLUSIVE MODE")
            channel_type = await conn.fetchval("""SELECT a.atttypid::regtype::text
                FROM pg_attribute a WHERE a.attrelid='public.registrations'::regclass
                AND a.attname='channel' AND NOT a.attisdropped""")
            if channel_type not in ("registration_channel", "public.registration_channel"):
                raise ValueError("Unexpected registration channel type; no migration applied.")
            labels = await conn.fetchval("""SELECT array_agg(enumlabel ORDER BY enumsortorder)
                FROM pg_enum WHERE enumtypid='public.registration_channel'::regtype""")
            if set(labels or []) not in ({"online", "walkin", "ocr"}, {"online", "offline", "walkin", "ocr"}):
                raise ValueError("Unexpected enum labels; inspect the schema before migrating.")
            duplicates = await conn.fetchval("""SELECT count(*) FROM (
                SELECT 1 FROM public.registrations GROUP BY event_id,participant_id HAVING count(*)>1
                ) duplicate_pairs""")
            if duplicates:
                raise ValueError("Existing duplicate event/participant pairs; no data was deleted or migration applied.")
            constraint = await conn.fetchrow("""SELECT c.contype,
                ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,ord)
                JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.ord) columns
                FROM pg_constraint c WHERE c.conrelid='public.registrations'::regclass
                AND c.conname='uq_registration_event_participant'""")
            if constraint and (constraint['contype'] != b'u' and constraint['contype'] != 'u'
                               or constraint['columns'] != ['event_id', 'participant_id']):
                raise ValueError("Named constraint has an unexpected definition.")
            if not constraint:
                await conn.execute("ALTER TABLE public.registrations ADD CONSTRAINT uq_registration_event_participant UNIQUE(event_id,participant_id)")
            await conn.execute("ALTER TYPE public.registration_channel ADD VALUE IF NOT EXISTS 'offline'")
        # The new enum label may only be used after the transaction above commits.
        return {"database": expected_database, "offline_enum": True, "event_participant_unique": True}
    finally:
        await conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--acknowledge-development", action="store_true", required=True)
    parser.add_argument("--database", required=True, help="Exact dedicated database name")
    args = parser.parse_args()
    try:
        result = asyncio.run(migrate(args.database))
    except ValueError as exc:
        print(str(exc))
        return 1
    except Exception as exc:
        # DB exceptions can include credentials, SQL parameters or participant data.
        print(f"Migration failed ({type(exc).__name__}); no sensitive details emitted.")
        return 1
    print(f"Migration complete for {result['database']}: offline enum and unique pair constraint.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
