# FE-LIVE-20261014 verification evidence

> **Branch/evidence context:** This is an English documentation copy of the [pinned dev record](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/README.md). Implementation, runnable commands and original outcomes below belong to that dev/history context, not main's README-only shell. This docs PR imports Markdown only; referenced code/artifacts remain external. Use [canonical CURRENT](../../../../docs/dev/CURRENT.md) for later status.

This directory contains sanitized synthetic test evidence for public events and Login. [VALIDATION.json](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/VALIDATION.json) records the SQL/runtime boundary. [browser-report.json](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/browser-report.json) distinguishes normal real-API navigation from controlled fault injection.

## Executed environment

- Python3.14.8; all73 imported requirement pins installed unchanged.
- Unchanged Austin FastAPI/SQLAlchemy/ORM source, with a test-only [transport wrapper](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/pglite_test_transport.py) replacing connection settings before router imports.
- PGlite0.5.9 embeds PostgreSQL18.6; official pglite-socket0.2.12 exposes loopback TCP. Its single underlying connection requires a one-connection pool, disabled statement caches and unique prepared names. This is not native PostgreSQL17.
- Chromium153.0.8010.0, desktop1440 and mobile390, Hong Kong browser timezone. Main flow uses no request interception. Empty/network/502/malformed-response/XSS cases use a separately labeled browser context.

Actual API calls exercised login/profile, anonymous reads, authorization rejection, invalid input, create/readback and pagination. The created event survived API and file-backed database restart. No credentials, authorization headers, tokens or real personal records are published. The screenshots show synthetic development events and blank password fields.

## Screenshots

- [Events, desktop1440](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/events-desktop-1440.png)
- [Events, mobile390](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/events-mobile-390.png)
- [Login, desktop1440](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/login-desktop-1440.png)
- [Login, mobile390](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/evidence/FE-LIVE-20261014/login-mobile-390.png)

## Limits and reproduction

Native PostgreSQL17.11 binaries were verified but `initdb` refused the root-only sandbox. No non-root identity is available. Native PostgreSQL17 acceptance was **NOT_RUN in this original alternative-engine run**, and the feature was then a Draft PR pending that check and team review. Later native reports and merged dev state are recorded in canonical CURRENT; this historical run is unchanged.

PGlite committed bootstrap rows correctly and preserved them across repeat runs/restart. Its socket adapter did not finish client disconnection; bootstrap processes required termination after successful writes. Clean bootstrap exit is therefore not claimed in this alternative environment.

Prefer reproducing with native PostgreSQL17 using the [pinned dev backend README](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/README.md), [pinned dev frontend README](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/README.md), and [HTTP/browser tests](../../../../tests/e2e/README.md). For the alternative experiment only, install `@electric-sql/pglite@0.5.9` and `@electric-sql/pglite-socket@0.2.12` outside the checkout, start `pglite-server --db=<disposable-path> --port=55432 --host=127.0.0.1`, supply a loopback `DATABASE_URL` and generated test secrets through the environment, and load this wrapper with both `backend/` and this evidence directory on `PYTHONPATH`. Restart the socket adapter after bootstrap before launching `uvicorn pglite_test_transport:app`. This wrapper is not used by normal app startup and must not be mistaken for a production fix.

Initial existing backend user tests failed because they expected integer IDs and obsolete duplicate-error text. The current source returns 26-character ULIDs and updated detail text; only those assertions were corrected. Business source, dependency pins, historical mocks and frozen documents remained unchanged.
