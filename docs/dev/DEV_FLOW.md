# Dev flow and takeover runbook

Benjamin owns frontend integration and readiness for end-to-end delivery. Austin is the reported backend contributor. Actual merge ownership and team decisions remain to be confirmed. No personal judgement is a release criterion.

## Delivery gates

| Gate | Required output | Exit condition |
|---|---|---|
| G0 Source | locked task/US, source version, conflict list | acceptance criteria trace to a source or clearly labelled proposal |
| G1 Backend receipt | commit, setup, env variable names, seed data, contract | fresh setup reproducible; no missing secrets in code |
| G2 Mock frontend | screens, state transitions, adapter and fixtures | synthetic happy/error/offline cases runnable |
| G3 Contract | request/response/auth/IDs/statuses/error schemas | both sides use agreed examples/version |
| G4 Integration | frontend/backend SHAs, environment, test log | user flow reaches actual persistence and survives refresh/restart |
| G5 Team acceptance | reviewer, accepted scope, unresolved defects | PM/designer/security review relevant parts; evidence recorded |
| G6 Release | reviewed branch/PR, migration, rollback and demo script | exact delivered commit reproducible |

G2 may run before G1/G3, but cannot be described as G4. No gate is passed merely by changing a document status.

## One task cycle

1. Open a task record with target outcome, one owner, allowed paths, source IDs and test cases.
2. Check upstream changes and lockfile before installation. Reuse framework and backend if suitable. Do not rebuild the architecture merely to match a preference.
3. Make the smallest usable slice with UI, contract and persistence boundaries. Put adapters between product views and transport.
4. Review data states and failures: loading, empty, full, cancelled, waiting, permission denied, expired link, validation, timeout, malformed response, offline, pending, retry conflict.
5. Run only relevant tests and record actual evidence. Review changed contract with its backend owner.
6. Update task then CURRENT. Commit/push only within current authorisation; distinguish local code, branch code, merged code and deployed code.

## Parallel work

| Workstream | Owner pattern | Handoff |
|---|---|---|
| Frontend | Benjamin or delegated UI writer | screens, adapter call sites, states, tests |
| Backend | Austin while usable; Benjamin fallback | code commit, schema, permissions, setup, seeded API examples |
| Contract/integration | one explicit owner | operation mapping, versioned fixtures, errors and integration evidence |
| Design/security/PM | existing team role | review scope, design and data/permission choices, not implicit code approval |

## Backend evidence and takeover triggers

Use an agreed task checkpoint, not silence or personality, as the trigger. For a short integration spike, propose a 30-minute setup/contract diagnosis once the actual handoff arrives; the budget is an estimate, not a promised completion time.

- If code is inaccessible: continue UI/mock/spec; request fixed-commit archive or access. Do not claim there is no backend.
- If it cannot start reproducibly: isolate one startup blocker, record command/log, repair minimal cause, retain useful work.
- If API runs but differs: use an adapter for harmless naming differences; update contract explicitly. Do not silently reinterpret status or permissions.
- If a critical acceptance case fails: reproduce it, add meaningful regression coverage, fix the bounded server invariant. Retain unaffected modules.
- If the agreed checkpoint passes without the necessary backend input: record task ownership transfer and implement the minimum independent backend slice in a separate branch after inspecting available repo code. Keep API shape compatible where practical.

## Full Dev fallback sequence

1. Health/readiness, validated environment config, database migration and synthetic seed; distinguish this proposal from existing backend.
2. Staff/leader authorisation and guest registration capability design, event/timeslot model and total/quota invariants.
3. Atomic booking with duplicate/idempotency policy, bounded waiting queue, cancellation and controlled promotion; persistence across restart.
4. Restricted roster/check-in, outreach/referral evidence, offline operation IDs and visible reconciliation.
5. Scheduled reminder outbox with fake provider first, explicit delivery/retry audit, then a configured real provider only if in scope.
6. Optional brochure/OCR behind separate adapters and review steps. No paid service is necessary to validate the core flow.

## Critical acceptance suite for the actual backend

All below remain NOT_RUN until an actual environment exists:

- Anonymous participant can request a place without an account; cannot read another participant's private registration.
- Staff roles cannot manage another leader's allocation or unrestricted users by guessing IDs.
- Concurrent requests for the last place produce at most one confirmed place.
- Repeated request with same idempotency key has one result; different payload with same key is rejected.
- Cancelling twice does not release two places; only one waiting entry is promoted, according to documented policy.
- Event cancellation beats stale frontend state; no new confirmed place is issued.
- Offline queue retains stable operation IDs; repeated sync does not double count; stale capacity returns visible conflict.
- Refresh/restart preserves accepted registrations; data reset is an explicit isolated test operation.
- Reminder queued/sent/delivered/failed states are separate; retries do not send duplicates under the chosen provider policy.
- Expired/invalid booking token fails; GET/read operations never perform cancellation.

## Definition of done

Record requirement/operation IDs, frontend SHA, backend SHA, contract version, environment, command/evidence, date, result and reviewer. Any unexecuted item stays NOT_RUN. Any missing input stays BLOCKED. Final report states achieved gates and next action, never a blanket “all done”.

## Workspace paths (documentation-only split)

Frontend code will be placed under [frontend](../../frontend/README.md) after authenticated source review; backend code under [backend](../../backend/README.md) only after equivalent handoff. Consult [OWNERSHIP](OWNERSHIP.md) and [API checklist](../api/HANDOFF_CHECKLIST.md). The G0–G6 gates above remain unchanged; the split does not advance a gate.
