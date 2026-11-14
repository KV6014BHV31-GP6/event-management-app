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

## Additive Phase2 contracts — 2026-11-02

Phase2 preserves `/api/v1` routes and flat response fields while adding `/api/v2` below. It does not merge the W8 module branches wholesale. Image limit3 is the owner-authorized gallery bound; supporting-document limit3 follows the W8 source. These engineering bounds do not establish eligibility, attendance, NGO field policy or mixed-pool acceptance.

The default registration form can omit `address`, `income_band_code`, `marriage_status` and `medical_record`; omitted values persist as actual NULL. Address is nullable in both participant and registration. Existing supplied values remain. Six provisional fields remain: first/last name, gender, date of birth, phone and national ID. This reduces the previous nine visible React inputs to six (33.3%); DOB/eligibility policy remains pending. No hidden mandatory defaults are fabricated.

For a signed-in account reusing its participant, omitted address leaves an existing participant address intact while the new registration snapshot is NULL. An explicitly supplied address (including explicit null) remains an authorized profile update. V2 offline reuse remains stricter: its complete identity snapshot must match exactly.

### Schema setup and explicit migration

Fresh `scripts.dev_bootstrap` registers the new file/association/receipt tables. For an existing **dedicated synthetic development DB**, stop its writers and back it up, then run from backend with private environment variables:

```bash
python -B -m scripts.migrate_phase2 --acknowledge-development --database EXACT_DEDICATED_DATABASE_NAME
```

Migration `rose_phase2_20261102_v1` verifies the exact connected DB and non-superuser role, takes an advisory lock plus registration table lock with5-second timeout, creates missing Phase2 tables and drops NOT NULL only on the approved optional fields. It records a schema receipt. It never inserts, rewrites or deletes business rows, never runs at server startup and has no destructive down migration. First/repeat, wrong-DB refusal, original-value preservation and injected-fault transaction rollback are tested separately on dedicated PostgreSQL.

`PRIVATE_UPLOAD_DIR` defaults to `private_assets` relative to backend cwd. Keep it outside any public `/uploads` mapping. Local runtime settings/accounts remain private; do not commit credentials. SQL echo is disabled and driver parameters hidden so forms/password hashes do not enter application SQL logs.

### Durable offline batch v2

`POST /api/v2/events/{public_id}/offline-batches` requires current leader/organizer identity. Body:

```json
{"contract_version":"rose.offline-sync.v2","batch_id":"canonical-lowercase-UUID","items":[{"client_submission_id":"stable-canonical-lowercase-UUID","application":{"first_name":"Synthetic","last_name":"Person","gender":"female","date_of_birth":"1990-01-01","phone":"TEST","national_id":"SYNTHETIC-ID"}}]}
```

Use1–25 items, unique IDs inside the envelope, maximum128KiB canonical envelope, and keep the exact submitted JSON/IDs for retry. No `leaderId` is accepted. Valid and invalid applications use the same fingerprint algorithm: `SHA256(UTF8("raw-json-sortkeys-v1\n" + canonical_json))`, with sorted object keys, preserved array order, compact separators, Unicode preserved and nonfinite numbers forbidden. Missing, null and empty values are distinct. Canonical application JSON fingerprints each submission; canonical whole envelope fingerprints the batch. Payload correction under the same ID409, even when parsed defaults would be equivalent. No raw application is stored in receipt tables.

Response200 contains `contract_version`, `fingerprint_version`, `batch_id`, `event_public_id`, authenticated `actor_id`, `recorded_at` and item receipts. Each item has `client_submission_id`, outcome `accepted/rejected/duplicate`, bounded code, authorized `registration_id` or null, immutable `registration_status_at_recording` and timestamp. Accepted creates **offline pending**, never approved. A same-ID replay returns the original accepted receipt even after approval/closure; obtain current lifecycle through the authorized registration API.

`GET .../offline-batches/{batch_id}` and `GET .../offline-submissions/{client_submission_id}` reconcile committed results, with fresh same-actor role checks under row lock. Unknown404; wrong actor/current role403; invalid/expired token or deleted account401. This is not a JWT revocation ledger.

Event and actor row locks, global unique batch/submission IDs, per-item savepoints and transaction rollback protect receipts/effects. Every accepted business effect and all rejected/duplicate receipts commit atomically with the batch. Global ID/event/payload collisions are envelope403/409 and roll back the whole batch. Unexpected500 or transport loss is **unknown to the client**: GET the original batch first, then resend exact IDs/JSON only after reconciliation. Never automatically create new IDs. Lost response after committed headers is tested with one DB effect.

Independent review regressions also force opposite submission/identity orders across two events. PostgreSQL deadlock `40P01` or serialization abort `40001` rolls back the whole losing batch and returns controlled409 with no automatic business retry; the client reconciles its original IDs. The winning batch may commit normally. Organizer cancellation re-reads and locks the actor after acquiring the event lock, so a demotion committed during that wait refuses403 without cancelling or promoting a record.

New items require active status and available aggregate approved capacity (`approved < online_quota+offline_quota`); pending records reserve no capacity. This retains aggregate approval/waitlist behavior, not a mixed-pool or deadline policy. Time-based expiry/medical eligibility is not implemented. Identity reuse is allowed only for an unclaimed participant previously registered offline by the same actor with exact matching fields (including nullable address, where NULL differs from text). Existing identities are never modified. Another ID for the same event/identity yields duplicate without a new row or foreign registration reference; online/other-actor cross-event claims are refused.

### Files, gallery, organizer views

- `POST /api/v2/files`: authenticated multipart `file` plus immutable purpose `event_image` or `supporting_document`. Maximum8MiB; MIME, extension and PNG/JPEG/GIF/WEBP signature must agree (PDF also for supporting documents). Unsafe filenames are rejected. Response is `{id,name,mime_type,size,purpose,url}` with no filesystem path.
- `GET /api/v2/files/{id}/content`: unassociated images are private. Associated event images are public through this endpoint. Documents require file owner or organizer owning their associated event, not every organizer. Responses use `no-store`, `nosniff` and attachment disposition for documents.
- Event Create/PATCH accepts up to3 distinct owned `image_file_ids`; full event responses/list retain legacy fields plus `image_files`. Omitted PATCH retains, `[]` clears, null422. Use legacy `image_path` only as fallback when gallery is empty.
- Online/v2 offline registration accepts up to3 owned `file_ids` of supporting-document purpose. Flat responses add `supporting_documents`, with metadata limited to file owner/event owner. Guest without authenticated upload may submit no files. Purpose cannot be switched by association.
- Organizer-only `GET /api/v2/me/events` returns the existing paginated event shape filtered by server ownership. `GET /api/v2/me/registrations?status=...` returns the existing flat array, joined/filtering own events on the server. The legacy organizer-global `/api/v1/registrations` policy remains; this increment does not claim that global policy gap is resolved.
- `POST /api/v2/registrations/{id}/cancel` requires organizer event ownership and reuses atomic cancellation/promotion, recording the actual cancellation actor.
- `GET /api/v2/analytics/registrations` aggregates own-event rows by status/channel/event, with `actor_id`, `as_of_utc`, `source`, definition and totals. It is registration accounting, not attendance, reach, conversion, ROI or load-test evidence.

### Verification layers

Run `python -B -m pytest -q tests` for ASGI/SQLite contracts. Set private `NU_NATIVE_TEST_DATABASE_URL=postgresql+asyncpg://.../EXACT_DEDICATED_NAME_test` to opt into native tests. Native v2 tests cover same-ID concurrency, global collisions with whole-batch rollback, cross-event National-ID races with persistent partial receipts, pre-commit rollback, raw fingerprint conflict, fresh role changes, NULL storage, exact identity reuse and closed/full/online-claim refusal. Native tests create only synthetic fixtures in the opted-in non-superuser `_test` DB. ASGI tests do not replace native transaction or browser evidence.

Original RED results and harness-only failures are retained externally. Real HTTP/file/DB/restart, local browser, independent acceptance, full Security/UAT and production are separate gates. No provider, SMS, OCR or check-in implementation is introduced.

## Synthetic managed journey (2026-11-03)

`/api/v2/operations` implements `rose.demo-journey.v1` alongside unchanged v1 and
`rose.offline-sync.v2` enums. New event sidecars explicitly opt into draft/publication,
registration windows, separate online/offline pools, reserved Leader allocation and
expiring waitlist offers. Unmanaged events retain aggregate/FIFO behavior. Managed
legacy application/approval/cancel/sync paths share policy and allocation; legacy
PATCH cannot bypass managed event transitions. Global Organizer registration reads
and approval now require ownership of the event. Private supporting-document binary
ACL is unchanged.

Before starting this source against any database, snapshot the intended dedicated
synthetic development database and explicitly apply:

```powershell
$env:PYTHONPATH='.'
python scripts/migrate_demo_journey.py --acknowledge-development --database <exact-dedicated-database-name>
```

Migration identity: `rose_demo_journey_20261103_v1`. It checks the connected database
name and non-superuser role, locks its own migration identity, and creates only the
additive journey tables and ledger. It never runs at startup, never resets data,
and refuses missing prerequisites. Fresh databases must explicitly import **all**
models (`from src.main import app`) before `Base.metadata.create_all`; they also need
the earlier native base and Phase2 schema/nullability migrations where applicable.
Do not run this against retained historical Demo databases.

Set `NU_DEMO_PROFILE=synthetic`, a task-owned `NU_DEMO_NAMESPACE`, and the exact seeded
Organizer ULIDs in `NU_DEMO_OWNER_IDS`. Only those seed-designated admins can provision
namespace-prefixed user/leader/organizer accounts or change managed account access.
New Organizers do not become Demo admins. Explicit bootstrap adds `JourneyState`
rows with key `account:<ULID>`, kind `account`, version1 and data `{enabled: true}`
for namespace accounts which the account list should manage. Passwords stay outside
Git. Disabled sidecars reject login, refresh, retained bearer access and fresh
post-lock operations; existing JWT bytes are not cryptographically revoked.

A real IANA TZif database is required by Python `zoneinfo`. On the approved Windows
runtime (without bundled tzdata), use the existing PostgreSQL17 distribution:
`PYTHONTZPATH=E:\NU_Local_Environment_20261014\runtime\PostgreSQL17\pgsql\share\timezone`.
Other installations may use an existing OS IANA database. Do not silently reinterpret
invalid timezone names as UTC.

Each immutable operation, business transition and registration-bound Demo outbox
write commits once. Event → fresh actor → registration/sidecar lock order is shared.
Mutations require current versions; exact same actor/request replays return the
historical receipt, modified requests conflict. Readback never repeats business
writes. Attendance IDs are distinct from registration sync IDs. The frontend may
queue preloaded roster actions offline; restoring connection must explicitly register
an intent and apply it against fresh role, booking and time-window checks. Closeout
blocks unresolved server intentions and requires the presenter's explicit local-queue
attestation; it cannot know about unseen devices.

`DEMO_TEMPLATE`, `DEMO_OTP` and `DEMO_OUTBOX` are explicit local providers. They never
send SMS or WhatsApp and never prove phone ownership. OTP codes/access/grants remain
in memory at the client; the database retains only secret hashes and expiry. The
short Demo code is derived from the random challenge access secret and server secret,
then compared using its stored hash. No raw code/token is logged or written to the
ledger. `NU_DEMO_OUTBOX_FAIL_KINDS=<comma-separated-kinds>` explicitly records deterministic
Demo failures for retry tests; retry changes only the existing outbox record.

Controlled checks: `python -m pytest tests/test_journey_acl.py tests/test_journey.py`.
Native checks require explicit `NU_NATIVE_TEST_DATABASE_URL` ending `_test` and run
`tests/test_journey_native.py`; they never replace controlled results or browser/UAT
acceptance. Native closeout derives totals from persisted registrations/attendance.
SQLite controlled responses honestly identify their source as `sqlite`.

Anonymous managed application writes additionally require `X-Application-Key`: a
canonical unpadded43-character base64url value from32 random bytes. Create and retain
it privately before POST alongside the immutable operation. The backend stores only
its SHA256 actor binding; exact POST replay and creation-receipt GET require the same
capability. This key only recovers that creation receipt; booking management still
requires the separate scoped DemoOTP grant. Never put it in URLs, logs or exports.

An ordinary account with a linked participant receives a generic 422
`INVALID_INPUT` for a different National ID on a managed application. The
refusal creates no registration or receipt. Submit corrected input explicitly
with a new operation ID. Existing pending `IMMUTABLE_CONFLICT` entries in
retained browser profiles require explicit review before further action.

Normal authorized Organizers can create their own managed events; only the seeded
Demo admin allowlist can provision accounts. Promotion GET uses the current assigned
Leader's stable referral, or an owner's explicit `?leader_id=<assigned-ULID>` selection;
it never mints a new code during a read. Promotion pause does not close registrations.
Assisted corrections preserve original entry/source attribution, return pending
review and release a place/live offer atomically, but refuse arrived bookings.

Fresh enabled Organizers may read only assignable namespace Leaders through `GET /api/v2/operations/accounts?scope=assignable_leaders`. Unscoped account administration remains restricted to seeded Demo admins; unknown scopes fail422. This directory grants no account-management permission.

Managed legacy online admission also enforces current staff role and event assignment.
Before a waitlist offer, the allocator rechecks enabled accounts for both the entry
operator and linked participant, plus current Leader assignment. Disabled candidates
receive neither a capacity hold nor an offer outbox record; FIFO continues to the next
eligible candidate without changing original operator or referral attribution.

## Own profile and synthetic assisted account recovery (R3, 2026-11-03)

Existing v1 routes and user response fields remain. Explicit account routes under
`/api/v2/operations` are registered before the journey catch-all. Every enabled
authenticated role can `GET /me/profile` and `POST /me/profile`, editing only
`display_name` (trimmed, 1–80 Unicode characters, no control characters) and
`preferred_language` (`en|ms`). Use the existing `rose.demo-journey.v1` operation
envelope and the current `expected_version`, including 0 for an absent profile.
GET is a projection and creates no row. Stale saves return 409. Exact replay and
`GET /me/profile/receipts/{operation_id}` return the original own receipt; follow
with current GET. Username, role, Participant identity, booking contact and historical
registration snapshots are not profile fields.

Before using this source against the intended dedicated development database,
snapshot it and explicitly apply the additive migration:

```powershell
python scripts/migrate_accounts.py --acknowledge-development --database <exact-dedicated-database-name>
```

Identity `rose_account_recovery_20261103_v1` creates typed `account_security`,
`account_profiles`, `account_recovery_challenges` and `accounts_schema_migrations`.
It requires base/journey prerequisites, exact connected DB acknowledgement and a
non-superuser development connection, takes its own advisory lock, and validates
column types/nullability, keys, foreign keys, checks and indexes on first/repeat
runs. There is no backfill or startup migration. Missing security state means
generation 0; legacy JWTs without a generation work only at generation 0. Fresh test
bootstrap importing all model metadata is separate from migration evidence.

Recovery issuance is admin-assisted and synthetic only: a current enabled Organizer
in server `NU_DEMO_OWNER_IDS`, with `NU_DEMO_PROFILE=synthetic` and a configured
namespace, selects an enabled namespace-managed account from `GET /accounts` and
POSTs `/account-recovery/challenges` with data `{account_id,synthetic:true}`.
Public signup still permits only role `user`; only server synthetic mode plus a
matching namespace prefix creates the existing managed-account sidecar in the same
signup transaction, making a newly signed-up Demo participant recoverable. Other
accounts are not backfilled or silently admitted.

The current original issuer alone reads
`GET /account-recovery/challenges/{id}/demo-message`. It returns a clearly labelled
`DEMO_PROVIDER` secret and explicitly reports no external delivery or identity
verification. It is not an email/SMS ownership check. No anonymous username-only
issuance or real-provider fallback exists. Secrets are derived with domain-separated
HMAC; the database retains only hash, nonce and bindings.

The recipient POSTs `/account-recovery/challenges/{id}/reset` with capability header
`X-Account-Recovery` and envelope data `{new_password}` (12–72 UTF-8 bytes).
Password hashing, token-generation increment, consumed challenge, invalidation of
other challenges and sanitized immutable receipt commit once. Access and actual
refresh tokens from the prior generation fail; both JSON/form login and refresh
serialize with reset on the user row. Existing event-first paths recheck the
request-bound generation after their locks, including legacy cancellation/approval
and Phase2 synchronization. Only the authenticated principal's presented generation
is bound; unrelated candidates and internal calls do not inherit it.

Synthetic engineering policy is five minutes/five wrong attempts, at most three new
issuances per target and thirty per issuer per ten minutes. A new issuance replaces
older unused secrets; exact issuance replay consumes no additional quota. Current
issuer/target revocation blocks reset and readback. The refresh cookie is cleared
after reset; explicit login is required. This server revocation is distinct from
the existing local Logout UI and does not erase remote browser caches.

Recovery secret/new password must stay only in current component memory, never
localStorage, IndexedDB, persistent payloads, URLs, logs, exports or screenshots.
After a lost response, GET
`/account-recovery/challenges/{id}/receipts/{operation_id}` with the same capability
before any retry. A valid unused challenge with no receipt returns 404; a used
challenge bound to another operation returns generic 403. A committed exact reset
can only return its historical receipt, never repeat the password change. Receipt
GET and exact POST replay share a 24-hour read-only deadline after success; this is
a synthetic policy proposal, not approved production retention. Same ID with a
changed password conflicts using a keyed fingerprint, not a cheap unsalted password
verifier. Revoked issuer/target or elapsed deadline refuses readback. Persist only
nonsecret IDs/unknown markers; re-enter the original secret after reload and the
same password only for a deliberate exact retry when no receipt exists.

Sensitive responses/errors are `no-store`. A known serialization/deadlock abort
returns controlled 409 after rollback. Unexpected connection/commit failure returns
bounded `OPERATION_OUTCOME_UNKNOWN` (500), requiring original-receipt reconciliation;
there is no automatic business retry or claim that an indeterminate commit rolled
back. No raw request, password or secret is placed in ordinary errors/receipts.

Controlled checks: `python -B -m pytest tests/test_accounts.py -q`. Native account
checks: `python -B -m pytest tests/test_accounts_native.py -q`, only with explicitly
assigned `NU_NATIVE_TEST_DATABASE_URL` and exact isolated `_be_test` names. Local
defaults use the original R3 databases on port5441; CI explicitly supplies
`NU_ACCOUNTS_NATIVE_DATABASE`, `NU_ACCOUNTS_MIGRATION_DATABASE`,
`NU_ACCOUNTS_SHAPE_DATABASE` and `NU_ACCOUNTS_NATIVE_PORT`. Loopback, distinct bounded
test names, PostgreSQL17.11 and non-superuser identity checks remain mandatory.
Override account and Phase2 evidence directories/labels and upload paths per run.
They cover concurrency, precommit rollback, injected lost acknowledgement, actual
refresh cookies, lock-wait revocation, signup directory and migration guards.
ASGI/native evidence is separate from a real TCP/browser journey, independent
acceptance, CI, UAT, merge and production delivery.

Legacy event creation now takes the Organizer row lock and rechecks current
role, enabled state and presented token generation before inserting any event.
This closes a request that authenticated before a credential reset but resumed
after it. The account migration compares quoted SQL values exactly while
normalizing PostgreSQL expression formatting; uppercase language literals cannot
silently satisfy the required lowercase `en`/`ms` constraint.
