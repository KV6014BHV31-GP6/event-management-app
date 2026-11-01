# User-side evaluation package

Current status: **REAL_USER_STUDY_NOT_RUN**. Automated/synthetic execution checks engineering behavior and measurement tools only. Do not manufacture interviews, SEQ answers, SUS ratings or human task times. Engineering acceptance, user research and funder review have separate ledgers.

## Session and privacy procedure

Recruit actual consenting adults separately for participant, guest, organizer, community leader and NGO field-worker contexts. Use synthetic accounts/records and a dedicated device. Explain that the product is being evaluated, participation is optional, stopping/skipping has no effect on services, and no real health/National ID/contact data should be entered. Record consent as a boolean outside the product; keep any recruitment contact separately with access control. Anonymous codes P001 etc only; no name/email/phone/IP in exports. Do not record passwords/tokens/forms or video by default. Ask separately before any recording. Delete identifiable recruitment linkage after scheduling; retain anonymized study records for the approved study period (proposed30days, requires owner/NGO approval), then delete and log completion.

Record exact frontend/backend SHA, migration/contract, device/browser/viewport/input method, role, language, scenario and facilitator assistance. Counterbalance English/Malay and before/after order where feasible. Do not compare an organizer desktop cohort with participant mobile as a causal redesign effect. Screen-reader/physical-device/language-interpreter sessions must be explicitly identified.

## U1–U10 task script

Use the scenario goal without revealing button names. Start timing after the participant confirms the task, stop at its observable completion or explicit abandonment. Maximum5minutes per task (U7/U8 combined10minutes); record timeout as failed attempt. Unavailable environment before starting is NOT_RUN, not a successful zero-second task. Assistance is an error event and is described anonymously in the severity tracker.

| ID | Role / scenario | Observable success | Predefined error opportunities |
|---|---|---|---|
| U1 | Participant: find a named upcoming event and its date/place | Correct server event/detail opened | Wrong event, lost query, inaccessible navigation |
| U2 | Guest: apply without an account | One acknowledged pending receipt, no account/login | Unnecessary login, repeated write, confusing pending with approval |
| U3 | Participant: create/login and apply to selected event | Correct actor/event and one receipt | Lost event, wrong identity, validation misunderstanding |
| U4 | Participant: retrieve and cancel own application | Fresh own GET and confirmed cancellation | Wrong record, missing confirmation, stale success |
| U5 | Organizer: create/edit event and use up to3 demo images | Real association and Reload-preserved fields | Wrong image/limit, accidental field overwrite, unknown-result resubmit |
| U6 | Organizer: review optional evidence and approve/waitlist | Authorized document access and correct server status/quota | Exposed other-owner file, treating pending/synced as approved |
| U7 | Leader/NGO worker: download event and capture3 synthetic records disconnected | App opens, three local durable records read back | Unverified event, storage failure ignored, local save mistaken for server sync |
| U8 | Leader: restart, reconnect and reconcile/sync without duplicates | Stable IDs, durable server receipts and unchanged replay count | New IDs on retry, uncertain outcome silently resent, wrong account |
| U9 | Each role: switch English/Malay then Reload offline/online | Selection/labels/date formatting retained; usable task controls | Missing translation, clipped text, inaccessible names |
| U10 | Mobile participant/NGO worker: navigate and share a public event | Mobile flow works; only explicit share opens public event text/link | Desktop-only control, PII in share text, accidental external send |

Error codes: navigation (includes assistance), validation, duplicate_action, authorization, data_mismatch, uncertain_recovery, language, accessibility. Count each observed event once per occurrence. Primary error denominator is **attempted tasks with at least one error / attempted tasks**. Also report total error events per attempted task (may exceed1; not a percent). Completion denominator is attempted tasks; NOT_RUN is excluded and reported separately. Record time both for all timed attempts and success-only attempts; missing timings remain null.

## SEQ and original ten-item SUS

Immediately after each attempted task, use the seven-point Single Ease Question: “How easy or difficult was it to complete this task?” Endpoints1Very difficult and7Very easy; do not fill ratings for participants. [Instrument authors' method](https://measuringu.com/seq10/).

After the whole session, administer **all ten original English SUS items, in order**, from John Brooke's instrument reproduced in [Brooke2013, SUS: A Retrospective](https://iihm.imag.fr/coutrix/ens/M2-MoSIG-HiL/1stAssignment/UsabilityQuestionnaire/JUS_Brooke_February_2013.pdf). The instrument reference is retained rather than silently rewriting its wording into a new scale. The anonymous template has S1–S10 in the original order and five response positions1Strongly disagree through5Strongly agree. A qualified approved Malay instrument is required before claiming a validated Malay SUS; technical UI translation is not psychometric validation. If respondents cannot use the approved instrument, record SUS NOT_RUN.

Scoring implemented by `scripts/evaluate_phase2.py`: sum `(response−1)` for odd items and `(5−response)` for even items, then multiply by2.5. Range0–100 is a scale score, not percent success. Missing items are not imputed. Original source: Brooke,J.(1996), “SUS: A quick and dirty usability scale”; retrospective above explains provenance and reusable instrument. The calculator's synthetic anchor checks0/50/100 are mathematical fixtures, not user scores.

## Execution and before/after

Copy `anonymous-session-template.json` outside Git, fill only actual observations, then run:

```powershell
python -B -X utf8 scripts/evaluate_phase2.py usability --input <anonymous-input.json> --output <local-results.json>
python -B -m unittest discover -s scripts/tests -p test_evaluate_phase2.py
```

The result groups by version/role/device/language and explicitly distinguishes synthetic pilots from declared human input. The tool does not independently prove participants exist or approve the product. Store SHA-bound evidence links per task in the companion evidence ledger. Compare matching cohorts before/after: success rate, task-error rate, median successful/all time, SEQ mean and SUS mean with their sample counts. `timed_attempts` and `timed_success_attempts` are separate denominators; a successful task with missing timing does not enter the success-only time median. Do not replace a missing baseline with invented values or infer causality from a synthetic run.

Severity tracker columns: finding_id,task_id,version,role,device,language,observed_behavior,expected_behavior,frequency_n,opportunity_n,severity,owner,fix_sha,retest_evidence,state. Severity0information/1minor/2major/3task-blocking/4privacy-or-data-loss; frequency and impact are independent. Preserve original failures; before/after results remain NOT_RUN until observations exist.
