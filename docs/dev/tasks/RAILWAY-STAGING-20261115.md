# NU ROSE PULSE Railway Staging, 2026-11-15

**Status:** working-baseline / LOCAL_VERIFIED_PARTIAL. No Railway application deployment, public hostname allocation, database provisioning, payment action or team approval has occurred.

## Objective and boundaries

Publish a synthetic-only NU Demo over Railway HTTPS with a real PostgreSQL 17.11 backend, preserving the already merged `dev_demo` product baseline and existing local Docker/Lab volumes. The user chose `rosepulse.up.railway.app` as first requested domain; it is not yet allocated and must be confirmed from Railway's service domain status. This task does not publish a Production release or justify real participant data, P1 automatic attachment sync, physical-device acceptance, full AC40 or UAT.

Source baseline: `KV6014BHV31-GP6/event-management-app`, `dev_demo@23e327a6ca18ad649db8e5075e0ae14c2286aa45`. The existing five-gate merge-commit GitHub Actions run `43666354951` was observed SUCCESS for this baseline. New deployment adapter commits are distinct and need their own source and verification.

## Implementation scope

- `deploy/railway/Dockerfile` builds the pinned React source with the required sibling `frontend/live` directory and separately packages pinned Python/FastAPI without changing product source. No old `0e8b` CI artifact is substituted.
- `deploy/railway/gateway.mjs` reuses the reviewed product proxy's canonical HTTPS Host/Origin guard. It blocks wrong Host, cross-origin writes and source docs, and provides a read-only DB-backed readiness endpoint. Node receives no DB or JWT secret.
- `deploy/railway/entrypoint.py` verifies synthetic-only mode, signed product identity, canonical public HTTPS origin, limited non-superuser role, expected database and existing complete model schema. It may initialize only a totally blank, explicitly acknowledged staging database, never seeds any person, activity or account and refuses partial/non-staging databases.
- `deploy/railway/Dockerfile.postgres` and `10-init-app.sh` pin PostgreSQL 17.11 and create non-superuser `nu_app` solely on a new volume. PostgreSQL is private and does not get a public TCP proxy.
- `deploy/railway/start.sh` fixes new mounted upload directory ownership then drops to non-root uid 10001 before starting the application, while preserving the private upload directory. Storage requires a separate private volume, not an ephemeral file system.
- `.dockerignore` excludes workspace secrets, generated DB data, build outputs and personal docs.

## Evidence and limitations

Local isolated synthetic run on authorized `beeawa-46`:
- `node --test deploy/railway/tests/gateway.test.mjs`: 2/2 PASS, exact-Host, same-Origin and forbidden write controls.
- `python deploy/railway/tests/entrypoint.test.py`: 4/4 PASS, invalid Host/Origin, missing JWT and wrong product/profile/port refusal.
- First Docker web build FAILED because `frontend/live` sibling modules were omitted from the original Docker Build Context. The Dockerfile was corrected without product changes, re-run PASS for the App image and separately for PostgreSQL 17.11.
- The new `nu_app` role read back `rolsuper=false`. The private local database was created with new empty data only. App health, website root and Events GET returned 200 via isolated loopback 5299; unauthorized Host returned 403. No real participant, real secret, public browser, external traffic, Cross-Device or full E2E test was performed.
- There are no changes to `backend/` or `frontend/` product bytes. Any edits after this recorded Docker preflight require targeted review.

Staged Railway resources, observed using Railway's authenticated app:
- Project `NU ROSE PULSE Demo`, private `staging` environment.
- Web service `rose-pulse-web` staged-create. Repo source currently staged at baseline SHA, not at uncommitted adapter. Its future deployed source must be updated to the fixed deployment-adapter SHA first.
- PostgreSQL service `postgres17` staged-create, image currently staged `postgres:17.11-bookworm`. Before apply, switch staged source to the reviewed GitHub database Dockerfile so its non-superuser app role is created. Do not apply the current unprepared DB service.
- Dedicated 256 MB Postgres volume and 128 MB app upload volume are staged, not live.
- Billing plan, available credits, spend hard-limit and external deployment rights not verified; **no accept-deploy** before owner permission for any recurring charges.

## Required gate before external deployment

1. Fixed adapter commit, scoped tests, document register and independent source/security review. Preserve original product HEAD and Docker label/source SHA.
2. Actual Railway billing/credit and spend limit decision. Free-tier general pricing is not account entitlement evidence.
3. Stage DB image source and generated DB/admin/app/JWT secrets, app env, fixed domain Host, HTTPS and healthcheck without logging secrets or granting public Postgres access.
4. Apply only authorized staged changes to a separate Project; observe terminal Railway SUCCESS, data-safe first-time schema initialization and readback.
5. Generate a Railway-managed domain; check whether `rosepulse.up.railway.app` is actually accepted. If not, report the actual generated domain and never invent a reserved name.
6. Perform real HTTPS browser + API + PostgreSQL bounded synthetic smoke; inspect secrets, browser access, document private ACL, identity/session, one controlled seed only when separately authorized. This is NOT original AC40 and does not replace real phone tests.

## Reversibility and limits

Local original Demo, base images, data and ports remain unmodified. This task uses only its own worktree and `nu-railway-lab-20261115` network/test containers. Preserve source and errors. Stop/clean only newly created Lab resources after inspecting their own identities; never reset, prune or delete team DBs. Railway staged settings have not been applied; if cancelled, remove only their own staged entries with explicit review. No force push, protected branch change, production environment switch, public tunnel, provider purchase or token export.

**Next owner decision:** authorize a specific Railway resource budget / confirm that any incremental paid usage is permitted, or restrict to existing free credits. This is a billing decision, not an engineering configuration task.


## Activation successor, 2026-11-15

Owner approved deployment fees in the current conversation. The isolated private Railway patch was applied; both services reached SUCCESS. Startup logs verified fresh synthetic schema initialization with no accounts/events. The database retains private networking and a non-superuser app role. The first-time empty-schema opt-in is now configured off for subsequent deployments. Existing JEV services, local Demo containers/data and protected branches remain unchanged.

Independent Astra review of fixed 830cb3d7 reported BLOCKED only for Railway healthcheck Host compatibility. Actual separate Sol writer changed only gateway.mjs and its tests: strictly allow the exact raw read-only readiness route for a unique healthcheck.railway.app Host with no Origin; retain genuine Events/DB readiness and upstream failures, never authorize business routes under the platform Host. New tests include duplicate Host, empty/foreign Origin, POST, query/path variants, non-health paths and failed/unavailable upstream. Sol reported 3/3 PASS and git diff --check PASS; original duplicate-header test failure is preserved externally. Controller copied the stopped writer's exact two-file diff for this successor. Hosted status, original local smoke and fixed-source review are different evidence layers. Public domain assignment, final HTTPS Browser smoke and the corrected candidate's independent review remain pending at this source checkpoint.
