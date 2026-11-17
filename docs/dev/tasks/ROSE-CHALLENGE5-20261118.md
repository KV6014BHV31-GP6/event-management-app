# ROSE PULSE Challenge 5 public experience

Status is **working-baseline**. Owner authorizes one Sol product writer and
documentation writer on `feat/rose-challenge5-20261118`. Base is
`27f1a1c5bade55304c60d4e133980c34b2031c2d`, origin
`KV6014BHV31-GP6/event-management-app`. The checkout was clean at entry.
Chat Astra is the controller. The author's endpoint is the local candidate
commit and handoff for subsequent independent review.

## Product scope

- Advertisement uses the existing search, images, complete collections and
  disclosure. Explicit legacy exercise IDs are absent from public discovery.
  Their routes and stored records are retained. Public event times support a
  local calendar download. Six existing source records keep IDs and images.
  Related references are `SP-FEATURES-20261012:A-01` and
  `SP-FEATURES-20261012:P-03`.
- Participation keeps accountless guest booking access and member history.
  Pending receipts stay until the participant chooses a next action. Age
  Group is required, Income Group is optional and approved options remain
  server-owned. Existing staging fixture labels get a display-only adaptation.
  Related references are `SP-FEATURES-20261012:P-01` and
  `SP-FEATURES-20261012:P-02`.
- Supply and demand use the organizer's existing scoped review, quota,
  waitlist and offer data. Check-in distinguishes the local queue from
  confirmed arrivals and keeps the existing server window and closeout rules.
  Related references are `SP-FEATURES-20261012:A-02`,
  `SP-FEATURES-20261012:A-03` and `SP-FEATURES-20261012:F-01`.
- Low-resource promotion uses assigned leaders, existing referral links,
  approved printable materials and self-reported outreach. WhatsApp opens
  the sender's app so they can choose a recipient. Offline drafts stay accessible
  for a verified leader with the same existing recovery boundaries.
  Related references are `SP-FEATURES-20261012:L-01`,
  `SP-FEATURES-20261012:L-03` and `SP-FEATURES-20261012:L-04`.

## Build, evidence and rollback

The product Dockerfile uses `VITE_DEMO_PROFILE=synthetic` and
`VITE_DEMO_PRESENTER=off`. This keeps the current IndexedDB profile while
hiding presenter actions and disabling the simulation transport. Isolated
author and hosted test builds can still use the existing presenter profile.
See the [frontend README](../../../frontend/rose-pulse-react/README.md)
and [Railway runbook](../../../deploy/railway/README.md) for source identity,
database preservation and setup.

Author execution results, retained failures, screenshot paths and the ten
verification groups are under the external task evidence directory.
Hosted CI, independent review, public activation and deployment require the
controller's separate stage. The candidate changes frontend presentation and
the one build flag. A pre-promotion rollback is the prior frontend revision.
Any later web image rollback must keep aligned host/image/source identity
and respect the retained PR71 schema and existing age-only writes.

## Draft PR 72 review follow-up

The local additive revision addresses findings R1–R5 against
`34a70bd8e3f720bb7e8bcfd865e968e7545444c9`. A new guest challenge
invalidates the previous detail and requires a matching grant and read.
Guest and member event selection opens the application, and the guest
sidebar opens accountless lookup. Catalogue assembly reads the surviving
page for a stale bookmark. Printed approved flyers include the exact
referral URL. Confirmed outreach saves refresh the scoped list, and a
failed refresh can be retried by reading the list.

The external review-fixes handoff records the preserved failing checks,
controlled Chromium and connected local evidence. The existing API and
database contracts continue to govern access and writes.
