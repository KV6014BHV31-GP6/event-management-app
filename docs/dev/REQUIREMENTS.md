# Developer requirement working baseline

**Status：working-baseline，未獲全隊 sign-off。**
本輪比對 `SP-OVERVIEW-20261012`、`SP-US-20261012` 及 `SP-FEATURES-20261012`。來源在 [SOURCE_REGISTER](SOURCE_REGISTER.json)，Feature 必須配合 [版本對照](FEATURE_ID_CROSSWALK.md)。這是摘要，不改寫原始課程題幹。

## 問題與範圍

收到的 ROSE 問題描述聚焦低資源社區活動：人員和供應有限，出席過多或過少，社區宣傳缺乏可追蹤結果，部分參加者沒有良好網絡或設備。Developer 目標是連接宣傳、無帳戶報名、名額判定、到場及營運回顧，而不是泛用售票商城。

## 十個 User Stories

以下 US 均屬 `SP-US-20261012`。現狀來自已保留 Mock/文件，不是完整 Story 驗收。

| US | 意圖摘要 | 現有範圍／缺口 | 真正完成的必要證據 |
|---|---|---|---|
| US01 | 建立發布 event、timeslot、quota、waitlist | Mock 單一 session/quota；多時段與 server 未驗證 | DB transaction 防最後名額競態、取消後正確補位 |
| US02 | 每位 leader 的唯一 referral link/QR | 固定 DEMO-LEADER，沒有真實 attribution | 唯一來源與 registration 關聯、造假来源不授權 |
| US03 | 報名／出席／宣傳回報 dashboard | 單機合成統計，不是 live analytics | 數字追溯 DB，自報派單與 conversion 分開 |
| US04 | WhatsApp 文案及帶 referral 的 flyer | 固定 template、copy/print 概念 | 正確 event 資料、有效唯一 QR/link、可用性 review |
| US05 | 回報線下宣傳活動 | Mock printed flyer self-report | 授權、日期/channel schema、server 去重；此處 offline 指線下活動 |
| US06 | 使用 leader reserved quota 快速代報 | 一位合成 leader；無真實 staff login | 多 leader 分權、名額 transaction、成功後下一筆输入 |
| US07 | 無帳戶 mobile 報名及防重複 | DEMO 身份選單/回條，不是正式姓名電話驗證 | 最少資料、guest 權限、idempotency、server 回條 |
| US08 | SMS reminder 與簡單取消 | Mock cancel；無實際 SMS | token/expiry/replay、DB 取消、provider delivery audit |
| US09 | 弱網下 QR/phone 查找及簽到 | pending/retry/conflict Mock；非真實多裝置 sync | 選定設計後的斷網、重啟、重送和衝突驗收 |
| US10 | 釋放過期/no-show 名額給 Walk-in | Mock 明確阻擋未批准的釋放 | PM 定義 grace/expiry，server 正確計算與分配 |

## 需保持的工程原則

Server 才能確認名額；各 pool 合計不超 total capacity。checked-in 是 confirmed 的子集，不重複扣額。相同 operation key 重試只產生一次副作用，timeout 以原 key 查詢未知結果。取消不得重複釋放，多裝置使用舊快取也不能自行確認。

Guest 無帳戶不等於資料公開。Staff/leader 有明確授權；numeric ID 不足以查閱或修改他人紀錄。正式欄位、retention、同一電話多位家庭成員及資料去重規則由團隊決定。

## 未決政策及範圍

PM/Dev/Security 需確認：欄位與驗證、候補的 pool/order/offer/auto-confirm/expiry、Walk-in/no-show、offline queue 與保存時間、提醒時區和24h或24–48h、語言範圍及正式 frontend stack。

醫療資格判定、screening history、預測、外部 AI/OCR、雙向 RSVP 及自動釋放不在本次文件整理中啟用。新來源有18項不表示全部18項都應實作。

第一個實際整合目標：guest request → server quota decision → persisted receipt → cancel → refreshed capacity。詳見 [驗收計畫](TEST_PLAN.md)。
