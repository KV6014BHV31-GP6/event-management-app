# Demo journey CI and artifact verification

Task `DEMO-FULL-JOURNEY-20261103`. This workflow is a new, read-only-token successor for this Demo. The historical PR4 workflow is unchanged. Workflow presence and local checks are not a CI PASS, independent acceptance, merge approval or local deployment.

## Immutable inputs and job order

`.github/workflows/demo-journey.yml` runs for PRs targeting `dev_demo_ben`, pushes to `integration/ben-demo-release-*`, pushes to `dev_demo_ben`, and manual dispatch on those authorized branches. Every checkout explicitly uses the trigger's full `github.sha`, with persisted credentials disabled. For a PR, that SHA is GitHub's candidate merge commit; it is not silently replaced by the PR head. A changed candidate/base requires new evidence. The merged target push gets its own run.

1. `source`: document register/link/privacy checks, document-control regression tests, pinned-action checks, contract/migration identities and all 40 amended AC IDs. This job runs before any product dependency installation. Runtime setup failure records `CI_BLOCKED` where the checkout is available. It never refreshes the register to hide a mismatch.

The source inventory discards only the empty terminator emitted by `git ls-files -z`; every actual path still passes the same privacy and path checks. Initial candidate failures from Windows fixture newline translation and the empty inventory terminator are retained in the external run. Their repairs do not count as a successful candidate CI run.
2. `frontend`: `npm ci` against the existing lock, React tests, all legacy live/mock/proxy tests, and a production build with `VITE_DEMO_BUILD_SHA` set to the verified full source SHA. Test totals and skips are read from actual JUnit/TAP. Zero tests, failures, errors or skips fail the gate. The exact build file hashes are retained.
3. `native_browser`: existing exact Backend pins and `pip check`; controlled ASGI/SQLite suite; a newly initialized private PostgreSQL cluster; explicit first/repeat additive migrations; all native suites with zero skips. The tracked `scripts/demo_browser_e2e.cjs` then exercises actual production React signup/login/reload/browse, authenticated private PNG preview/download, and simulated Offline through the product proxy and real FastAPI. Its fourth fresh database is separate from native-suite leftovers. Read-only PostgreSQL reconciliation binds the exact fixture, batch, submissions and private document. Each layer has its own report. This bounded CI E2E does not replace original 40AC acceptance, full document-format coverage, physical-device or independent fixed-SHA local gates.
4. `package`: require all previous jobs and their matching-SHA PASS receipts, including mandatory viewer/offline units and exact-once native readback. Missing, `NOT_RUN`, failed or `AUTHOR_LOCAL` Browser evidence fails closed. Verify the downloaded build against the frontend job's hashes, then package tracked source and the tested frontend build with `RELEASE.json`.
5. `verify_download`: download the published artifact and compare its inner release ZIP SHA256 with the independent package-job output. Then verify every ZIP member and contract/migration/asset hash. Any mismatch exits nonzero, even if the download action itself emitted only a warning.

All action references use full commits verified by the controller on 2026-11-03: checkout v6 `d23441a48e516b6c34aea4fa41551a30e30af803`, setup-node v6 `249970729cb0ef3589644e2896645e5dc5ba9c38`, setup-python v6 `ece7cb06caefa5fff74198d8649806c4678c61a1`, upload-artifact v4 `ea165f8d65b6e75b540449e92b4886f43607fa02`, download-artifact v5 `634f93cb2916e3fdff6788551b99b062d0335ce0`. No privileged PR trigger, branch push, deployment, paid runner or minutes purchase occurs in test jobs.

## Runtime and isolated database

Required Windows runner: `windows-2025`; exact Python `3.14.8`, Node `24.14.0`, PostgreSQL `17.11`. Existing dependency locks/pins are unchanged. Missing versions or dependency resolution failures stop the job; another version does not inherit acceptance.

PostgreSQL archive: `https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip`; required SHA256 `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`. It is verified before extraction or execution. The harness creates its own cluster under `RUNNER_TEMP`, binds only loopback port 55441, creates a random-password non-superuser application role and a unique `nu_ci_*_be_test` database. Initial loopback trust is replaced with SCRAM before application access. It checks `server_version_num=170011`, exact database identity, role and non-superuser status. No installed PostgreSQL service, local E: database, shared port or existing data is stopped/reset. Only the harness's own process handles and PGDATA are stopped in cleanup.

Windows Python uses `PYTHONTZPATH` pointing to `share/timezone` from that same hash-verified PostgreSQL archive. The harness verifies `Asia/Hong_Kong` before controlled tests, then preserves the setting for bootstrap, migrations, native tests and the API. It does not silently add a `tzdata` dependency. The API readiness route `/` is the product's actual healthy JSON route; database readiness/identity is verified separately.

The process runner captures stdout/stderr in private temporary files and publishes only sanitized copies. This prevents a Windows PostgreSQL daemon inheriting a pipe from keeping the exited `pg_ctl` launcher's capture open. Command deadlines remain bounded; timeout receipts record observed elapsed time and the requested deadline. Source CI includes real descendant-handle, timeout, stream-separation and redaction regressions before product dependency installation. This repairs the observed run41593627206 start hang; native CI must still rerun on the repaired candidate.

Browser tooling is isolated from product dependencies in a temporary npm workspace, pinned to `playwright@1.65.0-alpha-2026-10-30`, with its generated lock digest recorded. Its bundled Chromium binary is installed and the actual browser version is reported. Hosted Chromium is not presented as identical to the local Chrome or a physical iPhone. The E2E operates on new synthetic data only; it does not send external messages or call providers.

The helper creates a geometric PNG and new managed event/online application through real authenticated fixture APIs; these setup writes are reported separately from UI assertions. The organizer UI loads the participant's private supporting document, decodes thumbnail and modal pixels, exercises zoom/Fit/Escape, downloads the original and compares bytes. Actual private GETs must carry authentication and return `Cache-Control: no-store`.

For Offline, the UI downloads the new event, enables the product's Simulated Offline control, saves/queues three synthetic drafts, and reloads the real page. Read-only IndexedDB snapshots compare the same submission IDs and application payloads. There must be zero real API requests during offline capture/reload, and restoring connection must issue no automatic POST. After fresh online login, the product's lost-ACK control consumes one real successful batch response. The UI must show reconciliation required, then GET the original receipt and mark the same local IDs synced without another POST. No response mock, storage injection, retry after unknown result, or background-sync substitute is used. Native readback requires exactly one batch, three submissions, three pending accountless offline registrations, the separate online document linkage, and matching immutable payload fingerprints. Synced does not mean approved.

## Evidence and privacy

Only designated sanitized evidence directories and the allowlisted release payload are uploaded. Failure logs are captured without echoing command arguments, then redact generated credentials, database URLs, tokens and sensitive credential fields. Browser evidence records route/method/status and Boolean authentication/cache checks, not header values or request bodies. Screenshots show only known synthetic public browse, geometric document preview and the redacted local queue after credential forms close. Private fixture intents, original/downloaded PNGs, IndexedDB snapshots and profiles remain under the temporary private workspace, outside artifacts. No HAR, SQL dump, raw original DOCX/PDF, env file or database is an artifact. Failed checkpoints are preserved; a missing required unit cannot be substituted by the old bounded smoke.

Reports retain actual run ID/attempt, tested SHA, command exits, runtime, test totals/skips, build hashes, database identity checks and explicit unrun boundaries. `RELEASE.json` binds full Git SHA, runtime contract, actual native/browser runtime, migration identities, contract hashes and every bundled asset/file hash. Secrets and raw source originals remain outside the public artifact. These selected scans are not comprehensive security certification.

The CI ZIP includes tracked product source, the tested frontend build and their bundled static assets. It does not contain the controller's external eight-event database fixtures or private uploads. Local CD must supply a separate reviewed curated-fixture bundle: approved reusable images, source/license/AI disclosure and per-file hashes, plus an explicitly configured idempotent seed using a relative Demo clock and task namespace. Record and verify that bundle's own SHA256 independently of the CI ZIP. Private configuration and supporting-document uploads are excluded. No fixture-bundle presence or execution is inferred from a CI PASS.

## Commands and release consumption

From a clean fixed commit, the workflow calls:

```powershell
python -B scripts/demo_ci.py source
python -B scripts/demo_ci.py frontend
python -B scripts/demo_ci.py native-browser --input "$env:RUNNER_TEMP/nu-demo-build"
python -B scripts/demo_ci.py package --input "$env:RUNNER_TEMP/nu-demo-input" --release-dir "$env:RUNNER_TEMP/nu-demo-release"
```

For local non-native checks, use `python -B scripts/demo_ci.py self-test`, or `source --local` / `frontend --local`. Local mode is labelled and is rejected for native execution and release packaging. Evidence defaults to the system temporary directory, outside the product checkout. Local document control can legitimately fail while other owners are editing and before Astra refreshes the document register. Do not refresh or edit another owner's files from this harness.

An explicitly authorized local author driver may start separately owned services against its assigned fresh non-superuser test database and invoke this exact tracked Node helper with `NU_BROWSER_EXECUTION_MODE=AUTHOR_LOCAL`, `NU_BROWSER_SOURCE_SHA` equal to the actual clean author commit, and explicit `NU_BROWSER_URL`, `NU_BROWSER_TOOLS`, `NU_BROWSER_PRIVATE`, `NU_CI_OUTPUT`, `NU_SMOKE_USERNAME`, `NU_SMOKE_PASSWORD` and `SEED_PASSWORD`. `NU_BROWSER_EXECUTABLE` is permitted only in that local mode to report installed Chrome separately. This is authored helper proof, never a hosted CI receipt; it does not set fake GitHub environment variables or relax the native `--local` prohibition. All uploads, evidence, profile and connection settings must be explicitly isolated, with before/after process and native identity checks. The source/build SHA, helper digest, raw first failure and native readback stay with that author's external evidence.

Before extracting or starting a downloaded release, take the expected ZIP SHA256 and source SHA from the successful package job / reviewed delivery receipt, then run:

```powershell
python -B scripts/demo_ci.py verify --zip C:\approved-artifacts\nu-demo-FULL_SHA.zip --expected-digest EXPECTED_SHA256 --expected-sha FULL_SHA
```

The verifier does not extract or run the payload. A mismatched digest, unexpected file, path traversal, private file, case-colliding member, symlink or source/runtime mismatch fails closed. A successful CI artifact still requires Astra's fixed-SHA independent review, complete local browser/DB acceptance, unchanged target check and authorized merge. After merge, use the actual merge-SHA run/artifact for separate local CD and video gates. Migration snapshot/rollback, launcher identity and retained offline queue compatibility are local delivery obligations; this CI performs no deployment or data reset.

## R3 account migration and native isolation

Backend discovery recursively includes every `test_*.py` below `backend/tests`, including the existing nested user-creation contracts. The exact file inventory is saved in the native report. A regression asserts that these nested tests remain included; the initial top-level-only CI76 versus local78 discrepancy is retained as a coverage failure, even though its executed jobs were green. Native and controlled lists remain separate and both require zero skips.

CI creates four fresh per-run databases on its own loopback cluster: main native, account migration, malformed-shape counterexample and `*_browser_be_test`. All use the existing non-superuser application role. The account fixture accepts explicit `NU_ACCOUNTS_NATIVE_DATABASE`, `NU_ACCOUNTS_MIGRATION_DATABASE`, `NU_ACCOUNTS_SHAPE_DATABASE`, and `NU_ACCOUNTS_NATIVE_PORT`; names must be distinct, at most63 characters, start with nu_demo_ or nu_ci_, and end in _be_test. It verifies the exact URL, loopback host, PostgreSQL17.11, port, current database and non-superuser role. Local defaults preserve the original assigned R3 test databases. No test creates, drops or resets another database. CI overrides both native connection identities and all account/Phase2 evidence directories and labels, preventing inherited shared evidence paths. The Browser database receives its own explicit bootstrap and first/repeat three migrations after native suites finish; only then is it served to the Browser helper.

The explicit additive account migration `rose_account_recovery_20261103_v1` runs first/repeat after Phase2 and journey. CI requires the account native suite with zero skips, checks all three migration ledgers, and hashes the account contract/migration into the release artifact. These process/test harness changes do not replace final fixed-SHA product acceptance.
