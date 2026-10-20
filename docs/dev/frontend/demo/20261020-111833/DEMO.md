# NU Live 功能 Demo

開發分支功能示範，非完整驗收。錄製日期：2026-10-20（香港時間），run `20261020-111833`。

## 影片與實際版本

- 影片：`E:\NU_Local_Environment_20261014\demo-video\20261020-111833\NU_LIVE_FEATURE_DEMO.mp4`
- 時長：**06:22（382.28 秒）**；1920×1080、25fps、H.264／yuv420p、MP4 faststart，無音訊；8.86 MiB。
- 真實 Chrome 瀏覽器錄影：主畫面 1440×900，窄視窗 390×844；按比例放入 1080p。繁中解說字幕後製在畫面下方獨立 120px 區域，沒有修改產品 DOM。
- Repository：`KV6014BHV31-GP6/event-management-app`。
- Frontend：`dev_fe_create_event_role_guard`，完整 SHA `7fad81c227d1817c8cdc9e465e1e5dcaa4afaf25`；worktree `E:\NU_Local_Environment_20261014\create-event-role-guard\20261020-101830\role-worktree`。錄影 port **5190**，proxy → **8017**。PID／工作路徑已核對，18 個 served files 與 worktree bytes 完全一致。
- Backend：獨立 `dev_be_registrations` 來源 worktree（本地 detached），完整 SHA `d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`；port **8017**、PID **13376**，實際 cwd 為 `w7-preflight\20261020-021249\backend-worktree\backend`。專用 native PostgreSQL 資料庫 `nu_w7_20261020_021249`。
- 遠端 PR #27 Head `6ab9d531582b9528ded977f48b8c158403f8b8ce`；#28 Head `189dbe07fafddc793373abb36573805b3c471940`；#29 Head 為上述 Frontend SHA。開始及結束唯讀核對均是 Open／Draft，#29 包含 #27／#28 最新 Head，沒有父分支遺漏修正或遠端變動。

## 成片章節時間碼

以下來自實際成片字幕／剪輯時間，取整至秒。

| 時間 | 章節 |
|---|---|
| 00:02 | 匿名瀏覽 |
| 00:59 | 活動詳情 |
| 01:09 | Organizer 建立活動 |
| 02:13 | Signup 入口（工具暫停前） |
| 02:30 | Signup 接續、建立帳戶與手動登入 |
| 03:10 | 普通用戶角色限制 |
| 03:27 | 普通用戶線上報名 |
| 04:32 | 重複申請錯誤 |
| 04:46 | 窄視窗示範 |
| 05:01 | 錯誤提示 |
| 05:41 | 已知問題與邊界 |

## 真實展示結果

匿名 Events API 載入、搜尋 Alpha、無結果、Clear search、6 筆分頁 Next／Previous、Refresh、活動詳情均已展示。Organizer 透過 Login 與 `/users/me` 驗證 `role=organizer`，顯示 Create event；七欄表單只提交一次，HTTP **201**，顯示活動及 public_id，回列表 Refresh／Reload 後同一活動仍可讀回。Logout 後入口消失，列表仍公開。

Signup 前以 CDP 確認真正 `signup.mjs` submit listener 已初始化，再輸入正常合成 username；真實 HTTP **201**，表單停用、密碼清除、沒有自動登入。手動登入後 `/users/me` **200**，核對同一 id／`role=user`，返回原選活動。普通 user 沒有 Create event，直接頁面顯示 **Organizer account required.**、fieldset disabled；該普通用戶沒有 Create Event POST。

同一普通 user 使用同一個本輪新合成 Participant，兩次報名分別 HTTP **201**，兩份收據均為 **pending**。同一活動重複提交一次 HTTP **400**，沒有成功收據；另一未登入 Signup 頁重複 username HTTP **400**，沒有成功訊息；錯誤密碼一次 HTTP **401**，其後正確登入、Logout，回到匿名 Events。390px 畫面只示範 responsive 排版。

## 本輪合成資料 reference

- 新普通 user：`nu_demo_1020_111833`，id `01M5BNPVBQ2QQ4ECFK3Y6VRVQM`，role `user`。密碼只保留在輸出目錄外的本機受限 private 檔，沒有錄入明文或交付文件。
- 唯一新活動：`NU Live Demo 20261020-111833`；id `11`；public_id **`bGKteth3sHEA9ePhN6wy6`**；2027-03-15 10:00–12:00（香港），online quota 20／offline 0。
- 新 Participant：`SYNTH-DEMO-20261020-111833-A`，id `01M5BNREGVD956W6HFDHGZGPRY`；其餘表單值亦全為合成資料。
- 第一份 Application reference：**`01M5BNREHRZN00J9QY0EAN1NPA`**，活動 `bGKteth3sHEA9ePhN6wy6`，pending。
- 第二份 Application reference：**`01M5BNSEJA220RF67T7EMMTDQN`**，重用既有活動 `jfxvxFRhrizlmmTC0UF77`，pending。
- 唯讀資料庫前後核對：users **5→6**、events **10→11**、participants **1→2**、registrations **9→11**。兩份報名屬於同一新用戶／Participant；兩次重複拒絕沒有新增成功紀錄。

## 已知問題與驗收邊界

以下五項仍存在於本次固定版本的來源；本輪沒有漏洞寫入探測，也沒有把正常流程影片當成修復證明：

1. Signup JavaScript 未初始化時，原生表單可能 GET 傳送 username／password（`signup.html` 的初始 form 未 fail-closed）。
2. 全空白 username 的 Signup 與 Login／Profile 驗證不一致（`signup.mjs`／`api.mjs`）。
3. Signup 回應 id 缺少嚴格字串型別檢查，regex 有 coercion 風險（`api.mjs`）。
4. Backend Create Event 仍只驗登入，沒有強制 organizer（`events/router.py`）。
5. 公開 Signup schema 仍接受 organizer／leader role（`users/schemas.py`）。

本片角色段落只證明 Frontend 限制。**pending 代表收到申請，不保證名額；目前沒有本人報名 GET／Reload readback**，影片只展示當次提交收據及離頁前 reference。資料庫唯讀核對不等同產品提供本人收據讀回功能。

Complete native E2E、Security、UAT、完整 Backend／Frontend 測試套件及多裝置驗收：**NOT_RUN**。local Astra 保留獨立驗收與最終決策權。本片不是 Merge approval。

## 錄影、剪輯與播放核驗

真實 raw WebM 分段原速串接，沒有生成 UI、mock API、截圖輪播、重放寫入或時間加速。第一段在 Signup 輸入前，錄影工具的 CDP `Debugger.getScriptSource` 因尚未 enable 而停止；失敗記錄與 raw 保留，修正的只有 repo 外錄影工具。後段沿用同一個已建立活動，重新導航接續，沒有重建或把此工具問題描述為產品失敗。獨立匿名窄視窗片段放在最終錯誤／結尾章節前，所有資料寫入因果順序保留。

執行記錄（均為本輪，腳本在 `work/`）：`node record.mjs` 在上述工具檢查停止；`node record.mjs signup` 完成其餘實際 UI 流程；`python -X utf8 render.py` 編碼及全片解碼通過；`node playback.mjs` 以 Chrome **1× 原速完整播放至 ended**，實際 9557 個影格、media error 無、corrupted frames 0、播放器 dropped frames 5。開頭、Signup、角色限制、兩份收據、窄視窗與結尾已取樣視覺檢查，字幕可讀、沒有遮住產品訊息或觀察到敏感內容外洩。全片 blackdetect 沒有發現持續 0.3 秒以上、98% 畫面為黑色的片段（兩側留黑與字幕區域屬正常排版）。

`setup.py db before/after`、`closeout.py data` 的唯讀資料核對通過；`setup.py integrity` 確認所有既有 worktree／環境檔未變；`closeout.py remote` 確認遠端未變；`closeout.py stop` 僅停止本輪 5190（PID 23256），既有 5188／5189／8017 PID 保留。

沒有修改產品、Backend、依賴 pins、環境或資料庫結構；沒有 commit、push、PR／Issue／Board 更新、Merge、部署或外部上傳。必要原始錄影、HTTP 狀態摘要、工具失敗記錄及播放結果保留於 `work/`；沒有 request body、token 或 Authorization 內容。

影片 SHA256：`5060ccbf2c40c3001807966d1fa13975fb83a6816b83b7fc9aa84d6e734c3489`。
