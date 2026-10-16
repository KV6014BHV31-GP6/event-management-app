# Feature ID version crosswalk

**Status: OBSERVED source difference; the mappings are Developer comparison proposals pending team review.**

The older `SRC04` draft and v1.2.1 coverage use **17** features. The newly imported `SP-FEATURES-20261012` (`Features Review.docx`) lists **18**: P 4, L 4, A 5, F 3 and M 2. Later import does not establish approval or the original document's writing date.

## Admin ID changes

| Older SRC04 | Newer SP-FEATURES-20261012 | Comparison |
|---|---|---|
| No separate A-ID with this name | A-01 Event Creation & Publication | New table lists creation/publication separately; older US01 already concerns event setup, so this is not automatically a newly approved requirement |
| A-01 Timeslot / quota allocation | A-02 Dynamic Timeslot & Quota Allocation | Closest intent mapping; details still need checking |
| A-02 Waitlist refill | A-03 Automated Waiting List Auto-Fill | Confirm auto-confirm versus offer, pool and SMS policy |
| A-03 Referral analytics | A-04 Full-Channel Referral Analytics Dashboard | Attribution/conversion; an aggregate dashboard is insufficient |
| A-04 Attendance prediction | A-05 Attendance Predictor & Risk Alerts | New table still asks whether it is needed; implementation unapproved |

The ID sets P-01–P-04, L-01–L-04, F-01–F-03 and M-01–M-02 are unchanged, but wording, necessity and acceptance criteria still require version-specific comparison. The same ID does not automatically establish identical requirements.

## Index of the newer eighteen features

| ID within SP-FEATURES-20261012 | Original table name | Unresolved boundary retained |
|---|---|---|
| P-01 | Zero-Barrier Registration | Name/IC/Phone have question marks; do not turn them into approved mandatory fields |
| P-02 | Eligibility & Anti-Duplicate Filter | Source asks whether needed; do not independently collect screening history or determine medical eligibility |
| P-03 | Multi-Language Support | Source asks whether needed; no claim of three delivered languages |
| P-04 | Self-Service Booking via SMS | Source asks whether needed; token, rescheduling, permissions and expiry undecided |
| L-01 | Leader Account & Reserved Quota | Authentication and quotas for multiple leaders unverified |
| L-02 | Fast-Track Proxy Registration | Clear input only after server acceptance; fields undecided |
| L-03 | AI Smart Outreach Generator | Technical column offers template/Canvas options; title does not require external AI |
| L-04 | Lightweight WhatsApp Outreach Reporting | Simple form or WhatsApp API are options; flyers distributed do not equal people reached |
| A-01 | Event Creation & Publication | Status, timezone and edit permissions require a contract |
| A-02 | Dynamic Timeslot & Quota Allocation | Sum of pools cannot exceed capacity |
| A-03 | Automated Waiting List Auto-Fill | SMS, ordering, promotion method and transaction unverified |
| A-04 | Full-Channel Referral Analytics Dashboard | Unique referrals, clicks and registration conversion undelivered |
| A-05 | Attendance Predictor & Risk Alerts | Source asks whether needed; RSVP/model unapproved |
| F-01 | Offline-First Check-In (PWA) | Newly added/not yet discussed; weak-network intent in US09 does not select PWA implementation |
| F-02 | Live Walk-In Capacity Calculator | Do not deduct booked/checked-in twice; valid reservation set and policy undecided |
| F-03 | Automated No-Show Slot Release | Newly added/not yet discussed; 20–30 minutes is not an approved rule |
| M-01 | Two-Way SMS Reminder & RSVP | Confirm 24–48h versus handoff's 24h; two-way RSVP undiscussed |
| M-02 | Instant System Notifications | Channel, provider, retry, consent and delivery proof undecided |

## Usage

New task references use full IDs such as `SP-FEATURES-20261012:A-02`; User Stories use `SP-US-20261012:US01`. Preserve `SRC04:A-01` in older test/document references and record successors separately. Never change historical evidence IDs globally.

The two retained Developer Word documents describe US01–US10. Their older v1.2.1 coverage count of seventeen is historical. Do not calculate completion of the new table using old coverage.
