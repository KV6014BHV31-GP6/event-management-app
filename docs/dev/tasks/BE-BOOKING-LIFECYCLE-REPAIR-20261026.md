# BE-BOOKING-LIFECYCLE-REPAIR-20261026

Status: working-baseline, author **PASS_WITH_GAPS**, not Astra independent acceptance. Source `USER-BE-REPAIR-20261026` explicitly authorizes necessary Backend repair; the earlier UI_ONLY gate is preserved Frontend history. Sol is sole product/test writer; delegated reviews are read-only, and one delegated external HTTP harness was reviewed/operated by Sol. Austin remains original Backend owner. No claim of Austin approval.

## Git/source lock and adoption

Repository `KV6014BHV31-GP6/event-management-app`; account beeawanegd; existing worktree `E:\NU_Local_Environment_20261014\backend-repair\20261026-181320\repo`; existing branch `dev_be_booking_lifecycle_repair`; base D `4541c948f8aec68dbbb9500630abc8282a62abca`. No duplicate branch created. All18 other worktrees and original checkout `dev_fe_create_event_mvp@149bc376e098477d6552ef632a4b954d3cefd23a` are preserved. PR38 remains unchanged OPEN/Draft `dev_fe_booking_lifecycle@7e674d0124ba843df7f110b4b228068b6e22b252`; no UI_ONLY work is repeated or merged into this candidate.

Source keys: U=`847d035fe333a3b544204377e91690b83fdb42be`; R=`3bc68265efb79a8527b2ce2d8c185f5f8d9378d0`; E=`8b27e04c7b3f71413800ec4b1ce84fd7acfe7687`; O=`e70ea3fba269130dfc445acdea817c49fd1f3f91`. Fresh fetch matched handoff refs. Merge bases: U/D `79804aa67508de23d3f3c613e65cf375e9ded2a3`; R/D `a47ff7d92f296ebd0604a1df98daf0b8111829b3`; E/O with D equal D. Source refs are not merged/cherry-picked wholesale. No folder overwrite, Google/GCS/file/image/offline/refresh adoption, new dependency or pin change.

| Module/path | Source → candidate change/reason | Actual validation |
| --- | --- | --- |
| auth/deps, core/security | D Login retained; U invalid-token idea completed: only no Authorization is Guest, strict shared resolver and DB role; malformed/expired/unknown/non-Bearer/refresh-type401. Password verification failure stays controlled. | Native token/role/no-write negatives, JSON/form Login/me; SQLite regressions. |
| users schema/service | D public Signup → schema/service ordinary-user-only, unchanged raw values, byte guard, unique-race rollback/duplicate400. Role enum still contains organizer/leader for controlled identities. | Native two Signup201, high-role422/no row, duplicate400; original2 user tests retained. |
| events model/schema/router/service | Selected R status enum/search/create/detail, without image/PATCH; E aggregate idea only. DB organizer Create; safe enum/status422; input timezone guard; single SQL count/page/quota snapshot; offline mapping nullable, not invented. | Native Create/search/detail/page/quota; mixed-pool409/timezone422; unchanged API client checks. Three real timestamp red tests then green. |
| participants model/schema/service | R ULID/FK/non-null form/National ID structure; D standalone POST retained, no new R admin routes. Server-owned mapping, same-user reuse, no Guest/other-user claim, no historical snapshot rewrite. | Native collisions before/after full-row hashes, B cannot claim unowned Guest, same participant across events. |
| registrations model/schema | R five states/three channels/audit fields/form snapshots; PG+SQLite noncancelled partial unique index; no nonexistent offline enum. | Native schema/FKs/enums/index; direct precheck-bypassing insert gets23505 and rollback; controlled duplicate race201/400. |
| registrations router/service | R online/self/list/detail/approve/cancel intent → explicit wiring, func import, status-shadow removal, DB organizer dependency, event-first locks/fresh reread/flush and one commit/rollback. | Native self GET/main sequence/role denial, final-place approve race, repeated/double cancel, native fault rollback. |
| main / core/database | Only necessary routers/models mounted; echo=False/hide_parameters=True; auth autobegin transaction reused. | Static schemas; real HTTP OpenAPI14 paths; owned PID/cwd/source proof. |
| scripts/dev_bootstrap | D guards/stable credentials/3 seed events kept; lowercase enum/all4 models; incompatible legacy columns/enums/index stop rather than implied migration. | Native creation/repeats and measured identical row hashes; disposable SQLite guard tests. No original DB touched. |
| tests / pytest.ini | Original SQLite2 retained; related auth/ownership/lifecycle/schema cases and opt-in native fixtures. Native absence explicitly SKIP; no native reset/drop fixture. |28 unit/SQLite/ASGI tests PASS;3 native PG tests separately PASS;4 existing deprecation warnings retained. |

Full immutable candidate commit is recorded in remote PR and external receipt, not self-referenced in this commit. Data flow is [documented here](../../api/DATA_FLOW.md); [API contract](../../api/INTEGRATION.md). Refs #23/#26/#36/#37, and #32 for actual aggregate increments; no Issue closure.

## Measured behavior and evidence layers

External originals: run `E:\NU_Local_Environment_20261014\backend-repair\20261026-181320`, Sol material under `sol/`. E: paths are local originals, not public evidence links. Source defects are preserved before changes in `source-defects-before.json` and Astra's original DATA_FLOW; not every source defect was a pre-repair HTTP500. Whole app/model-schema/static OpenAPI and actual HTTP OpenAPI are separately recorded.

| Layer / command from candidate | Actual result / limits |
| --- | --- |
| Existing Python3.14.8, `-B -m pytest -q`, cwd backend |28 PASS,3 native SKIP when not opted in, exit0; original2 included. The 4 Pydantic deprecation warnings remain. No assertion removed. |
| `-B -m pytest -q -k explicit_timezone` before repair |3 FAIL,23 deselected, exit1. Mixed aware/naive raised TypeError and both naive were wrongly accepted. Explicit input timezone validator/common response fields fixed it; all3 green in current suite. |
| Native opt-in `-B -m pytest -q tests/native/test_candidate_pg.py`, exact private settings/reference paths |3/3 PASS, exit0 at the documented mid-flow state. Real PG schema/index and controlled Session.commit fault rollback. This is not SQLite or a fabricated HTTP outage. |
| External native HTTP main ledger |100 passed layered checks:97 real HTTP,1 trusted fixture setup,1 native pytest summary,1 fresh READ ONLY DB reconciliation.121 request intents include one local header-protocol failure later reconciled; two stopped harness attempts and continuations are retained. Not a clean single-run claim. |
| Additional real HTTP |5/5 PASS: organizer login/profile plus mixed-pool Approve409 and three naive/mixed-timezone Create422 cases; fresh pre/post hashes show no new rows. |
| Unchanged Frontend API client over actual candidate HTTP |4/4 PASS for detail/search/Login/fresh profile; no new data row or browser/UI claim. |
| Existing Node24.14.0 frontend, explicit PowerShell-expanded proxy/live files |161/161 PASS, exit0. Frontend files are byte-identical to D; no PR38 component added here. |
| Document-control / working and committed diff checks | Exact argv/cwd/exit/results in final external ledger. Public Git payload validation excludes ignored native .env/test cache via an exact staged/committed snapshot, without weakening the checker or publishing secrets. |

New native cluster only: installed PG17.11 binary, run/pgdata,127.0.0.1:5433, database `nu_be_repair_20261026_181320`, app role `nu_be_repair_app_20261026_181320`, actual server_version_num170011, rolsuper/createdb/createrole=false. Admin identity separate. New Backend127.0.0.1:8021 at this worktree/backend; actual server PID/cwd/command and source hashes recorded. No Frontend process or old launcher switch. Dependency pins unchanged.

Budget was recorded before native writes:4 users,5 events,3 Participants,9 successful registrations. Five events explicitly account for3 preserved bootstrap fixtures plus2 actual API-created online1/offline0 events. Two public ordinary accounts, trusted bootstrap organizer and trusted Leader fixture total4; no public privileged Signup used. Final new READ ONLY connection confirms exact4/5/3/9 counts. Tokens stay in memory; credentials/forms only restricted private files and ignored candidate settings, never public logs/Git. SQL bound parameters are suppressed.

Main E1: A/B201 pending→organizer A approved/B waiting→A own cancel→A GETcancelled/B GETapproved; aggregate approved remains1/waiting0. E2: new Guest null actor/participant.user_id; B cannot claim Guest; same A/B participant across events; pending cancellation does not increase approved-based capacity. Attack/duplicate/auth/role refusals preserve all row hashes. Each race uses exactly2 independent requests/DB sessions: POST201/400, last-place Approve approved/waiting, Cancel200/400 with one promotion. Test-only failure before commit after flush rolls back cancellation and waiting promotion together, confirmed from a fresh Session.

First failures retained: wrong cwd/import path; Windows pg_ctl pipe wait after server already started; readonly schema char→JSON issue; early readiness check; h11 client rejecting empty-Bearer trailing OWS. Corrected harnesses reuse the same cluster/accounts/events; no blind successful Signup replay or fixture reset. Empty Bearer was subsequently sent to the real server using stdlib HTTP and returned401/no write. Source/product timestamp regression is distinct from these harness failures.

## POLICY_DECISIONS — bounded behavior, not team approval

Publication hygiene: the first staged diff check rejected CRLF line endings in repaired Windows files. Only this change's files were normalized to LF; the failed receipt is preserved. A per-source proof compares the exact native-tested bytes to final bytes after CRLF normalization, with identical Python AST, followed by unit/static/native read-only verification. No fixture reset or blind replay of the completed main flow. Bootstrap's compatibility preflight checks required column/nullability, enum type name and index name, not all legacy types/FKs/predicates; new-schema native checks supply the actual candidate evidence, not migration certification.

| Decision/source | Current candidate behavior | Impact / unresolved restriction |
| --- | --- | --- |
| User-authorized online1/offline0 main case; R direct promotion | Pending does not consume approved count; approval chooses approved/waiting; cancellation may directly promote one waiting. | Only this online allocation is verified; no universal application cap, eligibility or income options approved. |
| R/E mixed totals and undefined offline channel | Reads actual online/all approved and waiting counts; capacities are settings. Offline approved=null when mapping unsupported; allocation_supported=false; allocation mutation409. | No online/offline borrowing, walkin/ocr pool mapping or fake zero/remaining. Mixed-pool allocation incomplete. |
| R organizer-wide list/Approve | Current DB organizer role required; source organizer-wide surface retained. | Cross-event organizer authority still needs policy review; no new cross-event permission model invented. |
| R noncancelled behavior; d2 compatibility | Partial unique predicate status!=cancelled includes pending/approved/waiting/rejected. Cancelled reapplication preserves source behavior. | Rejected/reapplication policy not generally approved; predicate changes require explicit policy decision and tests. |
| R waiting order | Earliest waitlisted_at, then ID as deterministic technical fallback. | Equal-time priority/deadline/eligibility are not approved business rules. |
| Issue37 place offers | Only source direct approved transition in supported scenario. | No offer/accept/expiry/SMS. Issue37 remains incomplete. |
| Guest identity | New Guest first application only; existing identity collision refused, null actor retained. | No claim/binding/safe retrieval/cancellation for Guest; knowledge of ULID/National ID is not authority. |
| Schema/bootstrap | New dedicated schema; compatibility guard; measured idempotent seed. | No old-Demo DB migration/upgrade PASS, data cleanup or owner repair. |

## Handoff and stop

Backend can start: **PASS**, actual HTTP OpenAPI and native DB identity. Limited Backend flow: **PASS_WITH_GAPS**, real supported sequence/races/rollback above, with preserved harness continuations and policy limitations. Frontend integration remains **NOT_IMPLEMENTED_THIS_ROUND**: PR38 is UI_ONLY; no live own-read/cancel/Approve/quota buttons/adapters were added.

Frontend Browser, full native E2E, complete Security, UAT, DB restart, video/deployment, old-schema migration and Astra independent stage C are NOT_RUN. Historical document unittest22/23 failure remains preserved, not rerun or hidden by these Backend tests. No Jest introduced, other-role course work or full LogTask3 completion claimed.

External final handoff supplies candidate full SHA/PR, native references, before/after Data Flow, API contract, exact command ledger, secret-file locations/key names without values, owned PIDs/ports/data directory and reproducible start/stop/status commands using secure persistent configuration. It records whether owned services were retained/stopped. Primary launcher/manual Demo/original DB and all other worktrees remain unchanged. No merge/force-push/Approve/Ready/auto-merge/Issue/Board/reviewer/message/deployment action. Sol stops at one Backend Draft PR for Astra independent acceptance.
