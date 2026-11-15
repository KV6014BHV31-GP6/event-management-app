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
