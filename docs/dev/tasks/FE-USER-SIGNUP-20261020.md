# FE-USER-SIGNUP-20261020

## P0 repair successor (2026-10-20)

The user's P0/P1 authorization permits repairing this feature branch and non-rewriting synchronization into PR #29, then a separate Guest Draft PR. Sol must not merge a PR or push dev/main/uat. Historical evidence below remains scoped to its original version.

Reproduced before editing: new regression suite 7/11 PASS, 4 FAIL; three controlled Chrome canary scenarios attempted a native GET containing a password. Every attempt was intercepted and aborted before any network delivery, with no canary value persisted. Repairs: HTML initially disables the sensitive fieldset; `method="dialog"` provides a non-network fallback; handlers fully initialize before enabling. Trim is used only to reject all-whitespace usernames, preserving valid raw input and all previous code-point/byte guards. Signup response IDs require `typeof id === "string"` before canonical ULID validation. Invalid201 remains uncertain with no resend.

Fresh results: 119/119 Node unit/component/proxy checks PASS; three controlled privacy cases PASS with disabled controls and zero native submission attempts. Commands: explicit PowerShell-expanded `node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs`; external `node scripts/privacy.mjs before/after`. Logs live under `E:\NU_Local_Environment_20261014\guest-frontend\20261020-142554\evidence`. The previous whitespace-permitted assertion was narrowed only to remove the now-rejected empty case; valid case/spaces/Unicode assertions remain. Session/Profile validation was not relaxed. Native Signup/Login awaits the one-account downstream run; complete native E2E/Security/UAT remain NOT_RUN. No backend changes or new credentials saved.

Status: working-baseline. Owner: Benjamin frontend. Authorization `USER-SIGNUP-20261020`: minimal Signup, necessary checks and one English Draft PR with Refs [GitHub:KV6014BHV31-GP6/event-management-app#25](https://github.com/KV6014BHV31-GP6/event-management-app/issues/25). Commit message uses Traditional Chinese (Hong Kong) with English technical nouns. No merge, deployment, Issue/Board/reviewer edits, approval or teammate messages.

## Source and writer lock

| Source | Full version / boundary |
| --- | --- |
| Base W7 frontend | `dev_fe_w7_browse_registration@6ab9d531582b9528ded977f48b8c158403f8b8ce`; PR #27 freshly read as OPEN/Draft. Signup is a stacked increment and targets that branch. |
| Backend dependency | `dev_be_registrations@d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`; separate clean detached worktree/service, not merged into dev or Signup. |
| dev | `a47ff7d92f296ebd0604a1df98daf0b8111829b3`, unchanged reference. |
| Preserved original checkout | `dev_fe_create_event_mvp@149bc376e098477d6552ef632a4b954d3cefd23a`, retained clean. |

No existing Signup branch/PR or dirty source was found at start. New branch: `dev_fe_user_signup`; new isolated worktree under external run root `E:\NU_Local_Environment_20261014\signup-frontend\20261020-093628\signup-worktree`. Original, W7 and both fixed preflight worktrees have before/after tracked/config/HEAD/status snapshots. Main is reference only. Root is the sole writer of API/page/navigation/CSS; the delegated test writer owns only `frontend/live/tests/signup.test.mjs` and two external first-failure records; contract reviews are read-only.

Visual thesis: retain ROSE cream/green, existing typefaces and Login surface; one two-field task and explicit Login after success. Content: account orientation → username/password → status → Login. Interaction: existing focus/hover affordances, immediate submit lock, accessible status/focus changes; no decorative motion, new media, framework or dependency.

## Contract and minimal change

Source-qualified CODE_INSPECTION at the fixed backend: `users/router.py:13–18`, `schemas.py:12–23`, `service.py:15–36`, `models.py:18–30`; `auth/router.py:48–75`, `auth/deps.py:16–46`, `core/security.py:4–15`.

- Public `POST /api/v1/users`, JSON only username/password, no role/token. Schema username3–20 Unicode code points, password minimum6 code points; no trim/normalization/username regex or password schema maximum.
- Frontend bcrypt compatibility guard: at most72 UTF-8 bytes, without truncation. Backend bcrypt5.0.0 still lacks an equivalent schema guard; this is not a backend fix or approved complexity policy.
- Only HTTP201 plus canonical26-character ULID, exact username, `role=user`, valid datetime fields and no password/password_hash shows success. The API and controller project the five safe response fields.
- Exact duplicate400 `Username is already registered.` and schema422 get static rejection text. Other/uncertain writes lock with no auto retry, including unexpected status or invalid201. W7 error mapping remains operation-specific.
- `signup.html`/`signup.mjs`, a narrow `createUser` API method, existing Login/header links, one `signupRoute` helper and small styles. Signup has only two inputs, no role/email/phone; no automatic signIn or secret/profile storage. Successful form stays disabled and clears password.
- Existing Login's HTML `maxlength=20` counted UTF-16 units and blocked valid astral-character usernames; only that maximum was removed. Native20-code-point/26-unit username then logged in successfully. Session and proxy bytes remain unchanged.
- Only a single validated21-character event ID is carried through fixed Signup/Login routes. No generic redirect mechanism. Existing proxy already supports POST `/api/v1/users`, so no proxy/route/environment contract change.

## Executed checks and evidence limits

External run root: `E:\NU_Local_Environment_20261014\signup-frontend\20261020-093628`. Repository commands run in its `signup-worktree`. Python is the existing preflight `venv\Scripts\python.exe`3.14.8; Node24.14.0, Chrome155.0.8059.79, nativePG17.11/170011. Frontend5189→fixedbackend8017; W7 frontend5188 preserved. Before writes, live PID/cwd/source and nine served files were reconciled with exact worktree bytes. Dedicated DB/application role `nu_w7_20261020_021249` is non-superuser/non-createdb/non-createrole. No install/bootstrap/migration/pin/engine change.

| Check / command | Actual result / layer |
| --- | --- |
| `node --test` with explicit PowerShell expansion of `frontend/dev-server.test.mjs` plus sorted `frontend/live/tests/*.test.mjs` | 108/108 PASS, exit0:31 Signup plus77 existing checks; unit/component/proxy. |
| `python -B -X utf8 scripts/check_dev_control.py`; `git diff --check` | Final results/argv/exit/log in external command ledger. Register refresh only follows intentional changed/new files; original LF format retained. |
| External `run_native.py` | Exit1 after six successful UI checks: exactly one real Signup201, no role/token, native76-byte rejection with0POST, locks/password clear/no auto Login/storage, selected-event link and390px layout sanity. Existing Login200/Profile200 occurred, then harness failed reading a navigated-away response body. Original result remains FAIL. |
| External `run_resume.py` | Exit0, three checks: same already-created account through existing Login, fresh authenticated Profile200 with exact id/username/user role, one separate-context duplicate400. No additional successful Signup or product change. Fresh profile uses the actual browser Login session, keeps token in page memory and returns no secret. |
| External `db_snapshot.py after` | Fresh READ ONLY connection: exactly one new ordinary user, same id/username as UI/Profile; previous user fingerprints preserved, all other W7 tables and original DemoDB unchanged. Duplicate adds no user. Counts users3→4, events9/registrations9/participants1 unchanged. |
| External `delivery.py integrity` | Original, W7 and both preflight worktrees retain tracked/config bytes, full HEADs, branches and clean status. |

Native conclusion: limited Signup→explicit Login→Profile and duplicate flow verified across recorded attempts, with the initial harness failure preserved. It is not a clean single-run PASS, full E2E, Security, UAT or formal reviewer approval. There was no response interception in these native flows. No video, W7 activity writes or privileged Signup probe.

The first targeted Signup Node run was29/30 PASS, exit1 because extra `debug` was retained in controller state. Five-field projection fixed it without lowering expectations;31/31 targeted and108/108 suite subsequently passed. The first log is explicitly a retrospective transcription of the observed tool result, not an originally redirected raw log. The original failed native run and its command/log/PNGs are retained under `evidence/native-first-attempt`; the continuation has a separate directory and ledger entry. No account recreation or retry of the successful Signup was used.

Evidence: external `evidence/runtime.json`, `native/results.json`, `native-resume/results.json`, `native-command.json`, `native-resume-command.json`, `db-before.json`, `db-after.json`, `protected-before.json`/`protected-after.json`, and final command ledger. Signup ready/success/mobile/duplicate PNGs were inspected;390px is layout sanity, not a device matrix. Publication identity/full head/remote verification and safe-artifact hashes are in external delivery files after push. Private credential fixture is excluded from Git/evidence; reports give only its restricted local path/key, never values.

## Manual reproduction and remaining risks

Open loopback Signup5189, or choose Create account from Events/Login. Enter a new synthetic username and compliant password; submit once. A valid201 disables the form, clears password and shows Account created; it does not log in. Choose Log in, re-enter the same credentials, and let existing Session verify `/users/me`. If an event was selected before Signup, Login returns to the same event. In a separate logged-out page, reuse that username once to see duplicate400. Do not unlock the successful form, auto resend an uncertain write or create more fixtures just to replay a passed run. The existing native fixture is already registered and should now produce duplicate.

The user-supplied handoff reports W7 independent PASS_WITH_GAPS and a later UI smoke on the same source; these are historical and were not rerun here. Historical document Python suite22/23 with UTF16 CRLF/LF KNOWN_BASELINE_FAIL is retained, not rerun or repaired in Signup.

DEMO_BLOCKER: none observed for this limited Signup flow against the fixed backend; initial browser-harness response-body failure was a tool failure after successful Signup, not a demonstrated product failure.

ISSUE_COMPLETION_GAP / risks: public backend Signup still accepts caller organizer/leader role; omit-role UI does not fix privilege escalation. Backend auth/participant ownership, own-registration GET/reload readback, bootstrap/oldDB migration, income/eligibility/review/pending-seat policy and formal design/team review remain unresolved. A pending application is not a confirmed place. Full Issue #25 is not declared completed or auto-closed.

OUT_OF_SCOPE / NOT_RUN: backend/pins/schema fixes; role probes/management/dashboard; offline/walk-in/OCR/waitlist/approval/upload/registration centres; whole native E2E/Security/penetration/UAT; DB restart/video/deployment/promotion. Finish one English Draft PR with Refs #25, then stop.
