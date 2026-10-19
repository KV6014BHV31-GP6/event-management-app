# Backend workspace

**Main state: RESERVED / NO RUNNABLE BACKEND.** No server source, migrations, database seed, configuration or live API is claimed in this folder.

**Reported contributor:** Austin; actual backend ownership, source location and handoff status require confirmation. This directory does not transfer ownership. See [backend handoff](../docs/dev/backend/README.md), [API checklist](../docs/api/HANDOFF_CHECKLIST.md) and [ownership](../docs/dev/OWNERSHIP.md).

Before adding code: inspect the source commit, existing stack and lockfiles; obtain setup instructions, environment variable names, synthetic seed, auth rules, schemas, transaction/idempotency evidence and relevant tests. Never commit secrets or real screening/participant data.

Do not create a speculative API implementation just to populate this folder. Keep routes that have only been reported clearly unverified.

## Pinned dev implementation

The separate dev baseline `a47ff7d92f296ebd0604a1df98daf0b8111829b3` contains implementation and [branch-specific setup](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/README.md). Those instructions apply to that exact dev checkout; this main-based docs PR imports only Markdown. Read [CURRENT](../docs/dev/CURRENT.md) for implementation, test and promotion boundaries. Existing main non-Markdown payloads remain unchanged.

Dev event creation/publication relates to `SP-FEATURES-20261012:A-01`. Existing event/Login integration does not complete that feature or the broader guest-booking, quota, cancellation and SMS scope.
