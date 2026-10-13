# Frontend workspace

**State: VERSIONED_MOCK_SOURCE / NO PRODUCTION APP.** The `dev_fe_shell` branch adds [index.html](index.html), a small navigation page linking to the already tracked four-role synthetic demo. It does not import the complete v1.2.1 engineering source or choose a frontend framework.

Working owner: Benjamin. Scope: [Frontend responsibilities](../docs/dev/frontend/README.md). Shared contract: [API handoff](../docs/api/HANDOFF_CHECKLIST.md). Workflow: [BRANCHING](../docs/dev/BRANCHING.md).

## Run locally

From the repository root, with Python available:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/frontend/`, then select **Open four-role demo**. Stop the server with Ctrl+C. This serves static files on loopback only; it is not the backend or a deployment. No dependency installation is required for the navigation page.

## Evidence and limits

The linked [frozen HTML](../docs/dev/evidence/LOG_DOCX_20261012/ROSE_DEMO_English_v1.2.1_SOURCE.html) is unchanged, SHA256 `3949160d0317c2b32ceadb00adca263db507f55c5577cb7ed4aa05e48cd8292e`. Do not move it, rewrite it or treat it as the complete production app. Synthetic role switching is not authentication. Browser storage in the demonstration is not verified multi-device offline persistence.

The new navigation page has no JavaScript, external assets, input form or API calls. Backend source and runtime contract are still unverified. Future implementation must inspect authentic source, existing stack and lockfiles before import.

## Checks and stop point

```bash
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
```

The added shell tests cover HTML/link structure, frozen-source identity and loopback static HTTP readback, not product E2E. See [feature task](../docs/dev/tasks/FE-SHELL-20261013.md) for boundaries. Commit/push to `dev_fe_shell` then stop; no feature promotion is authorized in this task.

## Versioned source commits

- [v1.2.0 module-based runnable mock](mock/v1.2.0/README.md) has been imported as a historical baseline, with `npm test` passing 41/41 locally.
- **Current:** [v1.2.1 verified standalone English demo](mock/v1.2.1/README.md), with exact original source bytes and history retained. Full v1.2.1 engineering ZIP remains unimported.

No real backend connection, production authentication or DB state is implied by these mocks.

## Upgrade: v1.2.0 → v1.2.1

Browse [version history](mock/README.md), run the [v1.2.1 English Mock](mock/v1.2.1/index.html), or test the [v1.2.0 modular baseline](mock/v1.2.0/README.md). Two separate commits keep the progression auditable. These are demos, not a functioning backend or deployable application.
