# Booking lifecycle candidate data flow — 2026-10-26

Owner: Sol, sole product writer on `dev_be_booking_lifecycle_repair`; independent acceptance: Astra; original Backend owner: Austin. This candidate is based on D `4541c948f8aec68dbbb9500630abc8282a62abca`. The final full candidate SHA is in the PR/external `DATA_FLOW_CANDIDATE.md`, avoiding a self-referencing commit. [API contract](INTEGRATION.md); [repair/adoption/policy task](../dev/tasks/BE-BOOKING-LIFECYCLE-REPAIR-20261026.md).

## Before: preserved source-qualified findings

Astra's original `DATA_FLOW.md`, run20261026-181320, remains unchanged outside Git. Before is SOURCE_ONLY, not repaired/native evidence. D imports but lacks registrations; R/E complete imports fail on committed markers, and E response schema has an unresolved type. U imports but is not a complete registrations pairing.

| Source | Full SHA | Before and selective use |
| --- | --- | --- |
| D / dev | `4541c948f8aec68dbbb9500630abc8282a62abca` | Existing Login/Signup/Frontend/bootstrap kept; public role and optional-auth weaknesses require repair. |
| U / users | `847d035fe333a3b544204377e91690b83fdb42be` | Invalid-token rejection idea only; non-Bearer still fell back to Guest. No refresh/Cookie or whole-branch adoption. |
| R / registrations | `3bc68265efb79a8527b2ce2d8c185f5f8d9378d0` | Models/form/self/approve/cancel design; unsafe participant overwrite, no duplicate constraint/locks, missing func and status-shadow. |
| E / events | `8b27e04c7b3f71413800ec4b1ce84fd7acfe7687` | Aggregate shape/SQL idea only; markers/types/missing imports/keyword/offline-enum issues. |
| O / offline | `e70ea3fba269130dfc445acdea817c49fd1f3f91` | Read-only dependency inspection; no adoption or mounted writer. |

IDs: users/participants/registrations.id are canonical ULIDs; JWT sub is the exact username, not users.id. events.id / registration.event_id are numeric internal FKs; only events.public_id is the21-character URL identifier. Guest null actor is not lookup/cancellation authority. Own GET has no event title/public_id; no numeric-to-public URL or invented mapping is supplied.

## After 1: Signup / Login → user / access token / DB role

`Public JSON → users.create_user → UserService.create_user → users INSERT/commit →201`

`JSON login OR form token → DB username/password → access token → Bearer → resolve_user → DB UserModel → profile`

| Aspect | Before → candidate and actual evidence |
| --- | --- |
| Actor, method/path, functions | Public POST `/api/v1/users`; POST `/auth/login` JSON and `/auth/token` form; GET `/users/me`. D router/Login retained; new schema validators/service guard; shared `auth.deps.resolve_user` and `require_organizer`. |
| Input/output/fields | Exact raw username/password retained, code-point bounds plus bcrypt byte guard; omit role or user only. Users ULID/username/user-role/timestamps, no password/hash; access_token/token_type returned only to caller, not evidence. |
| Auth | Only absent Authorization can be Guest. Required/optional share signature/exp/sub/type and DB lookup. Invalid/expired/non-Bearer/empty/unknown subject/refresh-as-access=401; DB role wins over JWT role claim. No new refresh endpoint. |
| Transaction / refusal / unknown | Public role organizer/leader422 and service defensive403; username unique-race rollback→existing duplicate400 text. Login/profile are reads. Unknown write response is not automatically retried; reconcile the existing account/reference. |
| Status / tests | VERIFIED in bounded native HTTP: `PUBLIC_SIGNUP_A/B`, `LOGIN_FRESH_ME_*`, role/token negatives and DB row-hash comparisons. A preserves spaces/Unicode through Signup/Login/me. Source/SQLite tests remain separate. |

## After 2: User / new Guest → owned participant → pending snapshot

`POST /events/{public_id}/registrations → optional identity → event FOR UPDATE → user/participant pairing → participant flush → registration flush → one commit →201 online/pending`

| Aspect | Before → candidate and actual evidence |
| --- | --- |
| Actor/source/functions | User/new anonymous Guest. R form/model design; `RegistrationService.create_online_registration` and `ParticipantService.resolve_for_registration` replace unowned National ID overwrite. |
| Input/output | Existing flat nine participant fields plus medical_record=null; same form snapshot, typed registration/participant ULIDs, selected event_id and actor, online/pending. No new income options or medical collection. |
| Auth/tables | Server DB user.id only; no user identity taken from request. Existing own participant must retain National ID and is reused across events; only its demographics can change. Another user or unclaimed Guest identity is403, with no claim/overwrite. Guest requires a new identity and stores participant.user_id=null / registration actor=null. |
| Locks/duplicate/transaction | event→user→participant lock order; explicit participant flush with autoflush=False. Noncancelled `(event_id,participant_id)` partial unique index plus precheck; duplicate400 exact old message. Participant+registration atomic; constraint conflict rollback409 without SQL/profile details. No pending-capacity gate, so both A/B can apply. |
| Failure/unknown | Invalid auth401 before writes; identity403; absent event404; inactive400; validation422; duplicate400. Timeout/5xx does not prove rollback; no auto retry. Guest has no safe GET/claim/cancel here. |
| Status/tests | VERIFIED native `REGISTER_*`, collisions, `B_CANNOT_CLAIM_UNOWNED_GUEST`, cross-event same-participant, normal duplicate and doublePOST201/400. New READ ONLY connection verifies rows/links; native index test separately bypasses precheck and gets23505 with rollback. |

The D standalone Participant POST is retained with server-assigned identity and safe collision handling; R administrative GET/PATCH routes are not newly mounted. No claim is made about unadopted offline writers or external SQL following these locks.

## After 3: Own GET → server actor filter → fresh response

`Bearer → GET /me/registrations?status=... → get_current_user → RegistrationService.get_user_registrations → WHERE created_by_user_id=DB user.id →200 flat array`

| Aspect | Candidate and evidence |
| --- | --- |
| Input/output/auth | No body/pagination; optional five-state status; required current DB user. Invalid status422. The response remains flat, with ULID references, numeric event_id, actor, form snapshot, channel/status and timestamps. |
| Tables/transaction | Read-only SELECT; created_at descending with ID tie ordering. No organizer-wide list borrowing, localStorage persistence or write/commit. |
| Refusal/unknown | Missing/invalid identity401. Empty list is a real empty result, not a fabricated receipt. GET failure remains an error/unavailable. |
| Status/tests/Frontend | VERIFIED native A/B pending→approved/waiting→cancelled/promoted GET readbacks and new DB connection. Existing Frontend has no own-read page/adapter or browser Reload wiring: NOT_RUN, not claimed. |

## After 4: Organizer Approve → locked state/capacity → approved or waiting

`Organizer Bearer → POST /registrations/{id}/approve → DB role → scalar event_id → event lock → registration lock/fresh reread → count → state/audit → one commit`

| Aspect | Before → candidate and evidence |
| --- | --- |
| Source/functions | R approve design; `require_organizer`, `_locked_target`, `_supported_allocation`, `_approved_count`, `approve_registration`. func imported; query name status kept without namespace shadow. |
| Inputs/outputs/tables | No body; pending only. Reads events/registrations; writes status/reviewed_by_user_id/reviewed_at/updated_at and waitlisted_at when waiting.200 flat registration. Organizer GET list/detail remain role-restricted source routes. |
| Auth/transaction | DB organizer only. Auth SELECT autobegin is reused, not nested begin. Event→registration locks, populate_existing after waiting, count/update/flush/commit in one transaction. |
| Supported allocation | Explicit candidate online channel/offline capacity0 only; approved uses online capacity, not combined mixed pools. Mixed/unmapped allocation409. Pending does not consume approved count in this limited scenario. |
| Refusal/unknown | Nonorganizer403 (list with/without status, detail/approve/create), missing404, nonpending409, inactive400; unknown POST outcome requires GET/ledger, not retry. |
| Status/tests | VERIFIED native A-approved/B-waiting, organizer list/detail and role negatives; two independent HTTP/session approvals for the last place produce one approved/one waiting, DB approved<=1. No UI Approve button or general offer policy delivered. |

## After 5: Own cancel → ownership → atomic cancellation and promotion

`Bearer → POST /me/registrations/{id}/cancel → _locked_target(event then registration) → actor/state recheck → cancelled/flush → same-event waiting lock → promote if supported capacity → one commit`

| Aspect | Before → candidate and evidence |
| --- | --- |
| Cancels whom / auth | Only registration.created_by_user_id==current DB user.id; knowing an ID/National ID is insufficient. Guest receives no cancellation capability. |
| Selection / fields | `cancel_user_registration` selects earliest waiting by waitlisted_at, then ID as technical deterministic tie-breaker; priority policy is unapproved. Target gets status/cancelled_at/cancelled_by_user_id/updated_at. A selected waiting row gets approved/updated_at; original review attribution remains. |
| Transaction/locks | Same event-first protocol as approve; recheck target after lock. Flush cancellation before count because autoflush=False. Cancellation+promotion are flushed and committed once, or both roll back. Only prior approved can release/promote; pending cancellation changes no approved-based quota. |
| Refusal/unknown | Missing404; nonowner403; rejected/already cancelled400. Repeated cancellation makes no second release. Mixed-pool approved cancellation409. Unknown HTTP result: GET own record and reconcile ledger/DB; no automatic resend. |
| Actual main readback | A pending201→approved, B pending201→waiting; A cancels→A own GET cancelled and B own GET approved. A response does not claim B's result. Both readbacks matched new READ ONLY connection; approved stays1 after refill. |
| Status/tests | VERIFIED limited native HTTP and DB; double cancel200/400 makes one promotion. Separate native PG test injects failure only in its test Session.commit after flush, proving target and waiting update both roll back in a fresh Session. It is controlled fault evidence, not a real outage or Security PASS. |

## After 6: Events quota → DB statement snapshot → response → future UI

`Public Create/List/Detail → EventService count/page/aggregate SQL → EventQuotaAggregate → HTTP JSON`

| Aspect | Before → candidate and evidence |
| --- | --- |
| Functions/source | R enum/keyword; E aggregate idea; candidate `EventService._counts`, `_response`, `get_paginated_events`, `get_event_by_public_id`. No broken E service/image/PATCH copied. |
| Input/output | page>=1, pageSize1..100 default20, keyword title/overview, controlled status enum. Count/page/data share one SQL statement; each event's correlated aggregates use that snapshot and avoid join multiplication. Create201/List200/Detail200 use the same quota builder. |
| Actual semantics | `quota.online/offline/total={approved,capacity}`, nested waitingCount and allocation_supported. Online/all approved and waiting are DB counts; capacities are settings, never remaining. Offline approved is null when mapping is unsupported, not a fake zero; walkin/ocr are not renamed offline. |
| Limited policy | Online1/offline0 with only online rows supports allocation; approved1 after refill is still full. Mixed-pool settings may be read truthfully but approve/promotion is unsupported. No API field promises remaining places. |
| Refusal/unknown | Invalid status/timezone/input422; invalid public ID400; missing404. GET failure is unavailable, not guessed counts. |
| Status/tests/Frontend | VERIFIED native keyword hit/empty/page/detail/Create quota and fresh DB counts, plus mixed-pool409/nullable display. Four checks through unchanged Frontend API client over real HTTP PASS; Browser NOT_RUN. PR38 remains UI_ONLY and its unmounted component still displays Quota Unavailable. |

## Evidence layers and remaining boundary

Native source hashes were captured before a required CRLF→LF publication correction. The external per-file proof preserves the original hash, final hash, exact normalized-text equality and identical Python AST. Final unit/static/native read-only checks follow; the completed stateful main fixture is not blindly replayed. This binding is explicit rather than pretending all pre-normalization raw hashes already equal the final commit.

- Full static import/OpenAPI and response model schemas PASS; actual HTTP OpenAPI200 separately proved14 paths and no offline/files mount.
- Original2 SQLite users tests retained; current unit/ASGI/schema suite28 PASS with3 native tests explicitly skipped when not opted in. Actual opt-in native PG tests3/3 PASS in the required mid-flow state; do not blindly rerun that write-state-dependent case after final promotion.
- Native main ledger100 passed checks comprises97 real-HTTP checks,1 controlled fixture setup,1 native-test summary and1 fresh-DB reconciliation. It records121 request intents, including one client-side header transport rejection later reconciled with unchanged rows. Two stopped harness attempts and same-fixture continuations are preserved; not a clean single-attempt claim. Additional HTTP checks5/5 include mixed-pool409 and timezone422; no extra rows. Final budget4 users/5 events/3 Participants/9 registrations.
- Bootstrap first creation/repeats retained; exact row hashes/password/seed dates preserved across the measured repeat. Three stable seed events plus2 API events explain the pre-recorded5-event budget. Existing-schema guard refuses incompatible legacy schema; no old DB migration was applied or passed.
- Full E2E, Browser UI, Security, UAT, DB restart, video, production deployment and launcher switch NOT_RUN. Policy gaps and frontend work remain in the task; Astra independent acceptance has not occurred.
