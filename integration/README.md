# Frontend integration 入口

本 PR 交付文件與現有演示證據，不加入新的 production frontend/backend。

已有可檢視的四角色 synthetic Mock：
[ROSE_DEMO_English_v1.2.1_SOURCE.html](../docs/dev/evidence/LOG_DOCX_20261012/ROSE_DEMO_English_v1.2.1_SOURCE.html)。

這是既有畫面 capture 的 frozen source，不是完整 v1.2.1 工程包。原始 HTML 未被重寫或當作已整合 app。可供本機瀏覽，但本輪沒有做正常 URL navigation；其儲存行為依瀏覽器而異，不能承諾 offline persistence。

真正 integration 入口由 [API record](../docs/api/INTEGRATION.md) 開始。先取得 backend branch/full SHA、setup、seed、auth、schemas，再依現有 stack 接 adapter。不要以未提供的 endpoint 或 demo role switch 代替正式授權。

既有 NU v1.2.0 `integration/src/` 保留在原 workspace；本 PR 不將它誤標為最新 v1.2.1 source。待完整 source 可用時另開 code PR，保留這次文件 PR 的邊界。
