# 真實 API+DB 最小驗收計畫

Status：PROPOSED；以下產品測試全部 NOT_RUN。這個 PR 的 Python 檢查只驗證文件，不能代替這張表。

前置：frontend/backend full SHA、nonproduction setup、synthetic seed、reset 方法、同意的 contract、角色及候補/取消政策。沒有 endpoint 時先由 backend owner 提供，不自行杜撰。

| Test | 來源意圖 | 情境 | 可接受結果 |
|---|---|---|---|
| BOOK-01 | SP-US-20261012:US07 | Guest 無帳戶請求並重新整理 | 由 server 決定狀態；DB 回條一致 |
| RACE-01 | SP-US-20261012:US01 | 同一 pool 剩一位，20 個有效不同參加者並發 | 新 confirmed 不超過一筆，total 不超 quota |
| RETRY-02 | SP-US-20261012:US07 | 同 key/payload 重送三次，再以同 key 改 payload | 原操作只有一次副作用；不同 payload 衝突被拒絕 |
| TIMEOUT-03 | SP-US-20261012:US07 | DB commit 後丟失 response | 以原 operation key 查回結果，不新增第二筆 |
| CANCEL-04 | SP-US-20261012:US08 | 同一 booking 並行取消兩次 | 只釋放一次，按批准政策最多晉升一位 |
| STALE-05 | SP-US-20261012:US01 | 舊 UI 顯示有額，但已滿或 event cancelled | Server 阻止額外 confirmed，UI 顯示真實原因 |
| OFFLINE-06 | SP-US-20261012:US09 | 斷網簽到、重啟、恢復後重送兩次 | 按批准儲存政策保留 pending；server 去重，conflict 可見 |
| ACCESS-07 | SP-US-20261012:US06/US07 | Guest 猜另一回條 ID；leader 使用另一 pool | 拒絕越權讀寫及名額使用 |
| ROSTER-08 | SP-US-20261012:US09 | 兩個裝置對同人簽到，另用過期 roster | 不多算到場，過期/衝突處置明確 |
| POLICY-09 | SP-US-20261012:US10 | 未批准 grace policy | Walk-in/no-show 不自動啟用 |

每次測試保存來源 namespace、operation ID、command、環境、兩端 SHA、expected/observed、時間、結果與 reviewer。測試資料只用 synthetic，輸出遮蔽 auth headers、tokens 和個資。
