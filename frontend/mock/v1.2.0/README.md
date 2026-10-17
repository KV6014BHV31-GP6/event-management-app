# Frontend Mock v1.2.0 · original module source

**Status:** historical runnable synthetic mock, NOT a live API / production app. Original bytes of the ten tracked `integration/` source and test files from `NU_Dev_Workspace_v1.2.0.zip` are preserved under this directory.

Source ZIP SHA256: `197921e18d5ee56bb4e23ae7ff224aeac01e3d60e62de86ee284cec0c502a4d7`. The original NU workspace also contains private Dev harness/portal materials, deliberately excluded from this focused import.

## Run

From this folder, run `npm test` (Node.js 18+). To preview UI, run `python -m http.server 8000 --bind 127.0.0.1` from repository root, then open `http://127.0.0.1:8000/frontend/mock/v1.2.0/`.

The app uses [app.mjs](src/app.mjs), [mock-service.mjs](src/mock-service.mjs) and an unused fail-closed [http-adapter.mjs](src/http-adapter.mjs). No backend, real user data, permissions, SMS, offline multi-device sync or DB persistence is implemented.

**Test receipt:** 41/41 Node tests were executed against the extracted ZIP before import, without npm dependencies. Complete product/browser acceptance remains NOT_RUN. `v1.2.0` is kept immutable as comparison baseline for `v1.2.1`.
