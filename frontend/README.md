# Frontend workspace

**State: RESERVED / NO RUNNABLE SOURCE.** This directory establishes a clear future code boundary. It does not contain the complete NU v1.2.1 frontend, a framework choice, or a verified build.

**Working owner:** Benjamin, Developer/frontend. See [scope and acceptance](../docs/dev/frontend/README.md) and [ownership](../docs/dev/OWNERSHIP.md).

Before adding code: obtain the full authorised source archive or commit, inspect its actual package manager and lockfiles, verify license and public-safe content, then import it in a separate reviewable code PR. Do not rebuild an app from screenshots or silently replace the team's chosen framework.

The frozen four-role demonstration remains [historical evidence](../integration/README.md). API calls must use a contract-checked adapter; only the backend can confirm bookings, quota, cancellation, authentication and attendance.
