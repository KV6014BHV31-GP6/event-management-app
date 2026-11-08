# AC40 portable repair, 2026-11-08

Status: LOCAL_VERIFIED scoped repair; hosted successor CI and full AC40 remain separate.
Base: `5479b9e1def06d1d917f7472325b4941cdca5569` on `dev_demo_ben`.
Writer: Astra, dedicated branch `fix/ac40-portable-20261108-1335`.

## Owner scope and retained evidence

Owner requested another AC40 run, independent groups, and smallest reproducible repairs first. The latest request explicitly authorizes using the connected desktop and its guarded agent-desktop adapter to resolve the execution blocker. UAT remains out of scope. No main/dev/uat/Austin branch changes, existing database migration, secret rotation, force push or production deployment.

PRs #58 and #59 were previously merged with disclosed incomplete acceptance. Their original partial passes, failures, restricted probes and unrun criteria remain unchanged. This task does not convert any complete AC row to PASS.

## Observed failures

1. Merge CI run 42412689950 failed document control because PR #59 added 18 unregistered portable files. The unchanged canonical checker reproduced exactly these 18 errors in a fresh checkout.
2. New secrets used platform-default text newline translation. On Windows, three new regression assertions failed because the shell's password bytes and the application's stripped value differed.
3. The connected PC's Docker Engine was stopped. Existing Desktop CLI started the engine. Both retained synthetic stacks returned HTTP 200 and healthy containers afterwards. A targeted agent-desktop 1.0.2 snapshot of Docker Desktop returned complete=true. No GUI input or existing database mutation was needed.

## Minimal changes

- Set explicit LF translation only when creating NEW secret files in `deploy/portable/prepare.py`.
- Add six regression tests for newline identity, exactly one terminator, no rotation or disclosure, and retained permission behavior.
- Register the omitted portable files, new regression and this task. Preserve existing approval statuses; update only reviewed fingerprints through the canonical refresh utility.
- Update CURRENT with this version-qualified successor; retain older sections as history.

## Verification

- Actual Windows execution of the new regression: 3 failures before repair, 6/6 pass after repair. Test secrets live only in temporary synthetic directories; existing credentials were not touched.
- Canonical document validation: reproduced FAIL before registration, PASS after registration.
- Existing Docker packaging and gateway suites run independently in an isolated copy using the frozen application image and artifact.
- Legacy, controlled backend and React groups are attempted independently. Exact counts and any failures belong to their original receipts and the PR verification summary, not inferred from source inspection.
- No product source or existing frontend artifact bytes changed. No complete AC40, new native concurrency, browser journey, physical-device or UAT acceptance is claimed.

## Handoff

The repair checkout and logs are outside the retained demo directories. Do not rerun prior one-shot AC40 fixture scripts. Use original operation IDs for reconciliation. Previously restricted refresh-cookie and supplemental native diagnostics remain isolated, with no alternate-tool retry. Confirm the exact published head and new CI before attributing remote results to this patch. Actual post-merge CI, local image rebuild and deployment each require their own result.
