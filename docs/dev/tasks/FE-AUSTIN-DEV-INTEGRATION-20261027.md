# FE-AUSTIN-DEV-INTEGRATION-20261027

Status: working-baseline, **PARTIAL_LIVE / BACKEND_BLOCKED**. The user explicitly authorized Astra to implement Frontend on existing Draft PR #38, merge latest Austin dev into its own branch without rewriting history, and update that same PR. This supersedes the earlier UI_ONLY/Sol-only scope for this increment. It does not authorize Backend changes, PR merges, Ready/Approve, Issue/Board changes or deployment. Refs #32 / #36 / #37; none is fully accepted.

## Versions and ownership

Repository `KV6014BHV31-GP6/event-management-app`, branch `dev_fe_booking_lifecycle`, base `dev`. Austin Backend is exactly `480460b4a2b0902bb8256be02bc7c8d8f13ac6ee`. Previous PR #38 head `7e674d0124ba843df7f110b4b228068b6e22b252` is retained; non-rewriting local merge `e0a1e8aa7d487415719a0747235399d6a2c4d2ba` incorporates Austin dev. Final immutable Frontend SHA is in the PR and external receipt. Backend tracked bytes remain identical to this Austin version. PR #39 is untouched Plan B; none of its fixes, code, wrappers, environment or database is adopted.

Astra is the primary shared API/Session/style/document writer. Scoped internal contributors handled proxy/Create/Edit and registration pages; a separate read-only review found two Frontend edge cases, both fixed with regression checks. The existing PR #38 worktree is reused; the other 19 recorded worktrees are protected. No reset/stash/clean/force push.

## Increment and contracts

- Existing Signup/Login/selected public_id/Guest and online submission logic are retained. Bearer Login and local Logout stay in use; no automatic POST retry or Cookie downgrade.
- Create has independent image upload and event-create writes. `POST /api/v1/files` uses unmodified multipart `file` and `folder=events`, strict201 plus safe response URL; optional `image_path` is passed to existing Create. PNG/JPEG/WebP/GIF up to900 KiB fits the1 MiB proxy ceiling. Success/uncertain states lock resubmission; uploaded URL survives Create failure. No deletion API is invented.
- Edit loads `GET /api/v1/events/{public_id}`, verifies organizer ownership, PATCHes only changed schema fields, and requires a matching fresh GET before displaying Saved. Untouched timestamp precision is preserved; unsafe legacy images can be removed. Failed loading disables editing.
- My registrations calls `GET /api/v1/me/registrations` and fresh GET after actions/Reload. Cancel uses the creator-only route. Organizer list/detail/Approve use their actual routes. Session verifies profile before new operations, validates identity, and drops late results after logout. Numeric event_id is shown as a reference, never guessed into a public_id link. Sensitive participant fields are not rendered.
- The original five-status component/tests remain. Validated Austin quota shows approved/capacity per pool plus total and waitingCount only when trustworthy; unavailable aggregates stay Unavailable. No client allocation, remaining-seat inference, waitlist selection or notification.
- Proxy adds only the exact Event PATCH route. Multipart boundary/body remain intact. Explicit absolute frontend UPLOAD_DIR maps restricted raster GET/HEAD under /uploads with realpath containment, file signatures and no directory listing/external junction. This is local development serving, not production storage.

## Actual validation and failures

Run `20261027-100514` used Python3.14.8, exact unmodified Austin requirements in a new venv, native PostgreSQL17.11 (server_version_num170011), non-superuser application role, and Chrome155.0.8059.86. Frontend5196 -> Backend8023 -> new isolated DB5434. Backend cwd is outside Git so local upload files remain outside the repository. Original bootstrap failed exit1/DBAPIError; original unmodified models created the new empty schema under **HARNESS_SCHEMA_SETUP**, followed by controlled organizer/leader fixtures. This is not bootstrap or old-database migration acceptance.

| Evidence layer | Actual result |
| --- | --- |
| Node unit/controller/DOM/proxy | 237/237 PASS, zero skipped, exit0; includes retained original status/Signup/Guest/W7 checks and new image/Edit/lifecycle/proxy cases. |
| Direct native HTTP preflight | 26 responses:12 HTTP200,7 HTTP201,7 HTTP500. Ordinary Signup/Login/profile; A/B/Guest registration201 online/pending; own and organizer reads succeeded. |
| Real Chrome/UI | Signup201 once, cleared/locked form, same-account profile200 and selected-event return. Organizer upload201 and Create201 once each; local image GET/Reload200. Own GET/Reload200; pending Cancel action followed by fresh GET and native DB cancelled. Organizer list/detail200. User Create guard disabled all relevant controls, zero Create POST. |
| Honest Browser blockers | Search/detail/Edit load500; Edit sent zero PATCH. Approve500 once, remained pending after GET, action locked. Guest/signed-in UI registration blocked by Event GET500 before submission. API registrations are not claimed as successful Browser registrations. |
| Cancellation evidence limit | CLI returned no usable result for the confirm action, then a broad Cancelled locator matched both option and status. No POST retry. Fresh readback and DB prove cancelled; exact cancel response status and POST count were not retained. |
| Native READ ONLY DB | Final5 users,2 events,3 participants,3 registrations; A cancelled, B/Guest pending, correct user/Guest attribution. No SQL business-state writes. |
| Tool/review history | Preserved navigation-body capture failure after successful Login, broad text locator failures, console encoding failure, fieldset isDisabled mismeasurement (native disabled property/actual controls verified), and first proxy fixture ID-length failure. Two review findings (old Edit normalization and known pre-write verification locks) were fixed and tested. |

Required commands from repository root: explicitly expand `frontend/dev-server.test.mjs` and `frontend/live/tests/*.test.mjs`, then `node --test @testFiles`; Python `-B -X utf8 scripts/check_dev_control.py`; working/staged/committed `git diff --check`. Exact exits and document-control totals are saved with the final external receipt. Node fixtures are not native success, Security, UAT or CI.

## Backend and policy blockers

At fixed Austin SHA: Events list/search/detail call nonexistent `RegistrationChannelEnum.offline` (`events/service.py:30`); PATCH lacks select/EventModel imports (`events/router.py:81`); Approve lacks func (`registrations/service.py:310`); nonempty Offline uses nonexistent offline enum (`registrations/service.py:425`). All were actual500 with sanitized reproductions. Ordinary-user global registration list returns500 because status parameter shadows the module (`registrations/router.py:128`). PATCH/Approve/Offline before-after database fingerprints matched. No Backend fixes were made.

Therefore Edit save, A-approved/B-waiting -> cancellation/refill, live quota readback and nonempty Offline remain BLOCKED. No Offline UI is added; notification has no verified trigger/channel contract. Public privileged signup, participant ownership/duplicate guarantees, optional-auth edge cases and pool/deadline/offer policy remain Backend/design issues. Guest has no safe own-read/cancel API. Cookie refresh/server logout are not integrated: direct Login sets secure Cookie flags, current proxy does not forward Set-Cookie/Cookie, Browser had zero cookies. No security settings were weakened.

## Design, evidence and launcher boundary

Six publicly readable reference SVGs are linked from Issue21 comment6272575392 (Supersugar2015); this does not verify Oscar identity, editable Figma layers or design approval. Existing ROSE colours/type/header/forms/responsive layout are retained. No SMS/pool-release deadlines or other diagram policies were invented. Designer/PM review and complete Issue acceptance remain pending.

Original evidence is local only: `E:\NU_Local_Environment_20261014\austin-dev-integration\20261027-100514`. `RESULT.md`, `MANUAL_DEMO.md`, `DATA_FLOW.md`, `BACKEND_BLOCKERS.md` and sanitized HTTP/Browser/DB/command receipts are outside Git. Raw private logs/credentials are not uploaded. Public reviewers receive this bounded summary and executable Node checks, not a claim that local paths are public evidence links.

Candidate launcher Start/Stop/Status/Open manages only verified owned loopback services and does not pull/seed/migrate. Core Events500 prevents replacing the original primary Demo launcher. Limited launcher stop/restart/idempotence checks are separate from complete database restart/recovery acceptance. Full native E2E, Security, UAT, Backend suite, old-data migration, new video and deployment remain NOT_RUN. Keep PR #38 Draft; no merge or team approval is implied.
