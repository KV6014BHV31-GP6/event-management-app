# Developer 入口

**Status: DOCUMENT_WORKSPACE / NO LIVE APP OR BACKEND.** Frontend 與 Backend 分開管理；目前只建立 source landing zones，不是已完成的程式碼。

| 領域 | 入口 | 責任界線 |
|---|---|---|
| Frontend | [frontend/README.md](frontend/README.md) | Benjamin 的 UI / user journey / API adapter |
| Backend | [backend/README.md](backend/README.md) | Austin 所報交付，source 及 ownership 待核對 |
| Integration | [API checklist](../api/HANDOFF_CHECKLIST.md) | 實際 schema/auth/errors/IDs，未 verified |
| Ownership | [OWNERSHIP.md](OWNERSHIP.md) | Writer/Reviewer 邊界，團隊待審 |
| Current | [CURRENT.md](CURRENT.md) | 唯一當前功能／阻礙／下三步 |
| Requirements | [REQUIREMENTS.md](REQUIREMENTS.md)、[crosswalk](FEATURE_ID_CROSSWALK.md) | US01–US10、新舊 Feature ID |
| Dev flow | [DEV_FLOW.md](DEV_FLOW.md)、[E2E acceptance](../../tests/e2e/README.md) | G0–G6、尚未執行的實測 |
| Document control | [DOCUMENT_CONTROL.md](DOCUMENT_CONTROL.md)、[register](DOCUMENT_REGISTER.json) | source/revision/metadata |
| Existing deliverables | [log-tasks](log-tasks/README.md)、[mock evidence](../../integration/README.md) | 歷史文件及 synthetic capture |

現有 `integration/` frozen evidence 不當作 `frontend/` production source；完整 v1.2.1 工程 ZIP 與可執行 backend 均未驗證導入。
