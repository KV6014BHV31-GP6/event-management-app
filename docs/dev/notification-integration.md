# Austin notification integration

Status: working-baseline; author-controlled synthetic tests, not external delivery acceptance.
Feature sources: SP-US-20261012:US08, SP-FEATURES-20261012:M-01/M-02; bounded successor is Owner's 2026-11-16 Web release task. No two-way RSVP, medical policy, identity, DOB or quota rule is introduced.

## Fixed source and adoption

Source: `dev_be_reminder-notification@b9dca01d29d7a1b36dbbf5a43bfed06863550e34`, author Athantse (Austin), commit `feat(reminder-notification): push latest module code`. Source branch is read-only. Product base: `4018d6507fdaa9ad70d77cb5a396d852971decec`.

| Austin path under backend/src | Adoption and necessary correction |
| --- | --- |
| reminders/service.py | Retains approved-registration milestone calculation and exact 7-day/1-day offsets, constructor/service methods, cancellation concept. Uses explicit Registration/Event join because current RegistrationModel has no `.event`; clock injected for tests; normalizes UTC; skips newly created past milestones; invalidates old start-time tasks. |
| reminders/repo.py, schemas.py, models.py | Repository/service split and 7d/1d types retained. Storage adapter targets existing JourneyState; no second event_reminders table or sent-success ledger. |
| notifications/service.py | Austin's actual build_message template method retained and adapted for truthful application receipts, offer acceptance, local timezone labels and delayed milestone wording. Processing moved to durable claim/unknown-result handling. |
| notifications/repo.py, schemas.py, models.py | Retains flattened Registration/Participant/Event context join and internal schemas. Replaces concat with portable string expression; canonical model is existing JourneyState. |
| notifications/whatsapp_sender.py | Retains actual Twilio Client/messages.create WhatsApp send; optional import, thread offload, 20-second HTTP timeout, explicit recipient/config gates, no body/phone/error-text logging, provider SID returned. API acceptance never means delivered. |
| infrastructure/scheduler.py and main.py | Retains the two original jobs and lifespan ownership. Repairs disabled reminder/lifespan wiring and incompatible constructors. Uses existing stdlib asyncio interval loop rather than adding unpinned APScheduler dependency. Both jobs execute per cycle; shutdown cancels/awaits the task. |

No unrelated Austin Events/Registrations/Offline Sync source is transplanted. Existing product tables, routes, identity, API schemas and allocation rules are preserved. No new dependency or schema migration is required; existing Journey schema remains a prerequisite. Original source constructor and missing-event-relation failures are independently reproduced in the external `evidence/sol-be/austin-source-red.log`.

## One canonical durable task

The existing `journey_state` row with `kind=outbox` is the notification task. Its JSON `delivery_status` is the only delivery state: `pending`, `processing`, `dry_run`, `accepted`, `delivered`, `failed`, `unknown`, `cancelled`, `expired`. There is no separate notification/reminder table and no second success state. API `state` is derived for old clients: pending/dry_run map to `demo_recorded`; other canonical values remain explicit. `external_delivery` becomes true only with a delivered receipt. Synthetic transport records `dry_run`, never provider accepted/delivered.

Historical `demo_recorded` rows remain display-only and are not silently externally sent. Historical failed rows retain explicit manual retry support. The retry route accepts only definite failure without a provider reference; unknown and provider-referenced attempts require reconciliation, not a new send ID. Existing event ownership, fresh role checks, optimistic versions and operation receipt replay remain in place.

Task creation and business receipts share the caller's transaction under the event row lock. The deterministic task key deduplicates repeated creation; claims compare persisted version atomically. Worker takes the event lock before claim, commits that claim before I/O, reacquires the event lock and rechecks cancellation, registration approval/current offer and schedule before sending. It holds that lock through the bounded send/result persistence. Concurrent stale workers therefore cannot both send the task.

Interrupted processing claims older than ten minutes become `unknown`, never automatically pending. Cancelling an in-flight claim records `cancel_requested`; the original worker can prove it stopped before I/O, otherwise recovery preserves unknown. Any timeout is unknown. Error codes are bounded and no exception message, phone or message body is logged. A durable claim plus provider I/O is not an exactly-once external delivery guarantee: a crash after provider acceptance and before local receipt needs the original provider record/operator reconciliation.

`WhatsAppSender.reconcile(provider_id)` fetches the original SID; `NotificationService.record_provider_receipt` stores a trusted operator/provider result against the same task and rejects a conflicting SID. There is no unauthenticated callback route or fabricated delivery receipt. A provider ID absent after timeout requires provider-side/operator lookup; this integration never blind-resends it. Provider polling/webhook deployment and actual external recipient delivery are NOT_RUN/EXTERNAL_DELIVERY_NOT_CONFIGURED.

## Reminder policy and lifecycle

Only approved registrations on published managed events receive automatic 7d/1d tasks. Pending creates an application-received task and does not confirm a place. Approval, waitlisting, rejection, correction, cancellation, event-change and offer notifications flow through the existing Journey lifecycle. An offer message does not claim an approved place. Unsent confirmation/offer is rechecked against current business state before transport.

Automatic task identity is registration + UTC event start + 7d/1d. Reschedule cancels pending old-start tasks; postpone/cancel/correction revoke unsent reminders; resume can reactivate a never-sent cancelled future task with the same identity. Accepted/delivered/unknown tasks are not reset. Restart reconciles future tasks from persisted registrations, not in-memory timers. Newly approved/rescheduled milestones already in the past are skipped; existing due tasks can be processed until event start, with date-based template wording rather than falsely promising seven more days. Event timezone affects display; offsets are absolute UTC durations. Naive timestamps follow the existing product UTC convention.

The existing manual `/events/{id}/reminders` operation preserves its configured `reminder_hours` window, inclusive start boundary, original synthetic message and response/receipt. Hours 24 and 168 share the corresponding Austin task key, so manual and automatic processing do not create two sends. Other existing policy-hour values remain their existing explicit milestone. Automatic tasks use kind `scheduled_reminder`; the legacy manual kind `reminder` remains compatible. Tasks track actual due time separately when the legacy scheduled_at field records event start.

This scope wires managed Journey lifecycle only; it does not redesign legacy v1 registration endpoints, add two-way RSVP or make Phase2 receipts imply approval.

## Runtime and verification

`NU_DEMO_PROFILE=synthetic` enables the safe scheduler by default. `NU_NOTIFICATION_SCHEDULER=off` disables it; `on` explicitly enables it. `NU_NOTIFICATION_INTERVAL_SECONDS` defaults to 60 (minimum 1). `NU_NOTIFICATION_TRANSPORT` defaults to `dry_run`. No secret is needed for synthetic transport.

Real transport requires `NU_NOTIFICATION_TRANSPORT=twilio`, `NU_NOTIFICATION_EXTERNAL_SEND=yes`, an already installed Twilio SDK, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SANDBOX_NUMBER`, and exact approved `NU_NOTIFICATION_TEST_RECIPIENT`. Missing configuration records `EXTERNAL_DELIVERY_NOT_CONFIGURED`; a different recipient is refused with `RECIPIENT_NOT_APPROVED`. None of those credentials/receivers are included in this change. No external send was attempted.

Controlled checks run with the existing `nu-rose-railway:23e327a` Python3.14 dependency image, mounting this candidate backend at `/work`; the old image label is dependency provenance, not the tested product source. SQLite is in-memory and does not prove PostgreSQL concurrency. Native checks opt in through `NU_NATIVE_TEST_DATABASE_URL`, require a non-superuser dedicated `_test` DB, and use only Controller's exclusive `nu_release_be_test`. Virtual clock tests explicitly use 2030-01-01 UTC; the system clock is unchanged.

Commands inside that image:

```sh
python -B -m pytest -q tests/test_notifications.py tests/test_journey.py tests/test_journey_acceptance_edges.py tests/test_journey_attribution.py tests/test_journey_acl.py
python -B -m pytest -q tests/test_notifications_native.py tests/test_journey_native.py
```

External raw logs live under the release evidence root `evidence/sol-be/`. The existing native rollback test now snapshots the three already-committed application receipt tasks (keys, versions and full JSON) and requires exact preservation after injected approval failure, while still requiring pending domain state/no operation receipt. Its original 3-versus-0 failure is retained in `submitted-rollback-red.log`; the rollback assertion was strengthened for the newly authorized receipt notification behavior, not removed.

Independent review, hosted CI, merged-source deployment and external delivery each require their own evidence. Author tests are not acceptance of those layers.

Author results: controlled notification/Journey/edge/attribution/ACL group 99 PASS; dedicated PG17 notification/Journey group 17 PASS. The first combined native launch inherited staging settings and correctly refused the development migration probe (16 PASS/1 FAIL); rerunning with explicit `ENVIRONMENT=development` on the same dedicated test DB passed all 17. Both logs are retained. Existing Pydantic deprecation warnings remain. The optional Twilio package is absent from the pinned dependency image: until separately configured/installed, explicit real-transport selection records `EXTERNAL_DELIVERY_NOT_CONFIGURED` and does not send.

Independent-review follow-up: correction can cancel a confirmation before it has any claim or provider attempt. A subsequent legitimate approval now requeues that same task/ID under the existing event lock, only when it is cancelled and has no claimed_at, processed_at, provider_id or external delivery. Unknown, processing, accepted, delivered, dry-run and attempted cancellation states remain unchanged. Worker eligibility also rechecks delivery_status immediately after acquiring the event lock and refreshing the task; a stale pending snapshot cannot overwrite a newly recorded unknown/accepted/delivered outcome with cancelled or expired. Full lifecycle and two-session regressions preserve the original reviewer RED evidence and explicitly verify no second send plus continued same-SID reconciliation.

Follow-up author checks: notification/Journey/acceptance-edge controlled group 82 PASS (`reapproval-stale-green.log`); dedicated PostgreSQL notification group 6 PASS (`reapproval-stale-native-final.log`). The added lifecycle/stale tests first reproduced four failures with six preservation cases already passing (`reapproval-stale-red.log`), before the narrow source patch. Native stale-worker tests use the same explicit virtual clock for both sessions. Existing Pydantic warnings remain; independent fixed-source review is separate.
