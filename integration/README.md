# Frontend integration entry

On main, this directory is the frozen demonstration-evidence entry. The English documentation PR adds no production frontend/backend source. Runnable dev implementation is branch-qualified in [CURRENT](../docs/dev/CURRENT.md).

The existing four-role synthetic Mock is available as [ROSE_DEMO_English_v1.2.1_SOURCE.html](../docs/dev/evidence/LOG_DOCX_20261012/ROSE_DEMO_English_v1.2.1_SOURCE.html).

This is frozen source for the existing screen capture, not the complete v1.2.1 engineering package. The original HTML has not been rewritten or presented as an integrated app. It can be opened locally, but the historical documentation intake did not perform normal URL navigation. Storage behavior varies by browser; offline persistence is not promised.

Real integration starts with the [API record](../docs/api/INTEGRATION.md). Obtain backend branch/full SHA, setup, seed, auth and schemas, then integrate an adapter using the existing stack. Unprovided endpoints and demo role switching cannot substitute for verified authorization.

The original NU v1.2.0 `integration/src/` remains in its original workspace. Its later dev import is documented separately; this main documentation PR does not import or relabel it as latest v1.2.1 source. A complete source import requires a separate code PR.

## Directory successor

The main source boundary is [frontend/](../frontend/README.md), with responsibilities in [docs/dev/frontend](../docs/dev/frontend/README.md). `integration/` remains the frozen synthetic evidence entry. No code is moved or rebuilt by this PR.
