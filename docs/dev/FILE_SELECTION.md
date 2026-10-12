# 本次文件選擇

Inventory 包括 NU 可見的 canonical workspace、原始 briefs、Working Drafts、SharePoint 移植、handoff、archive、generated aliases。已讀被选取的 Dev 文件與來源；其餘按必要性、公開性及版本排除，不宣稱重新驗收每個歷史附件。

| 類別 | 處理 | 原因 |
|---|---|---|
| 現有 Dev control、requirements、API 和 DEV_FLOW | 選擇必要內容，保留或做明確 successor | 建立同一套閱讀、版本及交接入口 |
| 最新 Developer Word 兩份 | 原 bytes 複製 | 可交 PM 組裝；圖文已有相符 provenance |
| LOG_DOCX source HTML、6截圖、runner、QA、crop、首次失敗記錄 | coherent frozen set | 讓 Word 圖片及測試範圍可追溯 |
| 新 Features Review、User Stories、Overview 原件 | 只用最少摘要、來源指紋及 ID 對照 | 原始 SharePoint 文件不公開複製 |
| 其他角色完整稿、meeting minutes、原始 UI/UX 圖 | 不納入；只建目錄入口 | 避免改寫或公開他人非必要內容 |
| 原始群聊、身份資料、私人 prompts、分享 URL | 排除 | 不屬於 public Dev deliverable |
| v1.2.0 workbench/RAG/portal及全部舊測試 logs | 排除 | 不把整個私人工作區推入 team repo |
| v1.2.1 full/candidate ZIP | 未取得可授權 raw bytes，不入包 | 不重建、不冒充完整 source，也不用舊code替代 |
| v1.2.1 verification / coverage | 明標讀取摘要，非 byte copy | 保留歷史測試界線，不虛構重跑 |
| before_source_capture Word、重複 preview/png、舊ZIP | 排除 | 避免多份互相矛盾的 current |
| runtime、.env、node_modules、cache、QA中間PDF/PNG | 排除 | 可重建或私人執行資料，不屬正式 repo payload |

Canonical paths 中原有文件保持不動。此 repo candidate 自成受控公開子集；文件 ID lineage 記於 DOCUMENT_REGISTER，不聲稱原 cloud 已同步。
