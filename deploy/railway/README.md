# NU synthetic staging release

The existing `NU ROSE PULSE Demo / staging / rose-pulse-web` service and
`https://rosepulse.up.railway.app` remain the release target. Preserve PostgreSQL,
its private network, both mounted volumes and the narrow healthcheck exception.

## Source identity

Build the full frontend/backend from the exact merged commit. Railway provides
`RAILWAY_GIT_COMMIT_SHA` as a Docker ARG; local controlled builds may supply
`NU_PRODUCT_SHA`. Missing/invalid identity fails the build. The same frontend build
writes `/nu-source.json`. The launcher requires `NU_PRODUCT_SOURCE_SHA` and any
provider commit identity to match that immutable file. Update the existing service's
fixed source pin and source variable together; redeploying the old build does not
publish a new release. Node receives neither DB credentials nor JWT/seed secrets.
The frontend is built with `VITE_DEMO_PROFILE=synthetic` to retain the existing
explicit synthetic offline draft/receipt tools. Backend `NU_DEMO_NAMESPACE=release_`
enables the existing synthetic Guest recovery challenge contract. No team account
is granted global owner access; `NU_DEMO_OWNER_IDS` is not populated by this release.

## Explicit content operation

`backend/scripts/staging_content.py --manifest deploy/railway/seed-assets/manifest.json`
is read-only by default. It requires the synthetic profile and non-superuser
`nu_staging` DB, checks the six current R4 source records and exact image hashes,
and serializes execution with a transaction advisory lock. `--apply` additionally
requires `NU_STAGING_CONTENT_OPERATION=nu-web-release-20261116-v1` and private
`NU_STAGING_ACCOUNTS_JSON` containing exactly the six role credentials. No default
password is in source. Existing accounts are never reset and foreign source-key
collisions stop the operation.

For this explicitly authorized first installation the launcher can perform that
same dry-run/apply operation before starting HTTP. It writes a restricted logical
snapshot to `/data/release-backups/nu-web-release-20261116-v1-before.json` before any
DB insert, then atomically commits users, events, assignments, images and a durable
`release-seed:nu-web-release-20261116-v1` receipt. Restart/lost acknowledgement reads
that same receipt and never recreates rows. Only public event images are associated
with the public image endpoint; supporting-document authorization is unchanged.
After public readback, remove the two seed variables. Keep `NU_INIT_EMPTY_DB=no`.

Manifest dates retain Figma's March/April 2027 dates. Timezone and synthetic
pool/window assumptions are disclosed in the manifest; they are not medical rules.
Event public IDs remain exactly21 characters, as required by the existing Web and
offline client contracts. They are deterministic hashes of the Figma source key.
The first local-only short-ID rehearsal is superseded; its original receipt must
refuse this changed manifest. Validate this revision in a fresh isolated database.
The two Organizers own distinct events. Leader1 is assigned the first three events;
Leader2 is intentionally unassigned there. Attendees retain the existing `user`
server enum. Guest needs no account. Normal password hashing/validation remain.

## Validation and rollback

Run `python deploy/railway/tests/entrypoint.test.py`,
`node --test deploy/railway/tests/gateway.test.mjs`, the focused backend tests,
the current native DB/API/Browser gates and hosted fixed-SHA CI. Verify the actual
public bundle and `/nu-source.json`, each login, event/image counts, permissions,
durable application/approval/cancellation and manual offline receipt recovery.

Before deployment retain the provider config, old deployment ID, manifest, seed
receipt and schema identity. Roll back only the web service to its previous build
and matching `NU_PRODUCT_SOURCE_SHA`; preserve DB, domain and volumes. These
changes require no schema migration and the new records use existing tables.
Do not restore the whole snapshot over newer legitimate writes. Investigate the
specific stable IDs and original receipt before any data repair. The restricted
snapshot is recovery evidence, not a public artifact.

## One-time Age/Income Group activation for existing synthetic staging

PR #70 changes NEW applications to a required age group and optional income
group. An existing nonempty Railway database still has the legacy DOB NOT NULL
columns and no lookup tables. Redeploying that code alone is not a migration:
the launcher refuses partial schema rather than guessing or clearing data.

The explicit staging successor is `registration_groups_staging.py`, invoked
by the launcher **only** when
`NU_STAGING_GROUPS_OPERATION=nu-staging-registration-groups-20261117-v1`.
It additionally checks the exact observed Railway project/environment/web
service IDs (source-pinned to this one-time operation), the private
`postgres17.railway.internal/nu_staging` connection endpoint, synthetic
profile, current non-superuser role, trusted HTTPS origin,
no empty-DB initialization, and original legacy tables.

The first invocation writes a private, mode-0600 **scoped legacy-column
snapshot** under the existing mounted upload volume
`/data/release-backups/registration-groups-20261117-before.json` with
a SHA-256 readback. It is NOT a full PostgreSQL or provider-volume backup.
The migration then takes short database locks, creates the two Austin lookup
tables, adds nullable age FK, makes legacy DOB columns nullable without
changing historical rows, and records a durable operation ID plus the backup's SHA-256 digest in the same
transaction. The code fails closed on wrong Railway target, unknown schema,
pre-existing reference taxonomy, changed legacy counts or missing backup.
Receipt-proven repeats recompute and verify the stored backup digest/schema
before proceeding; they do not reinsert any records.

Only the isolated **synthetic staging environment** installs five explicitly
labelled demo age groups and three illustrative income groups. These are
not teacher, NGO or medical eligibility policy and must not be used to infer
real-world qualification; Income remains optional. Backend still validates
codes on every NEW registration. Historical DOB and free-text income are
retained. Do not run the original development-only migration against staging
or set ENVIRONMENT=development to bypass its guard.

Release requires a fresh fixed-SHA build, mandatory CI, isolated PostgreSQL
rehearsal, readback of the exact Railway source identity and private database
volumes, then public dropdown and one bounded synthetic transaction. Previous
Web deployment and both volumes are retained. Roll back the Web image only
before new no-DOB registration records are accepted; after that, retain the
additive schema and fix forward rather than force NOT NULL or erase history.
Uninstalling or leaving the trigger blank makes future startup refuse an
incomplete schema, rather than installing a hidden default.
