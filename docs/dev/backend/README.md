# Backend responsibilities and handoff

**Reported contributor:** Austin. **Ownership status:** PENDING_CONFIRMATION. No source or runtime has been verified or reassigned. See [backend workspace](../../../backend/README.md), [ownership](../OWNERSHIP.md), and [API record](../../api/INTEGRATION.md).

## Expected technical handoff (not evidence of implementation)

1. Repository URL, branch/full commit SHA, stack/runtime versions, lockfiles, startup commands and environment variable *names*.
2. Database migrations, synthetic seed/reset instructions and observed persistent response after restart.
3. Auth/session/roles and guest-safe capability design, per-operation permissions and error responses.
4. Event/timeslot/quota model, unique IDs, atomic last-place booking, idempotent retries, waiting and cancellation policies.
5. Restricted check-in/roster and offline reconciliation protocol if approved; reminder/SMS only if separately in scope.
6. Reproducible tests and nonproduction HTTP examples, with token/PII removed.

Use [API handoff checklist](../../api/HANDOFF_CHECKLIST.md) for receipt and [E2E tests](../../../tests/e2e/README.md) for acceptance. Claims are REPORTED until code and observed responses match.

No speculative framework, routes or database design becomes approved because this folder exists. Backend transfer to Benjamin requires explicit scope/ownership decision and a separate code PR.
