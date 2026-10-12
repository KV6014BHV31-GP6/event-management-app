# v1.2.1 歷史報告摘要

Status：TRANSCRIBED_SUMMARY / NOT_RERUN。這是本輪讀取文件後的衍生摘要，不是原始 JSON/Markdown 的 byte copy，也不是新的測試 run。

來源：NU_Verification_v1.2.1.json、NU_Feature_Coverage_v1.2.1.md，TASK-005，run_id `TASK-005-c4a6305757ea`。來源 raw bytes 在本輪 materialization 被拒絕；讀取內容仍可用作有界歷史引用。

| 項目 | 原報告內容 |
|---|---|
| 整體 status | INCOMPLETE |
| Node | 56/56 |
| Python | 65，PASS |
| RAG | 24/24 |
| Injected DOM | 78/78，320/390/1440；sandbox enabled |
| DOM 儲存 | explicit in-memory test Storage fixture，非真正 browser persistence |
| 正常 navigation | NOT_RUN，ERR_BLOCKED_BY_ADMINISTRATOR |
| backend / human acceptance | NOT_RUN |
| remote_writes / cloud_original_updated | false / false |
| Feature coverage | 舊 SRC04 的17項，不能套到新18項表 |

此報告的56/65/78沒有在本次重新跑過。新一輪文件 hash、連結或 syntax 檢查不提升上述產品驗收狀態。
