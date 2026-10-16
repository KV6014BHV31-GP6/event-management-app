# Backend responsibilities and handoff

**Reported contributor:** Austin. **Ownership status:** PENDING_CONFIRMATION. Main has no runnable backend source. The pinned dev implementation derives from Austin's verified source commit `79804aa67508de23d3f3c613e65cf375e9ded2a3`; source/runtime evidence is branch-qualified in [CURRENT](../CURRENT.md). That evidence does not reassign ownership. See [backend workspace](../../../backend/README.md), [ownership](../OWNERSHIP.md), and [API record](../../api/INTEGRATION.md).

## Required backend handoff beyond the inspected dev slice

1. Repository URL, branch/full commit SHA, stack/runtime versions, lockfiles, startup commands and environment variable *names*.
2. Database migrations, synthetic seed/reset instructions and observed persistent response after restart.
3. Auth/session/roles and guest-safe capability design, per-operation permissions and error responses.
4. Event/timeslot/quota model, unique IDs, atomic last-place booking, idempotent retries, waiting and cancellation policies.
5. Restricted check-in/roster and offline reconciliation protocol if approved; reminder/SMS only if separately in scope.
6. Reproducible tests and nonproduction HTTP examples, with token/PII removed.

Use [API handoff checklist](../../api/HANDOFF_CHECKLIST.md) for receipt and [E2E tests](../../../tests/e2e/README.md) for acceptance. Broader claims remain REPORTED until code and observed responses match. Current source-inspected operations and historical/fresh runtime results are separately recorded in CURRENT and the API record.

No speculative framework, routes or database design becomes approved because this folder exists. Backend transfer to Benjamin requires explicit scope/ownership decision and a separate code PR.
