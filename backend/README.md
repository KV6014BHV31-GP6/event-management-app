# Backend development setup

## Booking lifecycle repair candidate — 2026-10-26

The bootstrap preflight checks required column presence/nullability, PG enum type names and required index names. It detects those incompatibilities; it is not a complete legacy schema/migration validator.

Candidate branch `dev_be_booking_lifecycle_repair` selectively repairs auth/users/events/participants/registrations on dev4541c948. Source adoption, exact candidate SHA, checks and limitations are in the [repair task](../docs/dev/tasks/BE-BOOKING-LIFECYCLE-REPAIR-20261026.md), [API contract](../docs/api/INTEGRATION.md) and [Data Flow](../docs/api/DATA_FLOW.md). Existing dependency pins and Frontend bytes are retained. This is author verification, not Astra independent approval or deployment.

Use only a new dedicated schema, non-superuser application role and synthetic data. `python -B -m scripts.dev_bootstrap --acknowledge-development`, from `backend/`, registers all four model tables, seeds the original organizer and three lowercase active events and preserves credentials/dates on repeat. It now refuses incompatible existing columns/enums/missing required unique index; `create_all` is not a migration. No original Demo database was upgraded or reset.

Configuration names remain DATABASE_URL/JWT_SECRET_KEY and optional SEED_PASSWORD in ignored settings. Restrict Windows ACL before writing secrets; do not print values or pass passwords on command lines. SQL echo is disabled and bound parameters hidden. Candidate runtime uses existing Python3.14.8/pins and PostgreSQL17.11; HTTP OpenAPI/PID/cwd/source and actual nonprivileged DB identity are independently recorded. No server auto-bootstrap or primary launcher change.

Relevant tests: existing unit/SQLite/ASGI assertions plus new auth/ownership/lifecycle/schema cases (`python -B -m pytest -q`). Native tests under `tests/native/test_candidate_pg.py` require explicit NU_NATIVE_SETTINGS_FILE and NU_NATIVE_REFERENCES_FILE paths to an already owned dedicated candidate; absent configuration SKIPs as NOT_RUN. They never recreate/drop a native schema. The atomic rollback case needs the documented approved/waiting fixture state; do not blindly replay it after final promotion. Actual native HTTP runner and secure candidate start/stop commands are in the external handoff, with no temporary shell-secret dependency.

Supported allocation is the user-authorized online-only/offline0 scenario. Mixed-pool approval/promotion is controlled409; quota offline approved=null when mapping is unverified. Read count/capacity fields are not remaining places. Current Frontend remains without own GET/cancel/Approve/quota wiring; PR38 remains UI_ONLY. Full E2E/Browser/Security/UAT/DB restart, migration, video and deployment NOT_RUN.

## Historical imported setup baseline

This folder contains Austin's imported FastAPI backend at source baseline `79804aa`, plus additive development setup. Python 3.14 and PostgreSQL 17 are **REPORTED** as Austin's environment. The imported `src/` and dependency pins remain unchanged; two stale user-test assertions were aligned with the existing ULID/error contract; setup instructions are not product, security or UAT acceptance. See [current status](../docs/dev/CURRENT.md) for the latest verification evidence.

Run the commands below from `backend/`. Use a dedicated local database and synthetic data only.

## Install the imported dependencies

```bash
cd backend
python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

On Windows PowerShell, use `py -3.14 -m venv .venv` and `.venv\Scripts\Activate.ps1`. `requirements.txt` is the original UTF-16 file with a BOM; do not silently re-pin or replace it. If the requested runtime or an exact package version is unavailable, stop and record the failed command/version with the backend contributor. A different runtime or dependency set is an experiment, not verification of the imported environment.

## Create a local database and configuration

PostgreSQL must already be running. As your local PostgreSQL administrator, create a dedicated non-superuser login and database, for example inside `psql`:

```sql
CREATE ROLE nu_event_dev LOGIN;
\password nu_event_dev
CREATE DATABASE nu_event_dev OWNER nu_event_dev;
```

`\password` prompts for a local password. Database creation is separate from application startup and from the bootstrap command. For an existing development database, verify its owner and contents instead of recreating it.

Copy `.env.example` to `.env` only if `.env` does not already exist, then edit it locally. Set `DATABASE_URL` to the database above, URL-encoding special characters in its password. The existing driver accepts `postgresql://` and converts it to `postgresql+asyncpg://`. Keep `ENVIRONMENT=development` and `API_V1_STR=/api/v1` for this integration.

Generate a JWT signing secret locally and place the result in `JWT_SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The exact backend names are `DATABASE_URL` and `JWT_SECRET_KEY`. Settings load `.env` from the working directory, with exported environment variables taking precedence. `.env` and `.env.seed` are ignored; never share them, commit them or include their contents in screenshots/test evidence.

## Initialize missing tables and synthetic demo records

Verify `DATABASE_URL` points to your dedicated development database, then explicitly run:

```bash
python -m scripts.dev_bootstrap --acknowledge-development
```

This command refuses staging/production and requires the acknowledgement before database access. It imports all three model modules and calls `Base.metadata.create_all` to create missing tables; it never drops or resets tables and is not a schema migration tool. It does not run automatically when the server starts.

The seed adds the synthetic `demo_organizer` account and three `ACTIVE` events, with UTC dates one, two and three weeks after the first run. It creates no participant, phone, identity or medical records. Stable seed identifiers make repeat runs idempotent: existing records, passwords and event dates are preserved; conflicting account/event identifiers stop the command. Run one bootstrap process at a time.

Choose either credential path before the first run:

- Set `SEED_PASSWORD` in your environment or `.env` to a locally chosen 12–72 UTF-8 byte password.
- Leave it blank and open the generated, ignored `backend/.env.seed` locally after bootstrap to read the `SEED_PASSWORD` value. On POSIX the file is created with mode `0600`; check equivalent access permissions on Windows. The password is never printed by bootstrap.

If the account already exists, changing `SEED_PASSWORD` does not reset it. Keep the original local credential; deleting `.env.seed` cannot recover or replace an existing account password. A failed database transaction may leave a generated `.env.seed` for a safe retry. A later schema change requires a separately reviewed migration; `create_all` will not alter existing columns.

## Start and check the API

From `backend/`, with the virtual environment active:

```bash
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
```

- Health: `http://127.0.0.1:8000/` (process/configuration response; not a database readiness check).
- Swagger UI: `http://127.0.0.1:8000/api/v1/docs` in development.
- Public event list: `GET /api/v1/events?page=1&pageSize=20`.
- JSON login: `POST /api/v1/auth/login` with `{"username":"demo_organizer","password":"<your local seed password>"}`.
- Current user: `GET /api/v1/users/me` with the returned bearer token.

The live frontend uses a same-origin development proxy; follow [frontend setup](../frontend/README.md). No backend CORS change is needed for that path. API/network errors must remain visible; they are not permission to switch to mock data.

## Verification and authorization boundaries

The imported user tests can be invoked with `python -m pytest` from `backend/` after configuration and dependencies are available. They use an isolated SQLite test engine and do not prove PostgreSQL behavior or real browser integration. The new bootstrap is PostgreSQL-only; document evidence from the actual runtime/database separately.

In the imported source, event creation requires a logged-in user but does not check for the organizer role. Public user creation also accepts the supplied role. Production authorization policy and role escalation controls remain **UNVERIFIED**; the synthetic organizer account does not establish that those controls exist. This setup leaves the imported policy unchanged. Event creation/publication relates to `SP-FEATURES-20261012:A-01`; event index/login integration alone does not complete that feature, guest registration, quotas, cancellation, SMS or the full 18-feature scope.
