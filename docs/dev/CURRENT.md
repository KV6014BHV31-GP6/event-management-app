# NU Developer 當前狀態

## Signup P0 follow-up, 2026-10-20

Author implementation: initial sensitive-field lock and non-network native fallback, trim-empty username rejection without changing valid input, and strict string/canonical ULID response validation. The existing Login/Profile contract and uncertain-write lock are preserved. Test-first regression: 7/11 PASS and 4 FAIL before repair; final frontend suite 119/119 PASS. Three controlled Chrome cases (JavaScript disabled, module failure, partial initialization failure) changed from intercepted password-query attempts to disabled fields and zero native request attempts; all canary requests were aborted before reaching the network. This does not replace the preserved historical failures or establish Security/UAT acceptance.

Evidence: `E:\NU_Local_Environment_20261014\guest-frontend\20261020-142554\evidence` (`p0-red.txt`, `p0-node.txt`, `privacy-before.json`, `privacy-after.json`). PR #28 remains stacked on #27. Native Signup/Login is deferred to the single-account downstream Guest author run; no additional account was created in this parent check. Backend authorization and ownership gaps remain unresolved. No merge or deployment.

Active task, 2026-10-20 (Hong Kong): [FE-USER-SIGNUP-20261020](tasks/FE-USER-SIGNUP-20261020.md), Refs GitHub #25. This branch is `dev_fe_user_signup`, stacked on OPEN/Draft PR #27's verified head `dev_fe_w7_browse_registration@6ab9d531582b9528ded977f48b8c158403f8b8ce`. Its Draft PR targets the W7 branch while #27 remains unmerged. Austin's backend dependency is still separate at `d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`; no merge/cherry-pick or backend change.

Signup increment: two-field public POST201 with strict ordinary-user response validation, code-point lengths plus the bcrypt 72-byte compatibility guard, bounded duplicate/422 messages, in-flight/success/uncertain locks, and explicit existing Login. A validated selected event survives Signup→Login; only the Login HTML UTF-16 maximum was removed, leaving Session/proxy unchanged. Public backend role escalation remains unresolved.

Fresh author checks: Node108/108 PASS (31 Signup checks plus existing77); real UI created one synthetic ordinary account once201, cleared/locked the form with no automatic Login, and rejected an over-72-byte password before POST. The initial harness then failed reading an old Profile response after navigation despite Login200/Profile200; its exit1 is preserved. Continuing with the same account verified existing Login and a fresh Profile200 with exact id/username/user role, plus one separate-context duplicate400. READ ONLY PG17 reconciliation: users+1 only; previous users, all other W7 tables and original Demo DB unchanged. This is bounded local/native evidence across two recorded attempts, not a clean single-run PASS or independent acceptance.

Relevant document-control and diff checks are recorded in the Signup task/external ledger. Historical Python22/23 baseline newline FAIL is retained and was not rerun or repaired for Signup. W7's independent PASS_WITH_GAPS and later UI smoke are reported handoff history, not a new W7 test run here. Full E2E/Security/UAT, role probes, bootstrap/migration repair, DB restart and video remain outside this Signup task. Deliver one English Draft PR with Refs #25, then stop; no Issue/Board update, merge or deployment.

## Preserved W7 stage-2 status (historical)

Active task, 2026-10-20 (Hong Kong): [FE-W7-BROWSE-REGISTRATION-20261020](tasks/FE-W7-BROWSE-REGISTRATION-20261020.md). This branch is the stage-2 frontend feature based on `origin/dev` **`a47ff7d92f296ebd0604a1df98daf0b8111829b3`**, which already contains merged PR #3 and PR #4. Austin's backend dependency remains separate at **`d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`**; it is not merged into this feature or dev. The branch names and hashes qualify every current claim; main documentation is read-only reference.

W7 limited implementation: server search/detail, selected-event Login return, verified ordinary-user online POST/pending receipt and applying to different events. Stage-2 checks: 77/77 Node checks, 19 real browser/HTTP/proxy checks and a fresh READ ONLY native PG17 mapping for three distinct applications by the same participant passed. Five controlled UI cases are explicitly synthetic. Original checkout, stage-1 worktrees and original Demo DB remain unchanged. Exact commands, source boundaries, first failures and external evidence are indexed in the task. This is LOCAL_VERIFIED / bounded INTEGRATION_VERIFIED, not designer/PM approval or stage-3 acceptance.

Own-registration GET, server-enforced registration authentication/ownership, public-role restrictions and agreed income/eligibility/pending policy remain ISSUE_COMPLETION_GAP. Full E2E, Security, UAT, DB restart and video are NOT_RUN in W7. Deliver only a base=dev Draft PR with Refs #19/#22; stop for Astra's independently authorized third stage. No merge or promotion.

W7 document-control CLI passes. The Python document suite is **22/23 PASS, 1 FAIL** (exit 1): its existing UTF-16 fixture expects LF but Windows writes CRLF. The same failure was freshly reproduced on the unchanged dev baseline, with identical test/checker bytes. No test was weakened; the task and external baseline evidence record this known failing gate.

## Preserved pre-W7 evidence (not a new test run)

Previous FE-CREATE-EVENT evidence: [native receipt](evidence/FE-CREATE-EVENT-NATIVE-20261014/38558483277-1/README.md), tested `0a29fde4ef8b1b76d2ba105d03ef9362ac9a8d90` on a GitHub-hosted Windows runner, not the user E: machine. Its earlier pending status was superseded by that run; the historical evidence table below is retained within its original scope.

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
