# Registration classification successor — 2026-11-17

Status: working-baseline; implementation LOCAL_VERIFIED; formal classification
activation BLOCKED; independent review / hosted fixed-Head CI pending.

## Authority, source, ownership and boundaries

Owner explicitly requests DOB removal from NEW registration input, required Age
Group and OPTIONAL Income Group. Income/age taxonomy is not teacher/NGO approved
by this task. W8 income-policy approval is still absent. No requirement is inferred
from bare feature IDs: SP-FEATURES-20261012 and legacy SRC04 namespaces retain
separate crosswalks and original acceptance gaps.

Repo: KV6014BHV31-GP6/event-management-app. Base: freshly fetched
`dev_demo@eb770465220e9d415a6ee75ee4f188b920fec79e`. Sole writer: Sol, isolated
`feat/registration-age-income-20261117`; existing release checkout and Austin branch
untouched. Controller hands this bounded API contract amendment to the same writer
for independent Astra review. No Railway, production DB, full AC40, video or broad
UI redesign. Candidate-writing endpoint excludes merge/deploy.

Targeted reuse from Austin `dev_be_reminder-notification` at immutable
`b9dca01d29d7a1b36dbbf5a43bfed06863550e34`: AgeGroupModel / IncomeBandModel
column definitions, RegistrationCreate classification concept, code/name response
shape and age/income relationships. Existing receipt layout, files, identity ownership,
permissions, capacity, pool allocation and notification integration remain. Whole
Austin branch is not merged. Code/name validation/options service is added here
because the inspected Austin source has no public options router or shared validator.
Fixture `18_29` / `Band A` does not become approved policy.

Three explicitly selected source Skills read through SOURCE_READ_FALLBACK:
Benjaminecraft token-efficiency-guarded, ponytail-guarded, unslop-ui-guarded.
Native Skills reader was unavailable; this is SKILL_READ/PROCEDURE_APPLIED, not a
native host load or proof of subscription savings. UI scope LIGHT: existing R4
form/grid/typography with EN/BM labels, explicit blank states, keyboard-native select,
required age and optional income. No automatic demographic selection by demo filler.

## Final behaviour and migration

GET `/api/v1/registration-options` reads actual age and active income lookup rows.
No runtime seed, fabricated historical code, DOB substitution or implicit defaults.
New application schemas reject DOB. Income omission/null remain NULL. DB validation
applies to anonymous/member online, journey, walk-in, legacy offline and durable v2
sync callers. Legacy offline accepts canonical `income_band_code` and legacy
incomeLevel/income_level aliases (also incomeBandCode); age aliases retain Austin
AgeGroupCode plus ageGroupCode and canonical age_group_code.

Historical DOB columns stay readable and nullable. Migration
`registration_groups_20261117_v1` verifies native PG/development/exact DB/non-superuser,
takes advisory/table locks, adds empty lookups and nullable age FK, drops DOB NOT NULL
in both history tables, and records schema provenance. No business row rewrite,
backfill or data loss. Income lookup is view-only to retain historic free text; NEW
supplied values are checked. Reverse only restores old NOT NULL when every DOB is
present and no age selections/new no-DOB rows exist; otherwise refuses. Keep additive
schema/provenance and use reviewed snapshots for broader rollback.

Old immutable drafts/envelopes/IDs/fingerprints are not transformed. Batch and
submission receipt recovery precedes new schema interpretation, including historical
DOB payloads and a fresh batch referencing the same committed submission. Unknown
ACK keeps reconciliation/no-blind-replay semantics. A legacy unsent draft cannot be
made valid by fabricating an age choice. Fresh offline pages without loaded reference
options cannot create invented choices; saved queue/receipt recovery stays available.

## Local checks and evidence

Task-local pinned Python 3.14 environment, Node 24.14, PostgreSQL 17.11 binaries;
fresh loopback cluster on 55467 with dedicated non-superuser test databases. Existing
Demo/staging/production services and databases untouched. External task evidence
prefix: `E:/NU_DOB_GROUPS_20261117_` plus evidence directory of the same prefix.
No raw credentials or real participant data committed.

- `npm ci --no-audit --no-fund`: PASS, locked 118 packages.
- `npm test -- --reporter=dot`: 371/371 PASS; new options/code/requiredness/empty EN/BM
  checks included. Original 355/13 and 367/1 RED logs preserved externally.
- `VITE_DEMO_PROFILE=synthetic npm run build`: PASS; existing large-chunk advisory.
- `node --test frontend/live/tests/guest-registration.test.mjs frontend/live/tests/w7.test.mjs`:
  61/61 PASS, including one-POST/unknown-write/session/Guest boundaries. Original
  legacy fixture failures retained, then options fixture explicitly routed separately.
- `python -m pytest -q tests/test_registration_groups.py tests/test_phase2.py` from
  backend: 17/17 PASS, including no-DOB optional income, unknown/disabled code refusal,
  empty options, historical person DOB preservation and original legacy ACK recovery.
- Affected backend journey/demo/classification/phase2 first repaired run: 52 PASS,
  one detached-session assertion failure in the new test, corrected with fresh readback.
  Earlier environment-only run: 147 PASS / 54 SKIP / 38 setup ERROR because local
  Python lacked IANA timezone. Subsequent checks use actual PG share/timezone data.
- Native affected Phase2/online/journey/attribution suites: 31/31 PASS.
- Separate `test_registration_groups_native.py`: 1/1 PASS on real PG17.11,
  first/repeat/history/empty references/wrong DB/injected DDL rollback/safe reverse,
  no-DOB optional-income creation and refusal to reverse new records. Original
  overlong synthetic username fixture failure retained before correction.
- `python -m pytest -q tests/test_demo_ci.py`: 11 tests and 19 subtests PASS.
- CI caller changes add the migration and an isolated migration DB; only disposable
  browser DB explicitly imports synthetic test reference fixture. No workflow/gate
  weakening. Required PR target is dev_demo's demo-journey pipeline. Other native/
  portable workflows do not match this branch/target and are not manually triggered.

Real local browser/narrow-mobile visual evidence and hosted fixed-Head CI: NOT_RUN
at candidate freeze. Formal nonempty approved taxonomy activation: BLOCKED. No full
AC40, teacher signoff, human UAT, physical device or production certification claimed.
