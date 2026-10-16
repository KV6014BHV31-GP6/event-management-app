# PR4 native Create Event acceptance

Status: working-baseline. Native UI result: **FAIL**.

- Tested commit: `06d7cc7ea95ec22e215e7cb7b4ebaac547d9492e`.
- Execution: GitHub-hosted Windows runner, Python 3.14, native PostgreSQL 17 and real Chrome. Not the user E: environment.
- Workflow: https://github.com/KV6014BHV31-GP6/event-management-app/actions/runs/38557951101
- The execution and browser JSON files contain stage results, A1-A10, redacted request metadata and same-ID readbacks. Never infer PASS from the presence of this folder.
- Screenshots and redacted process/test logs are in the workflow artifact. No passwords, tokens, HAR, traces or video are retained.
- Unit tests deliberately mock fetch; the native browser flow does not intercept routes or replace the database.
- Database readback is SELECT-only after one real UI submission. Full E2E, Security, UAT, restart, deployment and merge are outside scope.
- Initial run 38556907376 failed before Login: the test used Playwright isDisabled() on a fieldset rather than testing its disabled property and actual button. Documentation publication then failed on Windows-generated CRLF. Both harness issues were corrected; the failed run and artifact remain in GitHub Actions. No product change was made to bypass these checks.
- This evidence publication changes documentation only. Reviewer sign-off is separate.
