# Branch workflow

> **Branch/evidence context:** This is an English documentation copy of the [pinned dev record](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/docs/dev/BRANCHING.md). Implementation, runnable commands and original outcomes below belong to that dev/history context, not main's README-only shell. This docs PR imports Markdown only; referenced code/artifacts remain external. Use [canonical CURRENT](../../docs/dev/CURRENT.md) for later status.

Status: USER_CONFIRMED_WORKFLOW, 2026-10-13. The user supplied Austin's branch instructions and explicitly requested the main shell merge first. Only the workflow is recorded here; no private screenshot or contact data is published.

| Long-lived branch | Purpose | Promotion |
|---|---|---|
| dev | Shared development/integration | Reviewed feature PR into dev |
| uat | Stage candidate and known reference version | Reviewed dev → uat PR with scope, SHA and test evidence |
| main | Final handoff baseline | Separately authorized uat → main PR after acceptance |

Normal flow: `dev_fe_<feature> -> dev -> uat -> main`. The first frontend work branch is `dev_fe_shell`. Feature/docs branches are temporary work branches, not additional long-lived environments. Do not delete existing branches without authorization.

## One-time structure bootstrap

The user authorized PR #2 to merge the README-only frontend/backend shell into main before creating dev and uat. The verified merge commit is `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1`. Both long-lived branches and dev_fe_shell were initialized from that commit. Branch creation is not a successful product UAT.

The old PR-PREP / DEV-SPLIT no-merge wording is historical. This user authorization applied only to the structure merge, not arbitrary future merges. No branch protection, default branch, visibility or deployment configuration was changed.

## Feature work and historical FE-SHELL stopping point

Fetch and inspect the actual dev SHA, working tree, AGENTS and contract before starting `dev_fe_<feature>`. Keep frontend code under frontend/ and backend code under backend/. Use one writer per changed file and shared API review.

The historical FE-SHELL-20261013 instruction was to commit and push the static navigation entry and its documents/tests on dev_fe_shell, then stop. Do not open a promotion PR, merge into dev/uat/main or enable auto-merge. Further progression requires a separate instruction and the relevant checks.

UAT is a reference snapshot, not an automatic rollback mechanism. Recover using a normal fix/revert PR against a verified commit; do not reset or force-push away another contributor's history. If any ref has moved, reconcile before writing. See [ownership](OWNERSHIP.md) and [CURRENT](CURRENT.md).

## Documentation successor, 2026-10-16

PR #3 and PR #4 are merged into dev at the pinned baseline recorded in [CURRENT](CURRENT.md). Their scoped later authorizations do not grant arbitrary future merges. The current user separately authorized a Markdown documentation Draft PR based on main, plus the document-register metadata exception. This PR references dev implementation by exact-SHA links and imports no product code. It is not dev → uat → main product promotion.
