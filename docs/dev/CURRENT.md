# NU Developer 當前狀態

版本：`repo-docs/0.3.0`，2026-10-14（香港）。Active task: [FE-LIVE-20261014](tasks/FE-LIVE-20261014.md). This file describes `dev_fe_events_login`; it does not claim promotion of shared branches. Source baselines and ownership are in the task.

| Area | State | Evidence boundary |
|---|---|---|
| Public event index + Login | LOCAL_VERIFIED | `frontend/live/`, source-backed API validation, full pagination, session/profile verification, errors and mobile layout |
| Backend business source | OBSERVED / PRESERVED | Austin `79804aa67508de23d3f3c613e65cf375e9ded2a3`; `backend/src/` and requirements bytes unchanged |
| Setup | IMPLEMENTED | Explicit additive dev schema/seed command, .env example, loopback API proxy and Windows instructions |
| Unit/component checks | LOCAL_VERIFIED | 30 frontend tests, 4 proxy tests, 2 backend SQLite tests after correcting two stale expectations |
| SQL HTTP + browser integration | INTEGRATION_VERIFIED, ALTERNATIVE_ENGINE_ONLY | Python3.14.8, exact imported pins, PGlite0.5.9/PostgreSQL18.6 WASM/socket0.2.12 and a documented test-only transport wrapper; 8 HTTP scenario groups and 22 browser checks including separately labeled fault injection |
| Persisted readback | LOCAL_VERIFIED, ALTERNATIVE_ENGINE_ONLY | Created event remains after actual API and file-backed PGlite restart |
| Native PostgreSQL17 | NOT_RUN / ENVIRONMENT_BLOCKED | PostgreSQL17.11 initdb refuses root; sandbox cannot run a non-root user. Alternative engine does not clear this gate. |
| Bootstrap clean shutdown | BLOCKED_ON_ALTERNATIVE_ADAPTER | Writes and idempotent repeats verified; PGlite socket disconnect hangs, so test process terminated after commit. Not attributed to native PostgreSQL. |
| Historical mocks / captures / Word | PRESERVED | v1.2.0/v1.2.1, frozen screenshots/source and Log Task files retain their bytes |
| Production permissions / team UAT | NOT_ACCEPTED | Existing API allows any logged-in user to create events and accepts caller-selected signup roles. No policy change made; no production readiness claim. |
| Deployment / shared-branch merge | NOT_RUN | Reviewable feature PR only, no deployment or dev/uat/main merge |

Detailed [validation receipt](evidence/FE-LIVE-20261014/VALIDATION.json), [browser report](evidence/FE-LIVE-20261014/browser-report.json), and [screenshots/limitations](evidence/FE-LIVE-20261014/README.md). Real primary browser flow uses no intercepted responses; five controlled failure/XSS scenarios are explicitly synthetic.

## Next steps

1. Run the documented backend/bootstrap/HTTP/browser checks on native PostgreSQL17 with Python3.14; retain source SHA and actual results.
2. Review the feature PR into `dev`, including the two preserved source histories. Confirm organizer/account authorization policy with the backend owner before broader privileged workflows.
3. Proceed through reviewed `dev → uat → main` promotion only when separately authorized. Create Event UI and the broader guest-booking/dashboard scope remain later tasks.

The former static-shell stop point is historical. The latest user authorized this implementation and a PR, not remote merge or deployment. Environment limitations and human acceptance remain distinct from automated test results.
