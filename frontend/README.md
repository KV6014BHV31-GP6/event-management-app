# Frontend workspace

**Current slice:** public event index, Login and minimal Create Event, using vanilla HTML/CSS/ES modules in [live/](live/index.html). Owner: Benjamin. See [FE-LIVE-20261014](../docs/dev/tasks/FE-LIVE-20261014.md) and [CURRENT](../docs/dev/CURRENT.md) for exact validation and limits. Create Event scope and pending native acceptance: [FE-CREATE-EVENT-20261014](../docs/dev/tasks/FE-CREATE-EVENT-20261014.md). This does not implement bookings or the full ROSE Dashboard.

## Run the live frontend

Follow [backend setup](../backend/README.md) to initialize synthetic data and start FastAPI on `127.0.0.1:8000`. Then, from the repository root with Node.js installed:

```bash
node frontend/dev-server.mjs
```

Open `http://127.0.0.1:5173/live/`. No npm install or build is required for the app or development server. The browser uses relative `/api/v1/` URLs; the server proxies them to the loopback backend. It binds only `127.0.0.1`, rejects cross-site origins and does not serve private dotfiles. This is a local development server, not a deployment server.

Optional variables: `PORT` changes the frontend port; `BACKEND_URL` changes the loopback HTTP API origin. Example in PowerShell:

```powershell
$env:PORT = "5173"
$env:BACKEND_URL = "http://127.0.0.1:8000"
node frontend/dev-server.mjs
```

Stop with Ctrl+C. Opening HTML using `file://` cannot provide the same-origin API proxy.

## Implemented behavior

- Public event cards, total count, first/previous/next/last navigation, page-size selection and page jump. Dates use the viewer's browser timezone, stated on screen.
- Loading, empty, malformed response, timeout and server/network errors. Failed requests never switch silently to Mock.
- JSON Login followed by authenticated `/users/me`; incorrect credentials remain visible. Identity is verified on reload before it appears.
- Only the bearer token is kept in tab-scoped `sessionStorage`, never the password/profile. If storage is unavailable, Login works only on that page and explains that navigation ends the session.
- Logout clears the local token; history-cache restoration reloads and checks the session. The backend has no revocation endpoint; existing tokens remain valid until expiry. Production/shared-device session policy requires review.
- No inferred remaining places or coordinator permissions. Event status comes from the API; signup is outside this slice.

## Create Event

After Login and `/users/me` verification, choose **Create event**. The form at `/live/create-event.html` accepts title, optional overview, location, local start/end times and two non-negative quotas. Browser timezone is shown; dates are converted to ISO instants. Only a valid HTTP 201 response shows the server title/public ID. **Back to events** opens the existing first page and fetches server data again.

Cancel performs no write. Logout disables submission immediately. Unknown POST outcomes are never retried automatically; check Events before attempting another creation. Native UI/API/PostgreSQL acceptance for this new page remains BLOCKED / NOT_RUN in this cloud environment; historical PR #3 API creation is not evidence for this form.

## Checks

From the repository root:

```bash
node --test frontend/dev-server.test.mjs frontend/live/tests/*.test.mjs
```

Use [E2E instructions](../tests/e2e/README.md) for HTTP/browser checks. Browser tests require Playwright installed separately and a browser binary. Fault injection is reported separately from real API calls. The app itself has no third-party JavaScript dependencies.

## Preserved demos and history

[index.html](index.html) preserves demo navigation and adds the live-app link. [Version history](mock/README.md), [v1.2.0 modular mock](mock/v1.2.0/README.md) and [v1.2.1 English demo](mock/v1.2.1/README.md) remain unchanged. The full v1.2.1 engineering archive is still unimported; this slice is new code against inspected backend source.

To serve historical repository-root URLs exactly as before:

```bash
python -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/frontend/`. This historical static server does not proxy APIs; use port 5173 for the live slice.

The frozen [v1.2.1 source](../docs/dev/evidence/LOG_DOCX_20261012/ROSE_DEMO_English_v1.2.1_SOURCE.html) retains SHA256 `3949160d0317c2b32ceadb00adca263db507f55c5577cb7ed4aa05e48cd8292e`. Original v1.2.0 modules/tests remain intact. Historical role selection is not authentication.
