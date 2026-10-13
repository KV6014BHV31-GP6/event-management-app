# Developer responsibility matrix

**Status:** WORKING_BASELINE / TEAM_REVIEW_PENDING. This is a work allocation and review proposal for the Developer area, not evidence that the PM or Austin approved a change of responsibility.

| Scope | Working primary | Required handoff / reviewer | Evidence and authority |
|---|---|---|---|
| Frontend UI, UX integration, client-side state | Benjamin | UI/UX and PM review relevant screens | Verified source SHA, UI tests, story mapping |
| Frontend API adapter and contract consumer | Benjamin | Backend contributor | Endpoint fixture, error mapping, integration test |
| Backend app, DB transactions, auth and persistence | Austin (reported; pending confirmation) | Benjamin for contract review; Security for auth | Actual backend SHA, setup, schema, API/DB tests |
| API contract/version and G3 integration | Explicit single writer agreed per change | Benjamin + backend contributor | Signed-off request/response/auth/error examples; no guessed paths |
| E2E acceptance against real service | Named Dev test owner per task | PM/QA/Security for relevant cases | Both SHAs, synthetic environment, commands, PASS/FAIL/BLOCKED |
| Product scope, fields, waitlist, walk-in, no-show | PM/team decision required | Dev/Security/Designer | Recorded decision before enabling rules |

## Change rules

- One primary editor per file/task, shared review on contracts; no silent overwrite or unapproved backend takeover.
- Feature IDs carry source namespace. Historic 17-item SRC04 and imported 18-item SP-FEATURES-20261012 are not interchangeable.
- Place executable source under `frontend/` or `backend/` only after verifying authentic inputs and existing stack. Keep the frozen demo under `docs/dev/evidence/` and `integration/` untouched.
- `docs/dev/CURRENT.md` is the sole current functional status. Task records show historical execution, not competing current sources.
- A production-ready assertion requires real E2E/DB evidence, not screenshots or document-control test counts.
