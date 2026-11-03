# Demo journey contract — rose.demo-journey.v1

Status: engineering contract locked for explicit Owner synthetic scope, 2026-11-03. API prefix `/api/v2/operations`. Existing `rose.offline-sync.v2` and v1/v2 wire enums remain. Original-source coverage remains separately recorded. This file is owned only by Astra. A necessary change requires a versioned coordinated amendment, never silent FE/BE drift.

## Common mutation and receipt

All POST mutations except OTP challenge/verify use `{contract_version:"rose.demo-journey.v1",operation_id:UUID,expected_version?:integer,data:object}`. Creation omits expected_version; existing resource changes require its fresh integer version. IDs: existing event21-character NanoID, user/registration ULID, canonical lowercase UUID operations.

Return200 `{contract_version,operation_id,kind,resource_id,resource_version,recorded_at:UTC_Z,outcome:"applied",effects:{...}}`. Receipt is immutable. Kind/resource/current actor or scoped guest grant/payload fingerprint are bound. Business effects, outbox effects and receipt commit in one nativeDB transaction. Same exact request/actor returns original receipt; changed payload409 IMMUTABLE_CONFLICT; other actor403. `GET /receipts/{operation_id}` requires fresh bound authorization. Receipt read creates nothing; current resource GET follows historical receipt.

Errors: `{detail:{code,message}}`; AUTH_REQUIRED401, FORBIDDEN403, NOT_FOUND404, STALE_VERSION409, IMMUTABLE_CONFLICT409, EVENT_CLOSED409, WINDOW_CLOSED409, CAPACITY_UNAVAILABLE409, OFFER_EXPIRED409, PENDING_ATTENDANCE409, INVALID_TRANSITION409, INVALID_INPUT422, DEMO_PROFILE_REQUIRED403. No credential/OTP/document/request content in logs/errors. HTTP401/403 cannot be bypassed by Demo network mode.

## Server profile and backward compatibility

`NU_DEMO_PROFILE=synthetic`, `NU_DEMO_NAMESPACE=<run-prefix>` and `NU_DEMO_OWNER_IDS=<comma-separated seeded owner ULIDs>` explicitly enable Demo providers/namespace management. Never trust VITE flags for authorization. Existing auth remains real. New sidecars store managed workflow/policy, access status, review/attribution/offer/version, operations/attendance/outbox/challenges. Additive migration identity `rose_demo_journey_20261103_v1`, explicit database acknowledgement; never auto-migrate old DB.

Old events without workflow sidecar retain old aggregate/FIFO auto-promotion. New managed events use `separate_pools_offer`. Every v1/v2 and operations admission/approval/cancel route consults shared managed policy; legacy paths must not bypass window, assignment, offers or completed-state guard. Event→fresh actor→registration/offer lock order; recheck role/enabled/assignment after event lock. Legacy global organizer registration list/detail/approve is fixed to owning organizer for all events. Supporting-document ACL remains owner or owning-event Organizer. Mutable sidecars increment version on legacy-originated changes too.

## Accounts

`GET /accounts` → `{accounts:[{id,username,role,enabled,version}],as_of_utc}`; only configured namespace and seed-designated Demo owner organizer.

`POST /accounts` data `{username,password,role:"user"|"leader",synthetic:true}` → effects `{account_id,role,enabled:true}`. Names must carry run namespace prefix. No privileged public signup or organizer creation through this route. `POST /accounts/{id}/access` data `{enabled:boolean}` → effects `{account_id,enabled}`. Foreign/legacy/self/last-owner disabling denied. Auth/current-role checks reject disabled users; retained JWT bytes are not claimed cryptographically revoked. Offline drafts retained locked; sync rechecks live enabled role.

## Managed event lifecycle

`POST /events` data `{event:{title,overview,location,start_time,end_time,online_quota,offline_quota,image_file_ids},timezone,registration_opens_at,registration_closes_at,policy:{allocation_mode:"separate_pools_offer",offer_minutes:30,walkin_pool:"offline",checkin_opens_at,checkin_closes_at,reminder_hours:24,low_demand_ratio:0.5}}` creates draft. All numeric policy values configurable bounded Demo proposals. Require valid IANA timezone, chronological times, nonnegative pools and total>0. Publish requires1–3 owned images and content. Initial version1.

`GET /events/{id}` → `{contract_version,event:<existing EventResponse>,workflow:{version,state:"draft"|"published"|"postponed"|"cancelled"|"completed",timezone,registration_opens_at,registration_closes_at,change_notice},policy:{...plus owner:"proposal",synthetic_only:true},as_of_utc}`. Authenticated owner/assigned leader reads managed details. Public original list/detail excludes drafts and shows public additive workflow metadata where useful; do not expose private policy/account data. Public event link remains existing event route.

| POST suffix under /events/{id} | data | Rules |
|---|---|---|
| /edit | `{event?:partial existing fields,timezone?,registration_opens_at?,registration_closes_at?}` | Owner; draft/published. No quota below approved+live holds per pool. Allocation mode immutable after first application. |
| /publish | `{}` | Draft→published; required data/assets/time checks. |
| /postpone | `{start_time,end_time,registration_closes_at,checkin_opens_at,checkin_closes_at,notice}` | Preserve bookings; pause application/approval, invalidate offers, bound change outbox. |
| /resume | `{notice}` | Postponed→published; use saved times and eligible offers. |
| /cancel | `{reason}` | Event+pending/approved/waiting cancel atomically, invalidate offers, outbox to affected only; no promotion. Refuse after attendance. |

Underlying Event enum active for draft/published/postponed; cancelled for cancelled; completed only finalized closeout. Managed workflow controls admission. No automatic no-show release implied.

## Leader assignment and source attribution

`GET /events/{id}/leaders` → `{leaders:[{leader_id,reserved_quota,active,referral_code,public_url,version}],as_of_utc}`; owner all, leader own only. `POST /events/{id}/leaders` data `{leader_id,reserved_quota,active:true}` creates/sets a current enabled leader assignment; current event version used. `POST /events/{id}/leaders/{leader_id}` data `{active?,reserved_quota?}` uses assignment version. Active reserved sums≤offline pool and cannot undercut occupied reserved allocation. Revocation denies new event reads/writes; historical operator/referral remains audit evidence.

Stable opaque code per event/leader; public `GET /referrals/{code}` → `{event_public_id,attribution_kind:"leader_referral",leader_display_name,active}`. Attribution never grants staff access.

`POST /events/{id}/applications` data `{application:<existing RegistrationCreate>,source:{kind:"direct"|"leader_referral"|"unknown",referral_code:null|code}}`; optional real participant bearer or Guest, creation no version. Current matching referral required for referral kind. Server sets operator from auth; caller cannot select operator or leader. Effects `{registration_id,status:"pending"}`. Domain create, duplicates, files, policy and receipt atomic. Guest documents still denied. Store `{entry_operator_id,attributed_leader_id,source_kind,source_evidence:"public_referral"|"explicit_direct"|"unknown"}`. Shared phone is not same identity. Existing v1/sync creates for managed events get Unknown unless separately verified; operator is not automatically attribution. Offline v2 payload remains unchanged. Leaders may sync only active assigned managed events; owner organizer permitted.

## Promotion, instructions, stats and outreach

`GET /events/{id}/promotion` → `{version,state:"draft"|"approved",text,approved_text,approved_at,provider:"DEMO_TEMPLATE",public_url,flyer_data:{title,overview,location,start_time,end_time,timezone,image_files,public_url,text}}`.

`POST /events/{id}/promotion` data `{text}` saves bounded plain text by assigned leader/owner; edit invalidates approval. `POST /events/{id}/promotion/approve` data `{}` owner approves exact version/text. Version0 accepted when saving first absent draft. Public print/share uses approved public text/data only; browser flyer stylesheet, manual WhatsApp link, explicit template label. No AI generation or message-delivery claim.

`POST /events/{id}/instruction` data `{text}` owner saves intended assigned-leader instruction; event version. `GET /events/{id}/outreach` → `{reports:[{id,leader_id,channel,reported_at,quantity,notes}],as_of_utc}` current authorized scope. POST same suffix data `{channel:"flyer"|"whatsapp_manual"|"community_visit",reported_at,quantity,notes}` assigned leader self-report, creation no version. No measured reach claim.

`GET /events/{id}/stats` returns `{event_public_id,as_of_utc,source:"native_postgresql",counts:{applications,pending,correction_requested,approved,waiting,rejected,cancelled,offer_holds},quota:{online:{capacity,approved,offer_holds,available},offline:{capacity,approved,offer_holds,available}},attribution:{direct,leader_referral,unknown},alert:{policy_id:"demo-low-demand-v1",state:"below_threshold"|"normal",threshold,observed_ratio,definition:"approved / total capacity"},instruction:{text,version,updated_at}}`. Correction is subset pending; holds subset waiting. Below only ratio<threshold. No fabricated source claim on SQLite controlled tests; use source engine actual value. Owner sees full stats, leader only assigned event operational aggregate. Alert processing via explicit `POST /events/{id}/alerts` data `{}` event version, duplicate-safe per event/policy/condition revision; never creates effects via GET.

## Review, corrections, allocation and offers

`GET /registrations/{id}` → `{registration:<existing RegistrationResponse>,version,review:{state:"awaiting_review"|"correction_requested"|"eligible"|"rejected",reason,updated_at},booking_state:"pending"|"confirmed"|"waitlisted"|"offered"|"cancelled"|"rejected",offer:null|{id,state,expires_at,version},attribution:<above>,allowed_actions:[strings]}`. Owner Organizer, own participant or scoped guest grant; assigned leader may see own entered forms, no review powers/private file metadata outside original ACL.

| POST route | data | Rules |
|---|---|---|
| /registrations/{id}/review | `{decision:"approve"|"reject"|"request_correction",reason}` | Event owner; pending; required reason reject/correction; approval→confirmed or waiting by pool. |
| /registrations/{id}/correction | `{phone?,file_ids?,note}` | Owning participant while correction requested. Snapshot update, never shared Participant identity; owned file checks. Guest can supply note/phone through scoped grant but cannot attach files. Reset pending review. |
| /registrations/{id}/cancel | `{reason}` | Own participant/guest or owning organizer; idempotent cancellation, release once, offer+outbox atomically. |
| /offers/{id}/accept | `{}` | Own participant/guest; current offer version, eligible+unexpired+held place→approved. |
| /offers/{id}/decline | `{}` | Own participant/guest; explicit demo policy cancels registration and releases hold. |
| /events/{id}/offers/reconcile | `{}` | Owner; expire overdue holds and offer next eligible FIFO; event version. |

Managed capacity: approved+unexpired offer holds≤pool; pending/plain waiting0. FIFO waitlisted time→created time→ID. Offers remain legacy status waiting with sidecar offered. Cancel does not autoapprove on managed events; old unmanaged events preserve original behavior. All old/new approval/cancel and walk-in paths share allocator. Skip cancelled/rejected/correction/inactive candidates. Native race proofs mandatory. Admission to waiting is approved eligibility plus full relevant pool, not raw pending.

## Guest access, Demo OTP and outbox

`POST /guest-access/challenges` direct body `{registration_id,phone,purpose:"manage_booking"}` → `{challenge_id,expires_at,provider:"DEMO_OTP",delivery_state:"demo_recorded",demo_access_token}`. Opaque challenge access is scoped to this request; not general identity. Rate limit requests/attempts, random secret hashes/expiry only. Do not log, persist in localStorage or export code/token.

`GET /guest-access/challenges/{id}/demo-message` with `X-Demo-Challenge` access token → `{provider:"DEMO_OTP",code,phone_ownership_verified:false}` only synthetic server profile. This is explicit local simulated delivery; no real phone verification.

`POST /guest-access/challenges/{id}/verify` body `{code}` + same challenge header → `{grant_token,expires_at,registration_id,provider:"DEMO_OTP",phone_ownership_verified:false}`. Wrong/expired/used/attempt limit refusal; grant token short-lived in `X-Guest-Grant`, memory only; registration-specific, not phone-wide access. Shared phones never merge identities or grant unrelated access.

`GET /outbox?event_public_id=` → `{messages:[{id,event_public_id,registration_id,kind,recipient_binding:"registration",recipient_hint,provider:"DEMO_OUTBOX",state:"demo_recorded"|"failed",created_at,scheduled_at,message,external_delivery:false}],as_of_utc}`. Owner own event; participant/guest only bound registration. No raw telephone display. Kinds confirmation/waitlist_offer/offer_expired/cancellation/reminder/event_changed/correction/alert. All transitions bind correct recipient/event and dedupe with business effect. `POST /events/{id}/reminders` data `{}` enqueues due approved only within configured timing, cancelled excluded; unique schedule key. `POST /outbox/{id}/retry` data `{}` owner only failed messages, message version, records retry without new business transition. Deterministic explicit Demo failure configuration for controlled tests; no real send endpoint.

## Attendance and closeout

`GET /events/{id}/roster?query=` → `{event_public_id,version,rows:[{registration_id,first_name,last_name,phone_hint,status:"approved",arrived:boolean,attendance_operation_id:null|UUID}],as_of_utc}` owner/assigned enabled leader, bounded search, no identity ownership from search. Check-in server validates current approved state and configured time window again after lock.

`POST /events/{id}/attendance/intents` data `{device_id,attendance_operation_id,registration_id}` registers pending intention. FE saves/reads back separate local attendance UUID first. `POST /events/{id}/attendance` data same applies arrival; both event version. `GET /events/{id}/attendance/{attendance_operation_id}` → `{operation_id,state:"pending"|"arrived"|"cancelled",registration_id,recorded_at}` authorized actor. `POST .../{attendance_operation_id}/discard` data `{reason}` resolves pending without arrival. Unique registration/event arrival; same operation replay returns receipt, another operation for arrived registration409 ALREADY_ARRIVED. Lost ACK uses GET only.

This is connected intent-first check-in; fully offline check-in not admitted. Local pending is not server omniscience: finalize also requires explicit presenter local-queue attestation.

`POST /events/{id}/walkins` data `{application:<six fields>,eligibility_confirmed:true,eligibility_note}` owner only, event version, designated pool, current time/eligibility/capacity. Atomic approved walkin+arrival+receipt. Existing cancelled person/event cannot be implicitly resurrected. Distinct attendance UUID derived/bound to operation, not registration sync IDs.

`GET /events/{id}/closeout` → `{version,state:"preview"|"finalized",as_of_utc,pending_attendance_count,active_offer_count,totals:{capacity,applications,bookings,cancelled,rejected,pending,waiting,arrivals,booked_arrivals,walkin_arrivals,no_show},definitions:{...},blockers:[codes]}`. Bookings=all approved including walk-ins; arrivals=unique attendance; no_show=approved non-walkin−booked_arrivals; cancelled/pending/waiting already filtered, never subtract twice.

`POST /events/{id}/closeout` data `{attendance_reconciled:true,no_unregistered_local_actions:true}`, owner only after end; rejects pending attendance/live offers. Recompute under event lock, save immutable snapshot, mark completed and close all future mutations. Repeated receipt read stable. Attestation is not proof about unseen devices.

## Required validation

RED→GREEN owner ACL; wrong actor/revocation during lock; direct legacy admission bypass; all mutation exact replay/modified replay/cross-actor; offer/cancel/accept/walk-in last-place native races; outbox binding/dedupe; wrong/expired/used/abusive OTP; shared phone/referral mismatch/operator separation; correction snapshot/file ACL; pending attendance/finalize and check-in-cancel race; fresh DB closeout reconciliation. Controlled SQLite/ASGI and real native/browser layers separately reported. No core requirement may be relabelled FUTURE_ONLY.

## Coordinated clarification 1 — 2026-11-03

Outbox read entries also include `version` (integer), used for retry expected_version. Offer `state` is exactly `offered|accepted|declined|expired|invalidated`; a live hold uses `offered`. These close underspecified read fields without changing the contract identity or offline-sync payload. Both writers notified before integration.

## Coordinated clarification 2 — 2026-11-03

`allowed_actions` uses only `approve`, `reject`, `request_correction`, `correct`, `cancel`, `accept_offer`, `decline_offer`, filtered by current actor and state. Existing registration `supporting_documents` is retained. Authorized `/api/v2/me/events` includes the owning organizer's draft events; public v1 list/detail excludes managed drafts. UI uses ordinary event/account/registration selection, not manual resource-ID entry for the normal journey.

## Coordinated clarification 3 — original amended40AC recovered

Original amended source readback supersedes the earlier connected-only attendance assumption above. AC09-02/03 require preloaded approved roster, actor-partitioned IndexedDB pending attendance, stable independent UUIDs, offline save/readback/reload, explicit fresh-same-actor reconnect and per-action synced/rejected/conflict recovery. Existing intention/apply/GET endpoints remain; disconnected capture calls no API. Sync reads/reconciles the same attendance ID before creating/applying anything. Cancelled/revoked/closed stale snapshots are rejected and retained for resolution, never converted to walk-in. Closeout checks the current local pending queue and server pending intentions, plus explicit attestation about unseen devices. Disconnected walk-in remains not admitted.

AC01-02 permits designated owner account provisioning with role `organizer` as well as `leader|user`; new organizers are not automatically added to the server Demo-admin allowlist. Other account protections remain.

Referral public links use `?view=event&event=<public_id>&ref=<opaque_code>`. FE validates via the public referral resolver, preserves referral into managed application, and never treats it as staff authorization.

AC07-04 correction also permits the current assigned entry leader or owning organizer. Cancelled/rejected records remain immutable. Correcting approved/waiting records returns pending review, releases an occupied place/live offer once and reconciles the next eligible offer atomically. Original entry operator/attribution stay unchanged; correction operator is audited in its immutable operation. Private-file ownership rules still apply. Updated outcome gets bound Demo outbox evidence.

AC05-04 adds promotion `paused:boolean` and owner `POST /events/{id}/promotion/pause` data `{paused:boolean}` with promotion expected_version; it never changes event registration workflow/window. AC10-02 closeout includes recorded `attribution:{direct,leader_referral,unknown}` and no inferred promotional-channel claim. All additions were coordinated with both writers before integration.

## Coordinated clarification 4 — anonymous creation recovery

Anonymous operations application creation and its immutable receipt GET require `X-Application-Key`: canonical base64url of32 cryptographically random bytes,43 characters without padding. The client creates and saves this private capability with its pending operation before sending; it never appears in URLs, logs, public evidence or export. The server validates canonical encoding and stores only SHA256 digest in the operation actor. Exact POST replay and receipt GET require the same key; a missing or different key cannot read that receipt. Authenticated applications are unchanged. This capability authorizes only creation recovery; subsequent booking access still requires scoped Guest OTP grant. The offline-v2 envelope is unchanged.

Authoritative rolled-back business refusals may be recorded as terminal refusals; unknown transport outcomes remain pending until explicit receipt reconciliation or deliberate exact same-ID/same-body recovery. Never generate a replacement UUID merely because a response was lost. Attendance pre-send and stale-version cases need the same explicit distinction. This clarification was coordinated with both writers before integration.

## Coordinated clarification 5 — assignable leader directory

`GET /accounts?scope=assignable_leaders` permits any fresh enabled Organizer to read only enabled namespace leaders using the existing `{accounts,as_of_utc}` shape and `id,username,role,enabled,version` fields. It grants no account administration. Unscoped account reads, creation and access changes retain designated Demo-admin restrictions. Unknown scope is422; disabled caller is403. FE uses this bounded directory when assigning a leader to its own event; normal Organizers can create/manage their own managed events without becoming Demo admins.

## R3 account profile and recovery

The admitted [account contract](ACCOUNT_CONTRACT_R3.md) adds own profile persistence and synthetic assisted recovery, explicit account migration, token generation revocation and immutable receipt reconciliation. Existing journey and Offline contract identities remain unchanged.
