# NU Developer current status

Version: `repo-docs/0.4.0`, updated 2026-10-16 (UTC+8). This is the sole current functional-status record for `KV6014BHV31-GP6/event-management-app`. Active task: [DEV-BASELINE-VERIFY-20261016](tasks/DEV-BASELINE-VERIFY-20261016.md). This main-based documentation PR records branch-qualified progress; it does not merge dev implementation into main or update the independent NU cloud CURRENT.

## Repository identity and branch boundaries

| Context | Full commit / state | Meaning |
|---|---|---|
| Main before this docs PR | `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1` | README-only frontend/backend shell from merged PR #2; no runnable product source on main |
| Pinned remote dev baseline | `a47ff7d92f296ebd0604a1df98daf0b8111829b3` | PR #3 event index/Login and PR #4 Create Event are merged into dev; implementation is referenced, not copied into this PR |
| Preserved local checkout | Local `dev` at `cabb6a6a2cfede5ceacec47620eb1fa95c4da3a1` | Fourteen commits behind pinned remote dev; it is not the tested remote-dev snapshot and was not switched, pulled or overwritten for this task |
| Documentation worktree | `docs/english-context-handoff-20261016`, based on main | English Markdown/context/status changes plus the explicitly user-approved `docs/dev/DOCUMENT_REGISTER.json` metadata exception; no application code import |
| Promotion / release | NOT_ACCEPTED / NOT_RUN | No dev → uat → main product promotion, deployment, complete Security review or team UAT is established |

Historical PR #1 main commit was `aac3d3af7230544f7a1dab5ef051bd511b2972ba`, before the PR #2 shell merge. Historical PR #3 merge commit: `7a06f43dc30c8378d9f3c569635523b25ce556b0`; its prior evidence remains scoped to the recorded application commit.

Remote PR evidence: [PR #2](https://github.com/KV6014BHV31-GP6/event-management-app/pull/2), [PR #3](https://github.com/KV6014BHV31-GP6/event-management-app/pull/3), [PR #4](https://github.com/KV6014BHV31-GP6/event-management-app/pull/4). The old dev CURRENT saying PR #4 was not merged is superseded by the 2026-10-16 remote observation. Historical task statements retain their original timing and scope.

## Functional scope on pinned dev

| Area | State | Evidence boundary |
|---|---|---|
| Live frontend pages | IMPLEMENTED on dev | Public Events, Login and Create Event. [Pinned frontend setup](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/frontend/README.md); main frontend root remains a shell |
| UI-connected API operations | Four of eight business operations wired to live UI | Event list, JSON Login, current profile and event creation. Event detail has no dedicated live detail screen; form-token Login, user creation and participant creation have no dedicated live UI. HTTP/proxy coverage is not UI wiring |
| API inventory | Eight business operations plus health | Nine HTTP operations are a separate counting unit from three live pages, four UI-connected operations, ten User Stories and eighteen feature-draft entries; no product-completion percentage is asserted |
| Backend business source | OBSERVED / PRESERVED on dev | Austin source baseline `79804aa67508de23d3f3c613e65cf375e9ded2a3`; historical task records preserve original source/pin checks; ownership remains reported pending team confirmation |
| Setup | IMPLEMENTED on dev | Additive synthetic schema/seed command, .env example, loopback development proxy and Windows instructions. [Pinned backend setup](https://github.com/KV6014BHV31-GP6/event-management-app/blob/a47ff7d92f296ebd0604a1df98daf0b8111829b3/backend/README.md) |
| Fresh native verification of exact remote dev | EXECUTION COMPLETE WITH DEFECTS | [Fresh receipt](evidence/DEV-BASELINE-VERIFY-20261016/README.md): all eight business operations exercised direct/proxy; primary HTTP 144/156 assertions passed; browser 25/25 and restart readback 3/3 passed. Four runtime defect families and one Windows test-portability defect remain; no all-pass acceptance |
| Broader guest-booking scope | PLANNED / NOT_RUN | Server-confirmed guest booking, last-place races, waiting-list/cancellation policy, referral analytics, SMS and multidevice offline flows are not established by event/Login/Create Event tests |
| Production permissions / team UAT | NOT_ACCEPTED | Imported API allows logged-in event creation without organizer enforcement and caller-selected signup roles. Existing policy is unchanged; a synthetic organizer is not proof of authorization controls |
| Historical mocks, capture and Word | PRESERVED | Existing main bytes unchanged; dev Mock source referenced by pinned links. Document translation does not rerun historical product tests |

The [source scope audit](DEV_SCOPE_AUDIT.md) maps the eighteen draft features without promoting them to accepted. [Bug/contract proposals](BUG_PROPOSALS.md) retain reproduced defects and proposed separate repairs.

## Historical evidence retained with exact limits

| Record | Reported result | Scope / limitation |
|---|---|---|
| [FE-LIVE implementation](tasks/FE-LIVE-20261014.md) | 30 frontend + 4 proxy tests, two corrected SQLite backend tests; eight HTTP groups and 22 browser checks | Historical Python 3.14.8 / PGlite 0.5.9 with PostgreSQL 18.6 WASM and socket 0.2.12; test-only transport. Persisted readback passed; disconnect required termination. It does not clear native PostgreSQL 17 |
| User native A/B run `20261014-152157` | REPORTED PASS; supplied evidence consistency OBSERVED | Application commit `8339ab6b0428ea065e73292594f818c0286c9cf2`, PostgreSQL 17.11/Python 3.14.8. A1–A4 Login/profile/session and B1–B3 API creation/readback/restart. Initial Ctrl+C stop failed; Ctrl+Break retry passed. Reviewer checked supplied hashes, not all 183 artifacts or an independent rerun |
| [PR #4 native attempt 38557951101-1](evidence/FE-CREATE-EVENT-NATIVE-20261014/38557951101-1/README.md) | FAIL | Tested `06d7cc7ea95ec22e215e7cb7b4ebaac547d9492e` on GitHub-hosted Windows; retained as failure |
| [PR #4 native attempt 38558483277-1](evidence/FE-CREATE-EVENT-NATIVE-20261014/38558483277-1/README.md) | PASS for bounded Create Event UI acceptance | Tested `0a29fde4ef8b1b76d2ba105d03ef9362ac9a8d90`, Python 3.14/native PostgreSQL 17/Chrome on GitHub-hosted Windows, not the user's E: environment. No full E2E, Security, UAT, restart or deployment claim |

PR #4's earlier NOT_RUN and failed harness attempt `38556907376` remain historical. Later PASS supersedes only the bounded failed UI result, not all other gates or fresh exact-dev verification. A4 frontend Logout does not prove JWT revocation, expiry, actual BFCache or cross-browser behavior. Historical API Create Event is distinct from the later real form test.

## Next three actions

1. Review the five [defect proposals](BUG_PROPOSALS.md) and authorize any separate fix PRs. Keep HTTP failures, contract/policy decisions and UI wiring distinct; see the [18-feature source audit](DEV_SCOPE_AUDIT.md).
2. Review the English documentation and context handoff in the main-based Draft PR. Record final document checks/publication identity in the active task and delivery receipt; no merge is authorized.
3. Obtain PM/Dev/Security decisions and separately authorize broader booking work and any dev → uat → main promotion. Native slice evidence does not approve full-product release.
