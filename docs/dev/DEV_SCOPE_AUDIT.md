# Pinned dev implementation scope

Date: 2026-10-16 (UTC+8). Status: `OBSERVED` source audit; not feature acceptance.

This document describes remote `dev` at [`a47ff7d92f296ebd0604a1df98daf0b8111829b3`](https://github.com/KV6014BHV31-GP6/event-management-app/tree/a47ff7d92f296ebd0604a1df98daf0b8111829b3). The documentation PR is based on `main` at `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1` and does not import application code. The original local `dev` checkout remained at that older commit during the audit. See [CURRENT](CURRENT.md) for the single current status entry point.

## API and frontend denominators

The pinned backend exposes **8 business method/path pairs**, plus `GET /` health. Swagger and OpenAPI are infrastructure routes, not additional business operations. The source inventory is [main router registration](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/main.py), with [auth](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/auth/router.py), [users](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/users/router.py), [events](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/events/router.py), and [participants](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/participants/router.py).

| Business operation | Live frontend use at this SHA |
|---|---|
| `POST /api/v1/auth/login` | Login page |
| `POST /api/v1/auth/token` | No dedicated live UI; OAuth form endpoint |
| `POST /api/v1/users` | No live signup page |
| `GET /api/v1/users/me` | Session/profile verification |
| `POST /api/v1/events` | Create Event page |
| `GET /api/v1/events` | Event index and pagination |
| `GET /api/v1/events/{public_id}` | No live event detail page |
| `POST /api/v1/participants` | No live participant form |

The [live API adapter](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/live/api.mjs) wires **4 of 8 business operations** into **3 live screens**: event index, login, and Create Event. This is an implementation inventory, not a test-pass percentage. Reaching an API through the frontend proxy does not establish a corresponding user interface. Historical mock screens remain synthetic demonstrations.

## Feature mapping

Every ID below belongs to `SP-FEATURES-20261012`, which contains 18 draft features. Preserve the distinction from the 17-feature historical `SRC04` set in the [crosswalk](FEATURE_ID_CROSSWALK.md). Partial implementation and absence do not settle product policy or approval.

| Full feature ID | Source-observed implementation | Remaining boundary |
|---|---|---|
| `SP-FEATURES-20261012:P-01` | Partial: anonymous participant profile creation | No event booking relationship or live registration form; field policy unresolved |
| `SP-FEATURES-20261012:P-02` | Partial: exact phone and linked-user uniqueness checks | Eligibility, normalization, and approved anti-duplicate policy unresolved |
| `SP-FEATURES-20261012:P-03` | Absent from live application | Language scope and approval unresolved |
| `SP-FEATURES-20261012:P-04` | Absent from live application | Booking, SMS access tokens, expiry and edit permissions unresolved |
| `SP-FEATURES-20261012:L-01` | Partial: login and leader role value | No leader-reserved quota allocation or enforcement |
| `SP-FEATURES-20261012:L-02` | Partial: assisted participant creation attribution | No event booking relationship or live proxy-registration form |
| `SP-FEATURES-20261012:L-03` | Absent from live application | Historical mock is not delivery; AI versus template choice unresolved |
| `SP-FEATURES-20261012:L-04` | Absent from live application | No live outreach reporting workflow |
| `SP-FEATURES-20261012:A-01` | Partial: live event creation and list; API detail; new records are `ACTIVE` | No edit route or approved publication lifecycle; authorization policy unresolved |
| `SP-FEATURES-20261012:A-02` | Partial: two quota integers on each event | No multiple timeslots, total-capacity model, pool assignment, or booking consumption |
| `SP-FEATURES-20261012:A-03` | Absent from live application | Waiting-list order, promotion, transactions and notification policy unresolved |
| `SP-FEATURES-20261012:A-04` | Absent from live application | No live referral attribution or conversion dashboard |
| `SP-FEATURES-20261012:A-05` | Absent from live application | Predictor need, inputs and approval unresolved |
| `SP-FEATURES-20261012:F-01` | Absent from live application | Offline/PWA storage, synchronization and conflict policy unresolved |
| `SP-FEATURES-20261012:F-02` | Absent from live application | No effective booking/check-in capacity calculation; policy unresolved |
| `SP-FEATURES-20261012:F-03` | Absent from live application | No no-show release workflow; grace period is not approved |
| `SP-FEATURES-20261012:M-01` | Absent from live application | No two-way SMS/RSVP workflow; timing/provider/consent unresolved |
| `SP-FEATURES-20261012:M-02` | Absent from live application | No live notification delivery/retry workflow; channel and policy unresolved |

The source audit found **6 partial feature mappings and 12 absent live features**. This is not a completion rate: feature sizes differ, several decisions remain unapproved, and none receives full-feature acceptance from this audit.

## Supporting source boundaries

- [Participant schema](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/participants/schemas.py) and [model](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/participants/models.py): profile data has no event booking foreign key.
- [Participant service](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/participants/service.py): role attribution and exact duplicate checks do not implement booking, eligibility or quota consumption.
- [Event model](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/events/models.py) and [service](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/events/service.py): quotas are event attributes and creation immediately sets `ACTIVE`.
- [Live event rendering](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/live/events.mjs): cards do not implement booking or a detail screen.

Keep runtime test outcomes, source-observed scope, PM decisions, and human acceptance separate when updating this mapping.
