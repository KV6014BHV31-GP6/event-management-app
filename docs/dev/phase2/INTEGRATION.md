# Phase 2 integration and promotion boundary

The working runtime pairs two isolated branches. It does not assume that `dev` contains either candidate. Remote state, tested commits and object-only conflict analysis are recorded in the final acceptance/handoff.

| PR | Base at intake | Purpose |
|---|---|---|
|38|dev|Existing frontend booking lifecycle parent|
|40|dev_fe_booking_lifecycle|Existing repaired backend/demo parent|
|55|fix/pr38-demo-readiness|Verified React V2 parent|
|57|fix/pr38-demo-readiness|Phase2 durable offline sync, files/gallery/document association and owner APIs|
|56|dev_fe_rose_pulse_react|Phase2 React PWA, EN/MS and admitted W8 UI plus measurement tools|

All remain Draft unless separately authorized. `MERGEABLE`, a conflict-free tree or no returned checks are not acceptance. Independent local engineering evidence is not team review, full Issue completion, CI success or permission to merge.

## Proposed order, not an executed operation

1. Team review the existing38→40→55 stack at its latest heads and satisfy applicable required checks. Preserve each historical source/evidence boundary.
2. Review/integrate Backend57, including the explicit dedicated-database migration plan, role and private-file implications, native transaction counterexamples and remaining legacy policy limits. Reconcile its base after the parent is integrated; do not assume automatic GitHub retargeting.
3. Review/integrate Frontend56 against the actual accepted backend. Reconcile shared CURRENT/task/source/document-register changes from both branches. Regenerate document metadata for the combined payload after resolving content, then verify that combined commit with its actual database identity and API contract.
4. Any dev→uat→main promotion requires its own authorized review, deployment plan, backup/recovery and target-environment acceptance. No such promotion happens in this task.

The backend and frontend changes are separable review units. The backend is additive and retains legacy API regressions, but its migration and security policy still require review. The new frontend cannot claim complete Phase2 operation against an older backend without the v2 routes. Do not cherry-pick whole W8 module branches or erase PATCH/cancel/approve/global-list compatibility to make the new UI pass.

## Shared-file and migration handling

Product ownership is separated: Frontend writer owns the React workspace plus precise proxy allowlists/tests; Backend writer owns backend source/schema/migration/tests; controller owns shared documents/evaluation tooling. Both PRs necessarily update CURRENT, SOURCE_REGISTER and DOCUMENT_REGISTER. Resolve these as a combined-state update, retaining both task histories; do not choose one entire register over the other. The final virtual-merge result identifies actual conflicts without changing any branch.

Migration `rose_phase2_20261102_v1` has an explicit database-name acknowledgement and ledger. Dedicated fresh/legacy-shape synthetic tests do not validate an original Demo or production database. Stop writers and use an approved backup/restore procedure before any future real target migration. No destructive down migration or automatic startup migration is supplied.

## Release limits

Offline local data remains synthetic-only and unencrypted; physical iPhone, formal NGO language/eligibility policy, qualified Malay review, human usability and funder review remain separate gates. The inherited v1 organizer-global registration list policy remains available; the new owner-only v2 index does not imply that legacy data-access policy was removed. Guest claim/read/cancel, mixed-pool rules, provider-backed notices/OTP and production operations are not silently completed.
