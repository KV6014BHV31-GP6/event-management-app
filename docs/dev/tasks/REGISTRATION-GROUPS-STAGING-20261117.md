# Registration groups: synthetic staging deployment successor (2026-11-17)

**Status:** implementation/test candidate. Do not infer Railway release, real taxonomy or
production readiness from this file. Confirm target through Railway and GitHub readback.

Source: PR #70 merged as `dev_demo@88dc0b39efbc3822f6eae1cf432d1d721ff8c9a9`.
This successor only permits deployment of its Age/Income API/React code to the
existing `NU ROSE PULSE Demo / staging / rose-pulse-web` service. It does
not touch other branches, Austin source, real personal data or other services.

Existing Railway Web `eb770465220e9d415a6ee75ee4f188b920fec79e`
runs against existing PG17 `nu_staging`; PR70 requires an explicit schema
migration before the new application can boot. The older development-only
migration is not a staging permission. Never set `ENVIRONMENT=development`
against the hosted database to make that script run.

**New contained code:** `deploy/railway/registration_groups_staging.py`;
five-line launcher integration and one Docker copy; one focused migration
regression test. Activation requires explicit
`NU_STAGING_GROUPS_OPERATION=nu-staging-registration-groups-20261117-v1`,
scope-locked exact Railway IDs, private DB endpoint, DB name and non-superuser role. Scoped legacy
DOB/income data snapshot is mode 0600 inside existing private upload volume;
it is not a full backup. DDL is transactional/idempotent; historical row counts,
DOB and income are preserved. Only the new synthetic demo stage receives
clearly labeled placeholder age/income choices; this does not approve taxonomy.

**Gates:** focused isolated PG first/repeat/history/wrong-stage rejection,
syntax and existing affected CI, fixed-SHA independent review, target branch
readback. Stage matching source SHA and staged `NU_PRODUCT_SOURCE_SHA` together
with the deployment trigger. Verify postmigration receipt, six source events,
API options with optional income, submitted synthetic guest receipt, matching
frontend build and DB persistence. Preserve old Railway deployment/volumes.

**Rollback:** before any new age-only submissions, restore previous Web image
pin and `NU_PRODUCT_SOURCE_SHA` together, leaving additive DB schema intact.
After new rows exist, prefer repair-forward; old code expects non-null DOB and
must not be treated as universally compatible. Never truncate events,
registrations, volumes or reset role passwords.