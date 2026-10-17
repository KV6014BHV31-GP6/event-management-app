# ROSE-Pulse | Developer workspace

KV6014 Challenge 5, Group 6. This feature checkout contains the first live event-index/login slice, Austin's FastAPI source, and preserved historical demos. Verification scope and remaining gates are recorded in [CURRENT](docs/dev/CURRENT.md); this is not a production release.

## Development workspaces

| Area | Entry | Status |
|---|---|---|
| Frontend | [frontend/](frontend/README.md) | Vanilla HTML/CSS/JS event index and Login, with local API proxy. |
| Backend | [backend/](backend/README.md) | Austin source at `79804aa`, plus explicit development initialization. |
| API handoff | [docs/api/](docs/api/INTEGRATION.md) | Source-backed live-slice contract, separate from historical claims. |
| Developer documents | [docs/dev/](docs/dev/README.md) | Requirements, ownership, records and tests. |
| Historical UI capture | [integration/](integration/README.md) | Frozen synthetic demo evidence, not production source. |
| Tests | [tests/e2e/](tests/e2e/README.md) | Live-slice checks and the remaining broader E2E matrix. |
| Other team roles | [docs/](docs/README.md) | Existing PM, UI/UX, Security, QA and submission entry points unchanged. |

Current state: [CURRENT.md](docs/dev/CURRENT.md). Role and file ownership: [OWNERSHIP.md](docs/dev/OWNERSHIP.md). Requirements: [REQUIREMENTS.md](docs/dev/REQUIREMENTS.md), [Feature ID crosswalk](docs/dev/FEATURE_ID_CROSSWALK.md). Log Task deliverables: [log-tasks](docs/dev/log-tasks/README.md).

## Checks

```bash
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs
```

The Python document checks validate file control. Node tests validate the frontend API contract and development proxy. Follow the frontend/backend READMEs to run the application, then use the opt-in synthetic [HTTP smoke test](tests/e2e/live_api_smoke.py). Database/browser evidence must name the actual runtime; these checks do not imply deployment or team acceptance.
