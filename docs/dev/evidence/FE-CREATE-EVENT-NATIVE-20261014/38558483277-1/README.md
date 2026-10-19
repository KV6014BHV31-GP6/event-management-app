# PR4 native Create Event acceptance

> **Branch/evidence context:** This is an English documentation copy of the [pinned dev record](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-CREATE-EVENT-NATIVE-20261014/38558483277-1/README.md). Implementation, runnable commands and original outcomes below belong to that dev/history context, not main's README-only shell. This docs PR imports Markdown only; referenced code/artifacts remain external. Use [canonical CURRENT](../../../../../docs/dev/CURRENT.md) for later status.

Status: working-baseline. Native UI result: **PASS**.

- Tested commit: `0a29fde4ef8b1b76d2ba105d03ef9362ac9a8d90`.
- Execution: GitHub-hosted Windows runner, Python 3.14, native PostgreSQL 17 and real Chrome. Not the user E: environment.
- Workflow: https://github.com/KV6014BHV31-GP6/event-management-app/actions/runs/38558483277
- The execution and browser JSON files contain stage results, A1-A10, redacted request metadata and same-ID readbacks. Never infer PASS from the presence of this folder.
- Screenshots and redacted process/test logs are in the workflow artifact. No passwords, tokens, HAR, traces or video are retained.
- Unit tests deliberately mock fetch; the native browser flow does not intercept routes or replace the database.
- Database readback is SELECT-only after one real UI submission. Full E2E, Security, UAT, restart, deployment and merge are outside scope.
- Initial run 38556907376 failed before Login: the test used Playwright isDisabled() on a fieldset rather than testing its disabled property and actual button. Documentation publication then failed on Windows-generated CRLF. Both harness issues were corrected; the failed run and artifact remain in GitHub Actions. No product change was made to bypass these checks.
- This evidence publication changes documentation only. Reviewer sign-off is separate.
