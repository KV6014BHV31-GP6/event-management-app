# NU Web release — 2026-11-16

Status: working-baseline / BROWSER_BLOCKED; independent source work continues.
Merge and deployment cannot proceed while the required Browser gate is blocked.

## Authority and source

Owner explicitly authorizes a new isolated release branch, reuse/correction of
Austin source without changing his branch, real Sol-FE/Sol-BE writers, controlled
tests and independent Astra review, PR/merge to `dev_demo`, then the existing NU
Railway staging/domain and an actual420-second demo. Physical device and human
UAT are `OUT_OF_SCOPE_NOT_CLAIMED`; real Browser/API/DB, permission, recovery,
unknown-write reconciliation and necessary CI gates remain required.

Base `dev_demo@4018d6507fdaa9ad70d77cb5a396d852971decec`; read-only Austin source
`b9dca01d29d7a1b36dbbf5a43bfed06863550e34`. Adopted Figma file
`AwavHQahqm3zB2q2k5cWG0`, Home1:2, mobile4106:1876, events directory1:412.
Related references: `SP-US-20261012:US01/US02/US03/US06/US07/US08/US09`,
`SP-FEATURES-20261012:A-01/A-02/A-03/A-04/L-01/P-01/F-01/M-02`.
These references identify existing scope; they do not adopt unresolved medical,
OCR/AI, predictive, no-show release or production policies.

## Ownership and change

Root Astra is sole integrator and staging operator; real separate Sol-FE owns
frontend code/assets, Sol-BE owns Austin notification/reminder adaptation and
Journey wiring. Root owns seed, deployment adapter, shared schema/dependencies,
CI and controlled status documents. No other branch, existing DB/volume or JEV
service is a write target. The independent reviewer is a fresh non-author context.

The release addresses an empty public site, current R4 visual differences and
the absence of an integrated durable reminder worker. All controls keep the
existing authenticated APIs and pending/approved distinction. The current R4
directory supplies six distinct public event sources. Exact assets and source
IDs/dates are bound by [manifest](../../../deploy/railway/seed-assets/manifest.json).
The six normal team accounts have two each of `user`, `leader` and `organizer`;
no global owner is introduced. Actual passwords are never committed.

The prior adapter hardcoded old product identity. The new Docker build derives
identity from its exact Git source and binds both UI and launcher to it. The
explicit staging content script uses stable IDs, a native advisory lock, a
restricted pre-write logical backup and one immutable DB receipt. It never resets
existing credentials, clears the DB or repeats an unknown mutation with new IDs.
See [deployment runbook](../../../deploy/railway/README.md).

## Synthetic fixture decisions

Source dates remain March/April2027. Malaysia venues/EN-BM establish a reasonable
`Asia/Kuala_Lumpur` interpretation; the directory omits timezone, so this remains
a stated fixture assumption. Five places per event are in the existing offline
pool; remaining capacity is online, with total equal to the source. Registration
opens2026-11-16 and closes at event start; check-in window is one hour before start
until end. Existing locked synthetic policy remains30-minute offers,24-hour policy
reminder and0.5 low-demand ratio. These are visible Demo fixture settings, not
medical eligibility or real appointment rules. Leader1 is assigned first3 events;
Leader2 is unassigned there. Organizer2 owns the remaining3 for ownership negatives.

## Evidence at this checkpoint

LOCAL_VERIFIED: new isolated PostgreSQL17.11 non-superuser DB; seed dry-run creates
no rows; first apply creates6 accounts/6 events/6 public image associations;
same operation readback leaves counts unchanged. All6 accounts authenticate;
unassigned Leader, other Organizer and Attendee management reads return403.
Source drift regression was RED before the correction, then5 launcher checks
PASS; existing3 narrow gateway checks PASS. Seed ID review exposed a mismatch with
the existing21-character Web detail/offline contract. The corrected manifest uses
stable source-key hashes;6 manifest checks PASS after2 genuine RED cases. A fresh
isolated PostgreSQL rehearsal again verifies6 events/accounts/images,6 logins,
3 management permission negatives and idempotent repeat. The original short-ID
rehearsal remains preserved and is superseded, never replayed or deployed.

Stopped writer commits are integrated with preserved authorship: FE3ac3dead plus
canonical-delivery display6b887b85; BE1e9a0c23. FE affected129 checks PASS, outbox
followup55 PASS and synthetic build PASS. The two synthetic sharing assertions
also fail against unchanged base App and are retained as profile-specific test
limitations, not hidden product PASS. BE controlled notification/Journey group99
PASS, native PostgreSQL group17 PASS and final unknown-state guard9 PASS. Initial
Austin constructor/relation failures, old rollback count mismatch and the native
migration probe's refusal under wrong environment remain preserved. See
[notification adoption](../notification-integration.md). No schema/dependency change.

The integrated7b458591 controlled backend suite passed165 tests and its Docker
build succeeded. Independent Astra review then found a stale worker overwriting
unknown provider state (P1) and lost confirmation after correction/reapproval (P2).
Sol-BE95a40d61 fixes both with82 controlled/6 native checks PASS; the successor
requires independent exact-source review. Original failures remain retained.
The independent successor confirmed both fixes, then reproduced the same never-sent
reapproval problem for waitlisted notices. Sol-BE28379ab0 extends the identical
protected same-kind requeue to waitlisted;14 focused lifecycle/state cases PASS
after the preserved1-case RED. The new fixed successor requires delta review.

BLOCKED: integrated-candidate Browser acceptance and dependent merge/deployment.
The original executor rejected local proxy startup as blocked by policy. Actual
session approval=never and sandbox=danger-full-access override local config defaults
on-request/workspace-write. No formal executor approval entry is available here;
the selecting actor/cause of that session override is UNVERIFIED. The earlier
manual-start request was withdrawn following Owner correction. No renamed action,
alternate tool/host or user manual execution may reproduce the denied effect.
Source checks, existing CI evidence and media preproduction may continue but cannot
clear that gate. Actual420-second recording and public acceptance remain NOT_RUN.

The external task CHECKPOINT contains scheduling/operator details. `CURRENT.md`
remains the only repository functional status. Evidence-specific acceptance
records must identify the final exact code, commands, environment and scope.
