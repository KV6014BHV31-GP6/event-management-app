# Docker network continuation, 2026-11-05

Task: NU-DOCKER-CONTINUATION-20261104, targeted successor on existing PR59.
Base wrapper d109258fbaf4e6a218a46d981ba8813f93f3e44f. Product remains
0e8bba3863267223ede48ddca35f8bb2017a5e3a; existing CI artifact232 files are reused.

## Original failure preserved

GitHub Actions run41810843315 / job126509395219 built the image successfully.
All30 Python and15 gateway packaging checks passed. Its fresh ephemeral schema
initialized without accounts or events. PostgreSQL and App were Healthy, but
host curl127.0.0.1:5271 failed with exit7. The original containers.txt listed no
published App port. Original evidence artifact13312267143 is retained.

App and DB previously joined only internal:true private. The targeted correction
adds a standard ingress bridge to App only. Private remains internal, DB joins
only private with no published port, and the only host port remains loopback.
The original proxy Host/Origin checks, nonroot UID, capabilities, read-only root,
secret files, persistent volumes and product files are unchanged.

The ingress bridge is not a zero-egress control. App may have outbound access;
DB has no direct external network. This does not authorize public exposure.
Do not describe loopback publishing as internet deployment or production security.

## Verification layers

Four new topology tests first produced3 PASS /1 expected FAIL on the original
Compose, then4 PASS after the correction. These are configuration assertions,
not proof of container reachability. The unchanged wrapper-only hosted workflow
must still prove host GET readiness and restart readiness with actual Docker.
Read the successor CI run on this commit; no result is predeclared here.

No product CI rerun, React rebuild, VM reset, database restore, account creation,
Seed or previously refused probe is part of this change. The Grok VM was offline
at intake; do not replace it with the Owner's Windows Desktop. Existing40AC/G5,
conditional Merge/CD and formal full-feature video gates remain separate.
The already approved female narration and earlier images are preserved.

Evidence-first acceptance: a Healthy container alone is insufficient. Successful
host GET before/after restart must accompany its fixed wrapper and product SHA.
