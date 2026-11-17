"""Scoped, isolated staging registration-groups migration regression (real PG opt-in)."""
import asyncio
import importlib.util
import os
from pathlib import Path

import pytest
from sqlalchemy import text


ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "deploy" / "railway" / "registration_groups_staging.py"
spec = importlib.util.spec_from_file_location("registration_groups_staging", MIGRATION)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

SCOPED_ENV = {
    "NU_STAGING_GROUPS_OPERATION": module.OPERATION,
    "NU_DEMO_PROFILE": "synthetic",
    "RAILWAY_ENVIRONMENT_NAME": "staging",
    "RAILWAY_SERVICE_NAME": "rose-pulse-web",
    "NU_TRUSTED_HTTPS_ORIGIN": "https://rosepulse.up.railway.app",
    "NU_INIT_EMPTY_DB": "no",
    "DATABASE_URL": "postgresql+asyncpg://local-synthetic@postgres17.railway.internal/nu_staging",
    **module.TARGET,
}


def test_staging_operation_explicit_and_environment_pinned():
    assert module.require_staging_env({}) is False
    assert module.require_staging_env(SCOPED_ENV) is True
    for key in ("RAILWAY_ENVIRONMENT_NAME", "NU_DEMO_PROFILE",
                "NU_TRUSTED_HTTPS_ORIGIN", "RAILWAY_SERVICE_NAME",
                "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID",
                "RAILWAY_SERVICE_ID", "DATABASE_URL"):
        bad = dict(SCOPED_ENV)
        bad[key] = "wrong"
        with pytest.raises(ValueError):
            module.require_staging_env(bad)


@pytest.mark.skipif(os.environ.get("NU_STAGING_GROUPS_TEST_DB") != "yes",
                    reason="explicit isolated local PG opt-in")
def test_real_postgresql_migration_repeated_without_changing_legacy_data(tmp_path):
    # Required separate database is nu_staging on loopback with non-superuser role.
    from src.core.database import async_engine

    async def check():
        async with async_engine.begin() as conn:
            name = await conn.scalar(text("SELECT current_database()"))
            if name != "nu_staging":
                raise ValueError("REFUSE_NOT_ISOLATED_NU_STAGING")
            user = await conn.scalar(text(
                "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"))
            if user is not False:
                raise ValueError("REFUSE_SUPERUSER")
            await conn.execute(text(
                "CREATE TABLE participants "
                "(id VARCHAR(26) PRIMARY KEY, date_of_birth DATE NOT NULL)"
            ))
            await conn.execute(text(
                "CREATE TABLE registrations "
                "(id VARCHAR(26) PRIMARY KEY, date_of_birth DATE NOT NULL,"
                "income_band_code VARCHAR(20))"
            ))
            await conn.execute(text("CREATE TABLE users(id VARCHAR(26) PRIMARY KEY)"))
            await conn.execute(text("CREATE TABLE events(id BIGINT PRIMARY KEY)"))
            await conn.execute(text(
                "INSERT INTO participants VALUES('TEST-PARTICIPANT', '1995-01-02')"
            ))
            await conn.execute(text(
                "INSERT INTO registrations VALUES('TEST-REGISTRATION', '1995-01-02', 'legacy')"
            ))
        module.BACKUP_PATH = tmp_path / "secure" / "before.json"
        first = await module.apply_registration_groups(SCOPED_ENV)
        assert first["status"] == "APPLIED"
        second = await module.apply_registration_groups(SCOPED_ENV)
        assert second["status"] == "ALREADY_APPLIED"
        assert module.BACKUP_PATH.exists()
        assert module.BACKUP_PATH.read_text().find("TEST-REGISTRATION") >= 0
        async with async_engine.begin() as conn:
            dob = await conn.scalar(text(
                "SELECT date_of_birth::text FROM registrations"
            ))
            assert dob == "1995-01-02"
            assert await conn.scalar(text(
                "SELECT income_band_code FROM registrations")) == "legacy"
            assert await conn.scalar(text("SELECT COUNT(*) FROM age_groups")) == len(module.AGES)
            assert await conn.scalar(text("SELECT COUNT(*) FROM income_bands")) == len(module.INCOMES)
            await conn.execute(text(
                "INSERT INTO registrations(id,date_of_birth,age_group_code) "
                "VALUES ('NEW-TEST-REG', NULL, '18_29')"
            ))
            assert await conn.scalar(text(
                "SELECT COUNT(*) FROM registrations")) == 2
        module.BACKUP_PATH.write_bytes(module.BACKUP_PATH.read_bytes() + b"TAMPER")
        with pytest.raises(ValueError, match="RECEIPT_BACKUP_DIGEST_MISMATCH"):
            await module.apply_registration_groups(SCOPED_ENV)
    asyncio.run(check())
