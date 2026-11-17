"""One-time, scoped NU synthetic staging registration-group migration.

Not the development migration and not a general production migration. It runs only
as an explicit operation on the existing NU staging database before the Web server
starts. Prior legacy DOB/income values remain untouched.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

# One-time target identity read from the authorized Railway project on 2026-11-17.
# This operation must not silently migrate another Railway project/environment.
TARGET = {
    "RAILWAY_PROJECT_ID": "9ce0925e-48c0-4cd5-acfa-435b3c36a43e",
    "RAILWAY_ENVIRONMENT_ID": "66480b30-9ef9-4af5-a8e3-69f4ae16ad98",
    "RAILWAY_SERVICE_ID": "047e8599-7b6d-4dfb-8596-d4dc3ca09c3c",
}

from sqlalchemy import text

OPERATION = "nu-staging-registration-groups-20261117-v1"
BACKUP_PATH = Path("/data/release-backups/registration-groups-20261117-before.json")
AGES = (
    ("0_17", "Demo only: under 18", 0, 17),
    ("18_29", "Demo only: 18-29 years", 18, 29),
    ("30_44", "Demo only: 30-44 years", 30, 44),
    ("45_59", "Demo only: 45-59 years", 45, 59),
    ("60_plus", "Demo only: 60 years and over", 60, None),
)
INCOMES = (
    ("demo_income_a", "Demo income category A (illustrative)", 1),
    ("demo_income_b", "Demo income category B (illustrative)", 2),
    ("demo_income_c", "Demo income category C (illustrative)", 3),
)


def require_staging_env(env):
    """Refuse all production, wrong staging or implicit activation environments."""
    if env.get("NU_STAGING_GROUPS_OPERATION") != OPERATION:
        return False
    if (env.get("NU_DEMO_PROFILE") != "synthetic"
        or env.get("RAILWAY_ENVIRONMENT_NAME") != "staging"
        or env.get("RAILWAY_SERVICE_NAME") != "rose-pulse-web"
        or env.get("NU_TRUSTED_HTTPS_ORIGIN") != "https://rosepulse.up.railway.app"
        or env.get("NU_INIT_EMPTY_DB", "no") != "no"):
        raise ValueError("REFUSE_NON_SYNTHETIC_OR_WRONG_STAGING")
    if any(env.get(key) != value for key, value in TARGET.items()):
        raise ValueError("REFUSE_WRONG_RAILWAY_TARGET")
    # Only the scoped private Postgres service in the same Railway project.
    # A second database named nu_staging must never satisfy this operation.
    parsed = urlsplit(env.get("DATABASE_URL", ""))
    if (parsed.scheme not in {"postgresql", "postgresql+asyncpg"}
        or parsed.hostname != "postgres17.railway.internal"
        or parsed.port not in {None, 5432}
        or parsed.path != "/nu_staging" or parsed.query or parsed.fragment):
        raise ValueError("REFUSE_WRONG_DATABASE_ENDPOINT")
    return True


def save_scoped_backup(registrations, participants):
    """Record only affected legacy columns, never tokens or whole account records."""
    if BACKUP_PATH.is_symlink() or BACKUP_PATH.parent.is_symlink():
        raise ValueError("REFUSE_BACKUP_SYMLINK")
    if BACKUP_PATH.exists():
        raise ValueError("BACKUP_ALREADY_EXISTS_WITHOUT_MIGRATION_RECEIPT")
    BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "operation": OPERATION,
        "scope": "scoped-legacy-DOB-and-income, NOT a full PostgreSQL backup",
        "registration_count": len(registrations),
        "participant_count": len(participants),
        "registrations": registrations,
        "participants": participants,
    }
    encoded = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode()
    tmp = BACKUP_PATH.with_suffix(".json.tmp")
    if tmp.exists() or tmp.is_symlink():
        raise ValueError("REFUSE_EXISTING_BACKUP_TEMP")
    fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, BACKUP_PATH)
        os.chmod(BACKUP_PATH, 0o600)
    finally:
        if tmp.exists():
            tmp.unlink()
    if BACKUP_PATH.read_bytes() != encoded:
        raise ValueError("BACKUP_READBACK_FAILED")
    return hashlib.sha256(encoded).hexdigest()


async def apply_registration_groups(env):
    if not require_staging_env(env):
        return {"status": "SKIPPED_NO_EXPLICIT_OPERATION"}
    from src.core.database import async_engine
    from src.registrations.models import AgeGroupModel, IncomeBandModel

    try:
        async with async_engine.begin() as conn:
            await conn.execute(text("SET LOCAL lock_timeout = '5s'"))
            await conn.execute(text("SET LOCAL statement_timeout = '90s'"))
            await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": OPERATION})
            db = await conn.scalar(text("SELECT current_database()"))
            is_superuser = await conn.scalar(text(
                "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
            ))
            if db != "nu_staging" or is_superuser is not False:
                raise ValueError("REFUSE_WRONG_OR_PRIVILEGED_DATABASE")
            existing = set((await conn.execute(text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            ))).scalars())
            if not {"participants", "registrations", "users", "events"}.issubset(existing):
                raise ValueError("REFUSE_INCOMPLETE_EXISTING_SCHEMA")
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS registration_group_schema_migrations "
                "(migration_id VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ "
                "NOT NULL DEFAULT CURRENT_TIMESTAMP, backup_sha256 VARCHAR(64))"
            ))
            await conn.execute(text(
                "ALTER TABLE registration_group_schema_migrations "
                "ADD COLUMN IF NOT EXISTS backup_sha256 VARCHAR(64)"
            ))
            already = await conn.scalar(text(
                "SELECT EXISTS(SELECT 1 FROM registration_group_schema_migrations "
                "WHERE migration_id = :k)"), {"k": OPERATION})
            if already:
                if not {"age_groups", "income_bands"}.issubset(existing):
                    raise ValueError("RECEIPT_SCHEMA_MISMATCH")
                required = (await conn.execute(text(
                    "SELECT table_name,column_name,is_nullable FROM information_schema.columns "
                    "WHERE table_schema='public' AND (table_name,column_name) IN "
                    "(('participants','date_of_birth'),('registrations','date_of_birth'),"
                    "('registrations','age_group_code'))"
                ))).all()
                if len(required) != 3 or any(row.is_nullable != "YES" for row in required):
                    raise ValueError("RECEIPT_COLUMN_MISMATCH")
                if not BACKUP_PATH.is_file() or BACKUP_PATH.is_symlink():
                    raise ValueError("RECEIPT_BACKUP_MISSING")
                digest = await conn.scalar(text(
                    "SELECT backup_sha256 FROM registration_group_schema_migrations "
                    "WHERE migration_id = :k"), {"k": OPERATION})
                if not digest or hashlib.sha256(BACKUP_PATH.read_bytes()).hexdigest() != digest:
                    raise ValueError("RECEIPT_BACKUP_DIGEST_MISMATCH")
                return {"status": "ALREADY_APPLIED", "operation": OPERATION,
                        "backup_sha256": digest}

            # Lock first, so that both the scoped snapshot and DDL see one baseline.
            await conn.execute(text(
                "LOCK TABLE registrations, participants IN ACCESS EXCLUSIVE MODE"
            ))
            existing_cols = set((await conn.execute(text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name IN ('registrations','participants')"
            ))).all())
            for required in (("registrations", "date_of_birth"),
                             ("registrations", "income_band_code"),
                             ("participants", "date_of_birth")):
                if required not in existing_cols:
                    raise ValueError("UNEXPECTED_LEGACY_COLUMNS")
            if await conn.scalar(text("SELECT COUNT(*) FROM registrations")) > 2000:
                raise ValueError("REFUSE_OVERSIZED_SYNTHETIC_DATASET")
            if await conn.scalar(text("SELECT COUNT(*) FROM participants")) > 2000:
                raise ValueError("REFUSE_OVERSIZED_SYNTHETIC_DATASET")
            registrations = [dict(row) for row in (await conn.execute(text(
                "SELECT id, date_of_birth::text AS date_of_birth, income_band_code "
                "FROM registrations ORDER BY id"
            ))).mappings()]
            participants = [dict(row) for row in (await conn.execute(text(
                "SELECT id, date_of_birth::text AS date_of_birth "
                "FROM participants ORDER BY id"
            ))).mappings()]
            backup_hash = save_scoped_backup(registrations, participants)

            for table in (AgeGroupModel.__table__, IncomeBandModel.__table__):
                await conn.run_sync(
                    lambda sync, table=table: table.create(sync, checkfirst=True)
                )
            # Existing reference data may represent an owner's approved taxonomy.
            # Never mix unapproved synthetic entries with it.
            if (await conn.scalar(text("SELECT COUNT(*) FROM age_groups")) or
                await conn.scalar(text("SELECT COUNT(*) FROM income_bands"))):
                raise ValueError("REFUSE_PREEXISTING_REFERENCE_TAXONOMY")
            await conn.execute(text(
                "ALTER TABLE registrations ADD COLUMN IF NOT EXISTS age_group_code "
                "VARCHAR(20) REFERENCES age_groups(code)"
            ))
            await conn.execute(text(
                "ALTER TABLE registrations ALTER COLUMN date_of_birth DROP NOT NULL"
            ))
            await conn.execute(text(
                "ALTER TABLE participants ALTER COLUMN date_of_birth DROP NOT NULL"
            ))
            for code, name, low, high in AGES:
                await conn.execute(text(
                    "INSERT INTO age_groups(code,name,min_age,max_age) "
                    "VALUES(:code,:name,:low,:high)"
                ), {"code": code, "name": name, "low": low, "high": high})
            for code, name, order in INCOMES:
                await conn.execute(text(
                    "INSERT INTO income_bands(code,name,display_order,is_active) "
                    "VALUES(:code,:name,:order,TRUE)"
                ), {"code": code, "name": name, "order": order})
            if (await conn.scalar(text("SELECT COUNT(*) FROM age_groups")) != len(AGES)
                or await conn.scalar(text("SELECT COUNT(*) FROM income_bands")) != len(INCOMES)):
                raise ValueError("CLASSIFICATION_READBACK_MISMATCH")
            # Legacy row counts must not change; no old row is overwritten.
            if (await conn.scalar(text("SELECT COUNT(*) FROM registrations")) != len(registrations)
                or await conn.scalar(text("SELECT COUNT(*) FROM participants")) != len(participants)):
                raise ValueError("LEGACY_ROW_COUNT_DRIFT")
            await conn.execute(text(
                "INSERT INTO registration_group_schema_migrations"
                "(migration_id,backup_sha256) VALUES(:k,:digest)"
            ), {"k": OPERATION, "digest": backup_hash})
        return {"status": "APPLIED", "operation": OPERATION,
                "backup_sha256": backup_hash, "ages": len(AGES), "income_bands": len(INCOMES)}
    finally:
        await async_engine.dispose()


if __name__ == "__main__":
    result = asyncio.run(apply_registration_groups(dict(os.environ)))
    print(json.dumps(result, sort_keys=True))
