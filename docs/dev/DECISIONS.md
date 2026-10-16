# Repository import decisions

These records describe the documentation/import decisions. They do not delete the older NU DECISIONS or mean the team approved all features.

| ID | State | Decision and reason | Reopen condition |
|---|---|---|---|
| IMPORT-001 | OWNER_REQUESTED | Focus on necessary Developer documents; add directory entries for other roles | User explicitly expands scope |
| IMPORT-002 | LOCAL_APPLIED | Do not directly upload raw SharePoint files, group chats, old ZIPs or private prompts | Explicit public-data scope and approval |
| IMPORT-003 | LOCAL_APPLIED / TEAM_REVIEW_PENDING | Preserve SRC04 and SP-FEATURES-20261012 namespaces with seventeen/eighteen-item crosswalk | PM/Dev confirms successor mappings |
| IMPORT-004 | LOCAL_APPLIED | Select the two Word files with source capture; preserve bytes; exclude before_source_capture | Separate revision with render/inspection when changed |
| IMPORT-005 | LOCAL_APPLIED | Do not substitute v1.2.0 code for unavailable v1.2.1 source ZIP materialization | Authorized raw bytes and complete-engineering verification |
| IMPORT-006 | AUTHORIZED / REMOTE_BLOCKED | Latest task authorization allowed branch/push/PR, superseding TASK-004 historical local-only restriction | User scope changes; merge/deployment excluded |
| IMPORT-007 | CONDITIONAL | If remote is reverified empty, add only a minimal README main baseline before feature branching | Any existing commit requires reconciliation, not overwrite |
| IMPORT-008 | PROPOSED | One primary writer per role; reviewer follows content | Explicit team staffing decision |

Historical observation from the first cloud connection on 2026-10-13: both GitHub write methods returned 403 and no remote commit/branch/PR was created then. Later local CLI publication succeeded and PR #1 merged. The old observation describes only its original time. The structure PR did not claim backend source existed, was complete or had been taken over.

## Successor decisions, 2026-10-13

| ID | State | Scope and reason | Reopen condition |
|---|---|---|---|
| IMPORT-009 | OBSERVED_SUCCESS | [PR #1](https://github.com/KV6014BHV31-GP6/event-management-app/pull/1) merged; historical main `aac3d3af...`. Supersedes IMPORT-006 REMOTE_BLOCKED and IMPORT-007 empty-remote assumption; older rows retained | New remote evidence |
| STRUCT-001 | OWNER_REQUESTED / DOCS_ONLY | Add frontend/backend README-only landing zones. Preserve integration frozen evidence; no unverified source import or framework choice | Authentic source/lockfile and approved implementation PR |
| STRUCT-002 | WORKING_BASELINE / TEAM_REVIEW_PENDING | Separate FE/BE responsibilities; add ownership/API/E2E entries. Austin's role remains reported, not reassigned | PM/contributor confirms accountable owner and API contract |
| STRUCT-003 | LOCAL_CONTROL | Register new Markdown and changed revisions, retaining historical task/source identities | Approved public scope or control-policy change |

The original documentation PR authorized no merge, deployment, source move, backend takeover or role sign-off. Later one-time authorizations are recorded below and in their tasks rather than rewriting that history.

## English/context and remote-state successor, 2026-10-16

| ID | State | Scope and reason | Reopen condition |
|---|---|---|---|
| DOCS-EN-001 | USER_AUTHORIZED / WORKING_BASELINE | English Markdown and context handoff Draft PR based on main, plus explicitly approved DOCUMENT_REGISTER.json metadata exception; no dev code import | New user instruction or reviewed scope change |
| CONTEXT-001 | WORKING_BASELINE | Enhance canonical AGENTS.md; add bounded checkpoint/resume template; CURRENT remains sole functional status | Evidence of conflicting rules or revised repository workflow |
| BRANCH-STATE-001 | OBSERVED | Main shell at `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1`; remote dev `a47ff7d92f296ebd0604a1df98daf0b8111829b3` contains merged PR #3 and PR #4. Preserve local dev shell fourteen commits behind | Fresh remote refs / exact-SHA evidence |
| EVIDENCE-001 | WORKING_BASELINE | Keep historical FAIL/NOT_RUN and later bounded PASS, each with tested SHA/environment; fresh pinned-dev verification is separately recorded | New actual receipt, never a document-only status edit |
| SCOPE-001 | WORKING_BASELINE / TEAM_REVIEW_PENDING | Three live pages, four UI-connected operations, eight business API operations plus health, ten stories and eighteen features are different units. No blanket completion percentage or full-feature acceptance | Reviewed feature/acceptance evidence and policy decisions |

Any newly found product defect belongs in a proposal and separately scoped fix PR. Main documentation review does not authorize dev/uat/main product promotion, deployment or team acceptance. See [CURRENT](CURRENT.md) and [active task](tasks/DEV-BASELINE-VERIFY-20261016.md).
