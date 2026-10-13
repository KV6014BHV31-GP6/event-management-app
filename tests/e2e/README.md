# Real Frontend + Backend acceptance

**State: PLANNED / NOT_RUN.** The existing `tests/test_document_control.py` validates documentation only. This directory does not yet contain runnable product E2E tests.

Prerequisites: actual frontend and backend full SHAs, approved versioned API contract, isolated nonproduction environment, synthetic seed/reset, authorized roles, current PM decisions.

| Test ID | Scenario | Expected invariant |
|---|---|---|
| BOOK-01 | Guest registration, reload and restart | Server receipt matches persisted booking |
| RACE-01 | Twenty distinct requests for one remaining place | At most one newly confirmed booking |
| RETRY-02 | Same operation key repeated; then payload changed | Exactly one action; conflicting payload rejected |
| TIMEOUT-03 | Lost response after DB commit | Reconcile same operation without double booking |
| CANCEL-04 | Concurrent duplicate cancellation with waiting list | One release, no duplicate promotion |
| STALE-05 | Cached availability stale or event cancelled | Server disallows extra confirmation |
| OFFLINE-06 | Offline check-in, restart and repeat sync | Pending/conflict clear; server avoids duplicate count |
| ACCESS-07 | Guess other registration ID or use another leader's pool | Unauthorized access and writes rejected |

The complete planned matrix is [TEST_PLAN.md](../../docs/dev/TEST_PLAN.md). Record actual commands, sanitized responses, frontend/backend SHAs, result and reviewer; never call pending tests PASS.
