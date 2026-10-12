# 新舊 Feature ID 對照

**Status：OBSERVED source difference；對應關係為 Dev 比較建議，待團隊 review。**

來源 `SRC04` 的舊草案及 v1.2.1 coverage 使用 **17** 個 Feature。新匯入的 `SP-FEATURES-20261012`（Features Review.docx）列出 **18** 個：P 4 個、L 4 個、A 5 個、F 3 個、M 2 個。匯入較新不等於內容已批准，也不能據此斷定原件撰寫日期。

## Admin 編號變動

| 舊 SRC04 | 新 SP-FEATURES-20261012 | 比較結果 |
|---|---|---|
| 沒有獨立的同名 A-ID | A-01 Event Creation & Publication | 新表把 event creation/publication 單列；舊 US01 已涉及 event setup，不把它當作全新批准需求 |
| A-01 Timeslot / quota allocation | A-02 Dynamic Timeslot & Quota Allocation | 最接近的意圖對應，細節仍需核對 |
| A-02 Waitlist refill | A-03 Automated Waiting List Auto-Fill | 候補，需確認 auto-confirm vs offer、pool 及 SMS policy |
| A-03 Referral analytics | A-04 Full-Channel Referral Analytics Dashboard | Attribution / conversion，不以 aggregate dashboard 代替 |
| A-04 Attendance prediction | A-05 Attendance Predictor & Risk Alerts | 新表仍標 do we need，沒有批准實作 |

P-01 至 P-04、L-01 至 L-04、F-01 至 F-03、M-01 至 M-02 的 ID 集合未增減，但字句、必要性及驗收內容仍需按版本核對。相同 ID 不自動證明完全相同 requirement。

## 新表的 18 項索引

| ID（均屬 SP-FEATURES-20261012） | 原表名稱 | 保留的待決界線 |
|---|---|---|
| P-01 | Zero-Barrier Registration | Name/IC/Phone 都帶問號，不能改成必填批准 |
| P-02 | Eligibility & Anti-Duplicate Filter | do we need；不自行收集 screening history 或判斷醫療資格 |
| P-03 | Multi-Language Support | do we need；不宣稱三語已交付 |
| P-04 | Self-Service Booking via SMS | do we need；token、改時段、權限和 expiry 未定 |
| L-01 | Leader Account & Reserved Quota | Authentication 與多 leader quota 未驗證 |
| L-02 | Fast-Track Proxy Registration | Server 接受後才清空輸入；欄位未定 |
| L-03 | AI Smart Outreach Generator | 原表技術列 template/Canvas 選項；標題不等於必須接外部 AI |
| L-04 | Lightweight WhatsApp Outreach Reporting | 簡單 form 或 WhatsApp API 是選项；派單數不等於已接觸人數 |
| A-01 | Event Creation & Publication | 狀態、時區及 edit 權限待 contract |
| A-02 | Dynamic Timeslot & Quota Allocation | 各 pool 總額不能超 capacity |
| A-03 | Automated Waiting List Auto-Fill | SMS、排序、晉升方式及 transaction 未驗證 |
| A-04 | Full-Channel Referral Analytics Dashboard | 唯一 referral、click、registration conversion 未交付 |
| A-05 | Attendance Predictor & Risk Alerts | do we need；RSVP/模型未批准 |
| F-01 | Offline-First Check-In (PWA) | newly added/not yet discussed；US09 的弱網意圖不等於選定 PWA 實作 |
| F-02 | Live Walk-In Capacity Calculator | booked/checked-in 不能重複扣減；有效予約集合及政策未定 |
| F-03 | Automated No-Show Slot Release | newly added/not yet discussed；20–30 分鐘不是批准規則 |
| M-01 | Two-Way SMS Reminder & RSVP | 24–48h 與交接的 24h 要確認；雙向 RSVP 未討論 |
| M-02 | Instant System Notifications | channel、provider、retry、consent 和 delivery proof 未定 |

## 使用方式

新 task 的 feature reference 寫完整 `SP-FEATURES-20261012:A-02`；User Story 則寫 `SP-US-20261012:US01`。引用舊測試或文件时保留其 `SRC04:A-01`，並另外記 successor，不修改歷史證據中的 ID。

兩份保留的 Developer Word 按 US01 至 US10 描述功能；其中引用舊 v1.2.1 coverage 的17項計數只可視為歷史版本。不得用舊 coverage 計算新表完成率。
