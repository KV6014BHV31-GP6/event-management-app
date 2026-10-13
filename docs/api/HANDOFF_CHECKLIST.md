# Frontend ↔ Backend API handoff checklist

**Status: PARTIAL / LIVE-SLICE_SOURCE_INSPECTED.** The current index/login contract is recorded at the top of [INTEGRATION.md](INTEGRATION.md), with runtime evidence in [CURRENT](../dev/CURRENT.md). The broader intake remains open. The preserved historical **15 reported claims / 11 distinct method+path pairs** do not become implemented merely because the new slice works.

## Required for each operation

| Field | Required evidence |
|---|---|
| Source | Backend repository, branch and full SHA; file/line or generated OpenAPI source |
| Environment | Nonproduction base URL, install/start commands, DB seed/reset, runtime version |
| Identity | `eventId`, `public_id`, `registrationId`, time slot, quota pool mapping |
| Input/output | Real method/path, request body, response schema, HTTP status and content type |
| Security | Guest/staff/leader authorization, token or cookie lifetime, CORS/CSRF if relevant |
| Errors | Validation, full, waiting, unauthorized, duplicate, timeout, malformed response |
| Transactions | Last-place race, idempotency key reuse, cancellation, waitlist promotion, rollback |
| Proof | Sanitised actual HTTP response, persisted DB or readback evidence, exact test command |

## Broader guest-booking integration, deferred beyond FE-LIVE-20261014

1. Guest submits a request without creating an account.
2. Server decides confirmed/waiting/rejected within approved capacity and quota policy.
3. Refresh/restart returns a persistent receipt; access to someone else's receipt is denied.
4. Idempotent cancellation releases no more than one place and applies the approved waiting rule.
5. Repeat/race/offline failure cases follow [E2E matrix](../../tests/e2e/README.md).

If any schema/auth/error detail is unknown, label **BLOCKED** and request a concrete example. Do not generate endpoints, switch silently to Mock, or mark integration accepted from UI alone. Keep secrets and private identities out of issue/PR logs.
