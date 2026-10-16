# Pinned dev bug and contract proposals

Date: 2026-10-16 (UTC+8). Status: `PROPOSED`; no application or test-source fix is included in this documentation PR.

Target: `dev` at `a47ff7d92f296ebd0604a1df98daf0b8111829b3`, tested from an unchanged archive using Python 3.14.8 and native PostgreSQL 17.11. Reproductions use isolated synthetic databases. The initial boundary failures were observed directly and through the frontend proxy; the later participant concurrency reproduction was a separate direct API test. See the [scope audit](DEV_SCOPE_AUDIT.md) for implemented versus absent functionality and the [execution receipt](evidence/DEV-BASELINE-VERIFY-20261016/README.md) for counts and limits.

## Reproduced defects

| ID | Trigger and observed outcome | Expected boundary | Proposed smallest change for a separate code PR |
|---|---|---|---|
| `DEV-BUG-001` | Authenticated `POST /api/v1/events` with either quota set to `2147483648` returns HTTP 500; both fields reproduced through both transports | Reject values outside the actual database integer range with a validation response; proposed HTTP 422 | Add the PostgreSQL signed-int32 upper bound to both request quota fields, preserving the current nonnegative lower bound and schema/route names |
| `DEV-BUG-002` | `POST /api/v1/users` with a unique synthetic username and a 73-byte ASCII password returns 500; a 25-character, 75-byte UTF-8 password also returns 500. Supplemental JSON login and OAuth-form token login with an over-limit password return 500 rather than the expected controlled authentication rejection | Invalid password input must not become an unhandled server error; proposed signup HTTP 422 | Validate the encoded byte limit supported by the existing bcrypt implementation; preserve password hashes and validate login exception behavior before changing that contract |
| `DEV-BUG-003` | Authenticated event creation with `start_time="2027-01-10T09:00:00+08:00"` and `end_time="2027-01-10T10:00:00"` returns 500 | Reject incompatible timezone awareness before ordering timestamps; proposed HTTP 422 | Check compatible timezone awareness before comparing values and raise a validation error. Do not silently assign a timezone or change the agreed time policy |
| `DEV-BUG-004` | On native Windows, `python -B -m unittest discover -s tests -v` reports 22 passed / 1 failed: `test_utf16_requirements_remain_scanned` compares decoded CRLF with expected LF | The UTF-16 scanning test should verify its intended contract consistently across platforms | Give the test fixture explicit newline bytes, or explicitly compare the intended text semantics. Preserve UTF-16/BOM scanning and test a representative CRLF fixture separately if required |
| `DEV-BUG-005` | Four concurrent anonymous participant creates using the same synthetic phone return `[201, 500, 500, 500]`; database count is one | Keep the uniqueness guarantee and return the existing controlled duplicate response to losing requests instead of an unhandled error | Catch the relevant uniqueness failure at commit, roll back the failed session and return the documented duplicate response without masking unrelated database failures |

The proposed HTTP 422 outcomes above express the intended validation boundary for review; the measured facts are the HTTP 500 responses. No corrected run is claimed.

### Reproduction details and source

For `DEV-BUG-001` and `DEV-BUG-003`, use an authenticated synthetic organizer and an otherwise valid event: nonempty title/location, start before end, and small nonnegative quotas. Change only the field identified in the table. No credential or authorization header is included in this document.

- [Event request validation](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/events/schemas.py) has nonnegative quota constraints but no database-width maximum, and compares timestamps without an awareness check.
- [Event database model](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/events/models.py) stores quotas as SQL Integer. The [frontend validation](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/live/create-event.mjs) already bounds quotas; direct API clients can bypass the UI boundary.
- [User request schema](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/users/schemas.py) and [password hashing](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/core/security.py) expose a character/encoded-byte boundary mismatch. Test with generated data in memory; do not record real or reusable passwords.
- [UTF-16 regression fixture](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/tests/test_document_control.py) writes a fixture using platform newline translation, then expects LF from [the scanner](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/scripts/check_dev_control.py). This failure is separate from the pinned snapshot's passing document-control integrity check.

### Regression gates for future code PRs

1. Quotas: test 0, the current supported maximum, maximum plus one, and negative values, individually for both fields. Verify rejected requests do not create records and valid records still survive native database readback.
2. Passwords: exercise the byte boundary with ASCII and multi-byte input, normal signup/login, existing hashes, and both JSON and OAuth-form login paths. Never truncate passwords silently or expose them in evidence.
3. Timestamps: test both offset-aware values, both naive values under the agreed policy, mixed awareness, reversed/equal ranges, and offset conversions. Preserve current frontend payload names and working date behavior.
4. Document scanning: run the UTF-16/BOM and selected sensitive-pattern tests on Windows and a second platform with explicit LF/CRLF fixtures. Do not replace the original requirements file to satisfy a test.
5. Participant duplicates: run concurrent requests for the same synthetic phone and for the same linked user; expect one record and controlled loser responses, then verify the session/database remains usable. Check independent keys still succeed. Keep signup behavior separately tested.
6. Re-run the unchanged native baseline reproductions against the proposed fix branch, with before/after SHAs and observed results. Submit for review; no automatic merge or deployment.

## Contract and policy findings requiring decisions

- **Empty event fields:** both direct and proxy creation accepted empty title/location with HTTP 201, whereas the live form requires nonempty values. Agree the API contract and existing-record handling before adding stricter validation. This is a measured frontend/backend difference; it is not silently counted as an approved product requirement.
- **Caller-selected signup roles:** public signup accepts a role value, and event creation checks authentication without a role-specific permission gate. These are already documented production authorization limitations. Obtain the permitted role/ownership rules before changing behavior; local successful requests do not approve production permissions.
- **Missing UI connections:** signup, participant creation, OAuth-form token login, and event-detail operations have no dedicated live frontend flow. This is implementation scope, not a transport failure.
- **Feature policy:** booking, eligibility, reserved quotas, waiting-list promotion, offline check-in, no-show release, and notifications remain unimplemented or undecided as described in the [18-feature source audit](DEV_SCOPE_AUDIT.md).

## Concurrency follow-up boundary

The [participant service](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/participants/service.py) precheck/commit race is reproduced in `DEV-BUG-005`; the database still prevents duplicate storage. A separate four-request [user signup](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/src/users/service.py) trial returned `[201, 400, 400, 400]` and one record. That single successful trial does not establish comprehensive concurrency safety, and no signup race defect is claimed from it.

## Environment-only correction

The first external native attempt encountered a Windows `pg_ctl` output-pipe wait before database/API/frontend testing. The harness was corrected outside the repository to capture command output in files, and a fresh attempt used a distinct isolated database identifier. The failed attempt receipt is retained. This does not constitute an application code fix or a successful first attempt.
