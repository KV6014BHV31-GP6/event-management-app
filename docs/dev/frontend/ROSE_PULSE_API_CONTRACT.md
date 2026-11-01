> Phase 2 is a separate candidate: see [additive contract](../phase2/API_CONTRACT.md). The historical PR55 contract and evidence below remain source-qualified.

# Rose Pulse backend API contract

State: **SOURCE + OPENAPI OBSERVED; bounded direct HTTP/native checks PASS.**

- URL: `http://127.0.0.1:8026`; API prefix `/api/v1`.
- Source: `dcbdf47ed8e4d9b816676df97aaa80015c9e1928` (PR40); backend worktree is clean.
- Detailed machine-readable contract: API_CONTRACT.json (`API_CONTRACT.json`, local evidence). Captured server specification: OpenAPI (`evidence/backend/openapi.json`, local evidence).
- Preserve legacy routes and fields. No W8 module replacement or backend product change was needed.

| Method + path (prefix `/api/v1`) | Permission | Success / response |
|---|---|---|
| POST `/users` | Public; ordinary user only | 201 UserResponse; privileged role403; invalid fields422; duplicate400 |
| POST `/auth/login`, `/auth/token` | JSON / form credentials | 200 access-token response; invalid credentials401 |
| GET `/users/me` | Bearer access token | 200 server-derived id/username/role |
| POST `/auth/refresh`, `/auth/logout` | Existing refresh-cookie / cookie-clearing flow | 200; retained endpoints, frontend uses Bearer + local Logout |
| GET `/events` | Public | 200 `{total_count,page,page_size,total_pages,data}`; `page`, `pageSize`, `status`, `keyword` filters |
| GET `/events/{public_id}` | Public | 200 full EventResponse; malformed400, missing404 |
| POST `/events` | Organizer | 201 full EventResponse; forbidden403, invalid422 |
| PATCH `/events/{public_id}` | Organizer + event owner | 200 full EventResponse; forbidden403; invalid/null/timeline422; capacity conflict409 |
| POST `/events/{public_id}/registrations` | Signed-in actor or Guest with no Authorization | 201 flat RegistrationResponse; invalid token401; duplicate400; ownership conflict409 |
| GET `/me/registrations` | Bearer; own actor records | 200 flat RegistrationResponse array; optional status filter |
| POST `/me/registrations/{id}/cancel` | Bearer + registration actor | 200 flat response; cross-user403; invalid current status400; missing404 |
| GET `/registrations`, `/registrations/{id}` | Organizer role | 200 flat array / record; global across organizers under retained policy |
| POST `/registrations/{id}/approve` | Organizer role | 200 approved or waiting; role403; invalid state/inactive409 |
| POST `/events/{public_id}/offline-registrations` | Leader or organizer | 201 `{detail,synced_records}`; role403; identity/batch conflict409 |
| POST `/files` | Bearer | Multipart `file`, `folder`; 201 `{filename,url,provider}`; extension400 |
| GET/PATCH `/participants...` | Organizer | Existing participant directory/detail/update contracts retained; not a new feature acceptance claim |

`public_id` is a 21-character public event identifier. Registration and participant IDs are strings; do not substitute numeric event `id` for event URLs.

Event Create requires `title`, `location`, `online_quota`, `offline_quota`, `start_time`, `end_time`; optional `overview`, `image_path`. Response retains `id`, `public_id`, `organizer_id`, lifecycle/timestamps and `quota.online/offline/total.{approved,capacity}`, `quota.waitingCount`. Title-only PATCH preserves omitted fields; explicit null for required fields is refused.

Online registration requires `first_name`, `last_name`, `gender`, `date_of_birth`, `phone`, `address`, `national_id`, `income_band_code`, `marriage_status`; `medical_record` is optional. Flat responses retain `id`, `event_id`, `participant_id`, `created_by_user_id`, `channel`, `status`, form snapshot and timestamps. Guest actor/participant user remain null. Guest read/cancel/claim is unsupported.

Offline payload is `{leaderId,applications:[{firstName,lastName,gender,dateOfBirth,phone,address,nationalId,incomeLevel,medicalRecord?,marriageStatus}]}`. The server uses the authenticated actor rather than claimed `leaderId`. This is batch transfer, with actual `offline` channel; it does not establish PWA/service-worker/queue/check-in/OCR/no-show readiness.

Local upload URLs begin `/uploads/`; the isolated frontend safe proxy serves images from `runtime/backend/uploads`. Existing backend upload authentication and configurable storage strategy remain.

| W8 module head | Disposition | Concrete compatibility reason |
|---|---|---|
| Events `2a78284bfa67d5984b410edd54ac74eda2c66630` | Not adopted | New file relationships and split responses; removes Edit/image_path/validation. Branch imports missing files/registrations models. |
| Files `0b59e8bf8620456a82f53d05e13e4d1a90837fde` | Not adopted | Replaces URL contract with DB metadata, omits upload authentication and hardcodes storage path. |
| Registrations `40648478ce6ad2851d6e0d485c53363669e1e24c` | Not adopted | New income/files schema and nested responses; comments out Cancel/Approve/global list. |

All W8 increment files, models/schema/service/API changes, pin history and raw diffs are indexed in W8 audit (`evidence/backend/w8-audit.json`, local evidence). Each module increment adds no migration or tests. No safe standalone delta was required by this React slice; existing search/detail and lifecycle contracts already supply the needed data.

Evidence originals are local-only under `E:\NU_Local_Environment_20261014\rose-pulse-v2\20261102-032509`; local evidence names above are not public download links.
