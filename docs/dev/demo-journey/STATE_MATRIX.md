# Interaction and failure states

| Surface | Normal | Failure/edge | Evidence required |
|---|---|---|---|
| Event list/detail | loading→data | empty/error/closed/postponed/full; unknown quota | real response + viewport |
| Auth | Guest/logged-in fresh role |401/403/revoked/account switch | server denied effect; UI locks |
| Private files | empty/count/loading/thumbnail |401/403/404/missing/corrupt/unsupported/PDF fallback | component + native Browser ACL |
| Viewer | fit/zoom/download/close | actor change/stale response/record change/unmount | aborted or ignored old work; all Blob references released |
| Local save | draft→commit→readback | quota/storage denied/corruption/eviction | no false saved state; original form retained |
| Sync | fixed batch→POST→receipt | partial reject/duplicate/lost ACK/invalid receipt | immutable IDs/payload and per-item results |
| Recovery | GET receipt |401 login same actor;403 lock;404 bounded waiting;409 immutable conflict | no new IDs or blind business replay |
| Attendance | eligible approved→checked in | duplicate/cancelled/pending sync/conflict | independent operation ID + server readback |
| Closeout | computed draft→finalized | unresolved attendance, unauthorized, repeat | actual totals + consistent snapshot |
| Providers | persisted Demo outbox/template/OTP | duplicate/expired/wrong/used/rate limit | no real transmission claim |
