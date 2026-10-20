# FE-W7-BROWSE-REGISTRATION-20261020

Status: working-baseline. Stage: **2, implementation and Draft PR delivery**. Primary writer: Benjamin's local coding agent; shared API/Session/CSS have one writer. A separate test writer owns only `frontend/live/tests/w7.test.mjs`; other reviews are read-only. Stop after delivery; Astra owns independent stage 3.

## Authorization and source lock

User authorization `USER-W7-20261020-STAGE2`: narrow frontend, tests and minimal docs; own feature branch/commit/push/base=dev Draft PR. Refs [GitHub:KV6014BHV31-GP6/event-management-app#19](https://github.com/KV6014BHV31-GP6/event-management-app/issues/19) / [#22](https://github.com/KV6014BHV31-GP6/event-management-app/issues/22), reusing #9/#14. No automatic issue closing, merge, deployment, board edits, teammate messages or backend takeover.

| Source | Full SHA / role |
| --- | --- |
| Latest origin/dev, fetched at task start | `a47ff7d92f296ebd0604a1df98daf0b8111829b3`; base, already contains merged PR #3/#4 |
| Fixed Austin backend | `d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`; separate native service dependency, not merged/cherry-picked |
| origin/main | `e41f5cccb2e27a6242814e4fa3975bcec75ecdf1`; AGENTS/checkpoint reference only, not product source |
| Preserved original checkout | `dev_fe_create_event_mvp@149bc376e098477d6552ef632a4b954d3cefd23a`, clean |

Feature branch: `dev_fe_w7_browse_registration`. No similar open W7 PR/branch existed at start. Initial source SHAs match the first-stage handoff; first-stage API results are background, not evidence of this new UI.

Visual thesis: retain the cream/green ROSE surface, existing typefaces and restrained controls. Content: list search → event detail with one application action → flat online form → truthful pending receipt. Interaction: existing loading/focus affordances, abort+revision protection for reads, immediate single-submit locking for writes. No new framework, media/upload or decorative flow.

## Net implementation

- Server keyword search in title/overview, matching/empty/loading/error states, pagination and refresh retaining keyword; new search resets page one and stale requests cannot overwrite new state.
- Detail GET with validated public_id and internal-only Login return intent. Logged-in identity is verified through `/users/me`, never inferred from token presence.
- Minimal online schema form, free-text income code, optional medical input omitted. Session re-verifies the same ordinary user immediately before one POST, guards logout/auth races, and checks selected event/user/online/pending attribution.
- Page-memory actual POST receipt with application/event references, no stored participant/profile/receipt, no fabricated own-results GET. A result cannot be recovered after reload; uncertain writes stay locked, with no automatic resend.
- Existing Login/Create Event remain available; old `ACTIVE` and new lowercase status presentation coexist without replacing server values.

## Executed stage-2 verification

External run root: `E:\NU_Local_Environment_20261014\w7-frontend\20261020-023637`. This path is a local operator handoff, not a required repository location on other machines. New worktree is `frontend-worktree` under that root. Fixed stage-1 worktrees and venv remain under `E:\NU_Local_Environment_20261014\w7-preflight\20261020-021249`.

Runtime: Windows 11, Python3.14.8, Node24.14.0, native PG17.11/server_version_num170011, Chrome155.0.8059.79, independent headed sandbox-enabled contexts. Native database/application role `nu_w7_20261020_021249`, no superuser/createdb/createrole. Frontend5188 → fixed backend8017; baseline5187 and original8000/5173 preserved. No reinstall, provisioning, bootstrap, DB restart or pin changes.

| Check / exact command | Result / evidence layer |
| --- | --- |
| `node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs` from feature root | 77/77 PASS; unit/component/proxy. Includes 30 W7 tests, existing Login/Create Event/INT32/DST regressions. |
| `node tests/e2e/w7_browser.mjs --allow-synthetic-writes` with restricted local fixture paths/config | 19 limited actual browser/HTTP/proxy PASS, no interception in main flow. Three fixtures created through existing UI; same ordinary participant completes three different online applications, each once201/pending. Five separate SYNTHETIC_INTERCEPTION UI cases PASS, not native backend evidence. |
| External `db_stage2.py after` | Fresh READ ONLY asyncpg connection: three mappings, distinct registration IDs, same participant and correct user/event/online/pending; duplicate rejection adds no row. Original Demo DB fingerprint unchanged. NATIVE_DB, not own-results GET. |
| External `stage2.py integrity` | Original checkout and both fixed preflight worktrees retain exact tracked/config hashes, branches, full heads and clean state. |
| `python -X utf8 scripts/check_dev_control.py` | PASS: 157 controlled entries, 158 payload files, 141 local links, no errors. |
| `python -X utf8 -m unittest discover -s tests -v` | **22/23 PASS, 1 FAIL**, exit 1: existing `test_utf16_requirements_remain_scanned` expects LF while Windows UTF-16 `write_text` creates CRLF. Independently reproduced on unchanged baseline `a47ff7d92f296ebd0604a1df98daf0b8111829b3`; test/checker bytes match. No expectation or source changed. |
| `git diff --check` | PASS after retaining the register's original LF format. Final exact commands/exit codes are in the external ledger. |

First failures are retained externally: a Session stale-profile mock reproduction led to a regression test; its initial revision fix temporarily misclassified a forbidden role as unauthorized (targeted Node exit1), then was corrected and 77 checks passed. The first browser harness stopped before any writes because Playwright's disabled check on a fieldset did not check its native `.disabled` property; the assertion was corrected, with no product contract relaxation. The next native run passed; fixture evidence prevents blind write reruns.

Evidence indexes: `evidence/native/browser-results.json`, `ui-receipts.json`, `fixtures.json`, safe screenshots, `evidence/db-after.json`, `protected-after.json`, first-failure records and the final command ledger. Actual browser screenshots were inspected; this is not formal design review, team UAT or stage-3 acceptance. Full commit/PR remote identity and SHA256 manifest are in external `HANDOFF_FOR_ASTRA.json` after publication.

| New activity | public_id | registration_id | Status |
| --- | --- | --- | --- |
| Alpha | `DFBYagNblyuL7pvsnAoKS` | `01M5AQT9P2AC52CFKSRYHXB6BR` | online / pending |
| Beta | `gh5-SKAo-Hm5IuE86WPVL` | `01M5AQTAXTYV0QKTBJ6XJWQKC0` | online / pending |
| Gamma | `Xrfg_PXMzU_u2tPVsJxUe` | `01M5AQTC6B57W0PNS2DPX0KCGK` | online / pending |

All use participant `01M5APAF6EEGGRNMCEJHJ235GT`, created_by_user_id `01M5APAAFBYWKAK9GRXNPSNBAA`. These are synthetic local IDs, not production records. Three activities are a test arrangement, not a requirement attributed to Austin.

## Completion boundary and manual reproduction

DEMO_BLOCKER: none observed for this limited mainline against the pinned backend.

ISSUE_COMPLETION_GAP: own-registration GET/reload readback missing; server registration auth and participant ownership unresolved; public signup role escalation unresolved; approved design/peer evidence incomplete; income options, eligibility, review method and pending/reservation policy undecided. These belong with Austin/PM and prevent treating full #19/#22/#23/#26 as completed. UI verification is not a backend authorization fix. Original bootstrap remains FAIL and old DB migration remains NOT_RUN. The separate document-control unittest gate retains its baseline Windows newline failure (22/23 PASS); `baseline-unittest.json` and `.log` preserve the fresh comparison. This is not an all-tests-green delivery.

OUT_OF_SCOPE / NOT_RUN: signup UI (#25), role management/dashboard, approval/registration centres, upload, offline/walk-in/OCR, waitlist, cancellation, concurrency/stress, whole native E2E, Security/penetration, UAT, DB restart, video, deployment and promotion. These are exclusions, not a proposed repair backlog.

Manual limited replay: open frontend5188 → search `20261020-023637` → View event → Apply → Login with the existing ordinary synthetic account → return to that public_id. The existing account already applied to all three fixture events: submitting again should show the bounded duplicate failure, not another success. For fresh stage-3 success evidence, use the existing organizer's Create Event UI to prepare three new distinct events, then the same ordinary participant/fixture details; do not delete earlier records or replay stage-1 writes. Keep each returned reference before leaving. Browser reload intentionally does not retrieve receipts.

Account/participant secrets are read only from the existing restricted preflight `private/accounts.json` and `private/participant-fixture.json`, in program memory; never print/paste the whole files or pass passwords on a command line. The external handoff has exact launch/status/normal-stop commands and evidence paths. Only the new5188 frontend is managed by this stage's launcher; do not stop or replace the original or preflight services.
