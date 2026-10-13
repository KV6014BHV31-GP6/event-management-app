# NU Developer 當前狀態

版本：`repo-docs/0.2.0`，日期：2026-10-13（香港）。Canonical status for this **public GitHub repository**. Active task: [DEV-SPLIT-20261013](tasks/DEV-SPLIT-20261013.md). NU cloud 的舊 CURRENT 是獨立工作空間記錄，沒有在本 PR 同步或覆寫。

## Repository and handoff

| Area | State | Observed boundary |
|---|---|---|
| Repository `main` | OBSERVED | GitHub base commit `aac3d3af7230544f7a1dab5ef051bd511b2972ba`; [PR #1](https://github.com/KV6014BHV31-GP6/event-management-app/pull/1) has **MERGED**, not an open Draft |
| Frontend root | DOCS_ONLY | [frontend](../../frontend/README.md) entry exists; no complete verified app source or build |
| Backend root | DOCS_ONLY | [backend](../../backend/README.md) entry exists; no backend source, DB or runtime verified |
| Developer ownership | WORKING_BASELINE | [OWNER matrix](OWNERSHIP.md): Benjamin frontend; Austin backend reported, pending confirmation |
| API / integration | REPORTED / NOT_RUN | 15 reported claims, 11 HTTP operation pairs; no verified schema/auth/base URL/full backend SHA |
| Docs / Developer Log Tasks | PRESERVED_DRAFT | Existing two Word files and synthetic demonstration capture remain untouched |
| v1.2.1 complete frontend | NOT_IMPORTED | Historical HTML/screenshots are not a reproducible full application source |
| Real HTTP + DB / race / offline / SMS | NOT_RUN | No live backend or persisted end-to-end acceptance |
| PM policy / team sign-off | NOT_ACCEPTED | Fields, waitlist, no-show, walk-in, permissions and ownership still require decisions |
| CI / deployment | NOT_CONFIGURED | Documentation checks only; no app CI or production release |

## Next three actions

1. Review this documentation-only Frontend / Backend workspace split and confirm accountable owner for backend/API contracts.
2. Receive authenticated full frontend source and Austin backend full SHA/setup/seed/auth/schema; do not move or replace undocumented code.
3. Agree API contract and implement first real guest request → quota decision → persisted receipt → cancellation E2E on separate code PRs.

For this branch's exact file integrity and tests, use [DEV-SPLIT task](tasks/DEV-SPLIT-20261013.md) and the remote PR checks. Existing v1.2.1 Mock results are historical, not a claim of production verification.
