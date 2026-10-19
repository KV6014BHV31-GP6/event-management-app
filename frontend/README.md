# Frontend workspace

**Current slice:** public event browsing/search/detail, Login, existing Create Event and a minimal online application form, using vanilla HTML/CSS/ES modules in [live/](live/index.html). Owner: Benjamin. The branch-qualified [W7 task](../docs/dev/tasks/FE-W7-BROWSE-REGISTRATION-20261020.md) and [CURRENT](../docs/dev/CURRENT.md) identify source versions, validation and gaps. This is not a full registration centre or ROSE Dashboard.

## W7 backend dependency and local integration

W7 targets frontend base `dev` at `a47ff7d92f296ebd0604a1df98daf0b8111829b3` and Austin's separate backend `dev_be_registrations` at **`d2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0`**. That backend is not yet in dev. Use its already running, isolated native PostgreSQL service for the W7 flow; do not merge its branch into this frontend PR or apply its schema to an existing Demo database. The generic older setup below remains historical and is not a passing W7 bootstrap/migration procedure: the dependency's bootstrap still writes an incompatible uppercase status.

The stage-2 frontend uses a separate loopback port, preserving other running checkouts:

```powershell
$env:PORT = '5188'
$env:BACKEND_URL = 'http://127.0.0.1:8017'
node frontend/dev-server.mjs
```

Open `http://127.0.0.1:5188/live/`. Search uses the server's title/overview `keyword`, keeps it across pagination/refresh and resets page one on a new search. **View event → Apply for this event** keeps a validated public ID through Login, with no arbitrary redirect destination. Both lowercase backend statuses and the historical `ACTIVE` badge are supported without changing the value displayed.

The online form re-verifies the participant through `/users/me` immediately before its single POST. It checks the response event/user attribution, `online` channel and `pending` status. A pending receipt is not a confirmed place. Income is a free-text code, with no invented options or eligibility rules; optional medical information is not collected. Use synthetic data for this local demonstration.

The receipt exists only on that page. There is **no own-registration GET** in this backend; reload does not retrieve it. No participant/profile/receipt is saved in browser storage. Unknown write results lock this form against resend; ask the organiser to reconcile them. Frontend Login gating does not repair optional backend auth, public signup roles or participant ownership.

Limited browser verification is opt-in, needs external Playwright/Chrome and restricted synthetic fixture JSON paths. `W7_ACCOUNTS_FILE` has `ordinary`/`organizer` credentials; `W7_PARTICIPANT_FILE` has the flat participant schema. Never pass secret values in command arguments. Set `APP_URL`, `W7_RUN_ID`, `EVIDENCE_DIR` (outside the checkout), `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE`, then run `node tests/e2e/w7_browser.mjs --allow-synthetic-writes`. It prepares three different events through the existing Create Event UI and applies with the same ordinary participant; three is this test arrangement, not an Austin requirement. Existing fixture evidence causes it to refuse blind write reruns. Five separately labelled intercepted UI cases are not native backend PASS. See the task for exact results and handoff limitations.

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

Cancel performs no write. Logout disables submission immediately. Unknown POST outcomes are never retried automatically; check Events before attempting another creation. At the earlier cloud checkpoint this form's native UI/API/PostgreSQL checks were BLOCKED / NOT_RUN. W7 stage 2 now separately exercised three creations through this UI and native DB mapping, including the Login/quota/double-submit regressions described in the task; historical PR #3 API evidence is not reused as proof. DB restart and independent stage-3 acceptance remain NOT_RUN.

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

### PR #4 acceptance update (38557951101-1)

Quota inputs and payload validation enforce `0..2147483647`, matching the existing database integer fields. Native UI acceptance on GitHub-hosted Windows: **FAIL**. This supersedes the earlier cloud-only pending status for the tested source; it does not claim execution on the user local machine. [Run evidence](../docs/dev/evidence/FE-CREATE-EVENT-NATIVE-20261014/38557951101-1/README.md). No merge or deployment.

### PR #4 acceptance update (38558483277-1)

Quota inputs and payload validation enforce `0..2147483647`, matching the existing database integer fields. Native UI acceptance on GitHub-hosted Windows: **PASS**. This supersedes the earlier cloud-only pending status for the tested source; it does not claim execution on the user local machine. [Run evidence](../docs/dev/evidence/FE-CREATE-EVENT-NATIVE-20261014/38558483277-1/README.md). No merge or deployment.
