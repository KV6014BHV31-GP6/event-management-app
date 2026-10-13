# Austin frontend and API integration record

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
