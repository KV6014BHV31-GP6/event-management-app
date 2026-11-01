# ROSE · PULSE React — Phase 2

This additive frontend preserves the Phase 1 layout and legacy frontend/live files. Phase 2 uses the admitted contracts in ../../docs/dev/phase2/ and isolated services. Unit/component results below are controlled synthetic evidence. The controller and independent reviewer record native Browser/API/PostgreSQL acceptance separately.

## Start the production AppShell

Use Node 24. Run `npm ci`, `npm run build`, then `npm run preview` here. Open **http://127.0.0.1:5205**. The dedicated route is **5205 → proxy5206 → Backend8028**. Development and preview bind only loopback, with strict ports. Start the repository proxy separately with PORT=5206, BACKEND_URL=http://127.0.0.1:8028 and its dedicated absolute legacy UPLOAD_DIR. New v2 files remain in the Backend's private asset directory and are served through authorized API routes; never map that directory as public files.

Vite proxies /api/v1, /api/v2 and /uploads with changeOrigin:false, retaining the same-origin guard. The proxy admits exact reviewed v2 sync, file, own-event/index, cancellation and analytics routes. Existing v1 behavior and its 1 MiB body limit remain. Only POST /api/v2/files has the bounded 8 MiB-file multipart allowance; Backend validates actual content.

**Vite development HMR is not offline proof.** Only a production build registers /sw.js. Load the built app once online and allow installation before testing a disconnected reload/restart. Its finite cache contains static HTML/JS/CSS, manifest, icon and the local demo photo. It never intercepts APIs, uploaded content, authenticated requests or writes, and never stores private responses/tokens in CacheStorage. New builds use a content-derived cache version.

## Offline synthetic workspace

?view=offline and the leader workspace capture **synthetic test data only**. Download a selected public event after a fresh online users/me identity/role check. IndexedDB v1 partitions events, drafts and immutable batches by actor. Save includes local readback; it is not a server application or reservation. No background sync runs.

Local data is **not encrypted**. The UI boundary does not protect it from physical device/browser-tool access. Private browsing, eviction, cleared site data or device failure can erase unsynced drafts. This localhost demonstration establishes no production, LAN, iPhone or Security readiness.

After a full browser-process restart without a tab token, explicit acknowledgement can unlock only the previously verified actor's synthetic local workspace. Minimal ID/role/verification/expiry/lock metadata is kept in localStorage. No bearer is moved to long-term storage. This is not current server authentication. Local access expires after seven days; explicit Logout and every account-switch attempt persist a lock. Another account cannot select the previous actor's queue through this UI. Logout retains drafts, locked until the appropriate online login; delete local data before logout if unwanted.

Draft expiry is 1 or 7 days, with cleanup on the next opening of that account's workspace, including unsynced records. This does not promise bytes disappear while the browser is closed. Expired batches and request snapshots are deleted together. Explicit delete-all affects only this actor's local data, not server registrations. Individual batched records require reconciliation or explicit delete-all. Storage estimates/persistence requests explain that browser persistence is discretionary.

States are draft, pending_sync, syncing, synced, failed and needs_review. Stable UUID submission/batch IDs and the exact request are saved before sending. Interrupted syncing becomes unknown-needs-reconcile on restart. Queued payloads are immutable; corrections need an explicit new draft.

Manual download, sync, reconciliation and same-ID replay require a fresh online identity/role check. Cached metadata never authorizes server submission. Receipts must match version/actor/event/batch/item IDs/outcomes. Synced means recorded, **not approved**; registration_status_at_recording is historical. A lost response remains unknown. Reconcile by GET first; after missing receipt the user may explicitly retry the exact saved batch, with another GET before POST and unchanged IDs. 401/403 blocks access; 409 may mean saved/concurrent conflict and requires reconciliation. No JWT revocation ledger is claimed.

## Core, files and organizer portal

Signup/Login, explicit Guest, failed-identity Guest blocking, local Logout, search/pagination/detail, Create/Edit, own registrations/cancellation and organizer approval remain. Existing API/Session contracts are reused through additive Phase 2 adapters. Failed reads never use sample fallback. Unknown writes stay locked; confirmed success has explicit new-operation actions.

The default participant form has six visible fields, **9→6 (33.3%)** against Phase 1 React. Address/income/marriage/medical are genuinely omitted and actual NULL is validated for new records. Legacy provided values remain supported. Required first/last/phone/national-ID inputs reject trim-empty values while preserving valid bytes, shared with offline capture; no format, medical or eligibility rule is invented. The six-field choice remains a provisional engineering contract, not NGO policy signoff.

Organizers may preview/remove/replace/upload/associate up to three images. Reload uses actual image_files IDs; legacy image_path is fallback only when the gallery is empty, not a fourth image. Removing a selection does not delete a server upload. Authenticated participants may optionally attach up to three synthetic supporting documents (PNG/JPEG/GIF/WebP/PDF, ≤8 MiB each). That panel is collapsed by default. Guest has no private upload. No upload is mandatory; evidence/onsite-original policy remains pending. Returned file IDs and readback associations are verified.

Private document downloads use fresh authenticated fetch → Blob → temporary download URL → revoke, never a bearer query string or private offline cache. The organizer portal reads own events and server-scoped /api/v2/me/registrations, current quotas/waiting, approval, owner cancellation and permitted documents. Preserved global v1 organizer behavior is a separate Backend boundary. Analytics display actual own-event persisted registration counts with source/definition/actor/as-of, not attendance, outreach, conversion or ROI.

Share/copy is user-triggered public title/link only. WhatsApp opens a user-controlled external URL; no provider API, automatic message, SMS or OTP exists. Localhost reachability is explicitly limited. ASSET_MANIFEST.json records the licensed demo lake image and original SVG icon. Stock imagery is not verified NGO people/venues. No flyer bitmap or fabricated gallery photo is claimed.

## English and Malay

Pinned i18next/react-i18next use central EN/MS resources, saved preference, English fallback and locale-aware Intl formatting. Both catalogs ship in the public AppShell. Navigation/forms/status/bounded errors/aria/native validation follow the selected language. Arbitrary event/user data is not translated. Key/placeholder parity and static-key checks do not alone prove every browser/layout case. NGO language and sensitive-consent translation signoff remain pending.

Query routes retain home/events/event/apply/login/signup/create/edit/registrations/manage/profile/help and add offline/leader/organizer-events/analytics. Event selection uses event=<public_id>. Search preserves the real keyword contract; no category/location schema is invented.

## Validation and retained failures

Run `npm test`, `npm run build`, and from repo root `node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs`. The fixed candidate passes **77/77** controlled React tests across eleven files, including five required-field checks and a strict malformed-event receipt regression. The retained legacy/proxy suite passes **241/241** (original239 plus two exact-v2 proxy checks). The production bundle builds successfully; its >500 kB chunk advisory is not a performance acceptance claim. Historical Phase 1 31/31 and early Phase 2 46/46 are source-qualified checkpoints; consult external final logs for the fixed candidate's exact totals.

The retained31 preserve role denial/Guest identity/uncertain-write checks. Explicitly authorized expectation updates cover the new leader offline page, EN/MS control and minimized form; required-field fixtures now contain synthetic nonempty phone/ID. New coverage includes queue/restart IDs, exact reconcile/replay, token-free local unlock/Logout locks, language/native validation, three files/private downloads and safe sharing.

External evidence/frontend logs retain early42PASS/4FAIL (three worker-harness URL/path failures plus intended leader expectation), integrated53PASS/2FAIL plus one test-import failure (old English-only/marital expectations and relative path), then69PASS/2FAIL (spy/CJS harness issues), followed by71PASS. The trim-empty correction has a separate initial1PASS/4FAIL RED file. These are not native acceptance; production offline restart, actual uploads/replay and fresh PostgreSQL readback are independently reported after source freeze.

References: [MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [i18next](https://www.i18next.com/overview/api).
