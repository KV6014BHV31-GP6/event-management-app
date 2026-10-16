# Frontend responsibilities and handoff

**Owner for this workstream:** Benjamin. **Status:** working-baseline. Main retains a README-only source shell. Pinned dev `a47ff7d92f296ebd0604a1df98daf0b8111829b3` contains public Events, Login and Create Event using the existing vanilla HTML/CSS/ES-module approach; historical mocks are separate. See [main frontend boundary](../../../frontend/README.md), [FE-LIVE task](../tasks/FE-LIVE-20261014.md), [Create Event task](../tasks/FE-CREATE-EVENT-20261014.md) and [CURRENT](../CURRENT.md).

## Scope

- Mobile-first participant guest registration, status/receipt and cancellation UI; coordinator, leader and field staff workflows.
- Accessibility, loading/empty/full/error states, keyboard and mobile layout, including explicit unknown-outcome and offline pending/conflict feedback.
- Typed or validated API client and adapter against an actual agreed contract. Screen state must not manufacture a confirmed booking.
- Mock fixtures, UI/component tests, and documented evidence separated from live API acceptance.

## Broader implementation roadmap beyond the three-page dev slice

1. Recheck the actual dev source/full SHA, package files, runtime, build/test steps and approved next design scope. The complete historical v1.2.1 engineering ZIP remains unavailable; a frozen HTML capture does not establish it.
2. Map screens to [US01–US10](../REQUIREMENTS.md) and version-qualified feature IDs from the [crosswalk](../FEATURE_ID_CROSSWALK.md).
3. Confirm [request/response/auth/error handling](../../api/HANDOFF_CHECKLIST.md) with the backend owner; do not invent endpoints.
4. Build the smallest guest booking → server-confirmed receipt → cancellation slice and run tests at supported viewports.
5. Supply frontend SHA, tests, UI evidence and remaining risks to [E2E](../../../tests/e2e/README.md).

## Boundaries

Guest flow remains account-free unless approved otherwise. Role switching in a demo is not authentication. Do not commit phone/NRIC/health records, issue confirmations from stale quota displays, or claim full offline persistence from an in-memory mock.
