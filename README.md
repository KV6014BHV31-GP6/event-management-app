# ROSE-Pulse | Developer workspace

KV6014 Challenge 5, Group 6. This public repository currently contains a **document-controlled Developer baseline**, not a running production application.

## Development workspaces

| Area | Entry | Status |
|---|---|---|
| Frontend | [frontend/](frontend/README.md) | Folder reserved for verified frontend source. No runnable app imported. |
| Backend | [backend/](backend/README.md) | Folder reserved for verified backend source. No runnable API imported. |
| API handoff | [docs/api/](docs/api/HANDOFF_CHECKLIST.md) | Reported operations; contracts and runtime unverified. |
| Developer documents | [docs/dev/](docs/dev/README.md) | Requirements, ownership, records and tests. |
| Historical UI capture | [integration/](integration/README.md) | Frozen synthetic demo evidence, not production source. |
| Tests | [tests/e2e/](tests/e2e/README.md) | Real E2E cases are planned, not implemented. |
| Other team roles | [docs/](docs/README.md) | Existing PM, UI/UX, Security, QA and submission entry points unchanged. |

Current state: [CURRENT.md](docs/dev/CURRENT.md). Role and file ownership: [OWNERSHIP.md](docs/dev/OWNERSHIP.md). Requirements: [REQUIREMENTS.md](docs/dev/REQUIREMENTS.md), [Feature ID crosswalk](docs/dev/FEATURE_ID_CROSSWALK.md). Log Task deliverables: [log-tasks](docs/dev/log-tasks/README.md).

## Checks

```bash
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
```

These validate document-control integrity, not a frontend build, live API, database, deployment, or team acceptance. Actual source/framework decisions must follow an authenticated code handoff and approved contract.
