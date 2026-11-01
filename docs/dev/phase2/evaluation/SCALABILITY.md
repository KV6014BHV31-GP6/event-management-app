# Bounded scalability and sustainability evidence

This is a local synthetic engineering experiment, **not5000 simultaneous users, a production SLA, human processing time or funder approval**. Source pair: frontend `4f2bb20c1234ff1db0cfd6f8fc48fb25675f361e` / backend `54ab71d29852df26f17fb32317e405e5a48353ea`. Method:60 real GET requests to `/api/v1/events?page=1&pageSize=6` through production preview5205→proxy5206→FastAPI8028→native PostgreSQL5439, concurrency4. No business writes or provider calls were made. The already-running Windows environment also retained earlier Demo services; this is not a cold-start or isolated-host benchmark.

| Observed measure | Result |
|---|---:|
| Requests / errors |60 /0|
| Concurrency |4|
| Median elapsed |68.530ms|
| p95, nearest-rank definition |210.421ms|
| Maximum elapsed |651.500ms|
| Request window |1.513s|
| Observed responses per second in this finite window |39.654|

[Raw sanitized samples and process snapshots](read-benchmark.json) contain every HTTP status, elapsed time, response byte count and source pair. Windows CPU values are per-process cumulative snapshots; working-set values are snapshots, not measured peaks. PostgreSQL workers can be separate from the listening postmaster. These measurements cannot establish an infrastructure sizing or cost-per-registration forecast.

Offline evidence uses actual bounded batches: an original three-item UI batch, then one distinct one-item batch for the repaired failure-state UI. Both were committed by the real backend while their responses were deliberately discarded before reaching the page; authorized GETs reconciled durable receipts. A separate browser context repeated the original stable IDs without additional effects; nine table fingerprints were unchanged. The author native suite separately forced eight concurrent same-ID requests and opposite-order transaction conflicts. These are finite distributions, not proof against every distributed failure or performance at the contract maximum25-item batch.

The fixed backend checks current role, ownership and transaction uniqueness, and retains original failures before repair. AppShell/IndexedDB behavior was checked with the three owned HTTP services genuinely absent while PostgreSQL stayed running, plus Chrome offline emulation and whole-browser restart. Physical iPhone/hotspot, production network routing, real-device eviction, disk-loss recovery and field use are NOT_RUN. Real sensitive offline data remains blocked by the uncompleted privacy/key-management gate.

The [cost calculator result](cost-final-results.json) is deliberately unknown for all seven unsupported categories. Actual hosting/database/storage/support/training/notification/security costs, NGO demand and human staff baseline were not supplied. The [funder assessment](FUNDER_ASSESSMENT.md) defines KPIs, risk controls and required baselines; the [synthetic pilot](PILOT_RESULTS.md) validates measurement handling without inventing SEQ/SUS. Current sustainability conclusion: a locally demonstrated technical candidate with unresolved operational/financial/privacy/language baselines. **FUNDER_REVIEW_NOT_RUN; SOCIAL_IMPACT_UNPROVEN.**
