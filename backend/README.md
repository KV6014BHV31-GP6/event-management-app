# Backend development setup

This branch repairs the Austin Backend inherited from PR38 at `ff6e5d4fcdfb2f71103eac6769b376eca64bf843` (Austin dev `480460b4a2b0902bb8256be02bc7c8d8f13ac6ee`). See the [current task](../docs/dev/tasks/BE-FE-DEMO-READINESS-20261027.md) for the exact scope and native evidence. Python3.14/PostgreSQL17 and the existing pins are retained. Public Signup, token/participant ownership, row-lock transactions and schema consistency are repaired for the bounded Demo; this is author validation, not full Security/UAT or approved mixed-pool policy.

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

This command refuses staging/production and requires the acknowledgement before database access. It imports the User, Event, Participant and Registration model modules and calls `Base.metadata.create_all` to create missing tables; it never drops or resets tables and is not a schema migration tool. It does not run automatically when the server starts.

The seed adds the synthetic `demo_organizer` account and three lowercase `active` events, with UTC dates one, two and three weeks after the first run. It creates no participant, phone, identity or medical records. Stable seed identifiers make repeat runs idempotent: existing records, passwords and event dates are preserved; conflicting account/event identifiers stop the command. Run one bootstrap process at a time.

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

Create and Event PATCH require organizer; PATCH additionally verifies event ownership. Public Signup rejects organizer/leader, blank username and passwords over72 UTF-8 bytes. Absent Authorization allows first-time Guest; invalid credentials cannot fall back to Guest. A participant is matched to their authenticated account before reuse; National ID alone cannot claim another record. Signup errors remain controlled and do not expose secrets.

## Explicit existing-development-schema migration

Stop writers and back up the dedicated development database first. From backend, with its private DATABASE_URL and ENVIRONMENT=development:

```bash
python -m scripts.migrate_demo_readiness --acknowledge-development --database EXACT_DEDICATED_DATABASE_NAME
```

This standalone command verifies the exact connected database, locks registrations with a5-second lock timeout, refuses existing duplicate event/participant pairs, checks/adds `uq_registration_event_participant`, and adds actual `offline` to PostgreSQL `registration_channel`. It commits before the new enum label is used. It does not delete duplicates, change old rows or run on server startup. Verified first/repeat on a new original-shape synthetic DB and refusal on a separate duplicate fixture; original Demo and production database migration remain NOT_RUN. `create_all` is only fresh schema setup.

## Targeted checks and behavioral limits

Run `python -B -m pytest -q tests` from backend with the existing dependencies.26 ASGI/SQLite checks and3 opt-in native checks are separate layers. Set `NU_NATIVE_TEST_DATABASE_URL` privately to a dedicated PostgreSQL database ending `_test` to run the latter; they assert non-superuser identity and create isolated synthetic fixtures. Without opt-in,3 SKIP is expected. Native checks cover last-slot/repeated-cancel races, pair uniqueness and test-only pre-commit fault rollback. No production runtime monkeypatch is installed.

One registration per event/participant is enforced across all statuses; re-enrolment after cancellation is not implemented. The existing duplicate400 message remains for frontend compatibility; identity/uniqueness race conflicts return409. Cancel and promotion commit together under an event row lock; pending cancellation releases no approved place, and inactive events do not receive new promotions. Waiting FIFO ties are deterministic. Existing total online+offline capacity behavior is retained but only online1/offline0 is accepted for the core Demo. No new pool lending/eligibility/deadline/offer policy is implied.

The retained Offline service accepts new unclaimed identities with actual channel=offline; it rejects existing identity claims and duplicate batch entries atomically. No Offline UI/OCR workflow is added. Refresh/logout/files routes remain; frontend still uses existing Bearer/local Logout, without Cookie transport integration or a token-revocation claim. Full native E2E, Security/UAT, notifications, GCS, deployment, Guest read/claim/cancel and complete Issue acceptance are outside this repair.
