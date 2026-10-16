# Document control

Version: `repo-docs/0.4.0`, working-baseline. This is the public-repository subset of the existing NU control system. It does not replace the original source library or approve the whole product.

## Authority of each record

| Record | Controls | Does not establish |
|---|---|---|
| [SOURCE_REGISTER.json](SOURCE_REGISTER.json) | Source IDs/types, available bytes, fingerprints and inclusion of originals | PM approval or raw-byte verification of every source |
| [DOCUMENT_REGISTER.json](DOCUMENT_REGISTER.json) | Selected payload IDs, owners, revisions, statuses, dependencies, SHA256 and change history | Functional completion or database readiness |
| [CURRENT.md](CURRENT.md) | Sole current functional status with explicit branch/SHA boundaries, blockers and next actions | Synchronization of the independent cloud CURRENT |
| [DECISIONS.md](DECISIONS.md) | Recorded tradeoffs and successors | Deletion of older decisions or approval on another person's behalf |
| [Tasks](tasks/TEMPLATE.md) and [historical receipt](evidence/PR-PREP-20261013/VALIDATION.json) | Actual scope, commands, results and unperformed work | Rerunning historical results |
| [CONTEXT_HANDOFF.md](CONTEXT_HANDOFF.md) | Bounded startup/checkpoint/resume format | Another current status source or perpetual authorization |

Content statuses: `draft`, `working-baseline`, `accepted`, `superseded`. Record execution evidence separately. Accepted content requires explicit approval by a named reviewer. Role placeholders stay draft and do not assign others' work automatically.

## Source and feature identities

Keep older source `SRC04`; the newer feature table uses `SP-FEATURES-20261012`. For example, `SRC04:A-02` means waiting-list refill, whereas `SP-FEATURES-20261012:A-02` means timeslot/quota allocation. Read the [crosswalk](FEATURE_ID_CROSSWALK.md); do not globally replace strings.

Original source hashes and IDs do not change when a derived output path or language changes. Derived revisions get their own hashes. Rehash available originals; label hashes available only from an older register as recorded-not-rehashed.

## Change sequence

Read current body/diff → confirm owner/source → make the smallest change → record task/decision → run tests → refresh register for an explicit reviewed reason → recheck → commit.

```bash
python scripts/refresh_document_register.py --reason "Describe the reviewed body changes"
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
```

Refresh updates bytes/hash/revision for existing entries, preserving ID, owner/status, dependencies and old hashes. It refuses unknown or missing files; manually register new-file metadata first. It cannot approve content.

The register excludes its own hash. `.git`, `__pycache__`, `.env` and runtime outputs are outside the payload; the validator additionally rejects unregistered delivery files. The outer delivery receipt records register hash and Git SHA.

## Public and remote boundaries

The repository was observed public. Publish only selected public-safe Developer derivatives, synthetic evidence and required controls. Exclude raw SharePoint files, group chats, student/participant data, old ZIPs, raw prompts, private sharing links and secrets. Preserve designated DOCX originals and image provenance. Retain failed captures as historical failures; never hide them or turn them into PASS.

`.gitattributes` preserves verified bytes against platform line-ending conversion. New code needs its own reviewed text policy. Preserve nonempty remote contents and default branch; compare upstream changes before writing. Local baseline SHA is not remote HEAD. A historical empty-repository bootstrap does not apply again.

Independent branch/push/PR permission does not include merge, force push or deployment. Follow the current task's explicit authorization. Historical no-merge and later one-time merge permissions are reconciled in the task/decisions; neither becomes perpetual permission.

## Main documentation / dev implementation successor, 2026-10-16

Main retains README-only frontend/backend shells. Pinned dev implementation, historical tasks and evidence are described in English Markdown with explicit provenance. This docs PR imports no code, workflows, images, JSON evidence, DOCX, runtime or secrets from dev. Absent dev artifacts use GitHub blob links pinned to `a47ff7d92f296ebd0604a1df98daf0b8111829b3`; links are references, not local payload imports. Existing main non-Markdown artifacts retain bytes.

New Markdown requires explicit IDs, working owners, `draft`/`working-baseline` status, known source dependencies and SHA256. The user explicitly approved the 2026-10-16 allowlist of Markdown plus DOCUMENT_REGISTER.json metadata. The parent owns that JSON update, preserving identity/history; the documentation writer does not change it. Until metadata refresh and final validation finish, do not claim final document-control PASS or weaken the validator. The parent records the actual register update and final validation in the [active task](tasks/DEV-BASELINE-VERIFY-20261016.md).

Document-control PASS establishes only file/metadata/local-link and selected sensitive-pattern consistency. It is not product, native PostgreSQL, comprehensive Security, team UAT or release acceptance.
