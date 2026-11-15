# NU Web release — 2026-11-16

Status: working-baseline / IN_PROGRESS. This task is synthetic staging only.

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
PASS; existing3 narrow gateway checks PASS;3 manifest/key boundary checks PASS.

NOT_RUN/PENDING: fixed integrated-candidate browser acceptance, full affected
regression/hosted CI, independent review, merge/new public deployment and actual
420-second video. No local test is labeled public deployment acceptance.
An executor-policy rejection prevented the local Browser proxy startup; root
preserved the exact rejection outside the repo and requested native approval or
manual user start. No alternate execution path is used to bypass it.

The external task CHECKPOINT contains scheduling/operator details. `CURRENT.md`
remains the only repository functional status. Evidence-specific acceptance
records must identify the final exact code, commands, environment and scope.
