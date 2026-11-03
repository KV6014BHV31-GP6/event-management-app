# Phase 2 integration contract

This is an additive engineering contract for the isolated Phase 2 pair. It does not replace PR55/PR40 acceptance, approve NGO policy, or authorize a production migration. The complete route/payload/error mapping is [API_CONTRACT.json](API_CONTRACT.json). Fixed tested commits, actual results and limitations belong in the acceptance record.

## Offline write and recovery

`POST /api/v2/events/{public_id}/offline-batches` accepts `contract_version=rose.offline-sync.v2`, one stable UUID `batch_id`, and 1–25 items containing a stable UUID `client_submission_id` and a snake_case application. Only a freshly authenticated current leader or organizer may submit. The server derives the actor; it does not trust a client leaderId. Authentication and ownership apply to receipt reads as well.

HTTP200 contains durable per-item accepted/rejected/duplicate outcomes. Accepted creates an offline **pending** registration. All item receipts and accepted business effects commit together; an unexpected failure or global ID/payload collision rolls the batch back. Individual validation, closed/full-event and identity rejections are durable item results. A synchronized receipt is not approval, a reserved place, current lifecycle status or eligibility confirmation.

Raw JSON fingerprints preserve the distinction between omitted fields, null and empty strings. Object key order is canonicalized; array order remains meaningful. Nonfinite JSON is rejected. A reused ID cannot silently change event, actor or payload. A lost response is an unknown client result: first read the authorized batch/submission receipt, then allow an explicit retry of the **same immutable request and IDs** when appropriate. Never automatically send a new application or regenerate IDs. Historical `registration_status_at_recording` remains unchanged; current status comes from an authorized fresh registration GET.

`GET /api/v2/events/{public_id}/offline-batches/{batch_id}` and `/offline-submissions/{client_submission_id}` provide persisted recovery. Unknown receipt is404, expired/invalid identity401, wrong current role/actor403, immutable-envelope collision409 and invalid envelope422. These codes are not interchangeable with a per-item rejected receipt. Event validity currently means active status; no deadline or eligibility policy is inferred.

## W8 admission

- `POST /api/v2/files`: authenticated multipart `file` and `purpose=event_image|supporting_document`, bounded at8MiB. PNG/JPEG/GIF/WEBP are accepted images; synthetic PDF is also allowed for documents. File purpose, bytes/type and extension are checked.
- `GET /api/v2/files/{id}/content`: a currently associated event image can be public. A supporting document is readable by its owner or the organizer owning its associated event. It is not a public upload URL. Responses use no-store/nosniff; documents download as attachments. React sends Bearer through authenticated fetch and uses a short-lived Blob URL.
- Existing event create/update adds0–3 unique owned `image_file_ids`, and responses add `image_files`. Omitted PATCH retains associations, `[]` clears, null is rejected. Legacy `image_path` and lifecycle routes remain available.
- Existing registration create adds0–3 owned supporting-document `file_ids`. Anonymous Guest can submit without documents; authenticated upload is required. Uploads remain optional while NGO original-document/eligibility policy is unresolved.
- The React participant form changes from nine visible inputs to six: first name, last name, gender, date of birth, phone and National ID. Address, income and marriage are omitted and genuinely nullable; medical record was already absent from the React form. This is9→6 (33.3%), not an approved NGO data-retention policy. Previously stored participant address must survive an omitted address on another application.
- Organizer `GET /api/v2/me/events` and `GET /api/v2/me/registrations` filter ownership on the server. Owner cancellation reuses the existing atomic cancel/promotion lifecycle. Analytics counts persisted own-event rows and includes source, actor, timestamp and definition; it does not represent attendance, community impact or5000 users.

## Offline privacy and runtime boundary

Only synthetic records are authorized. IndexedDB is unencrypted, browser eviction remains possible and a local offline unlock is not server authentication. Explicit logout/account change locks the local workspace; synchronization/download/reconciliation require fresh authentication for the same actor. No token, private API response or application payload belongs in Service Worker Cache Storage. Production encryption/key lifecycle, retention approval, device-loss controls and qualified security assessment are not complete.

Use a production Vite build for Service Worker verification. Localhost is a secure-context exception; an iPhone on a plain HTTP LAN address is not equivalent. Browser offline emulation, owned-service process isolation and physical iPhone hotspot/device testing are separately labelled. Physical procedures are in [PHYSICAL-HOTSPOT-SCRIPT.md](PHYSICAL-HOTSPOT-SCRIPT.md).

## Migration and merge boundary

Migration identity is `rose_phase2_20261102_v1`; the writer maintains `backend/scripts/migrate_phase2.py` and its invocation in the Backend README. It requires an explicit database acknowledgement and records applied identity. Testing isolated empty/legacy-shape synthetic databases does not prove migration of existing Demo or production data. Frontend PR56 depends on Backend PR57 and the existing parent stack. Neither PR is automatically merged. Shared document-register conflicts must be resolved and regenerated against the actual combined payload in a future authorized integration.
