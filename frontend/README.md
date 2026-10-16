# Frontend workspace

**Main state: RESERVED / NO RUNNABLE SOURCE.** This directory establishes a clear future code boundary. It does not contain the complete NU v1.2.1 frontend, a framework choice, or a verified build.

**Working owner:** Benjamin, Developer/frontend. See [scope and acceptance](../docs/dev/frontend/README.md) and [ownership](../docs/dev/OWNERSHIP.md).

Before adding code: obtain the full authorised source archive or commit, inspect its actual package manager and lockfiles, verify license and public-safe content, then import it in a separate reviewable code PR. Do not rebuild an app from screenshots or silently replace the team's chosen framework.

The frozen four-role demonstration remains [historical evidence](../integration/README.md). API calls must use a contract-checked adapter; only the backend can confirm bookings, quota, cancellation, authentication and attendance.

## Pinned dev implementation

The separate dev baseline `a47ff7d92f296ebd0604a1df98daf0b8111829b3` contains implementation and [branch-specific setup](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/README.md). Those instructions apply to that exact dev checkout; this main-based docs PR imports only Markdown. Read [CURRENT](../docs/dev/CURRENT.md) for implementation, test and promotion boundaries. Existing main non-Markdown payloads remain unchanged.

The dev v1.2.1 standalone Mock retains source SHA256 `3949160d0317c2b32ceadb00adca263db507f55c5577cb7ed4aa05e48cd8292e`; it is distinct from live implementation and the complete engineering archive. See the [pinned source README](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/mock/v1.2.1/README.md).
