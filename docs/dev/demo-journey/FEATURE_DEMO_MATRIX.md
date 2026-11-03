# Feature demo matrix

Status: provisional Owner-admitted scope, no results claimed. Namespace OWNER-DEMO-20261103; original amended-source AC remain separately reconciled. Each semicolon-separated item is required and must receive its own evidence row before G3 PASS. Current GitHub issue AC will be appended without rewriting originals.

| ID | Required sub-features | Program locations (planned where absent) | Mode | Positive / negative / edge test | Video chapter | Result / gap |
|---|---|---|---|---|---|---|
| US01 | Login/logout; Participant private data; Organizer/Leader authorization; Demo account provisioning/deactivation; recovery; own profile display name/language persistence | auth/users; operations accounts | REAL_LOCAL + DEMO_PROVIDER recovery | valid role; foreign record; revoked role/stale token | 01 | NOT_RUN; fixed-SHA evidence required |
| US02 | Create/Edit/Publish; max3 images; online/offline quota; window/state; cancel/postpone; last-place/waiting | events/gallery; operations policy | REAL_LOCAL | valid lifecycle; fourth image; concurrent last place/pending not occupied | 02 | NOT_RUN; fixed-SHA evidence required |
| US03 | Event leader assignment; event referral; operator separate from attributed leader; Direct/Unknown | operations assignments/attribution | REAL_LOCAL | valid referral; forged token; revoked assignment/unknown source | 03 | NOT_RUN; fixed-SHA evidence required |
| US04 | Editable promotion draft; human approval; printable flyer; public WhatsApp share; explicit template provider | EventShare; operations promotion | REAL_LOCAL + DEMO_PROVIDER template | approve/print/share; unapproved draft; long EN/MS content | 04 | NOT_RUN; fixed-SHA evidence required |
| US05 | DB demand/quota/pending/approved/waiting; as-of; stored promotion instruction; traceable alert policy | analytics; operations instruction | REAL_LOCAL | DB reconciliation; foreign owner; threshold boundary/Unknown attribution | 05 | NOT_RUN; fixed-SHA evidence required |
| US06 | Guest/account apply; six fields; optional auth documents; Organizer preview/review/reject/correction | registration; FilePicker; operations review | REAL_LOCAL | authorized preview; forbidden/404; empty/PDF/corrupt/logout stale response | 06 | NOT_RUN; fixed-SHA evidence required |
| US07 | Download event; no-API local forms; queue/readback/refresh; manual sync; per-item receipt; same-ID retry; reconcile unknown | offline queue/sync; demo transport | REAL_LOCAL | 3 forms + reload + sync; lost ACK;404/409/2tabs/quota failures | 07 | NOT_RUN; fixed-SHA evidence required |
| US08 | Cancel/release/waiting; offer acceptance if current admitted AC requires it; confirmations/reminders; Demo OTP and recipient binding | allocation; operations outbox/OTP | REAL_LOCAL + DEMO_PROVIDER SMS/OTP | one cancel; duplicate outbox; wrong/expired/used/abusive OTP; pool boundaries | 08 | NOT_RUN; fixed-SHA evidence required |
| US09 | Independent check-in; roster search; duplicate protection; eligible walk-in/capacity; immutable attendance operation | operations attendance | REAL_LOCAL | approved check-in; cancelled denial; duplicate/concurrent walkin/pending reconcile | 09 | NOT_RUN; fixed-SHA evidence required |
| US10 | Completed-event capacity/bookings/cancelled/arrivals/no-show/walk-in totals; finalize guards | operations closeout | REAL_LOCAL | DB totals; unauthorized finalize; pending sync/duplicate finalize | 10 | NOT_RUN; fixed-SHA evidence required |


## Fresh amended issue AC additions

Source audit read current GitHub issue bodies in this run. Audit labels below are not claimed original IDs (except actual #6 AC-01-01..04).

| Source | Atomic required additions beyond master shorthand | Acceptance state |
|---|---|---|
| #6/#31 US01 | AC-01-01 own records and accountless offline participants; AC-01-02 privileged provisioning and assignment revocation; AC-01-03 inactive-user denial/cached policy; AC-01-04 server ACL/operator audit; invalid/duplicate account rejection and persisted readback | NOT_RUN |
| #11/#32/#33 US02 | Registration windows; capacity cannot reduce below committed places; separate pool limits; cancellation/postponement preserves bookings and correct affected-recipient notices | NOT_RUN |
| #41/#44 US04 | Correct event/link; editable unapproved draft label; authorized approval; print/share; unsupported-share fallback; no invented real AI/send | NOT_RUN |
| #42/#45 US05 | Intended leader instruction readback; threshold traceability; repeat processing emits no duplicate alert; empty/loading/error; no prediction | NOT_RUN |
| #16/#34/#48 US06 | OTP wrong/expired/used/rate-limit; accountless own-result retrieval; correction instruction/audit/recheck; minimum data policy; confirmation only after approval and capacity | NOT_RUN |
| #43/#47 US07 | Accountless assisted capture; local access/cleanup; persistence and rejection/auth-expiry recovery; no OCR | NOT_RUN |
| #35/#36/#37/#46 US08 | Release original pool once; pending cancellation releases none; waiting/offered/confirmed distinct; explicit pool/order/offer acceptance; concurrent accept; own-offer ACL; reminders exclude cancelled and use correct time/recipient; failed/manual-retry outbox | NOT_RUN |
| Owner US03/09/10 | Explicit current master requirements admitted; original-team AC unavailable | original40AC source now admitted; final fixed-SHA acceptance pending |

Inherited automatic waiting→approved promotion alone cannot satisfy #37. Missing originals do not turn the parent story into PASS. G3 requires an evidence row for every atomic criterion above and in the master table.

## Superseding original-source readback

All40 original amended AC are now indexed in AC_MATRIX.json. Earlier unavailable-original statements above are preserved intake history, superseded for story/AC text only. R3 subsequently verified original bytes/hashes, full text and the actual story-map graphic; full Word page-layout rendering remains NOT_RUN. G3 must attach a real evidence receipt to each row; this source update itself changes no test result. AC09 offline attendance, AC01 Organizer provisioning, AC07 assisted correction and AC05 promotion pause are required coordinated additions.

## R3 evidence reconciliation

At fixed2e95f9882b20b39c3e0ee9f17e043cb6df3efc64 the supplemental real browser journey reports20 observed-positive author rows,19 partial and1 validation RED with later valid-path pass. Root G4 separately records actual IndexedDB/lost-ACK/native readback. These are historical author layers, not a sum yielding final40AC PASS. Account recovery/profile and overlength-phone notice repairs require fresh integrated browser/native/independent acceptance. ACCOUNT_CONTRACT_R3.md retains original task-level recovery/profile scope. Current implementation status and raw receipts stay in the external run checkpoint; no CI/merge/localCD/video/UAT claim is created by this document update.

## Released R3 follow-up author layers

FE5f6bd962006e06d3ef8974afd609c28086bcd66c addresses absent-receipt profile/issuance recovery and strict receipt binding. Original protected envelopes are typed, actor-bound and guarded by origin-scoped Web Locks; reset passwords/capabilities remain memory-only. Five initial functional REDs are preserved; author full React221/221 and build pass. Live tab, profile/recovery and final independent acceptance remain separate.

CI63699c80e1247678319c37cc9d71104049b31263 adds a mandatory private-document/Offline E2E helper and native receipt reconciliation. Its AUTHOR_LOCAL proof has authenticated PNG thumbnail/modal/download, three IndexedDB drafts with identical IDs/payloads after reload, zero offline API/Restore autoPOST, one successful batchPOST, lostACK and one original GET, with native1batch/3submissions/3pending records. Three initial harness failures remain preserved; none is relabelled product PASS. Hosted CI and complete PDF/ACL/full40AC/final runtime acceptance cannot be inferred from this bounded layer.

Owner voice revision: formal narration is natural English female; Traditional Chinese and English subtitles remain. The32shot/40AC preproduction mapping has planned times only. Every final feature timestamp must come from actual footage of the accepted merge-SHA artifact after G6. No old canary montage or planned subtitle is G7 evidence.

## Subsequent R3 source and acceptance units

Clarification9 restores the original individual recorded Leader application counts required by T-03-03/T-10-03/AC-10-02. Stats and new closeouts share a database aggregate; owner event scope and assigned-Leader self scope are distinct. Missing legacy snapshot data stays unavailable, finalized snapshots remain immutable, and operator/channel/current assignment cannot invent attribution. FE7bd06d8 has47focused PASS; its original267-case full result265PASS/2FAIL is retained. BE568f1bca adds controlled/native cases for exact aggregates, ACL, threshold boundaries, notices/reminders, FIFO, roster/windows and correction recipient binding. Its52native cases require a separate actual PostgreSQL receipt; declarations and controlled SQLite results are not that receipt.

Login feedback8c701673 and runtime identity4a6ea696 address current failed-login visibility and late actorA completions affecting actorB. Independent REDs use actual runtime/session/manual coordinator with controlled transport; they are not a server authorization-bypass claim. Author runtime initial18RED/15controls became33GREEN, then39runtime cases plus11login cases passed on final bytes. The sole subsequent full synthetic run305PASS/1timeout306 happened before a copy-only fix; the unchanged recovery-review5000ms timeout remains unresolved here. These results do not certify the final candidate, actual Browser, native transactions or all40AC.

The Owner accepted the existing English female voice sample. Full-track listening and final feature timestamps remain unverified. Candidate439838ce hosted CI and its bounded Browser/DB evidence remain historical source-bound evidence; all new integrated changes need their own candidate CI and independent review. Two previously rejected supplemental native GREEN checks continue to block G5 and conditional merge. No native execution is inferred from a helper source review.
