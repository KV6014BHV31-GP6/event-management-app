# FE-CREATE-EVENT-ROLE-GUARD-20261020

Status: working-baseline. Source: current direct user authorization `USER-FE-CREATE-ROLE-20261020`, scoped only to a minimal frontend organizer restriction, necessary checks and one English Draft PR. Local Astra owns independent acceptance and decisions. No issue closure, merge, force-push, approval, Ready-state/reviewer/Issue/Board edit, deployment or teammate message.

## Source and change boundary

At start PR #28 was freshly read as OPEN/Draft, head `dev_fe_user_signup@189dbe07fafddc793373abb36573805b3c471940`; no matching local/remote branch or PR existed. New feature branch: `dev_fe_create_event_role_guard`, based on that latest head, with Draft base `dev_fe_user_signup`. Nothing was written to PR #27/#28 or their source branches. Remote `dev@a47ff7d92f296ebd0604a1df98daf0b8111829b3` and main remain reference only.

Actual runtime backend is the separate detached clean worktree `dev_be_registrations@d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`, not the frontend checkout's backend. Frontend/API contract and other features are not merged/cherry-picked or refactored. External run root: `E:\NU_Local_Environment_20261014\create-event-role-guard\20261020-101830`; new isolated `role-worktree`. All six pre-existing worktrees have before/after tracked/config/HEAD/status snapshots; existing dirty work, if any, is retained. Root is the sole shared product writer; the test writer owns only `frontend/live/tests/create-event-role.test.mjs`, and contract review is read-only.

Only `ui.mjs`, `create-event.mjs`, one HTML notice, relevant tests and minimal README/CURRENT/task/register metadata change. No Session/storage/Login/API/Signup/registration/style/dependency/backend edits.

## Resulting frontend behavior

- Events remain public. Existing username, Login, Signup, Logout and Events navigation remain.
- Create event link requires exact `session.user.role === 'organizer'`, taken from the existing `/users/me`-verified Session. Username is not an authorization rule; an ordinary user named `demo_organizer` is denied in tests while another organizer name is allowed.
- Unverified/absent identity retains the Login prompt and cannot submit. Authenticated non-organizers see exactly `Organizer account required.` and a disabled form; they are not told merely to log in.
- Controller checks role before payload/API and DOM submit separately checks role, so a re-enabled fieldset cannot bypass the guarded submit path. user/leader/missing/unknown role default to denial. No general RBAC framework was added.
- Existing date/quota/field/one-submit/uncertain behavior is retained. Role/identity changes during a write discard late success as uncertain; logout or non-organizer identity hides success and prevents further submit. This does not undo an already-sent request or enforce backend authorization.
- Existing successful Create Event fixture was already organizer. The quota regression fixture now explicitly uses organizer so it still reaches quota validation; the existing DOM fixture only adds the new notice node. No functional assertions were deleted or weakened.

## Checks and actual native smoke

Repository commands run in the new role-worktree, using existing Node24.14.0 and preflight Python3.14.8 venv. Final exact argv/cwd/UTC/exit/log are in external `evidence/command-ledger.json`.

| Check | Result / evidence layer |
| --- | --- |
| `node --test` with explicit expansion of proxy and sorted live tests | 120/120 PASS, exit0;12 new role tests plus108 existing. Unit/component/proxy, not full native E2E. |
| `python -B -X utf8 scripts/check_dev_control.py`; `git diff --check` | Final results in external ledger; register refresh only after intentional edits, preserving original LF. |
| New role test first targeted run | 12/12 PASS; no invented first failure. Covers navigation/controller/DOM including tampered disabled fieldset, pending identity, strict roles, identity/role changes and logout. |
| Existing Create Event/quota targeted tests | 13/13 PASS; old field/date/quota/duplicate/uncertain/logout assertions retained. |
| External `run_native.py` | 7/7 limited actual browser/HTTP/proxy checks PASS, exit0; no response interception. Anonymous Events200 and direct create denied; existing ordinary user has no entry, direct-page exact role notice and0 Create Event POSTs; existing organizer has entry and valid form, Enter plus form submit makes exactly1 POST201; organizer Logout removes entry and disables form/hides success. |
| External `db_snapshot.py after` | New READ ONLY nativePG17 connection: exactly1 new event, correct organizer/public_id, old events and all other W7 tables unchanged; original DemoDB fingerprints unchanged. events9→10; users5/participants1/registrations9 unchanged. |
| External `delivery.py integrity` | All six pre-existing worktrees' tracked/config/heads/branches/status unchanged. |

Runtime: Windows11, Chrome155.0.8059.79, nativePG17.11/170011, existing dedicated database/application role `nu_w7_20261020_021249`, superuser/createdb/createrole=false. Temporary frontend5190 proxied to existing backend8017; existing5188/5189/8017 retained. PID/cwd and six served app files were checked against exact worktree bytes. No install, bootstrap, schema, DB rebuild/restart or environment changes. Only existing restricted ordinary/organizer credentials were read in memory; no Signup account or privileged fixture was created.

Created event is synthetic local id10, public_id `3QzIIjByNZadddCCXyYhF`, organizer_id `01J00000000000000000000001`. The ordinary user made0 Create Event POSTs throughout its smoke. These are positive organizer/UI-negative user checks, not a direct API test that the backend rejects a user.

The first external provenance helper accidentally queried preserved Signup frontend5189, causing an expected byte-mismatch assertion, exit1, before any smoke writes. `runtime-first-failure.json` explicitly transcribes that observed tool result; only the external probe URL was corrected to5190, after which source checks passed. No product repair or unrelated change resulted. Native smoke itself passed its first run. No logs containing credentials/token/DSN or raw SQL are committed.

Safe evidence is external: `evidence/runtime.json`, `native/results.json`, `native-command.json`, ordinary-denied/organizer-created PNGs, `db-before.json`/`db-after.json`, `protected-before.json`/`protected-after.json`, final command ledger, and publication/delivery records. The two screenshots were visually inspected. Product hashes are matched to the committed blobs at publication. All results are author self-checks, not local Astra's independent acceptance or decision.

## Backend gaps retained, source inspection only

At the actual backend SHA:

1. `backend/src/events/router.py:16–22` requires `get_current_user`; `auth/deps.py:16–46` checks JWT/existing user, and `events/service.py:13–32` constructs/commits without an organizer check. The backend does not enforce organizer403 against ordinary users. No bypass write was performed to probe this.
2. Public `users/router.py:13–18` has no auth/role dependency; `users/schemas.py:6–15` permits caller user/organizer/leader role, and `users/service.py:25–35` persists `user_in.role.value`. No public Signup privileged account probe was performed.

Both are unresolved backend authorization/security gaps owned outside this frontend change. Frontend role restrictions passing do not mean backend authorization passed. They are not fixed or masked by this PR.

NOT_RUN: native leader/unknown-role account cases (covered only in unit/component); full native E2E/Security/UAT; backend bypass/security probes; full backend/Python suites; bootstrap/schema/migration repair; DB restart/rebuild; video/deployment. Historical Python22/23 baseline newline failure is unchanged, not rerun/repaired here. Scope ends at one Draft PR and factual delivery; no other feature work or acceptance decision.
