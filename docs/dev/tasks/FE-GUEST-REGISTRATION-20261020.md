# FE-GUEST-REGISTRATION-20261020

Status: working-baseline; author implementation and bounded self-checks only. Source: `USER-FE-P0-P1-20261020`. Local Astra owns independent acceptance and integration decisions. Sol may repair PR #28, synchronize PR #29 without rewriting history, and deliver one stacked Guest Draft PR. Sol may not merge, mark Ready, approve, push dev/main/uat, deploy, change Issues/Board/reviewers, repair Backend/schema/pins, or send teammate messages.

## Source and stack

- PR #27: `dev_fe_w7_browse_registration@6ab9d531582b9528ded977f48b8c158403f8b8ce`, unchanged.
- PR #28: `dev_fe_user_signup@46e77c023d72426859e587aff7afa4db8b4c0027`, includes all three test-first Signup repairs. Its original 189dbe0 history is retained.
- PR #29: `dev_fe_create_event_role_guard@d09fe02d10b5636beb654d5d4c8d02f6f2f7a041`, non-rewriting merge of repaired #28 into latest `afd06a360a31406db16a0f8e5e2997d910df3e27`. Organizer guard and original Demo media/report remain. The old recording does not demonstrate this Guest increment.
- New `dev_fe_guest_registration` is based on synchronized #29 and targets that branch. Existing nine worktrees, including checked-out parent branches, are preserved; isolated temporary local branches published normal fast-forward updates to the correct remote feature refs.
- Actual Backend: separate clean `dev_be_registrations@d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`, served by existing Python process on 8017. It is not an ancestor of current dev. Frontend code integration does not mean dev alone has complete runtime dependencies.

Root owns shared API/Session/UI/doc metadata; delegated writers own only registration HTML/controller and the new Guest regression test respectively. A separate author-side review is not Astra acceptance. No Backend file, dependency, schema, migration, secret setting, historical media or frozen source is changed.

## Minimal behavior and inspected contract

Anonymous browsing/search/detail leads to the selected event's existing registration page, with explicit **Continue as guest**, **Log in** and **Create account** choices. Guest reuses the nine existing fields, validation and styles, with no new identity/role, email, OTP, medical collection or income options. The HTML begins disabled with a non-network dialog-method fallback. All handlers, a valid event and completed identity check precede enablement.

`registerGuestForEvent(publicId, payload, eventId)` is separate from the token-required existing registration method. Guest never calls Signup/Login or sends Authorization, and never creates/stores/borrows a user identity. It accepts only HTTP201, typed canonical IDs, matching numeric event, explicit null actor, online/pending, valid times and echoed form fields. Signed-in user retains fresh `/users/me`, bearer and actor binding. Organizer/leader do not become Guest. Any existing or failed identity is blocked from Guest until explicit Logout; clearing an expired token is not itself consent to Guest.

Submission, success and uncertain results lock against double-click/Enter/retry. Session revision is exposed read-only; the existing token storage/Login mechanism is unchanged. Mode/identity changes cannot attribute a late receipt to another identity. No personal form or receipt enters localStorage/sessionStorage. Pending is received, not confirmed; leaving/reloading loses this page's receipt, so keep the reference and contact the organiser. No read/cancel/edit/claim/binding feature is added.

Read-only Backend inspection: registrations router13-43, schemas33-64, service41-138, participant model14-27 and optional auth49-80 at the fixed Backend SHA. Absence of Authorization is the intended Guest contract. Error mappings retain exact duplicate/full/inactive400, validation422 and event404 behavior. Unknown writes do not automatically retry.

## Actual author checks

External evidence root: `E:\NU_Local_Environment_20261014\guest-frontend\20261020-142554`. Existing Node24.14, Chrome155, Python3.14.8 and native PostgreSQL17.11 reused; no bootstrap/install/schema/restart. New frontend5192 was byte-compared across all18 served HTML/MJS/CSS files; Windows PID/cwd proved it is this worktree, not old5189. Backend PID/cwd/full SHA/clean status and nonprivileged isolated DB identity were verified separately.

| Check | Result and evidence boundary |
| --- | --- |
| Signup test-first regression | 7/11 PASS,4 FAIL before fix; retained `evidence/p0-red.txt`. Parent final119/119 Node PASS. |
| Controlled Signup privacy | Three cases before FAIL, after PASS; no-JS/module-fail/partial-init remain disabled with0 native request attempts after fix. Pre-fix canary requests were aborted before network. `privacy-before.json`/`privacy-after.json`; no password value saved. |
| Synchronized role parent | 131/131 Node PASS; document-control PASS. Relative corrected Signup base contains role/Demo increment, not repeated Signup product changes. |
| Final frontend suite | 161/161 PASS, explicit PowerShell-expanded `node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs`; includes30 new Guest API/controller/DOM checks. `evidence/guest-node.txt`. |
| Controlled Guest Chrome cases | 8/8 PASS: no-JS/module-failure/partial-init, expired401, Profile503/network failure and organizer/leader. All API responses were mocked or aborted;0 POST attempts and0 personal-data query attempts. Explicit logout was required after failed identity before Guest selection. `evidence/guest-controlled.json`; not native integration or Security acceptance. |
| Limited real Browser/UI/API | 12/12 PASS, no mocked success responses; real Signup201, Login/Profile200, organizer event201, Guest201 and authenticated-user201. A write-budget interceptor only aborts forbidden/extra writes; none were blocked. `evidence/native/results.json`, masked pending receipts. |
| Fresh READ ONLY PostgreSQL | All16 reconciliation checks PASS. Users6→7,events11→12,Participants2→4,registrations11→13; all pre-existing rows unchanged. New Guest Participant user_id=null and actor=null; authenticated record belongs to the one new Signup user. Unique and distinct synthetic National IDs existed only in memory. `evidence/db-before.json`, `db-after.json`. |
| Required document/diff checks | `python -B -X utf8 scripts/check_dev_control.py` and `git diff --check`; final outputs and exits recorded in the external ledger. Register refreshed only for reviewed feature/docs changes. |

Guest reference `01M5C0DSCGEJM7XC0A26RC2JK9`, authenticated reference `01M5C0DTH02CAF1QSZ8771TXJD`, event public ID `6qKa9i9QNqbZtWQ8VGjUX` (numeric12). Guest context had0 Signup,0 Login,0 Authorization and empty browser storage, including after reload. Successful writes total exactly1 account,1 event,2 Participants and2 applications. No raw form, password, token, Authorization value or new private fixture is persisted. Full command/source/remote verification is external, not a new large evidence package or Demo.

## Unresolved boundaries

Intended Guest registration is not itself an authentication vulnerability. Remaining Backend gaps are invalid/expired token becoming anonymous; National ID reuse/update without ownership; login-only Create Event without organizer enforcement; public Signup accepting privileged roles; missing own/Guest registration retrieval; bootstrap/migration compatibility. No bypass write probes, privileged Signup, reused National ID or real data were used. Frontend PASS does not resolve Backend authorization.

Pending/eligibility/income/quota policy, Guest retrieval/claim and broader product decisions remain unapproved. Complete native E2E, Security, UAT, Backend suite, DB restart, video and deployment are NOT_RUN. Historical Python22/23 newline baseline failure is preserved and not rerun or weakened. No P2 work started.

The user authorizes local Astra, after independent acceptance, to integrate these Frontend changes and necessary parent PRs into dev through normal PR retarget/Ready/Merge operations subject to required checks. This does not authorize Sol to merge or to merge Austin's Backend or deploy main/uat. No independent approval is claimed.
