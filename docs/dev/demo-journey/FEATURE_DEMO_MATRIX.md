# Feature demo matrix

Status: provisional Owner-admitted scope, no results claimed. Namespace OWNER-DEMO-20261103; original amended-source AC remain separately reconciled. Each semicolon-separated item is required and must receive its own evidence row before G3 PASS. Current GitHub issue AC will be appended without rewriting originals.

| ID | Required sub-features | Program locations (planned where absent) | Mode | Positive / negative / edge test | Video chapter | Result / gap |
|---|---|---|---|---|---|---|
| US01 | Login/logout; Participant private data; Organizer/Leader authorization; Demo account provisioning/deactivation; recovery | auth/users; operations accounts | REAL_LOCAL + DEMO_PROVIDER recovery | valid role; foreign record; revoked role/stale token | 01 | NOT_RUN; fixed-SHA evidence required |
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
| Owner US03/09/10 | Explicit current master requirements admitted; original-team AC unavailable | original source coverage BLOCKED; Owner requirement execution NOT_RUN |

Inherited automatic waiting→approved promotion alone cannot satisfy #37. Missing originals do not turn the parent story into PASS. G3 requires an evidence row for every atomic criterion above and in the master table.
