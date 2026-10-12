# 目前 Dev repo 導入狀態

文件包版本：`repo-docs/0.1.0`。整理日期：2026-10-13，Asia/Hong_Kong。Active task：[PR-PREP-20261013](tasks/PR-PREP-20261013.md)。

這是 repo 導入 candidate 的狀態，不覆寫 NU cloud 的 v1.2.0 CURRENT，也不將 v1.2.1 frontend candidate 升級成正式 release。

| 項目 | 狀態 | 證據邊界 |
|---|---|---|
| 文件選擇與目錄 | PREPARED_LOCAL | Dev 為主，其他角色只加入口 |
| Source 版本核對 | LOCAL_VERIFIED | v1.2.0 register 的 70 個受控檔案 bytes 相符；不是 70 個功能測試 |
| Feature ID 衝突 | OBSERVED | 舊 SRC04 17 項，新 SP-FEATURES-20261012 18 項；已加入來源 namespace 對照 |
| Developer Word | PRESERVED_DRAFT | Log Task 1 共 7 頁，Log Task 2 共 9 頁；保留選定來源 bytes |
| Screenshot 證據 | HISTORICAL_LOCAL_MOCK | 原有 12 個 UI checks、六張圖及 HTML source；本次只核對檔案與展示來源 |
| v1.2.1 工程完整原包 | BLOCKED | 文件庫回報不能取得授權 raw bytes，沒有重建或偷偷以 v1.2.0 代替 |
| Target repo | OBSERVED_EMPTY | 本次 API 讀取 public repo，branches=[]、pull requests=[]；角色 metadata push=true |
| Remote write | AUTH_VERIFIED / PUSH_PENDING | 2026-10-13 本地 gh 已確認 beeawanegd、WRITE 權限及 main default branch；歷史 connector 403 保留為歷史，未以權限 metadata 冒稱成功 push |
| Branch / push / PR | REMOTE_NOT_CREATED | 交付包提供本地 branch 與 Git bundle；遠端 SHA、PR number/URL 尚不存在 |
| 真實 backend / DB / offline / SMS | NOT_RUN | 沒有核對到可執行 backend source 或 runtime contract |
| Team scope / production acceptance | NOT_ACCEPTED | 無 PM、Designer 或 Security sign-off |

文件檢查結果存 [validation receipt](evidence/PR-PREP-20261013/VALIDATION.json)。本機 Git SHA 存交付包外層 `DELIVERY_RECEIPT.json`，避免在 commit 內反覆自我引用。GitHub 最後檢查時間由交付回條記錄。

## 下一步

1. 本地 CLI 已核對 beeawanegd 授權；Push 前再次檢查 Remote 為空，再重用 Bundle main 及 Developer history，正常 Push 並建立 Draft PR，最後 Fetch 核實。
2. PM/Dev 確認新舊 Feature 對照、未決政策及該版本的使用範圍，不沿用裸 A-ID。
3. 取得 backend full SHA、setup、seed 及 request/response/auth contract，才開始真實報名→回條→取消→名額驗收。
