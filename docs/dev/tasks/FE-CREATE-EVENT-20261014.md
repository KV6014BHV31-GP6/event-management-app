# FE-CREATE-EVENT-20261014 | Minimal Create Event UI

> **Branch/evidence context:** This is an English documentation copy of the [pinned dev record](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/tasks/FE-CREATE-EVENT-20261014.md). Implementation, runnable commands and original outcomes below belong to that dev/history context, not main's README-only shell. This docs PR imports Markdown only; referenced code/artifacts remain external. Use [canonical CURRENT](../../../docs/dev/CURRENT.md) for later status.

Status: working-baseline; implementation LOCAL_VERIFIED by unit/component tests, native integration BLOCKED / NOT_RUN. Related scope: `SP-FEATURES-20261012:A-01`, not acceptance of that full feature.

## Authorization and baseline

User instruction on 2026-10-14 authorizes this page, tests, minimal documents, commit/push and one Draft PR with base `dev`. No merge, deployment, role-policy, backend/schema/pin change, or writes to shared branches. Sole writer: root Codex agent, frontend and associated documentation only.

Repository: `KV6014BHV31-GP6/event-management-app`; origin `https://github.com/KV6014BHV31-GP6/event-management-app.git`.
Initial clean workspace: `/workspace/scratch/7e6e6a825113/nu-event-management`, branch `dev_fe_events_login`, HEAD `50a7d244db4f5caa299daed5eb9c87584d11265c`. Fetch completed. New isolated clean worktree: `/workspace/scratch/cce866e6a9e3/nu-create-event`, branch `dev_fe_create_event_mvp`, based on latest `origin/dev` at `7a06f43dc30c8378d9f3c569635523b25ce556b0`. Existing `origin/feat/fe-create-event-mvp` points to that same merge commit with zero additional changes; PR search returned no corresponding PR. No existing work overwritten.

## Changes and contract

- Add `frontend/live/create-event.html` and `create-event.mjs`; reuse ROSE fields, palette and mobile layout.
- Add minimal API method to existing request client, Session method forwarding its private token and verified-account navigation link. No token getter or new storage.
- Trim/validate seven allowed form fields; dates use the browser local timezone and convert to ISO; reject impossible dates including DST gaps. Repeated local times at a DST fallback use JavaScript's earlier matching instant.
- Existing POST `/api/v1/events` requires Bearer token and returns EventResponse with HTTP 201. Only that status plus valid structure displays server title/public ID. Server owns IDs, organizer and status. Source: `backend/src/events/schemas.py`, `router.py`, `service.py` inspected, unchanged.
- Guard in-flight and successful submissions; 401 clears session, 403/422 keep values. Unknown outcomes lock the form and tell the user to check Events; no automatic POST retry. Logout invalidates late responses.
- Back/Cancel use `./index.html`; unchanged list starts page 1 with a fresh GET; existing backend sorts newest created first. No fake/local event cards.

## Verification, 2026-10-14

`node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs`: **44/44 PASS**, Node v24.19.0. 10 new tests cover payload/date/DST validation, Bearer JSON, 201/schema enforcement, authentication, duplicates, failures, logout races and mounted form wiring. This is unit/component/proxy evidence with mocked fetch/DOM, not a real browser/API/database acceptance.

First run: 42/43 passed; new synthetic fixture mistakenly had a 22-character public ID and correctly failed the 21-character contract. Corrected the fixture, then 43/43 passed; added mounted form component coverage and final run passed 44/44. No production contract relaxation.

Environment probe: `python3 --version` = Python 3.12.14. `command -v python3.14 postgres pg_ctl psql chromium google-chrome` found none; `/usr/lib/postgresql` is absent. No replacement runtime/database installed. Real Login/form POST 201, actual public ID, list readback, Refresh/Reload persistence and real browser duplicate-POST observation: **BLOCKED / NOT_RUN**. No Windows execution claimed. PR #3 native reports retain their historical scope and are not reused as acceptance of this form.

`git diff --check` and repository document-control validation are delivery gates. No full E2E, Security, UAT, deployment, video or database restart performed.

## Five-step native manual demo (pending)

Prerequisite: checkout this feature commit, follow backend/frontend README using Python 3.14, native PostgreSQL 17, exact dependencies and a dedicated synthetic database/account. Start API and `node frontend/dev-server.mjs`. Open browser DevTools Network with Preserve log; do not share Authorization values.

1. Open `http://127.0.0.1:5173/live/`, confirm Events is public, then use the real Login form and confirm `/users/me` 200 plus Create event navigation.
2. Open Create event; fill unique `NU Frontend Create Demo <run_id>`, location, increasing local dates/times and quotas. Confirm displayed browser timezone. Submit once; rapid extra click/Enter must not add a POST.
3. Record exactly one real `POST /api/v1/events` with **201**, success message, returned title and `public_id`. Do not use Swagger, SQL INSERT or API scripts to create the record.
4. Click Back to events. Confirm fresh first-page GET contains that same public ID/title and the card is visible.
5. Click Refresh events, then browser Reload. Confirm fresh GET responses still contain the same public ID and no further POST. Record results; no DB restart needed. Also confirm Cancel does not POST and logged-out Create Event cannot submit.

Stop after Draft PR delivery. No merge or next feature.

## Authorized repair and native acceptance successor, 38557951101-1

The user authorized resolving review findings and updating this PR, explicitly without merge. Quotas now match native PostgreSQL integer range 0..2147483647; both input max attributes and independent boundary tests are included. Native UI status: **FAIL**, tested `06d7cc7ea95ec22e215e7cb7b4ebaac547d9492e` on GitHub-hosted Windows, not the user local machine. [Evidence](../evidence/FE-CREATE-EVENT-NATIVE-20261014/38557951101-1/README.md). Historical NOT_RUN entries describe the earlier run and are retained. No backend/schema/pin changes, alternative engine, full E2E, Security, UAT or deployment.

## Authorized repair and native acceptance successor, 38558483277-1

The user authorized resolving review findings and updating this PR, explicitly without merge. Quotas now match native PostgreSQL integer range 0..2147483647; both input max attributes and independent boundary tests are included. Native UI status: **PASS**, tested `0a29fde4ef8b1b76d2ba105d03ef9362ac9a8d90` on GitHub-hosted Windows, not the user local machine. [Evidence](../evidence/FE-CREATE-EVENT-NATIVE-20261014/38558483277-1/README.md). Historical NOT_RUN entries describe the earlier run and are retained. No backend/schema/pin changes, alternative engine, full E2E, Security, UAT or deployment.
