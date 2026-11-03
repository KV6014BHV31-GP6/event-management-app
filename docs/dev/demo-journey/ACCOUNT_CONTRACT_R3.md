# Coordinated clarification 6: account profile and recovery

Controller engineering contract LOCKED for DEMO-FULL-JOURNEY-20261103, R3 account-v1. Source baseline2e95f9882b20b39c3e0ee9f17e043cb6df3efc64. This is the normative successor to the worker proposal; where wording differs this document governs. It will be admitted to the shared tracked contract before integration. Original Amended T-01-01 and AC01-01/03/04; original DOCX SHA2561db8980ad415a89bf741ba1c4a717232577d09f9f17137cf8d7d7b6f373710c3. Independent Astra/max pre-lock review supplied two corrections retained below. Existing rose.demo-journey.v1 and rose.offline-sync.v2 identities remain.

Risk: credential replacement and revocation need a real atomic database boundary. No anonymous username-only issuance, no real phone/email identity claim, no role mutation through profile. All new recovery delivery is explicit DEMO_PROVIDER; authentication, hashing, profile persistence, authorization, transaction and receipt are REAL_LOCAL. Policy owner=proposal, synthetic-only; no NGO or production approval implied.

## API and fields

Prefix /api/v2/operations. Mutations use existing immutable envelope {contract_version,operation_id,expected_version?,data}; canonical UUID; existing immutable200 receipt shape and bounded {detail:{code,message}} errors. Register explicit routes before catch-all. No v1 response or existing route removal.

| Route | Contract |
|---|---|
| GET /me/profile | Fresh enabled authenticated actor, any role. {contract_version,account:{id,username,role},profile:{display_name,preferred_language,version,updated_at},as_of_utc}. Absent profile: version0, display_name=username, preferred_language=en, updated_at=null; GET never creates rows. |
| POST /me/profile | Both data fields required: display_name trimmed Unicode1–80 with no control characters; preferred_language=en or ms. expected_version mandatory including0. Unknown fields forbidden. Receipt effects={account_id,profile_version}; current GET follows historical receipt. No identity/role/password/Participant/historical registration snapshot changes. |
| GET /me/profile/receipts/{operation_id} | Only current enabled original actor and profile-update kind. Exact replay returns old receipt; foreign actor403; changed sameID409; stale new operation409. |
| POST /account-recovery/challenges | Current enabled Organizer listed in server NU_DEMO_OWNER_IDS; server synthetic profile and nonempty namespace required. data={account_id,synthetic:true}; no expected_version. Target enabled, namespace-prefixed, with existing account:<id> sidecar. effects={challenge_id,expires_at,provider:DEMO_PROVIDER,delivery_state:demo_recorded,external_delivery:false,identity_verified:false}. No secret in receipt. |
| GET /account-recovery/challenges/{id}/demo-message | Current original issuer still enabled/designated Organizer; target enabled/current namespace/managed sidecar/generation; challenge live and unused. Return {challenge_id,provider:DEMO_PROVIDER,recovery_secret,external_delivery:false,identity_verified:false}. Cache-Control:no-store. |
| POST /account-recovery/challenges/{id}/reset | Anonymous capability authentication in X-Account-Recovery, never URL. data={new_password},12–72UTF8bytes, no expected_version. Generic403 RECOVERY_INVALID for wrong/unknown/expired/exhausted/used/ineligible capability. Success effects={credentials_changed:true,reauthentication_required:true}; clear refresh cookie, explicit login required; no issued auth token. |
| GET /account-recovery/challenges/{id}/receipts/{operation_id} | Same original capability; current issuer/target scope must remain valid. Return only matching committed reset receipt. A valid live unused challenge with no receipt returns404 NOT_FOUND. A used challenge bound to a different operation returns403 RECOVERY_INVALID. A committed matching receipt is readable for24hours after success regardless of original5minute mutation expiry; after that generic403. |

Protected errors:401 AUTH_REQUIRED,403 FORBIDDEN,422 INVALID_INPUT,409 STALE_VERSION/IMMUTABLE_CONFLICT/TRANSACTION_CONFLICT,429 RECOVERY_RATE_LIMIT. Anonymous structurally invalid envelope/password422 without echoing submitted values; valid capability sameID changedpassword409. No password, secret, raw body, contact or account existence details in ordinary errors/logs. Add no-store to sensitive responses, including failures.

## Recovery transaction, replay and policy

- Secret is canonical base64url256bits; hash stored, constant-time compare. Explicit local Demo provider derives it using domain-separated HMAC(serversecret,randomnonce+challengeID+target+issuer+namespace); database contains only hash/nonce/bindings. No plaintext secret storage.
- Five-minute mutation validity, maximum five durably counted wrong attempts. New issuance limited to3per target/10minutes and30per issuer/10minutes using persisted history under sorted user locks. Exact issuance replay checks current issuer/scope and returns original receipt without rate consumption or new expiry. A different successful issuance atomically invalidates prior unused challenges for the target; UI states that it replaces an older secret.
- Reset first reads binding, locks issuer+target user rows in sorted ID order, then reloads challenge/security. Current issuer enabled/Organizer/allowlist and target enabled/namespace/managed sidecar are checked again. Revocation after issuance blocks a new reset. No owner_profile issuer-first lock shortcut.
- Authenticate original capability before looking up any operation. Reset fingerprint is domain-separated server-keyed HMAC over canonical path/challenge/envelope/exact password and capability binding; never public unsalted password SHA. A committed exact operation+fingerprint returns the original receipt without changing any credential/audit/delivery, even after used flag or generation changed, but ONLY within the same24hour receipt deadline and current issuer/target scope. SameID changedpassword409. New operation under used challenge403. Foreign challenge/capability never recovers another result.
- New reset additionally enforces live/unexpired/attempt bound/not invalidated and issued generation=current. Password hash, generation increment, used operation/time, all other target challenge invalidation and sanitized immutable receipt commit atomically. Precommit failure rolls back all effects. Lost ACK means unknown: GET receipt first, then only deliberate exact originalID/payload retry when no receipt and still live. Never substitute a UUID or password to guess success.
- If issuer/target is revoked after success, readback is refused but committed password change is not undone or repeated. UI retains unresolved marker; deliberate new-credential login can establish outcome. Receipt is historical and never overwritten by later changes.
- Native serialization/deadlock returns controlled409 TRANSACTION_CONFLICT after full rollback; no automatic business retry. Global operation UUID uniqueness still binds actor/path/payload and prevents cross-route receipt confusion.

## Credential generation and all affected routes

New access and refresh JWTs carry integer token_version. Missing legacy claim means0 only while database generation0; boolean/negative/malformed claims reject. Both JSON login and OAuth form login, plus refresh, lock/reload their user row before validating credential/generation/enabled state and minting tokens. Reset shares this serialization so old-password login cannot acquire the new generation.

Ordinary authentication records the validated generation in request/session-scoped context without acquiring a user lock before an event lock. After product domain locks, fresh enabled/current-generation checks MUST cover managed policy.fresh, phase2 fresh_actor and legacy approval callers of policy.enabled, AND legacy/unmanaged registration cancellation after its event/registration locks (src/registrations/service.py). Merely changing policy.fresh is insufficient. Direct internal calls without bearer context must retain their admitted semantics, but HTTP authenticated routes may not omit the generation binding. Native lock-wait tests prove stale access cannot resume mutation after reset commits. Logout UI still honestly describes local session clearing; reset server revocation is separate.

## Profile and signup persistence

Profile user-row lock serializes creation/version check/update/immutable receipt; two version0 saves have one winner. Own profile edits never alter username/role, Participant matching identity, booking contact or historical registration snapshots. EN/MS preference can be applied by explicit successful profile save in UI using existing localization.

Public signup remains role=user only. Inside its existing single transaction, create existing JourneyState account:<newID> enabled=true/version1 ONLY when server NU_DEMO_PROFILE=synthetic, configured nonempty namespace and username prefix match. No client synthetic authority and no legacy/nonnamespace backfill. Existing owner directory then exposes the new managed Participant for authorized recovery; assignable-leader directory still excludes user roles. Prove signup failure rolls back both records and real owner-directory GET selects the committed account.

## Explicit additive migration

Identity rose_account_recovery_20261103_v1; script backend/scripts/migrate_accounts.py. Typed tables account_security(user FK,nonnegative token_version), account_profiles(user FK,display_name,language,positive version,updated_at), account_recovery_challenges(UUID,target/issuer FK,namespace,secret_hash,nonce,issued generation,created/expires,attempts0..5,unique nullable used operation,used_at,invalidated), plus accounts_schema_migrations ledger. Required constraints/indexes are validated on first/repeat execution; no backfill. Missing security row means generation0; absent profile GET is projection only.

Exact dedicated development database acknowledgement, non-superuser, prerequisites and schema-shape validation, advisory migration lock; never automatic startup migration, no old database reset. Explicit bootstrap metadata on fresh test DB is not proof of migration. First/repeat/shape refusal and legacy-row fingerprint preservation must be recorded. Controller updates CI migration identity/run/readback and localCD after writer release; worker does not edit shared CI.

## Frontend and evidence contract

Profile form: loading/saved/stale/error/unknown states, real GET after save, existing identity and logout retained. Recovery entry from login; designated admin issuer chooses normal account directory, views clearly labelled synthetic delivery, and no automatic external message. Secret and new password only current component memory; never localStorage/IndexedDB/URLs/history/logs/exports/screenshots. Persist only challengeID,operationID,endpoint,unknown marker (no reset body). Reload requires re-entry of original secret before GET; original password re-entry required for deliberate exact retry. Inputs clear on success/cancel/unmount/actor change; stale response must not reveal prior account or secret. Double submit guard is supplementary to DB invariants. Actor replacement never inherits a protected profile or issuer result. Normal signup/recovery/login/profile journey must actually work.

Existing ROSE tokens and reusable form/notice styles; no brand/dependency/route redesign. Participant profile displays identity first, then editable display name/language. Organizer-only synthetic recovery is an explicitly separate section, hidden/locked by current server response, not a role-selector claim. Public recovery page explains assisted Demo delivery and unresolved result before destructive retry. All fields labelled, keyboard/focus/touch/mobile/EN-MS200%zoom verified at final candidate. No new cloud provider.

## Required RED to GREEN and acceptance

Separate controlled ASGI/SQLite, real native PostgreSQL, real browser and independent fixedSHA layers. Preserve initial failures and skips. Tests: own/foreign/revoked actor; profile stale/malformed/save failure; signup directory/atomic failure; issuer revoked and target disabled; no-demo/nonnamespace denial; expiry/attempt/rate/replaced secret; exact issuance/reset replay vs changed body; no plaintext secret/password in ledger; used receipt window including exactPOST; unused valid404 versus wrong used operation403; lostACK GET without duplicate generation; simultaneous sameID and competing reset; reset/login/refresh/deactivate races; legacy/unmanaged locked cancellation, phase2 and approval generation recheck; full atomic rollback and migration first/repeat/refusal. Capture actual refresh cookie from endpoint, both login forms, old access/refresh rejection, new password login. Browser final flow proves reload/relogin/native readback and memory-only sensitive fields.

Author completion is not independent acceptance. G0–G5 and required candidate CI plus fixedSHA independent review precede conditional dev_demo_ben merge. No production, human UAT or physical-device claim.

## Integration clarification 7: indeterminate connection or commit

The locked clarification6 body above has source SHA256 `0e71e64a52add565be277aae30beb9aead0aa5d836ea9730d177a55df311685f`. The controller and both writers accepted this additive error mapping: an indeterminate connection/commit failure returns bounded `500 OPERATION_OUTCOME_UNKNOWN` with `Cache-Control: no-store`. It makes no rollback assertion and permits no automatic business retry. Preserve the immutable operation ID, reconcile by GET, and use the existing exact-original-payload rules. Known PostgreSQL deadlock/serialization/integrity rollback remains `409 TRANSACTION_CONFLICT`. The native postcommit-fault author evidence records500 then the original durable receipt with one generation increment; final integrated independent acceptance remains required.


Admission: the clarification8 below was independently reviewed at Astra/max as `APPROVE_BOUNDED_AUTHOR_IMPLEMENTATION_ONLY`. Its external source SHA256 is `100daa7e1a9ca814dbd87e8a61ecb5928fb1ef86997de7101cb1f0c96f122959`. The proposal wording is now admitted for this synthetic Demo; this admission is not product/native/CI acceptance.

## Controller clarification 8: bounded protected account recovery

Task DEMO-FULL-JOURNEY-20261103, R3. Proposed engineering amendment to the tracked account contract at b9b6c7b0fcae4c5c91e4496d90eb0e45382362df (SHA25684d0f1f9364b4493bebde42952979f38a53cacc451cbd4850a09a2db6e0cf098). Source findings RO-B9-01/02. This adds complete recovery and strict response binding; it changes no Backend route/schema/business authority. Synthetic-only local Demo remains the acceptance boundary.

### Durable original protected request

The existing four-field reset marker remains unchanged: challenge_id, operation_id, endpoint, unknown. Password, recovery capability, auth token and reset body MUST NOT be persisted, hashed into public evidence or logged. They remain current component memory only.

For profile and challenge issuance only, permit a versioned typed original request record under the existing actor-specific storage namespace. Persist actor binding, canonical operation ID, exact endpoint and original envelope. A profile envelope contains only contract_version, operation_id, expected_version, data.display_name and data.preferred_language; an issuance envelope contains only contract_version, operation_id and data.account_id/synthetic=true. Reject unknown fields, mismatched actor/endpoint/operation IDs and malformed values. No contact fields, username/password/token/capability or arbitrary data are allowed. Ordinary logs, screenshots and public reports contain only counts/check results/operation IDs, never the stored profile body. This is not an encrypted personal-data production feature.

Before any initial protected POST, durably save and read back the exact allowed record. A storage failure, changed reference or corrupted record sends no POST and preserves existing data. Prevent two tabs/client instances from overwriting one unresolved operation; choose the smallest supported origin-scoped serialization mechanism, fail closed if required capability is unavailable, and test the failure path. Never silently replace a different pending ID.

Legacy four-field profile/issuance markers remain readable as unresolved references for receipt GET. They lack a trustworthy original body/version and therefore cannot be retried by inventing values or a new UUID. Explain their limitation and preserve the reference for manual source/receipt reconciliation. Do not clear them to hide a previous uncertain write.

### Manual original-ID reconciliation and retry

Reconciliation authenticates the same current actor and validates the complete receipt. A valid receipt clears only the matching stored operation; profile then reads current profile separately. A valid authenticated NOT_FOUND404 means only that no receipt was returned at that observation. It never means rollback or permission to discard/change the request.

After an explicit user reconciliation returned valid404, a separate deliberate retry may use only the durable exact original envelope. Read the original record again, confirm unchanged binding, and perform a fresh receipt GET immediately before sending. If GET returns a valid receipt, resolve without another POST. Any other GET result (including auth denial, conflict, server error, malformed response or transport unknown) preserves the reference and sends no POST. If GET still returns valid404, send the original ID and byte-equivalent canonical envelope; no automatic retry, new UUID, changed name/language/target/expected_version or silent overwrite. Preserve the original reference after any uncertain replay or refusal; no rollback claim based solely on a replay error.

Cancellation/unmount/actor replacement must not allow a stale completion to clear another actor or newer operation. Secret and delivery state still clear in memory. UI clearly separates checking original result, deliberately retrying that original request and beginning a later new action only after a validated resolution.

### Receipt binding

In addition to exact schema/version/operation ID/outcome/timestamp/effects:

- Profile: kind=account_profile_update, resource_id=current original actor ID, positive resource_version=effects.profile_version. If a durable original expected_version is available, require resource_version=expected_version+1.
- Issuance: kind=account_recovery_issue, resource_id=effects.challenge_id (canonical UUID), resource_version=1. The request's original target remains bound in the retained immutable envelope; no claim that an absent target field in the server receipt was independently verified.
- Reset: kind=account_password_reset, resource_id=original challenge ID, positive integer resource_version. This is credential generation, not challenge version1. Do not assume the target had generation0.

Wrong kind/resource/version, unknown fields or mismatched effects are outcome unknown, never success; keep the original reference and do not reveal delivery or clear inputs as completed. Tests must use actual Backend receipt families rather than invented account_test fixtures.

### Required bounded evidence

Preserve initial RED for precommit unknown→404 stranded profile/issuance and mismatched receipt binding. GREEN tests cover durable reload, original immutable retry, fresh GET receipt avoiding POST, storage failures, actor replacement, cross-instance serialization and malformed/401/403/409/500 receipt failures. Existing reset secret-lifecycle and exact-ID recovery tests remain. Relevant full React tests/build and real Browser flow are separate layers; no native security probe rejected by runtime is authorized through this amendment. Independent source/component review and remaining native acceptance blockers stay separate.
