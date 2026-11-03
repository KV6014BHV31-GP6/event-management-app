# 真實 API+DB 最小驗收計畫

## PR38 repair author matrix — 2026-10-27 (current)

See [the bounded repair task](tasks/BE-FE-DEMO-READINESS-20261027.md) for source, failures, contracts and reproduction. New isolated successor branch; no PR38/PR39 mutation.

| Layer | Actual bounded result |
| --- | --- |
| Frontend unit/controller/proxy |239 PASS; parent checks retained, offline read and409 rejection covered. |
| Backend ASGI/SQLite |26 PASS; strict corrected ULID/error assertions and new identity/auth/state/PATCH regressions. |
| Native PostgreSQL |3 opt-in tests PASS: last-slot/repeated-cancel races, rollback fault, unique constraint. |
| Real UI |D1–D7 passed across preserved attempts; Signup/Login/localLogout, image/Create/search/detail/Edit, User/Guest/ownGET/Reload, organizer Approve, A Cancel200 and B promotion with quota1/0. |
| Separate native HTTP |56 requests/59 assertions including negative no-write fingerprints, pending cancel, Offline201 and two-request races. |
| Schema/setup |Explicit old-shape migration twice with rows preserved; duplicate refusal unchanged; fresh standard bootstrap twice preserved all rows. |

Retain initial7 native500, bootstrap failure,2 original stale test failures and subsequent timezone regression failure; Browser capture/fixture failures are individually recorded externally. Do not convert them into clean first-run PASS. Full E2E/Security/UAT/mixed-pool/old Demo migration/video/team review remain NOT_RUN or pending. The matrices below describe older versions.

## Current Austin integration matrix — 2026-10-27

Source and authorization: [current task](tasks/FE-AUSTIN-DEV-INTEGRATION-20261027.md). Fixed Backend `480460b4a2b0902bb8256be02bc7c8d8f13ac6ee`; updated Frontend is the PR #38 increment. Earlier tables below are historical UI_ONLY results, not the current integration status.

| Requirement / risk | Current implementation and test | Actual result / limit |
| --- | --- | --- |
| Separate image/event writes; no duplicate uncertain retry | Multipart upload, strict201 URL; independent Create; controller and real UI | Upload201/Create201 once each; image GET/Reload200. No GCS/production storage claim. |
| Edit identity, partial fields, timestamp precision, trusted readback | Owner GET, minimal PATCH, matching fresh GET; controller fixtures | Fixture PASS; native GET500 disables form, zero UI PATCH; direct PATCH500. |
| Own read/cancel, stale identity, no fabricated persistence | Fresh profile and own GET, confirm action, refresh, identity/epoch tests | Browser GET/Reload200, DB cancelled; exact cancellation POST response not captured. |
| Organizer list/detail/Approve | Role guard, minimal fields, per-record uncertain lock | Reads200; one Approve500, GET still pending. Full waitlist/refill BLOCKED. |
| Quota/status truthfulness | Retained five-state component, strict Austin aggregates, no client allocation | Component PASS. Create response has credible zeros; event aggregate GET500, no live quota/readback success. |
| Existing Signup/Login/Guest/search | Existing tests retained; bounded actual Browser/API regression | Signup201/profile200 and public_id preserved; real search500; Guest/User API201 separately, UI blocked by detail GET500. |
| Proxy containment and method boundary | Exact PATCH, raw multipart, signature/MIME, traversal/junction/body-limit tests | Node HTTP tests PASS; local PNG GET200. No Cookie downgrade or arbitrary proxy methods. |

Final frontend command: `node --test frontend/dev-server.test.mjs <explicit sorted frontend/live/tests/*.test.mjs paths>` ->237/237 PASS, zero skipped, exit0. This includes original10 status fixtures and prior Signup/Guest/W7 checks. Native DB/browser results are not inferred from fixtures. Original bootstrap failed; HARNESS_SCHEMA_SETUP is preparation only. Full E2E/Security/UAT/Backend suite/old migration/video/deployment NOT_RUN. Actual tool capture failures are preserved in the task/external ledger. Required document-control and working/staged/committed diff checks are recorded with the final receipt.

## Developer feature matrix — 2026-10-26

**UI preparation only. Live integration is BLOCKED by the backend admission gate.** Sources: `USER-FE-BOOKING-LIFECYCLE-20261026` and `ASTRA-BACKEND-ADMISSION-20261026`, from Astra run20261026-095026. New verified self-read/cancel/approve/waitlist/quota HTTP contracts=0; READY Backend=null. Sol owns Frontend implementation; Austin owns Backend; Astra owns admission and independent acceptance.

Version key: **F** is freshly fetched `dev@4541c948f8aec68dbbb9500630abc8282a62abca`, including merged PRs #27–30. **UI** is this branch's detached [component](../../frontend/live/booking-state-view.mjs) and [tests](../../frontend/live/tests/booking-state-view.test.mjs) on F; final immutable SHA is in the PR/external receipt. **G** means the blocked Backend candidate versions in the [current task](tasks/FE-BOOKING-LIFECYCLE-20261026.md). Historical native evidence used the older `d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`, not a new lifecycle pairing.

| Feature / requirement | Expected result | Layer / runner | Version | Was / will be tested | Owner and gap |
| --- | --- | --- | --- | --- | --- |
| Signup / inherited P0 repairs | Initialized form gate; trim-empty rejection without changing valid input; typed ULID201; explicit Login | Unit/component, `node --test`, Signup/P0 files | F | Existing assertions rerun within171/171 PASS. [Earlier native evidence](tasks/FE-USER-SIGNUP-20261020.md) remains historical, not rerun. | Sol Frontend; Austin public-role/auth gap; no full Issue completion. |
| Login / session | Fresh profile/expiry/identity checks; explicit re-login; no automatic Guest | Unit/component, `node --test`, session/Guest files | F | Existing assertions rerun PASS; native Login/refresh transport NOT_RUN this round. | Sol Frontend; Austin refresh/Cookie/proxy contract unadmitted. |
| Guest; `SP-US-20261012:US07` | Explicit no-account/no-token201/pending/null actor; no personal storage or uncertain resend | Unit/component, `node --test`, Guest file | F | Existing assertions rerun PASS; [prior native evidence](tasks/FE-GUEST-REGISTRATION-20261020.md) not rerun. | Sol Frontend; Austin duplicate/identity/ownership gaps in G; no Guest cancellation authority. |
| Browse / search / detail / pagination | Anonymous server-backed browsing; validated selected public_id retained | Unit/component/proxy, `node --test`, API/events/W7 files | F | Existing assertions rerun PASS; no native service started. | Sol Frontend; new events candidate search/pairing BLOCKED. |
| Create Event; `SP-FEATURES-20261012:A-01` | Verified organizer only; ordinary user Create POST0; existing field/date/quota validation | Unit/component, `node --test`, Create/role/quota files | F | Existing assertions rerun PASS; new Backend role HTTP authorization NOT_RUN. | Sol Frontend; Austin server enforcement requires admission. |
| Existing authenticated registration | Fresh users/me/bearer; correct event/actor/participant; strict201/pending and one-write locks | Unit/component, `node --test`, W7/Guest files | F | Existing assertions rerun PASS; no native POST/DB writes this round. | Sol Frontend; G duplicate/ownership/schema behavior BLOCKED. |
| Detached status preparation; Refs #36/#37 | Five distinct labels; Unknown for unknown/missing; quota Unavailable; text-only output | Component fixtures, `node --test frontend/live/tests/booking-state-view.test.mjs` | UI | **10/10 PASS**, first actual run; full171/171 PASS. Component example below. | Sol sole writer; no live import or self-registration feature. |
| Own GET / Reload; Refs #36/#37 | Actual own GET after reload; no global organizer list or fake persistence | Planned HTTP/Browser/READ ONLY native PG, after admission | G | **BLOCKED / NOT_RUN**. Later compare actual own GET/reload and ownership with DB under an admitted full pairing. | Austin contract/schema; Astra gate; Sol only after new admission. |
| Cancellation; `SP-US-20261012:US08`, Refs #36 | Actual confirmation/result/error and subsequent GET; no client quota release | Planned real HTTP/Browser/native PG | G | **BLOCKED / NOT_RUN**. Later cover owner/nonowner, repeated request and pending cancellation; deadline/pool rights unresolved. | Austin saved effects/ownership/migration; Astra admission/acceptance. |
| Waitlist/refill; `SP-FEATURES-20261012:A-03`, Refs #37 | B rereads server decision after A cancels; waiting not confirmed; no invented offer/accept | Planned real A/B HTTP/Browser/native PG | G | **BLOCKED / NOT_RUN**. Later prove A-approved/B-waiting saved transitions. Direct auto-approval is not full Issue37 place-offer completion. | Austin ordering/capacity/concurrency; PM policy; Astra gate. |
| Quota; `SP-FEATURES-20261012:A-02` | Only verified server/pool data; capacity not remaining; refill need not increase availability | Component now; HTTP/DB comparison after admission | UI / G | Unavailable fixture checks PASS. Actual quota display/counts **BLOCKED / NOT_RUN**; no calculation or Refs #32. | Sol display only; Austin aggregate/pool contract; PM pending-seat policy. |
| Conditional organizer pending list / Approve | Only if manual Demo needs it and organizer authorization is admitted | Planned authorized HTTP/Browser/native PG | G | **BLOCKED / NOT_RUN**. No action/adapter added; nonorganizer denial and saved states need later evidence. | Austin permissions/service; Astra necessity/admission. |

The full command uses explicit PowerShell expansion of proxy/live test files and preserves `node --test`. No Jest migration or Backend pytest execution. Component fixtures, existing unit/proxy assertions, historical native reports and future native checks are different evidence layers. Full native E2E, Security, UAT and DB restart remain NOT_RUN; historical baseline failure records remain intact. The broader feature catalogue remains in REQUIREMENTS/CROSSWALK; this matrix does not certify the whole course project.

## Completed traceable example — component only

1. **Requirement/risk:** current admission permits five display labels but0 new HTTP contracts. Calling waiting confirmed, calculating remaining from capacity or parsing unknown status as HTML would mislead or create unsafe output.
2. **Test design:** explicit fixtures exercise all five states, unknown/missing/non-string/prototype/coercion inputs, markup/quotes, unverified quota numbers and import/render without network/storage access. A DOM double rejects HTML parsing and interactive elements. These are not captured API responses.
3. **Change/reason:** added `booking-state-view.mjs` and its test file. Exact labels, `dl/dt/dd` with `textContent`, and constant quota Unavailable satisfy the admitted preparation scope. The node stays detached; no page/Session/API/launcher is changed. Both complete added-file diffs are in this PR.
4. **Actual result:** first targeted run10/10 PASS, exit0; full frontend171/171 PASS, exit0. No failure was deliberately manufactured and no historical evidence or expectation was weakened. Document-control and working/branch diff outcomes are recorded in the task/external receipt.
5. **Limit:** the requirement→test→change→result example is complete at component scope only. A complete real cancellation/waitlist example remains BLOCKED; there is no new GET/Browser/DB success claim.

Course source: the user's prompt carries Astra's Task3 read-only requirements at P30/P39/P45, original Word SHA256 `857dda3f5fdde11b9456c2a49c036713cbf882d8932515381cb7c0372ca8f472`. A useful reasonable format is allowed; no runner is prescribed. PM QA rationale, Designer UX/usability plan/case and CyberConsultants Security plan/case remain their work. The source gives Blackboard2026-10-27 11:59pm without timezone and presentation “Week 8 Supervision (Anytime w/c Nov 3, 2026)”; this task does not resolve scheduling or declare team submission complete.

## Historical proposed plan — retained within its original scope

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
