# Developer requirement working baseline

**Status: working-baseline; whole-team sign-off pending.** This baseline compares `SP-OVERVIEW-20261012`, `SP-US-20261012` and `SP-FEATURES-20261012`. Sources are recorded in [SOURCE_REGISTER](SOURCE_REGISTER.json). Read feature IDs with the [version crosswalk](FEATURE_ID_CROSSWALK.md). This is a summary; it does not rewrite the original course brief.

## Problem and scope

The supplied ROSE problem description concerns community events with limited staff and resources, overattendance or underattendance, outreach without traceable results, and participants with limited connectivity or devices. The Developer goal connects outreach, account-free registration, capacity decisions, attendance and operational review. It is not a general ticket marketplace.

## Ten User Stories

All stories below belong to `SP-US-20261012`. The baseline observations describe preserved mocks/documents, not acceptance of complete stories. See [CURRENT](CURRENT.md) for later branch-qualified implementation evidence.

| US | Intended outcome | Preserved baseline / gap | Evidence required for completion |
|---|---|---|---|
| US01 | Create/publish events, time slots, quotas and waiting lists | Mock has a single session/quota; multiple time slots and server behavior unverified | DB transaction prevents last-place races; cancellation promotes correctly |
| US02 | Unique referral link/QR per leader | Fixed DEMO-LEADER; no real attribution | Unique source linked to registration; forged sources do not grant permission |
| US03 | Registration, attendance and outreach dashboard | Synthetic single-device statistics, not live analytics | Numbers trace to DB; self-reported flyer distribution separated from conversion |
| US04 | WhatsApp copy and referral flyer | Fixed template and copy/print concept | Correct event data, valid unique QR/link and usability review |
| US05 | Report offline outreach activity | Mock self-report of printed flyers | Authorization, date/channel schema and server deduplication; offline here means activity away from the system |
| US06 | Fast proxy registration using leader reserved quota | One synthetic leader; no real staff login | Separate permissions for multiple leaders, quota transactions and next input only after success |
| US07 | Account-free mobile registration and duplicate prevention | DEMO identity selector/receipt, not formal name/phone verification | Minimum data, guest permissions, idempotency and server receipt |
| US08 | SMS reminders and simple cancellation | Mock cancellation; no actual SMS | Token expiry/replay handling, DB cancellation and provider delivery audit |
| US09 | QR/phone lookup and check-in with weak connectivity | Pending/retry/conflict mock; no real multidevice sync | Approved design tested for disconnect, restart, resend and conflict |
| US10 | Release expired/no-show places for walk-ins | Mock explicitly blocks unapproved release | PM defines grace/expiry; server calculates and allocates correctly |

## Engineering principles to retain

Only the server confirms a place. The sum of quota pools cannot exceed total capacity. Checked-in participants are a subset of confirmed participants and must not consume capacity twice. Retrying the same operation key has one side effect; reconcile an unknown timeout outcome using the original key. Cancellation cannot release capacity twice, and devices using stale caches cannot confirm independently.

Account-free guest access does not make personal data public. Staff/leaders need explicit authorization; a numeric ID alone cannot permit access to another person's record. The team must decide final fields, retention, multiple family members using one phone, and deduplication rules.

## Unresolved policy and scope

PM/Dev/Security must confirm fields/validation; waiting-list pool, order, offer versus auto-confirm and expiry; walk-in/no-show rules; offline queue and retention; reminder timezone and 24h versus 24–48h; language scope; and the formal frontend stack.

Medical eligibility decisions, screening history, prediction, external AI/OCR, two-way RSVP and automatic release are not enabled by this documentation work. Eighteen entries in the newer source do not mean all eighteen should be implemented.

The first broader booking integration target remains guest request → server quota decision → persisted receipt → cancellation → refreshed capacity. See the [acceptance plan](TEST_PLAN.md).
