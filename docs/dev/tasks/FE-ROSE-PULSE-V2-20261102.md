# ROSE PULSE V2 React integration

Status: working-baseline; LOCAL_VERIFIED with bounded independent Browser/API/native PostgreSQL acceptance. Draft PR55 is delivered; no team acceptance. Source namespace `USER-ROSE-PULSE-V2-20261102`; no team approval or merge authorization.

## Source and ownership

Latest fetched dev is `480460b4a2b0902bb8256be02bc7c8d8f13ac6ee`. This increment starts from the unmerged, repaired PR40 `dcbdf47ed8e4d9b816676df97aaa80015c9e1928`, branch `fix/pr38-demo-readiness`, preserving PR38 and its Austin source. The frontend Draft PR is deliberately stacked on PR40, avoiding duplicate parent changes. No existing React candidate was found in registered worktrees, remote branches or open PRs.

W8 PR51/53/54 were merged only into events/files/registrations module branches, at `2a78284bfa67d5984b410edd54ac74eda2c66630`, `0b59e8bf8620456a82f53d05e13e4d1a90837fde`, and `40648478ce6ad2851d6e0d485c53363669e1e24c` respectively. These are compatibility inputs, not a claim that dev includes their changes. The [API contract](../frontend/ROSE_PULSE_API_CONTRACT.md) records selective admission and exclusions. W8 files omit upload authentication; events remove PATCH; registrations remove Cancel/Approve/global list and change model/response shapes. No Backend product change or empty Backend PR was required.

Sol A (`gpt-6.1-sol`, xhigh) owns only `frontend/rose-pulse-react/**`. Sol B (same runtime) owns `backend/**` in a separate worktree/branch and isolated native PostgreSQL environment. Astra Controller owns shared docs and integration. Independent Astra (`gpt-6-astra`, max) reviews fixed commits using a fresh context. Agent APIs expose no verified Fast switch. Maximum two implementation writers; no shared product files have concurrent ownership.

## Design and functional scope

Owner's ROSE PULSE reference guides forest/cream/gold tokens, leaf branding, desktop sidebar, search/profile header, landscape hero, event cards, focused forms and mobile navigation. Components must remain keyboard operable and fit mobile widths. The image's 5,000-case numbers, Offline Ready, multilingual and security claims are illustrative, not verified results.

Retain legacy `frontend/live/` as regression reference. React uses the existing validated API client and Session through its service layer; errors never fall back to mock data. Preserve public Signup, selected-event Login return, local Logout, API search/pagination/detail, organizer image upload/Create/Edit, ordinary-user and Guest registration, own read/cancel, organizer read/approve and server-controlled waiting/promotion. Known statuses retain their exact meaning; unknown values and unavailable quota are not invented.

Real roles are `user`, `organizer`, `leader`; Participant and Community Leader are display labels. Backend enforces permissions. No unsupported leader dashboard, Offline queue, analytics or Guest claim/cancellation is implied. Category buttons use actual keyword searches because the retained server has no category field. English is the delivered language until translations are implemented.

## Retained live API contract

All paths below start `/api/v1`. Signup `POST /users` sends username/password without role and requires201/user. `POST /auth/login` plus `GET /users/me` supplies verified identity. Existing bearer/sessionStorage/local Logout remains; cookie refresh/server revocation is not claimed.

`GET /events?keyword=...&page=...&pageSize=...` returns `data,total_count,total_pages,page,page_size`; public detail uses `/events/{public_id}`. Organizer image multipart `POST /files` returns201 with safe url; event POST201 binds image_path. Owner PATCH uses only changed fields and fresh matching GET. Public IDs and numeric event IDs are distinct.

`POST /events/{public_id}/registrations` sends existing participant schema and returns201/online/pending; user mapping must match verified identity, explicit Guest has no Authorization and null actor. `/me/registrations` supplies real readback. `/registrations`, `/{id}`, `/{id}/approve` are organizer reads/action; `/me/registrations/{id}/cancel` is owner action. Backend determines pending/approved/waiting/rejected/cancelled and quotas. Unknown write outcomes lock resubmission; no automatic POST/PATCH retry.

## Acceptance and evidence

A01 React start; A02 actual desktop/mobile; A03 identity; A04 API events/search; A05 organizer upload/create/edit; A06 user/Guest registration; A07 own read/cancel; A08 organizer approve/waiting/refill; A09 fresh PostgreSQL linkage; A10 auth/cross-user refusals; A11 legacy/component regression; A12 fixed source/independent review/remote readback.

Final results: React31/31 controlled checks and production build; legacy239/239; Backend29 (26ASGI/SQLite+3native);38 direct HTTP/DB checks; independent browser106 observed HTTP responses with21 passing steps and3 retained harness failures; read-only follow-up23/23 assertions and17GETs. Four independent P2 findings were repaired and rechecked. Native Signup/Login/Create/Edit/image/User/Guest/own-read/Approve/Cancel/promotion/DB linkage passed at frontend `6ddb485a28f6d94230481ce14db45b721c63ca00` / backend `dcbdf47ed8e4d9b816676df97aaa80015c9e1928`. [Independent acceptance summary and actual screenshots](../frontend/rose-pulse-v2/ACCEPTANCE.md) distinguish native, controlled and unrun scopes. Final docs-only delivery binds unchanged product bytes to that tested commit. Raw evidence and private settings remain outside Git at `E:\NU_Local_Environment_20261014\rose-pulse-v2\20261102-032509`; that local path is not a public download. Original failures are retained. No credentials, database, large raw logs or video are committed.

## Run and boundaries

Dedicated local route: React5201 → safe legacy proxy5202 → Backend8026 → native PG17.11 port5437, loopback only. PostgreSQL database `nu_rose_pulse_20261102_032509` uses a non-superuser role. Standard bootstrap is applied to the fresh database; migration proof must remain separate from old-Demo/production migration.

Offline remains independent: React web does not replace a PWA/IndexedDB or native/SQLite design. Existing server batch-sync endpoints do not establish disconnected capture, restart, replay/conflict or sync guarantees. Mixed pools, full offer/accept/expiry, notifications, broad Security/UAT, deployment and team approval remain outside the verified claim. No merge, force push, Issue/Board changes or teammate messages.
