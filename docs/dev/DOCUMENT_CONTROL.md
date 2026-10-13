# Document control

版本：`repo-docs/0.2.0`，working-baseline。這是現有 NU 控制制度的 public repo 子集，不取代原始檔庫或批准整體產品。

## 記錄的權威範圍

| 記錄 | 管甚麼 | 不代表甚麼 |
|---|---|---|
| [SOURCE_REGISTER.json](SOURCE_REGISTER.json) | 來源 ID、來源類型、可用 bytes、指紋及原件是否隨包 | PM 已批准、所有來源 raw bytes 都已核驗 |
| [DOCUMENT_REGISTER.json](DOCUMENT_REGISTER.json) | 本 PR 選定檔案的 ID、owner、revision、status、dependencies、SHA256、變更史 | 功能已完成或資料庫可用 |
| [CURRENT.md](CURRENT.md) | repo 導入 candidate 當前進度、blockers、下一步 | 全域 cloud CURRENT 已被同步修改 |
| [DECISIONS.md](DECISIONS.md) | 本次取捨和 successor | 刪除原有決策或代替他人批准 |
| [tasks](tasks/TEMPLATE.md)、[驗證回條](evidence/PR-PREP-20261013/VALIDATION.json) | 實際範圍、command、結果、未做事項 | 歷史結果被重新執行 |

內容狀態：`draft`、`working-baseline`、`accepted`、`superseded`。執行證據狀態另外記錄。只有具名 reviewer 的明確批准才可標 accepted。角色 placeholder 一律 draft，沒有自動認領他人工作。

## Source ID 與 Feature ID

來源 `SRC04` 保留舊編號，新匯入 Feature 表使用 `SP-FEATURES-20261012`。例如 `SRC04:A-02` 是候補，而 `SP-FEATURES-20261012:A-02` 是 timeslot/quota。先核對 [crosswalk](FEATURE_ID_CROSSWALK.md)，不得做全域字串替換。
原始來源 hash、source ID 不因輸出改路徑而變；本輪衍生文件有自己的 hash。可取得的原件先計算 bytes；只有舊 register 的 hash 則明標 recorded-not-rehashed。

## 變更順序

先讀當前正文及 diff → 確認 owner 和來源 → 修改最小範圍 → 寫 task/decision → 執行測試 → 以明確原因 refresh register → 再 check → commit。

```bash
python scripts/refresh_document_register.py --reason "描述已 review 的正文改動"
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
```

Refresh 只更新已登記檔案的 bytes/hash/revision，保留原 ID、owner/status、dependencies 及舊 hash。它拒絕新增或遺失檔案，須先人工登记 metadata；不能自動批准新內容。
Register 自身不放進自身 hash。`.git`、`__pycache__`、`.env` 及 runtime 輸出均不屬於 payload；validator 額外拒絕未登記的交付檔。最終外層交付回條記 register hash 和 Git SHA。

## 公開發佈邊界

本次已觀察 repo 是 public。只提交選定 Developer 衍生資料、synthetic 截圖及必要控制文件。原始 SharePoint、群聊、學生資料、過時 ZIP、raw prompt、私人 share links 和真實個資不入 repo。
DOCX 保留指定原件，不合併整隊的課程稿。圖片與 embedded figures 保留來源，既有失敗 capture log 留作歷史，不藏起失敗紀錄或改成 PASS。
``.gitattributes`` 保留檔案 bytes；不讓平台換行轉換破壞已核對指紋。新增 code 請經獨立 PR 檢查相應 text policy。

## Remote 工作

只開獨立 branch、push、PR；不 merge、不 force push、不部署。最小 README 初始化只適用重新核對為空的 repo。收到他人新 commit 時先比較；不得覆寫現有 branch 或把本機基線當成真正 remote HEAD。

## DEV-SPLIT-20261013 successor

Root `frontend/` and `backend/` contain README-only source landing zones. The actual Developer workstream notes are `docs/dev/frontend/README.md`, `docs/dev/backend/README.md` and `docs/dev/OWNERSHIP.md`; API and E2E receipt requirements are linked rather than copied into competing CURRENT files. New files require explicit document IDs, working owners, `draft`/`working-baseline` status and checked SHA256. Old PR-PREP remains a historical task, while `CURRENT.md` describes PR #1 as merged.

Document-control PASS proves file/metadata/link consistency only. The absence of backend source means app, HTTP, DB, SMS and offline E2E remain NOT_RUN. See [active task](tasks/DEV-SPLIT-20261013.md).
