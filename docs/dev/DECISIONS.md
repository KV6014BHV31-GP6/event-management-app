# Repo 導入決策

這些是本次整理決策，不刪除 NU 的舊 DECISIONS，不代表團隊已批准所有功能。

| ID | 狀態 | 決定及原因 | 重開條件 |
|---|---|---|---|
| IMPORT-001 | OWNER_REQUESTED | 必要 Dev 文件為主；其餘角色建立目錄入口 | 使用者明確擴大範圍 |
| IMPORT-002 | LOCAL_APPLIED | 不直接上傳原始 SharePoint、群聊、舊 ZIP、私人 prompt | 明確資料公開範圍與批准 |
| IMPORT-003 | LOCAL_APPLIED / TEAM_REVIEW_PENDING | 同時保留 SRC04 與 SP-FEATURES-20261012 namespace，加入17/18項對照 | PM/Dev 確認 successor mapping |
| IMPORT-004 | LOCAL_APPLIED | 選用有 source capture 的兩份 Word；保持 bytes，排除 before_source_capture | 修訂時另開 revision 並 render/inspect |
| IMPORT-005 | LOCAL_APPLIED | 不以 v1.2.0 code 代替未能 materialize 的 v1.2.1 source ZIP | 取得授權 raw bytes 並驗證完整工程 |
| IMPORT-006 | AUTHORIZED / REMOTE_BLOCKED | 最新授權允許 branch+push+PR，取代 TASK-004 的歷史 local-only | user scope 改變；不含 merge/deploy |
| IMPORT-007 | CONDITIONAL | 若 remote 重核仍空，只加最小 README 作 main 基線，再分支提交 | 發現任何現有 commit 時先 reconcile，不覆寫 |
| IMPORT-008 | PROPOSED | 每個角色一個 primary writer，reviewer 依內容決定 | 團隊明確人員安排 |

歷史紀錄（2026-10-13 初次雲端連線）：兩次 GitHub 寫入均為403，當時未有 remote commit/branch/PR；其後本地 CLI 成功及 PR #1 已合併。這條舊紀錄只描述當時狀態。Backend 不在本次結構 PR 被宣稱存在、完成或被接管。

## Successor decisions, 2026-10-13

| ID | State | Scope and reason | Reopen condition |
|---|---|---|---|
| IMPORT-009 | OBSERVED_SUCCESS | [PR #1](https://github.com/KV6014BHV31-GP6/event-management-app/pull/1) merged; main at `aac3d3af...`. Supersedes `IMPORT-006` REMOTE_BLOCKED and the empty-remote assumption in `IMPORT-007`; historic rows remain for audit. | New remote evidence |
| STRUCT-001 | OWNER_REQUESTED / DOCS_ONLY | Add `frontend/` and `backend/` README-only landing zones. Keep original `integration/` frozen evidence; do not import unverified source or choose a framework. | Authentic source/lockfile and approved implementation PR |
| STRUCT-002 | WORKING_BASELINE / TEAM_REVIEW_PENDING | Separate FE/BE responsibilities under `docs/dev/` and add [ownership](OWNERSHIP.md), [API checklist](../api/HANDOFF_CHECKLIST.md), and E2E entry. Austin role is reported, not reassigned. | PM / contributor confirms accountable owner and API contract |
| STRUCT-003 | LOCAL_CONTROL | Register all new Markdown files and changed revisions; historical task and source registers remain unchanged. | Approved public scope or document-control policy change |

No merge, deployment, source-code move, backend takeover or role sign-off is authorized by this documentation PR.
