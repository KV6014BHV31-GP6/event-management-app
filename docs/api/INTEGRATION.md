# Austin frontend and API integration record

## Backend repair candidate — 2026-10-26

This section describes Sol's tested candidate on `dev_be_booking_lifecycle_repair`, based on `dev@4541c948f8aec68dbbb9500630abc8282a62abca`; it does not revise Austin source history or grant Frontend live admission. Final immutable SHA is in the PR/external receipt. [Data Flow Before/After](DATA_FLOW.md) and [adoption/policy/test task](../dev/tasks/BE-BOOKING-LIFECYCLE-REPAIR-20261026.md) qualify every claim. Earlier sections below retain their source/version scope. PR38 remains untouched UI_ONLY.

All paths below use `/api/v1`; error envelope is `{"detail": ...}`. Source/read five-state contracts are separate from strict registration POST201/online/pending. HTTP/DB VERIFIED means bounded author checks, not Astra approval, whole Security or UAT acceptance.

| Method/path | Candidate HTTP contract and measured boundary |
| --- | --- |
| POST `/users` | Public username3–20 code points/nonblank and password>=6 code points/<=72 UTF-8 bytes; original valid values retained. Omitted role or user creates201 ordinary user. Organizer/leader role injection422 with no row. Username duplicate400 `Username is already registered.`; response id/username/role/timestamps, never password/hash. |
| POST `/auth/login`; POST `/auth/token` | Existing JSON and form transports preserved;200 access_token/token_type=bearer,401 wrong identity. No refresh/Cookie feature adopted. JWT sub is exact username; role permission always comes from current DB user. |
| GET `/users/me` | Required Bearer;200 DB identity. Invalid/expired/malformed/non-Bearer/empty/unknown subject/refresh-as-access401; no Guest fallback or write. |
| POST `/events` | Required DB organizer; ordinary/leader403, anonymous401. Existing form fields/default quotas retained, max2147483647 and explicit timezone timestamps/end>start.201 response includes matching public_id/numeric id and required quota. Invalid naive/mixed timestamps422. |
| GET `/events` | Public page/pageSize/status/keyword;200 count/page/page_size/total_pages/data. page>=1, size1..100 default20; keyword title OR overview; same SQL statement count/page/aggregates. Invalid status422. |
| GET `/events/{public_id}` | Public21-character ID;200 detail/required quota; bad length400 `Invalid identifier structure. Expected a 21-character public NanoID ID.`; missing404 `Event with public identifier '<public_id>' was not found` (no final period). |
| POST `/events/{public_id}/registrations` | Only absent Authorization can be Guest. Flat existing participant form plus medical_record=null. Valid201 requires generated ULIDs, correct event_id/actor, echoed snapshot, online/pending. Both A/B pending allowed even online capacity1. Invalid auth401; identity collision403; normal noncancelled duplicate400 `This participant already holds an active registration record for this event.`; missing event404 with final period; inactive400; invalid body422; other constraint conflict409 generic. |
| GET `/me/registrations` | Required identity; optional five-state status;200 flat own array by created_by_user_id, created_at descending. Invalid status422. No pagination, title/public_id mapping, Guest capability or fabricated persistence. |
| POST `/me/registrations/{id}/cancel` | Required owner; no body.200 cancelled for pending/approved/waiting; missing404; nonowner403 `You cannot cancel this registration.`; rejected/repeated400 `This registration cannot be cancelled in its current state.`. Supported approved cancellation and one waiting promotion commit atomically. |
| GET `/registrations`; GET `/registrations/{id}` | Required organizer; list optional status and no pagination/event filter,200 global list/detail. Ordinary/leader403 with/without valid status; detail missing404. Not a user/Guest listing endpoint. |
| POST `/registrations/{id}/approve` | Required organizer, no body; pending-only200 approved/waiting according to supported count; nonpending409 `Only pending registrations can be reviewed.`; missing404; nonorganizer403. |

Quota shape: `online/offline/total` each contain configured capacity and DB approved count; `waitingCount` is nested in quota. `allocation_supported=true` only for online rows/offline capacity0. Unsupported offline allocation count is null, never an invented0; total counts are actual all-channel counts, not remaining. Mixed/unmapped Approve or approved-cancel returns409 `Mixed-pool allocation is not supported by this candidate.`. No walkin/ocr→offline assumption or offer/accept/expiry is implemented.

Mutation protocol: event→registration lock for review/cancel; event→user→participant for online creation. State is reread after locking, updates flushed with autoflush=False, and each service owns one commit/rollback over auth autobegin. Native partial unique index on event/participant where status!=cancelled backs duplicate prevention, including rejected. Cancelled reapplication retains source behavior only; it is not approved universal policy. Guest identity reuse/claim/read/cancel is unsupported. No unadopted offline writer is mounted or claimed to obey the protocol.

Evidence:28 SQLite/ASGI/schema tests PASS;3 opt-in native PG tests PASS; main native ledger100 layered checks PASS across preserved stopped attempts/continuations, plus5 additional HTTP checks and4 unchanged Frontend API-client compatibility checks. New READ ONLY DB verifies final4 users/5 events/3 Participants/9 registrations, null Guest pointers, identities/statuses and counts. Source/runtime and command receipts are local originals; public task/tests/data-flow provide inspectable summaries. Whole native E2E/Browser/Security/UAT and old DB migration NOT_RUN. Actual cases define VERIFIED coverage; other permutations of documented source errors are not independently claimed as HTTP verified.

## Historical integration records

## W7 bounded successor, 2026-10-20

Frontend base: `dev@a47ff7d92f296ebd0604a1df98daf0b8111829b3`; backend dependency: `dev_be_registrations@d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0` (not in dev). This supersedes the historical contract inventory below **only for the W7 operations**. See the [W7 task](../dev/tasks/FE-W7-BROWSE-REGISTRATION-20261020.md).

| Operation | Current contract and UI boundary |
| --- | --- |
| GET `/events?page=1&pageSize=6&keyword=...` | Public, server-side title OR overview substring search, created_at descending. Page/page_size/total_count/total_pages/data are checked. New search resets page one; pagination/refresh keep keyword and discard stale responses. No location-search contract. |
| GET `/events/{public_id}` | Public 21-character NanoID detail; selected detail must match requested public_id. Invalid/not-found errors use bounded static messages. UI displays server status as supplied, with case-compatible active styling. |
| Login → GET `/users/me` | Existing token closure/tab session retained. Only a validated public ID may lead back to the fixed registration route. No signup UI, token getter or arbitrary URL redirect. |
| POST `/events/{public_id}/registrations` | Flat first_name/last_name/gender/date_of_birth/phone/address/national_id/income_band_code/marriage_status, optional medical_record=null. Strings follow existing schema max lengths; no invented phone/income/eligibility policy. Current UI omits optional medical input. |
| Registration 201 | Validate ULID references, selected numeric event_id, freshly verified nonnull created_by_user_id, online channel, pending status and echoed fields. Only then show the actual POST receipt. No confirmed-place or eligibility claim. |
| Registration rejection/unknown result | Exact reviewed duplicate/full/inactive/invalid-ID/not-found details map to bounded messages. 401/403/422 are failures; arbitrary detail/HTML/422 input never displayed. Network/timeout/5xx/malformed or mismatched success is uncertain and never automatically resent. |

Backend facts remain unresolved: registration uses optional auth, existing national_id reuse lacks current-user ownership enforcement, public signup accepts privileged roles, and there is no own-registration GET. UI gating/profile recheck does not fix these server policies. Page-memory receipts and external READ ONLY DB evidence are not a server readback feature. Original bootstrap/lowercase enum compatibility and old-database migration are not passed by the isolated schema/fixture harness. Formal income options, eligibility/review and pending-reserves-capacity policy still require PM/Austin decisions. Refs #19 / #22; full issues cannot be closed by this limited demo.

## Current live slice, FE-LIVE-20261014

The following source-backed contract supersedes the historical "no backend source" state **only for this slice**. Backend source: `dev_be_users` at `79804aa67508de23d3f3c613e65cf375e9ded2a3`; frontend base: `dev_fe_shell` at `3e9aa8f15f18dd52a142fb3bd1ebe1efaa497ab9`. Runtime and browser results are tracked in [CURRENT](../dev/CURRENT.md) and the [task](../dev/tasks/FE-LIVE-20261014.md). Public index and Login are the current delivery. A Create Event UI, guest bookings and the other historical claims are not implemented by this slice.

| Operation | Source contract | Frontend behavior |
|---|---|---|
| `GET /api/v1/events` | Public. `page` starts at 1; `pageSize` is 1–100, default 20. Optional `status` filter. Response: `data`, `total_count`, `page`, `page_size`, `total_pages`. | Show title, overview, location, dates and server status; provide pagination, loading, empty and explicit error/retry states. Quota settings are not remaining places. |
| `POST /api/v1/auth/login` | JSON `username` (3–20 characters), `password` (minimum 6). Response: `access_token`, `token_type: bearer`; wrong credentials: 401, input validation: 422. | Verify identity through `/users/me` before showing signed-in status. No automatic retries of login writes. |
| `GET /api/v1/users/me` | Bearer token; response `id`, `username`, `role`, `created_at`, `updated_at`; missing/invalid token: 401. | Restore a tab session by re-verifying it; clear expired/rejected identity; show recoverable network failure separately. |
| `POST /api/v1/events` | Bearer token, no organizer-role enforcement in imported code. Required `title`, `location`, `start_time`, `end_time`; optional `overview`, nonnegative `online_quota`, `offline_quota`. End must follow start. 201 on create, 422 on invalid input. | No Create Event UI. Validate this existing backend operation through Swagger and opt-in HTTP integration tests. |
| `GET /api/v1/events/{public_id}` | Public; 21-character identifier, 400 invalid structure, 404 absent. | Used for integration readback, no new detail screen. |

Event responses also contain internal `id`, `organizer_id`, `public_id`, status and audit timestamps. The UI does not display internal identifiers or infer booking eligibility from them. Source returns events newest-created first. The browser renders supplied text with safe DOM text APIs and keeps all API failures visible, without Mock fallback.

The local Node server forwards same-origin `/api/v1/` calls to loopback FastAPI. It is a development proxy, not a deployment or authentication boundary. Tokens use tab-scoped session storage, never passwords; `/users/me` verifies restored sessions. Logout clears this browser's token; the backend has no revocation endpoint and tokens can remain valid until their configured expiry. Shared-device and production token policy still require review. The imported public user-creation endpoint accepts a caller-supplied role; production authorization remains unresolved.

## Historical handoff record (preserved)

Current evidence: SRC09 supplies 15 API/feature claims and SRC10 repeats them. There are 11 unique HTTP method/path pairs. No payload, response schema, auth contract, reachable base URL, code commit or runtime test has been supplied. The old workspace reported repo404. During this import preparation the target repository became readable and was observed empty (no branches or pull requests). Both attempted write methods returned 403 Resource not accessible by integration; no backend code or runtime was verified. All claims are REPORTED, all actual integration tests are BLOCKED/NOT_RUN.

In the historical NU v1.2.0 workspace, the local frontend uses `integration/src/mock-service.mjs`; `integration/src/http-adapter.mjs` is a separately gated transport scaffold. Those historical modules are not imported in this documentation PR; the included standalone HTML is frozen visual evidence, not a replacement production app. The application does not currently switch to live HTTP. A production composition/service mapper must be written against the real repo and verified contract. The scaffold preserves route names; it does not validate their existence on Austin's server.

## Claim-by-claim receipt

| ID | Supplied claim | Supplied route | Missing acceptance inputs |
|---|---|---|---|
| AUS-01 | Register account | `POST /users` | Staff/leader account policy; participant guest flow must remain separate; request fields/password rules; returned user ID |
| AUS-02 | Get account information | `GET /users/{id}` | Which role can read whose record; data minimisation; missing/forbidden responses |
| AUS-03 | Update account information - phone | `PUT /users/{id}` | PUT full vs partial replacement semantics; phone verification; owner permission; concurrent update policy |
| AUS-04 | Create an event | `POST /events` | Coordinator role; event/timezone/timeslot schema; quotas invariant; duplicate create semantics |
| AUS-05 | Get event information | `GET /events/{public_id}` | public_id vs internal eventId; location/date/online/offline quotas; public redaction; lifecycle and freshness |
| AUS-06 | Update event status - end soon, full, cancelled (Frontend logic) | No concrete HTTP route supplied | UI may derive urgency from server data; cancellation and availability must be server-enforced; lifecycle write API not supplied |
| AUS-07 | Register event | `POST /register` | Guest/proxy input; allocation; duplicate/idempotency rules; confirmed/waiting response; server transaction |
| AUS-08 | Get register information | `GET /register/{id}` | Guest-safe opaque capability vs staff auth; ID enumeration prevention; private fields; not a guessed unauthenticated lookup |
| AUS-09 | Update registration status - confirmed, waiting, cancelled | `PUT /register/{id}` | Allowed transitions and actors; cancellation capability; repeat cancel; atomic waitlist promotion; no client privilege escalation |
| AUS-10 | AI brochure generation | `POST /api/v1/events/{eventId}/brochures/generations` | JSON/file/job response; sync vs async; polling route if needed; provider credentials server-side; review and failure states |
| AUS-11 | Generate application form | `GET /api/v1/events/{eventId}/registration-form` | HTML/PDF/JSON format; content-type; role; download and print; scaffold currently JSON only |
| AUS-12 | AI application form OCR --> create registration | `POST /register` | Same operation as7, not a separate proven OCR endpoint; upload/schema/size/consent/human-review flow absent |
| AUS-13 | SMS notification (before 24 hrs) - Webhook | No concrete HTTP route supplied | Scheduler vs webhook callback; provider signature/replay verification; timezone; consent; queued/sent/delivered/error audit |
| AUS-14 | Waiting list (SQL Trigger) | No concrete HTTP route supplied | DDL and transaction evidence; deterministic queue order; last-slot race; cancellation promotion; rollback and replay cases |
| AUS-15 | login | `POST /auth/login` | Auth payload/session or bearer format; expiry/refresh/logout; roles; CORS/CSRF; no token storage assumption |

## Gaps against the product draft

US02/03/05 need referral, activity reporting and dashboard data. US01 needs a specified timeslot/quota model and an event-update lifecycle. US09 needs a restricted roster, check-in and reconciliation protocol. US10 needs no-show/walk-in rules. An event list query may be needed for staff navigation. Austin's list does not specify these operations. Mark them missing from the handoff, not proven absent from the backend. Do not invent working paths for them.

Mixed unversioned routes and `/api/v1` are preserved until the actual server is inspected. IDs (`public_id`, `eventId`, `id`) stay distinct until mapping is documented. `POST /register` appearing for normal registration and OCR does not establish multipart support or a working OCR pipeline.

## Contract confirmation record per operation

Fill in method/path, source backend SHA, request query/body schema, required/optional/null fields, response status/schema/content-type, ID mapping, timestamp timezone, permissions, auth method, error envelope and codes, concurrency/idempotency semantics, examples and evidence. Obtain schema from real code/OpenAPI and verify it against actual responses. Never create a guessed OpenAPI document and call it an accepted contract.

For guest cancellation, agree an unguessable scoped capability or other explicit verification method. A numeric registration ID alone is not authorisation. GET must not cancel; URL preview bots and retries may issue GET. POST/PUT intent must be verified, and cancellation/replay behaviour documented.

For live cookies, review origins, credentials, CSRF and cookie attributes. CORS is not authentication. Hiding coordinator controls does not protect the API. For bearer auth, keep tokens out of files/logs and settle secure lifecycle handling before production integration. The current adapter is not an authentication system.

## Failure and offline behaviour

- Read failure: distinguish unavailable server, HTTP rejection, invalid JSON, contract mismatch and stale cached data.
- Write timeout: outcome unknown. Query/reconcile with the same operation key after server idempotency is established; no blind resend.
- Offline state: queue an intent or check-in only under the agreed policy; do not promise a confirmed place from an old count.
- Multiple devices: reserved leader quota alone does not allocate non-overlapping device quotas. Server reconciliation must enforce final capacity.
- Waitlist: specify FIFO or another priority, allocation pool, offer vs auto-confirm, offer expiry and exactly-once promotion semantics within transactions.
- Reminder: a webhook needs an event source; “24h webhook” does not prove a clock-based scheduler. Provider accepted and recipient delivered are different states.

## Integration evidence template

| Field | Required value |
|---|---|
| Frontend branch/full SHA | unknown until actual repo import |
| Backend branch/full SHA | unknown |
| Contract version/source SHA | unknown |
| Base URL/environment | nonproduction, authorised, no secrets in report |
| Data | synthetic seed and reset method |
| Scenario | requirement ID + operation IDs + steps |
| Expected | response, persisted state and invariant |
| Observed | status, redacted body, DB/result evidence and errors |
| Repeatability | exact command or executable test |
| Result/reviewer/time | PASS/FAIL/BLOCKED/NOT_RUN, named reviewer and timestamp |

A screenshot of a mock success is G2 evidence only. G4 requires the real frontend/backend pair, persistence and failure cases. Obtain the inputs in `../dev/AUSTIN_HANDOFF_REQUEST.txt` before enabling any actual operation.

## DEV-SPLIT-20261013 handoff location

For the proposed Frontend/Backend workspace split, use [HANDOFF_CHECKLIST.md](HANDOFF_CHECKLIST.md) as the intake form and [Developer ownership](../dev/OWNERSHIP.md) to identify the contributor and reviewer. This document remains the sole inventory of reported operations; none of these routes became verified merely by adding directory entry points.
