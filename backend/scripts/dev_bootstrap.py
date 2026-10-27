"""Create missing tables and synthetic fixtures in a dedicated development DB."""

import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import secrets
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_ENV_PATH = BACKEND_DIR / ".env.seed"
SEED_USERNAME = "demo_organizer"
SEED_USER_ID = "01J00000000000000000000001"
SEED_EVENT_IDS = tuple(f"dev_synthetic_event_{number}" for number in range(1, 4))


class BootstrapError(Exception):
    """An actionable, non-secret error that is safe to display."""


def get_seed_password() -> tuple[str, str]:
    """Use an explicit password or persist a generated password for retries."""
    from dotenv import dotenv_values

    # Match settings precedence: the process environment overrides backend/.env.
    password = os.environ.get("SEED_PASSWORD")
    if password is None:
        password = dotenv_values(BACKEND_DIR / ".env").get("SEED_PASSWORD")
    if password:
        source = "SEED_PASSWORD from your environment or backend/.env"
    else:
        if SEED_ENV_PATH.is_symlink():
            raise BootstrapError("Refusing a symlink at backend/.env.seed.")
        if not SEED_ENV_PATH.exists():
            generated = secrets.token_urlsafe(24)
            # Exclusive creation never overwrites an existing credential file.
            try:
                descriptor = os.open(SEED_ENV_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                raise BootstrapError("backend/.env.seed appeared during setup; rerun once setup is idle.") from None
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                output.write("# Private synthetic development login; do not commit or share.\n")
                output.write(f"SEED_USERNAME={SEED_USERNAME}\nSEED_PASSWORD={generated}\n")
        seed_values = dotenv_values(SEED_ENV_PATH)
        if seed_values.get("SEED_USERNAME") != SEED_USERNAME:
            raise BootstrapError("backend/.env.seed does not identify the expected synthetic account.")
        password = seed_values.get("SEED_PASSWORD")
        source = "backend/.env.seed (open this ignored file locally)"

    if not password or not 12 <= len(password.encode("utf-8")) <= 72:
        raise BootstrapError("SEED_PASSWORD must contain 12–72 UTF-8 bytes; the backend uses bcrypt.")
    return password, source


async def bootstrap() -> None:
    from src.core.config import settings

    if settings.ENVIRONMENT != "development":
        raise BootstrapError("Refusing bootstrap: ENVIRONMENT must be development, never staging or production.")
    if not settings.DATABASE_URL.startswith(("postgresql://", "postgresql+asyncpg://")):
        raise BootstrapError("Set DATABASE_URL to a dedicated PostgreSQL development database.")
    if "replace-with-" in settings.DATABASE_URL:
        raise BootstrapError("Replace the DATABASE_URL placeholder in backend/.env before bootstrap.")
    if len(settings.JWT_SECRET_KEY) < 32 or settings.JWT_SECRET_KEY.startswith("replace-with-"):
        raise BootstrapError("Set a locally generated JWT_SECRET_KEY of at least 32 characters before bootstrap.")

    from sqlalchemy import or_, select
    from src.core.database import AsyncSessionLocal, Base, async_engine
    from src.core.security import hash_password
    from src.users.models import UserModel, UserRoleEnum
    from src.events.models import EventModel, EventStatusEnum
    from src.registrations.models import RegistrationModel
    from src.participants.models import ParticipantModel  # noqa: F401; register every table before create_all

    # Development engine defaults to SQL echo; keep seed hashes out of console logs.
    async_engine.echo = False
    user_created = False
    events_created = 0
    credential_source = "existing account password is unchanged"
    try:
        async with async_engine.begin() as connection:
            # Add missing tables only. This is not a migration or reset operation.
            await connection.run_sync(Base.metadata.create_all)

        async with AsyncSessionLocal() as session:
            async with session.begin():
                matches = (await session.execute(select(UserModel).where(or_(
                    UserModel.id == SEED_USER_ID,
                    UserModel.username == SEED_USERNAME,
                )))).scalars().all()
                if matches:
                    if len(matches) != 1 or matches[0].id != SEED_USER_ID or matches[0].username != SEED_USERNAME:
                        raise BootstrapError("Synthetic account ID/username collision; no existing account was changed.")
                    if matches[0].role != UserRoleEnum.organizer:
                        raise BootstrapError("Synthetic account role differs; no existing account was changed.")
                else:
                    password, credential_source = get_seed_password()
                    session.add(UserModel(
                        id=SEED_USER_ID,
                        username=SEED_USERNAME,
                        password_hash=hash_password(password),
                        role=UserRoleEnum.organizer,
                    ))
                    await session.flush()
                    user_created = True

                existing_events = (await session.execute(select(EventModel).where(
                    EventModel.public_id.in_(SEED_EVENT_IDS)
                ))).scalars().all()
                if any(event.organizer_id != SEED_USER_ID for event in existing_events):
                    raise BootstrapError("Synthetic event identifier collision; no existing event was changed.")
                known_ids = {event.public_id for event in existing_events}
                first_start = (datetime.now(timezone.utc) + timedelta(days=7)).replace(
                    hour=9, minute=0, second=0, microsecond=0
                )
                for index, public_id in enumerate(SEED_EVENT_IDS):
                    if public_id in known_ids:
                        continue
                    start_time = first_start + timedelta(days=index * 7)
                    session.add(EventModel(
                        public_id=public_id,
                        organizer_id=SEED_USER_ID,
                        title=f"Synthetic community event {index + 1}",
                        overview="Synthetic local development fixture. No real participants or appointments.",
                        location=f"Demo community hall {index + 1}",
                        online_quota=30 + index * 10,
                        offline_quota=10,
                        start_time=start_time,
                        end_time=start_time + timedelta(hours=3),
                        status=EventStatusEnum.active,
                    ))
                    events_created += 1
        print("Development schema ready (missing tables created; no tables dropped).")
        print(f"Synthetic login: {SEED_USERNAME}; account {'created' if user_created else 'preserved'}.")
        print(f"Password: {credential_source}. No password reset is performed on repeat runs.")
        print(f"Synthetic events created: {events_created}; existing records preserved.")
    finally:
        await async_engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acknowledge-development",
        action="store_true",
        help="confirm DATABASE_URL targets a dedicated synthetic development database",
    )
    args = parser.parse_args()
    if not args.acknowledge_development:
        parser.error("explicit --acknowledge-development is required before any database access")
    if Path.cwd().resolve() != BACKEND_DIR:
        parser.error("run from backend/ so bootstrap and uvicorn read the same .env")
    try:
        asyncio.run(bootstrap())
    except BootstrapError as error:
        print(f"Bootstrap stopped: {error}", file=sys.stderr)
        return 1
    except ImportError:
        print("Bootstrap stopped: install backend/requirements.txt in the active virtual environment.", file=sys.stderr)
        return 1
    except Exception as error:
        # Driver/validation exceptions can contain credentials or query parameters.
        print(
            f"Bootstrap failed ({type(error).__name__}). Check local configuration, PostgreSQL access, "
            "and the imported dependency pins. Details are suppressed to protect secrets.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
