# ROSE-Pulse | Developer workspace

KV6014 Challenge 5, Group 6. This main-based branch contains a **document-controlled Developer baseline and README-only application shell**. Runnable event index, Login and Create Event implementation is on the separately pinned dev baseline; see [CURRENT](docs/dev/CURRENT.md). This docs PR does not import that implementation.

## Development workspaces

| Area | Entry | Status |
|---|---|---|
| Frontend | [frontend/](frontend/README.md) | Folder reserved for verified frontend source. No runnable app imported. |
| Backend | [backend/](backend/README.md) | Folder reserved for verified backend source. No runnable API imported. |
| API handoff | [docs/api/](docs/api/HANDOFF_CHECKLIST.md) | Source-inspected pinned-dev operations and native results; broader reported claims remain unverified. See CURRENT. |
| Developer documents | [docs/dev/](docs/dev/README.md) | Requirements, ownership, records and tests. |
| Historical UI capture | [integration/](integration/README.md) | Frozen synthetic demo evidence, not production source. |
| Tests | [tests/e2e/](tests/e2e/README.md) | Real E2E cases are planned, not implemented. |
| Other team roles | [docs/](docs/README.md) | Existing PM, UI/UX, Security, QA and submission entry points unchanged. |

Pinned dev setup: [frontend](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/README.md), [backend](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/README.md). Follow those commands only in an authorized checkout of the named dev commit; they cannot run against main's shell.

Current state: [CURRENT.md](docs/dev/CURRENT.md). Role and file ownership: [OWNERSHIP.md](docs/dev/OWNERSHIP.md). Requirements: [REQUIREMENTS.md](docs/dev/REQUIREMENTS.md), [Feature ID crosswalk](docs/dev/FEATURE_ID_CROSSWALK.md). Log Task deliverables: [log-tasks](docs/dev/log-tasks/README.md).

## Checks

```bash
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
```

These validate document-control integrity, not a frontend build, live API, database, deployment, or team acceptance. Actual source/framework decisions must follow an authenticated code handoff and approved contract.

Context startup and resume: [AGENTS.md](AGENTS.md), [CONTEXT_HANDOFF.md](docs/dev/CONTEXT_HANDOFF.md). Document integrity checks do not transfer dev runtime evidence to main.
