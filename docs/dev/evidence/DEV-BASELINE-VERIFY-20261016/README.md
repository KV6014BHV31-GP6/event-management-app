# Native dev verification receipt, 2026-10-16

Status: **execution complete with reproduced defects; not an all-pass acceptance**. The user explicitly assigned GPT-6.1 Sol to test the current dev implementation without changing its source. See the [active task](../../tasks/DEV-BASELINE-VERIFY-20261016.md), [scope audit](../../DEV_SCOPE_AUDIT.md), and [bug proposals](../../BUG_PROPOSALS.md).

## Exact baseline and environment

| Field | Observed value |
|---|---|
| Repository | `KV6014BHV31-GP6/event-management-app` |
| Tested remote dev | `a47ff7d92f296ebd0604a1df98daf0b8111829b3` |
| Original local checkout | Local `dev` remained at `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1`, clean and fourteen commits behind the tested snapshot |
| Documentation base | `main` at `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1`; no dev code import |
| Host | Native Windows; user local environment, not the earlier GitHub-hosted runner or PGlite |
| Runtime | Python 3.14.8, original 73 dependency pins; native PostgreSQL 17.11 server; Node 24.14.0; Chrome 155.0.8059.79 with sandbox enabled |
| Isolation | Unchanged Git archive of the dev commit; external harnesses, test output and temporary files; new synthetic test databases and roles |
| Local listeners during tests | Backend loopback 8016, frontend loopback 5186, known dedicated PostgreSQL instance on loopback 5432 |
| Execution ownership | GPT-6.1 Sol native acceptance agent; separate documentation writer and independent source-scope reviewer |

The original checkout was not pulled, switched, reset, cleaned, or edited. Source snapshots and original Git-tracked file bytes were compared before/after and remained unchanged. Ignored credential files were not accessed by the acceptance harness; no before/after byte-manifest claim is made for those ignored files.

## Fresh results

| Check | Result | Limit |
|---|---|---|
| Runtime pins and `pip check` | PASS; 73/73 pins match | Dependency consistency only |
| Pinned dev `python -B scripts/check_dev_control.py` | PASS | Integrity/metadata/link checks, not product acceptance |
| Pinned dev `python -B -m unittest discover -s tests -v` | **22/23 PASS; one FAIL** | Windows UTF-16 fixture CRLF/LF mismatch; retained as `DEV-BUG-004` |
| Live/proxy Node tests | **47/47 PASS** | Unit/component tests; not all native integration scenarios |
| Backend SQLite pytest | **2/2 PASS** | Explicitly SQLite; native PostgreSQL proof comes from the HTTP/browser runs below |
| Historical mock suite | 41/41 PASS | Mock behavior only; no promotion to live acceptance |
| Native bootstrap | First and repeat runs exit 0 | Isolated synthetic database; no original development-data reset |
| Business operation execution coverage | **8/8 direct and 8/8 proxy**, plus direct health | Coverage means exercised, not every scenario passed or every endpoint has a UI |
| Primary HTTP scenario assertions | **144 PASS / 12 FAIL, out of 156** | Ten HTTP 500 boundary failures across three runtime defect families; two empty-field contract mismatches |
| Primary real-browser checks | **18/18 PASS** | Three live screens, event pagination, login/session/reload, validation, one form submission, logout, invalid token, desktop/mobile |
| Supplemental real-browser checks | **7/7 PASS** | Actual backend stopped -> proxy 502 -> visible error -> restarted -> retry; real empty dataset; authenticated mobile layouts and literal HTML-like text rendering |
| Total real-browser checks | **25/25 PASS** | Real local frontend/backend, no interception or source patch to produce PASS; not a full cross-browser/security suite |
| UI-created event readback | PASS | Same public ID through API/proxy/database |
| Restart persistence | **3/3 records retained** | PostgreSQL stopped/started via `pg_ctl`; owned API process terminated and restarted, not graceful application shutdown |
| Source preservation and cleanup | PASS for the recorded scope | Original tracked files and every snapshot file unchanged; test databases/roles removed, test-owned processes stopped, ports 8016/5186/5432 closed at completion |

The eight operations are listed in [DEV_SCOPE_AUDIT](../../DEV_SCOPE_AUDIT.md). Four are connected to the three live frontend screens; the other four are available as APIs without dedicated live UI flows. Neither operation coverage nor browser-check counts measure the eighteen-feature draft's completion.

## Supplemental HTTP and concurrency observations

The supplemental run is separate from the primary 156 assertions. It issued sixteen sequential probes: the raw harness recorded twelve PASS and four mismatches. A reverse mixed-timezone request returned 500, confirming `DEV-BUG-003`; over-limit password bytes also produced 500 in both JSON login and OAuth-form token login, extending `DEV-BUG-002`. The fourth mismatch expected rejection of two naive timestamps, but the current schema accepts them and returned 201. That last expectation is a policy assumption, so it is reported as an observed unresolved timezone-policy case, not another runtime defect.

Two additional four-request concurrency trials used distinct isolated synthetic keys:

- Participant creation: `[201, 500, 500, 500]`; database count one. Storage uniqueness held, but losing requests produced unhandled errors. This confirms `DEV-BUG-005`.
- User signup: `[201, 400, 400, 400]`; database count one. No signup race defect was reproduced in this single trial; comprehensive concurrency safety is not claimed.

There are **four reproduced runtime defect families plus one Windows test-portability defect**, detailed in [BUG_PROPOSALS](../../BUG_PROPOSALS.md). Empty event fields, role selection, organizer permissions and timezone policy remain distinct contract/approval decisions. No source repair is included in this PR.

## Exploratory response measurements

Ten sequential warm local `GET /api/v1/events?page=1&pageSize=6` samples were collected for each transport in the primary run.

| Transport | Samples | Median | Observed p95 |
|---|---|---|---|
| Direct backend | 10 | 14.62 ms | 16.96 ms |
| Frontend proxy | 10 | 16.89 ms | 18.85 ms |

These small samples describe this machine/run only. They are not load testing, statistically stable tail estimates, an SLA, or production performance acceptance.

## Commands, evidence and replay

Existing tests were run unchanged from the pinned snapshot, with bytecode disabled and external temporary/cache locations:

```text
python -B scripts/check_dev_control.py
python -B -m unittest discover -s tests -v
node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs
python -B -m pytest -p no:cacheprovider
python -B -m scripts.dev_bootstrap --acknowledge-development
python -B tests/e2e/live_api_smoke.py --allow-synthetic-writes
```

Use `backend` as cwd for pytest/bootstrap, and snapshot root for repository/Node/smoke checks. Python denotes the pre-existing project's explicit Python 3.14 virtualenv executable. Exact argv/cwd/exit records are in the retained local results; shell wildcard behavior differs by platform, so use the recorded invocation when replaying.

Local evidence root: `E:\NU_Local_Environment_20261014\dev-verification\20261016-a47ff7d`.

- `acceptance/ACCEPTANCE_PLAN.md` and `acceptance/RUN_USAGE.md`: bounded plan and safe external replay instructions.
- `acceptance/native_acceptance.py`, `browser_acceptance.mjs`, `supplemental_acceptance.py`, `browser_supplement.mjs`: external harnesses; no application monkeypatching.
- `evidence/acceptance-native/`: unchanged unit checks and the initial environment-harness failure receipt.
- `evidence/acceptance-native2/`: primary HTTP/native/browser results, screenshots, source manifests and restart records.
- `evidence/acceptance-supplement1/`: actual outage/empty-state/mobile checks and concurrency results.

Raw JSON, screenshots, harnesses, runtime files and credentials are deliberately outside this Markdown/register-only PR. This receipt is a sanitized summary of locally retained execution evidence, not a claim that reviewers can retrieve those artifacts from this PR. Follow the local usage instructions with a fresh run label; do not rerun against the original database or overwrite prior evidence.

## Failed attempts and residual limits

The first native attempt hit a Windows inherited-output-pipe wait during PostgreSQL startup. Its receipt was retained; only the external harness was changed to file-based output capture, and the next attempt used a fresh test database. It was not counted as a successful first run.

Owned backend/frontend processes were stopped with process termination (recorded exit 1), not a verified graceful application shutdown. The database used its normal `pg_ctl` stop/start. Persistence results therefore prove the recorded restart/readback scenario, not clean API shutdown handling. No other process was stopped.

Full eighteen-feature acceptance, approved production authorization, SMS/provider integration, booking/cancellation/waiting-list transactions, offline workflows, exhaustive races, browser diversity, accessibility, sustained load, Security review and team UAT remain unexecuted or unapproved. Historical PGlite/mock/runner evidence was not used to fill those gaps.

## Retained raw evidence fingerprints

These SHA256 values identify the local artifacts described above; they do not imply that raw artifacts are included in the PR. Reporting corrections were made in derived summaries, preserving these raw results.

| Local artifact under the evidence root | SHA256 |
|---|---|
| `evidence/acceptance-native2/results.json` | `92215364e5e8ea508c0b7d07a99f8064affb62d6b1680c8971291fe43d86b9c4` |
| `evidence/acceptance-supplement1/results.json` | `403ee7f42aec8271aaf0b737cfb07e41edbb45bf069859260e77eadb9d971c21` |
| `evidence/acceptance-native2/browser-result.json` | `a86f880c77a6ac41875e87d3117a68679458d630e58644d93d2273f1f5e463fc` |
| `evidence/acceptance-supplement1/browser-result.json` | `e615564628e1c5f36a8a6f1fc9c21ee6e94ecfedea1194a3e95a667d6ce02cd3` |
