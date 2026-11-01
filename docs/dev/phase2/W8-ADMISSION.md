# W8 selective admission and field decisions

Status: engineering working baseline, not complete W8/NGO acceptance. Owner supplied a W8 meeting overview on2026-11-02: improve visual consistency/readability; reduce unnecessary registration fields and clarify eligibility/supporting documents; allow participant WhatsApp sharing; replace OCR with disconnected form capture and synchronization. Remaining quota/event notices/phone verification, promotion/demand reporting/notifications and approval improvements continue as R2 work. Designer and Security tasks remain distinct; this implementation does not sign them off.

| Requirement/source | Current PR55 baseline | Admitted increment | Acceptance / remaining limit |
|---|---|---|---|
| Offline capture/sync, Issues43/47 + OwnerW8 | Legacy201 count-only batch, no browser queue | Synthetic PWA + IndexedDB + additive durable v2 sync/receipt APIs | O01–O04/P01–P04; physical device/security/realPII separate |
| Event images, PR51 source; Owner max3 | Single authenticated image_path | Add max3 actual file associations while preserving legacy image_path/PATCH | W01 upload/replace/remove/Reload/nativeDB; max3 is Owner bound, not attributed to lecturer |
| Optional supporting docs, PR54 schema max3; Issue48 | No live supportdoc UI | Up to3 private authenticated files, registration association and authorized read | W02 owner/event-organizer ACL; uploads optional, on-site original policy unresolved |
| Reduce unnecessary fields, W8/#48 | Nine visible React inputs; medical already absent | Default form9→6 visible fields; address/income/marriage nullable | W03 actualNULL migration in both applicable tables; no fabricated hidden values; formaleligibility/DOBpolicy pending |
| Organizer quota/review/reporting | Global organizer review, owner Edit; no live analytics | Preserve lifecycle; owner event cancel, DB aggregates with actor/source/as-of | W04; analytics is registrations, not attendance/referral impact |
| Participant WhatsApp sharing, OwnerW8 | No share action | Explicit user-triggered public event title/link | No sending on user behalf; localhost links not public URLs |
| Phone verification/SMS/reminders | No approved provider | No fake OTP/delivery; provider integration deferred | BLOCKED_PROVIDER; cost/consent/delivery evidence absent |
| English/Malay, Phase2Owner | English only | Central EN/MS resources, fallback/persistence/Intl/labels | L01; LANGUAGE_REQUIREMENT_PENDING and qualified translation review pending |

The latest source module merge heads are events2a78284bfa67d5984b410edd54ac74eda2c66630, files0b59e8bf8620456a82f53d05e13e4d1a90837fde and registrations40648478ce6ad2851d6e0d485c53363669e1e24c. PR51/53/54 were merged only into those module branches. Their full replacements remove PATCH/Cancel/Approve/list behavior or upload authentication and change dependent schemas. The work uses additive adaptations with explicit tests, not wholesale branch adoption.

| Original field | UI proposal | Backend required after migration | Decision/basis |
|---|---|---|---|
| first_name,last_name | Retain | Yes | Existing participant identity contract; no approved merged-name change |
| gender,date_of_birth | Retain provisionally | Yes | Existing model requirement; DOB/eligibility policy still needs review, not declared NGO mandatory |
| phone,national_id | Retain provisionally | Yes | Existing contact/dedup contract; do not substitute fake defaults |
| address | Remove from default form | No, NULL in Participant and Registration | No quota/eligibility dependency; exact identity reuse still distinguishes NULL from a previously supplied address |
| income_band_code | Remove from default form | No, NULL allowed | No approved mandatory income options; preserve legacy supplied values |
| marriage_status | Remove from default form | No, NULL allowed | Nonessential collection reduction, preserve legacy values |
| medical_record | Omit default form | Already optional | No new medical collection; no eligibility automation |

Six visible fields instead of the verified nine is33.3% reduction. The earlier proposal's10→7/30% denominator was incorrect for PR55 React and is corrected here before acceptance. Medical was already absent from that UI. Supporting documents are optional controls, not hidden fabricated form values. The engineering decision does not establish a lawful/approved production data-minimization policy. Only synthetic data is used.
