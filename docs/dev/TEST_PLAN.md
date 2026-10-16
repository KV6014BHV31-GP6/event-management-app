# Minimal real API and DB acceptance plan

Status: PROPOSED. The broader booking tests below remain NOT_RUN. Python document checks cannot substitute for this matrix. Later index/Login/Create Event results in [CURRENT](CURRENT.md) do not clear these unimplemented booking cases.

Prerequisites: full frontend/backend SHAs, nonproduction setup, synthetic seed, reset method, agreed contract, roles and waiting-list/cancellation policies. If an endpoint is missing, obtain it from the backend owner rather than inventing one.

| Test | Source intent | Scenario | Acceptable result |
|---|---|---|---|
| BOOK-01 | SP-US-20261012:US07 | Guest request without account, then refresh | Server decides status; DB receipt agrees |
| RACE-01 | SP-US-20261012:US01 | Twenty valid distinct participants concurrently request the last place in one pool | At most one new confirmation; total does not exceed quota |
| RETRY-02 | SP-US-20261012:US07 | Resend same key/payload three times, then change payload using same key | One side effect for original operation; conflicting payload rejected |
| TIMEOUT-03 | SP-US-20261012:US07 | Response lost after DB commit | Retrieve outcome with original operation key; no second record |
| CANCEL-04 | SP-US-20261012:US08 | Cancel same booking twice concurrently | One release and at most one promotion under approved policy |
| STALE-05 | SP-US-20261012:US01 | Old UI shows places while event is full or cancelled | Server blocks extra confirmation; UI gives actual reason |
| OFFLINE-06 | SP-US-20261012:US09 | Offline check-in, restart, then resend twice after reconnect | Retain pending under approved storage policy; server deduplicates and exposes conflict |
| ACCESS-07 | SP-US-20261012:US06/US07 | Guest guesses another receipt ID; leader uses another pool | Unauthorized reads, writes and quota use rejected |
| ROSTER-08 | SP-US-20261012:US09 | Two devices check in one person; another uses expired roster | No duplicate attendance; expiry/conflict handling explicit |
| POLICY-09 | SP-US-20261012:US10 | Grace policy unapproved | Walk-in/no-show automation stays disabled |

For each run retain source namespace, operation ID, command, environment, both application SHAs, expected/observed behavior, time, result and reviewer. Use synthetic data and redact auth headers, tokens and personal information.
