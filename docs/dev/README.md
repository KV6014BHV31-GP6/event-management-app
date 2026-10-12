# Developer 入口

主要維護範圍：Benjamin 的 frontend、integration readiness、Developer 文件及測試設計。Backend 交付與 ownership 依實際團隊紀錄確認。

先讀 [CURRENT](CURRENT.md) → [REQUIREMENTS](REQUIREMENTS.md) → [Feature ID 對照](FEATURE_ID_CROSSWALK.md) → [API 交接](../api/INTEGRATION.md)。

| 工作 | 使用文件 |
|---|---|
| 規劃最小可用流程及 G0 至 G6 | [DEV_FLOW](DEV_FLOW.md) |
| 準備真正 API+DB 驗收 | [TEST_PLAN](TEST_PLAN.md) |
| 取得 Log Task 1、2 | [log-tasks](log-tasks/README.md) |
| 核對來源與版本 | [Document control](DOCUMENT_CONTROL.md)、[Source register](SOURCE_REGISTER.json) |
| 查看本次篩選及排除原因 | [File selection](FILE_SELECTION.md) |
| 保存決策／新工作 | [Decisions](DECISIONS.md)、[Task template](tasks/TEMPLATE.md) |

現有演示只作 synthetic Mock，位置見 [integration](../../integration/README.md)。這個 PR 不把不完整或不能取得原始 bytes 的 v1.2.1 工程 ZIP 冒充可重現 app source。
