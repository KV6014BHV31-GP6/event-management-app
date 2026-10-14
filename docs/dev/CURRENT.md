# NU Developer 當前狀態

版本：`repo-docs/0.3.2`，2026-10-14（香港）。Active task: [FE-CREATE-EVENT-20261014](tasks/FE-CREATE-EVENT-20261014.md). PR #4 quota boundary repaired. Native Create Event UI acceptance: **FAIL**, [current evidence](evidence/FE-CREATE-EVENT-NATIVE-20261014/38557951101-1/README.md), tested `06d7cc7ea95ec22e215e7cb7b4ebaac547d9492e` on a GitHub-hosted Windows runner, not the user E: machine. This supersedes only the previous pending PR #4 UI result. PR #3 remains merged at `7a06f43dc30c8378d9f3c569635523b25ce556b0`; its historical evidence below is unchanged. PR #4 is not merged; no uat/main promotion or deployment.

| Area | State | Evidence boundary |
|---|---|---|
| Public event index + Login | LOCAL_VERIFIED | `frontend/live/`, source-backed API validation, full pagination, session/profile verification, errors and mobile layout |
| Backend business source | OBSERVED / PRESERVED | Austin `79804aa67508de23d3f3c613e65cf375e9ded2a3`; `backend/src/` and requirements bytes unchanged |
| Setup | IMPLEMENTED | Explicit additive dev schema/seed command, .env example, loopback API proxy and Windows instructions |
| Unit/component checks | LOCAL_VERIFIED | 30 frontend tests, 4 proxy tests, 2 backend SQLite tests after correcting two stale expectations |
| SQL HTTP + browser integration | INTEGRATION_VERIFIED, ALTERNATIVE_ENGINE_ONLY | Python3.14.8, exact imported pins, PGlite0.5.9/PostgreSQL18.6 WASM/socket0.2.12 and a documented test-only transport wrapper; 8 HTTP scenario groups and 22 browser checks including separately labeled fault injection |
| Persisted readback | LOCAL_VERIFIED, ALTERNATIVE_ENGINE_ONLY | Created event remains after actual API and file-backed PGlite restart |
| Native PostgreSQL17 | REPORTED PASS, evidence consistency OBSERVED | Supplied Windows report: PostgreSQL17.11 server, Python3.14.8, original pins; native A1-A4/B1-B3 run `20261014-152157` on application commit `8339ab6b0428ea065e73292594f818c0286c9cf2`. Report/results hashes checked; raw logs/video and runtime not independently rerun here. |
| Bootstrap clean shutdown | REPORTED PASS on native PostgreSQL | Initial native environment report records two exit-0 runs, unchanged seed records and normal driver disconnect. Historical PGlite disconnect failure remains valid only for that alternative test adapter. |
| Native Login / API creation / persistence | REPORTED PASS, evidence consistency OBSERVED | A1-A4 Login/profile/reload/frontend Logout; B1-B2 one API-created event and API/proxy/UI/DB readback; B3 native restart persistence passed on attempt 2. First CTRL_C_EVENT stop failed; normal CTRL_BREAK_EVENT retry passed, original local stopper still needs follow-up. |
| Historical mocks / captures / Word | PRESERVED | v1.2.0/v1.2.1, frozen screenshots/source and Log Task files retain their bytes |
| Production permissions / team UAT | NOT_ACCEPTED | Existing API allows any logged-in user to create events and accepts caller-selected signup roles. No policy change made; no production readiness claim. |
| Dev integration | USER_AUTHORIZED after code review | User explicitly requested review and merge of PR #3 into `dev`; see PR for actual remote outcome. No blocking defect identified for this limited development integration. |
| Complete native E2E / Security / UAT / deployment | NOT_RUN / NOT_ACCEPTED | A/B evidence does not establish full-product acceptance. No deployment or `uat`/`main` promotion. |

Detailed [validation receipt](evidence/FE-LIVE-20261014/VALIDATION.json), [browser report](evidence/FE-LIVE-20261014/browser-report.json), and [screenshots/limitations](evidence/FE-LIVE-20261014/README.md). Real primary browser flow uses no intercepted responses; five controlled failure/XSS scenarios are explicitly synthetic.

## Next steps

1. Complete the remaining full native E2E, Security and team UAT scope separately. Native A/B checks are already reported passed; do not reset them to NOT_RUN.
2. Follow up the existing local Ctrl+C stopper compatibility and backend organizer/signup authorization policy before broader privileged workflows.
3. Proceed through reviewed `dev → uat → main` promotion only when separately authorized. Run the new Create Event five-step native demo before accepting that UI; the broader guest-booking/dashboard scope remains later work.

The former static-shell and initial implementation stop points are historical. On 2026-10-14 the user explicitly authorized review and merge of PR #3 into `dev`. This does not approve production deployment or broaden the feature scope. The task records the source hashes, review checks and evidence limits; original cloud evidence remains unchanged.
