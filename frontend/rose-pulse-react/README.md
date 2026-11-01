# ROSE · PULSE React V2

Additive React/Vite frontend, based on the PR40 backend contract. The legacy `frontend/live` app is preserved. This app imports the existing `api.mjs`, `session.mjs` and guarded write controllers. It does not substitute mock data when the API fails.

From this directory run `npm ci`, `npm run dev` and open **http://127.0.0.1:5201**. Node 24 is the validated local runtime. Vite binds only loopback, uses a strict port and proxies `/api/v1` and `/uploads` through the existing reviewed development proxy at **http://127.0.0.1:5202**. Both development and preview use `changeOrigin: false`, preserving Host/Origin for the proxy's same-origin guard. Start that proxy separately from the repository root with `PORT=5202`, `BACKEND_URL=http://127.0.0.1:8026` and an absolute dedicated `UPLOAD_DIR`; use the matching isolated backend runtime, not an existing demo database. Do not use a generic static server for API access.

Run `npm test` for React/component and adapter tests. Run `npm run build` for the production bundle. `npm run preview` serves the built bundle with the same local proxy. The `dist` and `node_modules` directories are ignored by the repository.

Routes are query parameters (`?view=events`, `?view=event&event=<public_id>`, `?view=apply&event=<public_id>`, `?view=login`, `?view=signup`, `?view=create`, `?view=edit&event=<public_id>`, `?view=registrations`, `?view=manage`, `?view=profile`). Browser history and reload retain selected event IDs, search, page and page size. Search uses only the backend's title/overview `keyword`; no category or location filter schema is invented.

Only a verified `organizer` can create/edit events and review/approve registrations. `user` is the participant role. Guest is an explicit anonymous application mode; a failed identity is never changed into Guest. Signup sends only username/password and does not automatically log in. Private form values and receipts are not persisted. Only the existing bearer token is retained in tab-scoped session storage. Logout clears the local token without claiming server revocation.

Uploads, Create, Signup, application, Edit, Approve and Cancel preserve single-flight and uncertain-result locks. An unknown write is not retried automatically; read records and reconcile with the organiser. Guest receipts cannot be retrieved after leaving/reload. Registration lists show numeric event references where the read contract has no trustworthy title/public-ID mapping. English is the only available language. Offline operation, multilingual completion, messages, analytics, full security acceptance and large-user simulation claims are not included.

The lake photograph is stored locally in `public/images/community-lake.jpg`; it is decorative community imagery, not an event venue or verified event photo. Source: [Unsplash image](https://images.unsplash.com/photo-1501785888041-af3ef285b470); use under the [Unsplash License](https://unsplash.com/license). The leaf brand mark is an original SVG in `src/App.jsx`. Missing event images use a clearly branded placeholder rather than an unrelated event photograph.

Native browser/API/database acceptance is a separate evidence layer from component tests and a successful bundle build. See the parent task/evidence for actual tested runtime and results.
