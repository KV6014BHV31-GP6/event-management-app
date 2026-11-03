# Funder-side value and sustainability package

Status: **FUNDER_REVIEW_NOT_RUN / SOCIAL_IMPACT_UNPROVEN**. No NGO/funder interviews, invoices, verified staffing baseline or deployment cost quotations were supplied. This package defines reproducible measurements and explicit cost scenarios; engineering tests cannot establish adoption, health outcomes or ROI.

## Outcome/KPI dictionary

| KPI | Numerator / denominator and source | Baseline / limit |
|---|---|---|
| Persisted applications | Distinct registrations committed in the stated DB/time window; separate channel/status | Pending is not approved/attendance; synthetic dataset only |
| Offline reconciliation coverage | Queue items with a durable accepted/rejected/duplicate receipt / attempted offline queue items | Measures reconciliation, not equitable real-community coverage |
| Effective offline applications | Distinct accepted offline registration effects / valid queued applications; rejection reasons separately | No claim pending reserves quota |
| Duplicate prevention | Replayed stable IDs producing zero additional effects / tested replay attempts | Bounded test distribution; not an arbitrary-network guarantee |
| Staff processing time | Actual human active seconds per attempted review/registration; success-only separately | REAL_USER_STUDY_NOT_RUN; automated latency is not staff time |
| Language convenience | Human task completion/time/SEQ by EN/MS/device/role, same task | NGO confirmation and qualified translation review pending |
| Response time | Measured HTTP elapsed median/p95/max, status/error count and concurrency | Local synthetic benchmark, no production SLA extrapolation |

Each evidence row records acceptance ID, exact FE/BE SHA, migration/contract, command/exit, environment, start/end, numerator/denominator, raw evidence hash, reviewer and limitations. Never combine engineering pass rates, questionnaire scores and funder approval into a single percentage.

## Cost model and executable scenarios

Use `cost-template.json`; amounts share one currency and monthly accounting period. Required categories: hosting, database, storage, support, training, notifications and security. Each amount is classified actual invoice / quote / estimate / synthetic assumption / unknown, with source/date. Unknown remains null, never silently zero. Add explicit per-registration variable cost and scenario volume; total divided by volume gives scenario cost per registration only when every category is known. Annual/one-time training or security costs need a stated amortization period before input. Avoid double-counting included hosting/database or support staffing.

```powershell
python -B -X utf8 scripts/evaluate_phase2.py cost --input docs/dev/phase2/evaluation/cost-template.json --output <local-cost-results.json>
```

The default100/1000/5000 volumes are **arithmetic planning scenarios, not tested user counts**. They return unknown total/per-registration cost until source amounts are supplied. The calculator rejects a declared period other than `month`; it does not silently relabel annual amounts or amortize them. Existing local subscription/runtime reuse is not evidence of free production hosting, maintenance or notifications. No paid provider was purchased or SMS delivery fabricated.

## Finite scalability protocol

After the candidate is fixed, run a bounded public read benchmark at declared concurrency and request count, record every status/elapsed time and source pair, native process CPU/working-set snapshots and DB identity. Reuse offline batch timing from actual bounded native tests, or execute one explicitly sized synthetic batch with stable IDs and fresh DB readback. Retain first failures. Record machine/runtime, warm/cold distinction, payload size and interfering local services. Do not extrapolate a localhost test into5000 simultaneous users. Report process-resource snapshots separately from profiler-level peak/total CPU claims.

## Operational risk register

| Risk | Current control / evidence needed | Release implication |
|---|---|---|
| Role removed while device offline | Fresh same-actor DB-role authorization on every sync/receipt request | Cached identity permits synthetic capture only; not server authorization |
| Shared/lost device exposes local records | Actor partition/logout lock, explicit delete/retention; IndexedDB is unencrypted | Real sensitive data BLOCKED pending encryption/key lifecycle/security review |
| Unknown write / duplicate replay | Stable IDs, durable receipts, transaction/UNIQUE constraints, reconcile before retry | Bounded native failure/race evidence required |
| Storage eviction/private mode | Persist request/estimate/error UI; no permanent-storage promise | Training and backup/recovery plan needed; physical-device NOT_RUN |
| Private supporting document leakage | Purpose separation, authenticated owner/event-owner read, no public upload path | Targeted ACL/type/size tests; no claim malware scanning complete |
| Database/disk loss | Isolated data retained; migration identity and repeatability checked | Production backup scheduling/encryption/off-host restore NOT_RUN |
| Audit/support diagnostics leak PII | Bounded codes/IDs, SQL parameter logging disabled, private evidence excluded from Git | Log review required; no general compliance certification |
| Backend/PR dependencies drift | Fixed SHA pair/contract/migration and source-bound launcher | Review parent stack separately; no automatic merge/deploy |
| Unfunded notifications/support | Explicit unknown cost and BLOCKED_PROVIDER | No delivery/phone-verified badge; provider consent/cost review needed |
| Staff/language accessibility mismatch | Independent task framework and qualified language review pending | Human usability and funder acceptance cannot be replaced by tests |

## Funder brief

The candidate aims to reduce repeated data entry during intermittent connectivity while preserving server authorization and state. Measurable engineering outcomes are durable synthetic capture, reconciliation without additional effects, and auditable registration status. Benefits to NGO staff or communities remain hypotheses until actual field study and baseline comparison. Investment decisions need real demand, staffing, retention/security policy, hosting/storage/support quotes, provider selection and human/funder review. Current sustainability verdict is **conditional technical feasibility; operational and financial baseline incomplete**, not ROI or production approval.
