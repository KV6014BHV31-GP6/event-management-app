# Frontend responsibilities and handoff

**Owner for this workstream:** Benjamin. **Status:** working-baseline for responsibilities; real application source NOT_IMPORTED. See [frontend workspace](../../../frontend/README.md) and [CURRENT](../CURRENT.md).

## Scope

- Mobile-first participant guest registration, status/receipt and cancellation UI; coordinator, leader and field staff workflows.
- Accessibility, loading/empty/full/error states, keyboard and mobile layout, including explicit unknown-outcome and offline pending/conflict feedback.
- Typed or validated API client and adapter against an actual agreed contract. Screen state must not manufacture a confirmed booking.
- Mock fixtures, UI/component tests, and documented evidence separated from live API acceptance.

## Before implementation

1. Obtain complete frontend source, full SHA, package manager, lockfile, build/test steps and approved design scope; do not infer source from a frozen HTML capture.
2. Map screens to [US01–US10](../REQUIREMENTS.md) and version-qualified feature IDs from the [crosswalk](../FEATURE_ID_CROSSWALK.md).
3. Confirm [request/response/auth/error handling](../../api/HANDOFF_CHECKLIST.md) with the backend owner; do not invent endpoints.
4. Build the smallest guest booking → server-confirmed receipt → cancellation slice and run tests at supported viewports.
5. Supply frontend SHA, tests, UI evidence and remaining risks to [E2E](../../../tests/e2e/README.md).

## Boundaries

Guest flow remains account-free unless approved otherwise. Role switching in a demo is not authentication. Do not commit phone/NRIC/health records, issue confirmations from stale quota displays, or claim full offline persistence from an in-memory mock.
