# Real Frontend + Backend acceptance

**Branch boundary:** main contains this acceptance documentation only. The scripts referenced below exist on pinned dev `a47ff7d92f296ebd0604a1df98daf0b8111829b3`; no executable test/code is imported by this docs PR. Run commands only in an authorized checkout of that dev commit. See [CURRENT](../../docs/dev/CURRENT.md) for fresh native status and the separate historical PGlite/native records. [FE-LIVE evidence](../../docs/dev/evidence/FE-LIVE-20261014/README.md) describes the original alternative-engine run; its native NOT_RUN is historical, not a reset of later native results.

## Run against a disposable local development database

Start native PostgreSQL, bootstrap synthetic records and run FastAPI as described in [pinned dev backend setup](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/README.md), then start the [pinned dev frontend proxy](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/README.md). In the test terminal, set `SEED_USERNAME=demo_organizer` and `SEED_PASSWORD` to your local synthetic seed credential without committing either. The HTTP test writes five synthetic events and is intentionally opt-in:

```bash
python tests/e2e/live_api_smoke.py --allow-synthetic-writes
```

Its `APP_URL` defaults to `http://127.0.0.1:8000`; set it to `http://127.0.0.1:5173` to exercise the development proxy. It verifies public reads, pagination, login/profile, token rejection, event validation, creation and readback. It does not certify organizer-role restrictions.

Browser acceptance requires Playwright installed separately, a compatible browser, and at least seven synthetic events (the bootstrap plus HTTP smoke supplies eight). Set `APP_URL=http://127.0.0.1:5173` for this test. `PLAYWRIGHT_MODULE` can point to an installed Playwright module and `BROWSER_EXECUTABLE` to its compatible browser; omit both with a normal local Playwright install. `EVIDENCE_DIR` chooses a directory outside the checkout for private test outputs.

```bash
node tests/e2e/live_browser.mjs
```

The primary browser flow uses real requests without interception. Five separate controlled cases inject empty, network failure, 502, malformed payload and HTML-like text; the report labels them `SYNTHETIC_INTERCEPTION`. Screenshots contain only synthetic data and blank password fields. Use `EVIDENCE_LABEL` to name an alternate engine/fixture environment accurately. To check persistence, restart both API and database, then retrieve the `created_public_id` printed by the HTTP smoke; retain the engine/version in evidence.

## Broader booking matrix, PLANNED / NOT_RUN

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

The [HTTP script](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/tests/e2e/live_api_smoke.py) and [browser script](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/tests/e2e/live_browser.mjs) are external exact-commit references. A real HTTP response through the proxy does not establish a corresponding live UI control. The current three live pages wire event list, JSON Login, profile and event creation; other source operations require separate UI scope and acceptance.
