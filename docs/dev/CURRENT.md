# NU Developer 當前狀態

版本：`repo-docs/0.2.3`，2026-10-13（香港）。Active task: [FE-MOCK-V121-20261013](tasks/FE-MOCK-V121-20261013.md). This file describes the current feature checkout; NU cloud is a separate workspace.

| Area | State | Evidence boundary |
|---|---|---|
| Main directory shell | MERGED | PR #2 merged as `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1`; frontend/backend and Dev/API/E2E entries exist |
| dev / uat | CREATED | Initialized from that structure merge, not a claim of product UAT |
| Frontend feature | VERSIONED_MOCK | [Static launcher](../../frontend/index.html) offers current v1.2.1 English Demo and preserved v1.2.0 modular source, under dev_fe_shell |
| Backend / real API / DB / SMS | NOT_RUN | No verified backend source, auth/schema or live integration; [handoff checklist](../api/HANDOFF_CHECKLIST.md) remains open |
| Complete v1.2.1 frontend | NOT_IMPORTED | Exact standalone Demo HTML is versioned; full engineering source ZIP remains unavailable |
| Existing Word / capture set | PRESERVED | Original bytes and historical test boundaries retained |
| PM / Security / product acceptance | NOT_ACCEPTED | This structure merge and static entry do not approve all features or policies |
| CI / deployment | NOT_CONFIGURED | Local tests only; no new workflows or protection settings |

Flow: [feature → dev → uat → main](BRANCHING.md). The earlier PR-PREP/DEV-SPLIT no-merge instructions describe their original scope; the latest user explicitly authorized only the completed main structure merge and subsequent feature commit/push-and-stop.

## Next three actions

1. Confirm remote dev_fe_shell matches the tested feature commit and main/dev/uat retain the structure merge SHA; then stop without feature promotion.
2. Obtain authentic frontend source and Austin backend full SHA/setup/seed/auth/schema before a new implementation task.
3. Agree the versioned API contract and PM policies, then perform the first real guest request → persisted receipt → cancellation E2E through separately authorized PRs.

Validation commands and boundaries are in the [feature task](tasks/FE-SHELL-20261013.md). Local document and static HTTP checks are not backend, native browser or human acceptance.

## Source import successor 1/2 · v1.2.0

On `dev_fe_shell`, imported the verified original module-based synthetic Frontend v1.2.0 under `frontend/mock/v1.2.0/`; local Node tests 41/41 PASS. This supersedes the earlier statement that the feature branch contained only a static launcher. Full v1.2.1 engineering source and the Austin backend remain NOT_VERIFIED; no API/DB/UAT acceptance.

## Source import successor 2/2 · v1.2.1

Verified English standalone four-role Demo at `frontend/mock/v1.2.1/index.html` as CURRENT_DEMO, using the original frozen Git blob with SHA256 `3949160d0317c2b32ceadb00adca263db507f55c5577cb7ed4aa05e48cd8292e`. The previous v1.2.0 module+Node tests remain intact at `frontend/mock/v1.2.0/`. This is a documented Demo upgrade, not a claim of full v1.2.1 engineering archive, real backend integration or product acceptance. No PR/merge/deploy.
