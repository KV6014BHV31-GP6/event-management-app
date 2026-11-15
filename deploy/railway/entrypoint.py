"""Railway-only synthetic staging launcher. Never seed accounts, events or participant data."""
from __future__ import annotations

import asyncio
import json
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path("/opt/nu")
DB_NAME = "nu_staging"


def read_build_identity():
    """Read the immutable identity produced in the same Docker stage as the UI."""
    value = json.loads((ROOT / 'web/nu-source.json').read_text(encoding='utf-8'))['source_sha']
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{40}', value) or value == '0' * 40:
        raise ValueError('INVALID_BUILD_IDENTITY')
    return value


def validate_environment(source=None):
    env = dict(os.environ if source is None else source)
    url = env.get("NU_TRUSTED_HTTPS_ORIGIN", "")
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname
            or parsed.hostname in {"localhost", "127.0.0.1"}
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in {"", "/"} or parsed.port not in {None, 443}
            or url != f"https://{parsed.hostname}"):
        raise ValueError("INVALID_TRUSTED_HTTPS_ORIGIN")
    db_url = env.get("DATABASE_URL", "")
    if not (db_url.startswith("postgresql://") or db_url.startswith("postgresql+asyncpg://")):
        raise ValueError("INVALID_DATABASE_URL")
    if not 32 <= len(env.get("JWT_SECRET_KEY", "")) <= 256:
        raise ValueError("INVALID_JWT_SECRET")
    if env.get("NU_DEMO_PROFILE") != "synthetic":
        raise ValueError("SYNTHETIC_PROFILE_REQUIRED")
    source_sha = read_build_identity()
    if env.get("NU_PRODUCT_SOURCE_SHA") != source_sha:
        raise ValueError("PRODUCT_SOURCE_DRIFT")
    if env.get('RAILWAY_GIT_COMMIT_SHA', source_sha) != source_sha:
        raise ValueError('PROVIDER_SOURCE_DRIFT')
    port = env.get("PORT", "8080")
    if not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise ValueError("INVALID_PORT")
    env.update(
        PYTHONPATH=str(ROOT / "backend"), ENVIRONMENT="production",
        UPLOAD_DIR="/data/uploads", PRIVATE_UPLOAD_DIR="/data/private_assets",
        STORAGE_PROVIDER="local", PYTHONDONTWRITEBYTECODE="1",
    )
    return env


async def verify_or_initialize_fresh_db():
    from sqlalchemy import text
    from src.main import app  # noqa: F401, registers reviewed product models
    from src.core.database import Base, async_engine

    expected = {key.split(".")[-1] for key in Base.metadata.tables}
    if not expected or not {"users", "events", "registrations"}.issubset(expected):
        raise ValueError("UNEXPECTED_MODEL_REGISTRY")
    try:
        async with async_engine.begin() as connection:
            db_name = await connection.scalar(text("SELECT current_database()"))
            superuser = await connection.scalar(text(
                "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
            ))
            existing = set((await connection.execute(text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            ))).scalars())
            if db_name != DB_NAME or superuser is not False:
                raise ValueError("REFUSE_WRONG_OR_PRIVILEGED_DB")
            if not existing:
                if os.environ.get("NU_INIT_EMPTY_DB") != "yes":
                    raise ValueError("EMPTY_DB_NEEDS_EXPLICIT_INIT")
                await connection.run_sync(Base.metadata.create_all)
                print("NU fresh synthetic schema initialized; no accounts or events seeded", flush=True)
            elif not expected.issubset(existing):
                raise ValueError("REFUSE_PARTIAL_SCHEMA")
        print("NU synthetic DB schema ready", flush=True)
    finally:
        await async_engine.dispose()


def serve(env):
    children = []
    stopping = False

    def stop(*_):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        for process in children:
            if process.poll() is None:
                process.terminate()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, stop)
    try:
        children.append(subprocess.Popen(
            [sys.executable, "-B", "-m", "uvicorn", "src.main:app",
             "--app-dir", str(ROOT / "backend"), "--host", "127.0.0.1",
             "--port", "8000", "--no-access-log"],
            cwd=ROOT / "backend", env=env,
        ))
        # No signing key, database credentials or session secrets reach Node.
        safe_env = {key: value for key, value in env.items()
                    if key in {"PATH", "HOME", "PORT", "NU_TRUSTED_HTTPS_ORIGIN",
                               "NODE_ENV", "LANG", "TZ"}}
        children.append(subprocess.Popen(
            ["node", str(ROOT / "deploy/railway/gateway.mjs")], cwd=ROOT, env=safe_env,
        ))
        while not stopping and all(p.poll() is None for p in children):
            time.sleep(0.3)
        unexpected = not stopping
    finally:
        stop()
        for process in children:
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
    return 1 if unexpected else 0


def main():
    env = validate_environment()
    os.environ.update(env)
    sys.path.insert(0, str(ROOT / "backend"))
    asyncio.run(verify_or_initialize_fresh_db())
    # This explicit release operation is idempotent and keeps its immutable DB receipt.
    # The default remains no seed. Credentials never enter Node or request handlers.
    operation = env.get('NU_STAGING_CONTENT_OPERATION')
    if operation:
        sys.path.insert(0, str(ROOT / 'backend'))
        from scripts.staging_content import OPERATION, run
        if operation != OPERATION:
            raise ValueError('UNKNOWN_STAGING_CONTENT_OPERATION')
        manifest = ROOT / 'deploy/railway/seed-assets/manifest.json'
        plan = asyncio.run(run(manifest))
        print('NU staging content dry-run: ' + plan['result'], flush=True)
        result = asyncio.run(run(manifest, apply=True))
        print('NU staging content receipt: ' + json.dumps({key: result[key] for key in
              ('operation_id', 'manifest_sha256', 'result', 'backup_sha256', 'event_public_ids')
              if key in result}), flush=True)
    env.pop('NU_STAGING_ACCOUNTS_JSON', None)
    os.environ.pop('NU_STAGING_ACCOUNTS_JSON', None)
    return serve(env)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        # Exceptions may contain DSNs or tokens. Never log untrusted exception text.
        print("NU Railway staging stopped: " + type(exc).__name__, file=sys.stderr)
        raise SystemExit(1)
