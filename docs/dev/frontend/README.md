# Frontend responsibilities and handoff

**Owner for this workstream:** Benjamin. **Status:** working-baseline; the current task implements a live event index and Login in `frontend/live/` using the existing vanilla HTML/CSS/ES-module approach. The historical mocks remain frozen. See [frontend workspace](../../../frontend/README.md), [current task](../tasks/FE-LIVE-20261014.md) and [CURRENT](../CURRENT.md).

## Recorded live feature demo, 2026-10-20

The user authorized publishing the two completed demo deliverables on the existing PR #29 branch. This documentation/media follow-up does not change product code or mark local Astra acceptance.

| Deliverable | Repository link | SHA256 |
| --- | --- | --- |
| Genuine browser recording: 6m22.28s, 1920x1080, H.264, 25fps, Traditional Chinese captions, no audio | [NU_LIVE_FEATURE_DEMO.mp4](demo/20261020-111833/NU_LIVE_FEATURE_DEMO.mp4) | `5060ccbf2c40c3001807966d1fa13975fb83a6816b83b7fc9aa84d6e734c3489` |
| Original recording report, chapter timecodes, actual outcomes, synthetic references and limitations | [DEMO.md](demo/20261020-111833/DEMO.md) | `e657237b9b202489112e8a118b7369091321cc1772e8447b2ea6307cf95ab8b7` |

Recorded frontend: `dev_fe_create_event_role_guard@7fad81c227d1817c8cdc9e465e1e5dcaa4afaf25`, including PR #27/#28/#29. Actual backend: separate `dev_be_registrations@d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`. A later docs-only commit on this branch does not change those recorded versions.

The real UI journey covers anonymous browse/search/no-results/clear/pagination/detail, organizer Login/Create Event/reload, ordinary Signup/manual Login with the selected event retained, frontend role denial, two pending registrations, duplicate account/application errors, incorrect-password feedback, Logout and a 390px responsive illustration. Actual writes: one ordinary account, one event and two successful applications; all through the UI. Create/Signup/registration returned 201; duplicate submissions returned 400 and one incorrect Login returned 401. The complete MP4 was decoded and played at 1x to ended, with required result frames visually checked.

Three inherited Signup defects remain: native GET fallback before JavaScript initialization, blank-username inconsistency and missing strict string validation for the returned id. Backend organizer enforcement and public Signup privileged-role restrictions also remain unresolved. The video demonstrates frontend restrictions only. Pending does not confirm a place; own-registration GET/reload readback is absent. Complete native E2E, Security and UAT remain NOT_RUN; this is author demonstration, not local Astra acceptance or Merge approval.

Both deliverables retain their original bytes. Workstation paths, external `work/` evidence references and the no-publication statement inside the dated report describe the completed recording run; this separately authorized follow-up publishes the report and MP4 here. Raw recordings, private credentials, runtime logs and ChatGPT upload troubleshooting are excluded. [Publication record](../tasks/FE-CREATE-EVENT-ROLE-GUARD-20261020.md#demo-publication-follow-up-2026-10-20).

## Scope

- Mobile-first participant guest registration, status/receipt and cancellation UI; coordinator, leader and field staff workflows.
- Accessibility, loading/empty/full/error states, keyboard and mobile layout, including explicit unknown-outcome and offline pending/conflict feedback.
- Typed or validated API client and adapter against an actual agreed contract. Screen state must not manufacture a confirmed booking.
- Mock fixtures, UI/component tests, and documented evidence separated from live API acceptance.

## Broader implementation roadmap after the current two-page slice

1. Obtain complete frontend source, full SHA, package manager, lockfile, build/test steps and approved design scope; do not infer source from a frozen HTML capture.
2. Map screens to [US01–US10](../REQUIREMENTS.md) and version-qualified feature IDs from the [crosswalk](../FEATURE_ID_CROSSWALK.md).
3. Confirm [request/response/auth/error handling](../../api/HANDOFF_CHECKLIST.md) with the backend owner; do not invent endpoints.
4. Build the smallest guest booking → server-confirmed receipt → cancellation slice and run tests at supported viewports.
5. Supply frontend SHA, tests, UI evidence and remaining risks to [E2E](../../../tests/e2e/README.md).

## Boundaries

Guest flow remains account-free unless approved otherwise. Role switching in a demo is not authentication. Do not commit phone/NRIC/health records, issue confirmations from stale quota displays, or claim full offline persistence from an in-memory mock.
