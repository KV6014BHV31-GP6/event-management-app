import { beforeEach, expect, it, vi } from 'vitest';
import {
  ACCOUNT_PREFIX, ACCOUNT_VERSION, RECOVERY_MARKER_KEY, createAccountClient,
  parseRecoveryCode, recoveryCode, validateNewPassword, validateProfileInput,
} from './account-api.js';

const ACTOR = '01K00000000000000000000001';
const CHALLENGE = '10000000-0000-4000-8000-000000000001';
const NOW = '2026-11-03T08:00:00Z';
const secret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const password = () => crypto.randomUUID();
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const errorReply = (code, status) => reply({ detail: { code, message: 'Untrusted server text must never be shown.' } }, status);
const receipt = (body, effects, kind = 'account_test') => ({
  contract_version: ACCOUNT_VERSION, operation_id: body.operation_id, kind,
  resource_id: ACTOR, resource_version: 1, recorded_at: NOW, outcome: 'applied', effects,
});
const resetEffects = { credentials_changed: true, reauthentication_required: true };
const profile = (version = 0) => ({ contract_version: ACCOUNT_VERSION,
  account: { id: ACTOR, username: 'synthetic-account', role: 'user' },
  profile: { display_name: 'Synthetic account', preferred_language: 'en', version, updated_at: version ? NOW : null }, as_of_utc: NOW });
const authorize = fn => fn('synthetic-bearer', { id: ACTOR, role: 'user' });
beforeEach(() => localStorage.clear());

it('accepts only canonical combined capability codes and validates UTF-8 password bytes', () => {
  const code = recoveryCode(CHALLENGE, secret());
  expect(parseRecoveryCode(code).challenge_id).toBe(CHALLENGE);
  for (const invalid of [CHALLENGE, code + '.', code.replace('10000000', 'ABCDEF00'), CHALLENGE + '.' + 'A'.repeat(42) + 'B'])
    expect(() => parseRecoveryCode(invalid)).toThrow();
  expect(() => validateNewPassword('字'.repeat(4))).not.toThrow();
  expect(() => validateNewPassword('字'.repeat(25))).toThrow();
  expect(() => validateNewPassword('a'.repeat(11))).toThrow();
  expect(() => validateNewPassword('a'.repeat(12), 'b'.repeat(12))).toThrow();
});
it('validates trimmed profile fields and preserves both admitted fields including version0', async () => {
  expect(validateProfileInput({ display_name: '  合成名字  ', preferred_language: 'ms' })).toEqual({ display_name: '合成名字', preferred_language: 'ms' });
  for (const values of [{ display_name: ' ', preferred_language: 'en' }, { display_name: 'x\n', preferred_language: 'xx' }, { display_name: 'a'.repeat(81), preferred_language: 'en' }])
    expect(() => validateProfileInput(values)).toThrow();
  const fetchImpl = vi.fn(async (path, options) => options.method === 'GET' ? reply(profile())
    : reply(receipt(JSON.parse(options.body), { account_id: ACTOR, profile_version: 1 })));
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  expect((await client.getProfile()).profile.version).toBe(0);
  await client.saveProfile({ display_name: ' Edited ', preferred_language: 'ms' }, 0);
  const [, options] = fetchImpl.mock.calls[1];
  expect(JSON.parse(options.body)).toMatchObject({ expected_version: 0, data: { display_name: 'Edited', preferred_language: 'ms' } });
  expect(client.pendingProfile()).toBeNull();
});
it.each(['foreign actor', 'malformed profile', 'invalid language'])('refuses %s profile responses', async kind => {
  const data = profile();
  if (kind === 'foreign actor') data.account.id = 'foreign';
  if (kind === 'malformed profile') data.profile.version = true;
  if (kind === 'invalid language') data.profile.preferred_language = 'xx';
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl: async () => reply(data) });
  await expect(client.getProfile()).rejects.toMatchObject({ code: 'UNKNOWN' });
});
it('fresh authorization failure sends nothing and never substitutes another actor', async () => {
  const fetchImpl = vi.fn();
  const client = createAccountClient({ actorId: ACTOR, authorize: fn => fn('token', { id: 'other' }), fetchImpl });
  await expect(client.getProfile()).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each([['STALE_VERSION', 409], ['TRANSACTION_CONFLICT', 409], ['INVALID_INPUT', 422]])('releases only a known original rollback %s', async (code, status) => {
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl: async () => errorReply(code, status) });
  await expect(client.saveProfile({ display_name: 'Changed', preferred_language: 'en' }, 0)).rejects.toMatchObject({ code, status });
  expect(client.pendingProfile()).toBeNull();
});
it('retains an unknown profile save and reads the original actor-bound receipt before further saves', async () => {
  let original;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); throw new TypeError(); }
    return reply(receipt(original, { account_id: ACTOR, profile_version: 1 }));
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(client.saveProfile({ display_name: 'Changed', preferred_language: 'en' }, 0)).rejects.toMatchObject({ unknown: true });
  await expect(client.saveProfile({ display_name: 'Different', preferred_language: 'en' }, 0)).rejects.toMatchObject({ code: 'PENDING' });
  await client.reconcileProfile();
  expect(fetchImpl.mock.calls[1][0]).toBe(`${ACCOUNT_PREFIX}/me/profile/receipts/${original.operation_id}`);
  expect(client.pendingProfile()).toBeNull();
});
it('issues via the real directory scope and reveals synthetic delivery only on explicit request', async () => {
  const capability = secret();
  const fetchImpl = vi.fn(async (path, options) => {
    if (path.endsWith('/accounts')) return reply({ accounts: [{ id: ACTOR, username: 'synthetic-participant', role: 'user', enabled: true, version: 1 }], as_of_utc: NOW });
    if (path.endsWith('/demo-message')) return reply({ challenge_id: CHALLENGE, provider: 'DEMO_PROVIDER', recovery_secret: capability, external_delivery: false, identity_verified: false });
    return reply(receipt(JSON.parse(options.body), { challenge_id: CHALLENGE, expires_at: NOW, provider: 'DEMO_PROVIDER', delivery_state: 'demo_recorded', external_delivery: false, identity_verified: false }));
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await client.getDirectory();
  await client.issueChallenge(ACTOR);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body).data).toEqual({ account_id: ACTOR, synthetic: true });
  await client.revealChallenge(CHALLENGE);
  expect(fetchImpl.mock.calls[2][0]).toBe(`${ACCOUNT_PREFIX}/account-recovery/challenges/${CHALLENGE}/demo-message`);
  expect(localStorage.length).toBe(0);
});
it('keeps only an allowlisted marker on lost ACK and needs capability re-entry after client recreation', async () => {
  const capability = secret(), chosen = password(), code = recoveryCode(CHALLENGE, capability);
  let original;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); throw new TypeError(); }
    return reply(receipt(original, resetEffects));
  });
  const first = createAccountClient({ fetchImpl });
  await expect(first.resetPassword(code, chosen)).rejects.toMatchObject({ unknown: true });
  const raw = localStorage.getItem(RECOVERY_MARKER_KEY), marker = JSON.parse(raw);
  expect(Object.keys(marker).sort()).toEqual(['challenge_id', 'endpoint', 'operation_id', 'unknown']);
  expect(raw.includes(capability) || raw.includes(chosen) || raw.includes('new_password')).toBe(false);
  const client = createAccountClient({ fetchImpl });
  await expect(client.reconcileReset('')).rejects.toMatchObject({ code: 'CODE' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await client.reconcileReset(code);
  const [url, options] = fetchImpl.mock.calls[1];
  expect(url.includes(capability) || url.includes(chosen)).toBe(false);
  expect(options.headers['X-Account-Recovery'] === capability).toBe(true);
  expect(options.headers).not.toHaveProperty('Authorization');
  expect(options).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  expect(localStorage.getItem(RECOVERY_MARKER_KEY)).toBeNull();
});
it('treats an explicit500 OPERATION_OUTCOME_UNKNOWN as unknown and never retries automatically', async () => {
  const fetchImpl = vi.fn(async () => errorReply('OPERATION_OUTCOME_UNKNOWN', 500));
  const client = createAccountClient({ fetchImpl });
  await expect(client.resetPassword(recoveryCode(CHALLENGE, secret()), password())).rejects.toMatchObject({ code: 'UNKNOWN', status: 500, unknown: true });
  const marker = client.pendingRecovery();
  expect(marker.unknown).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(client.retryReset(recoveryCode(CHALLENGE, secret()), password())).rejects.toMatchObject({ code: 'RETRY' });
  expect(client.pendingRecovery().operation_id).toBe(marker.operation_id);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('retries only the original ID after explicit unused404 and another receipt GET', async () => {
  let original, posts = 0;
  const capability = secret(), code = recoveryCode(CHALLENGE, capability), chosen = password();
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'GET') return errorReply('NOT_FOUND', 404);
    posts++;
    const body = JSON.parse(options.body);
    if (posts === 1) { original = body; throw new TypeError(); }
    expect(body.operation_id).toBe(original.operation_id);
    expect(body.data.new_password === chosen).toBe(true);
    return reply(receipt(body, resetEffects));
  });
  const client = createAccountClient({ fetchImpl });
  await expect(client.resetPassword(code, chosen)).rejects.toThrow();
  await expect(client.retryReset(code, chosen)).rejects.toMatchObject({ code: 'RETRY' });
  await expect(client.reconcileReset(code)).rejects.toMatchObject({ status: 404 });
  expect(posts).toBe(1);
  await client.retryReset(code, chosen);
  expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET', 'GET', 'POST']);
  expect(client.pendingRecovery()).toBeNull();
});
it.each([['IMMUTABLE_CONFLICT', 409], ['RECOVERY_INVALID', 403]])('retains unresolved original ID after a replay %s', async (code, status) => {
  let posts = 0;
  const fetchImpl = vi.fn(async (path, options) => options.method === 'GET' ? errorReply('NOT_FOUND', 404)
    : ++posts === 1 ? errorReply('OPERATION_OUTCOME_UNKNOWN', 500) : errorReply(code, status));
  const client = createAccountClient({ fetchImpl });
  const combined = recoveryCode(CHALLENGE, secret());
  await expect(client.resetPassword(combined, password())).rejects.toThrow();
  const id = client.pendingRecovery().operation_id;
  await expect(client.reconcileReset(combined)).rejects.toMatchObject({ status: 404 });
  await expect(client.retryReset(combined, password())).rejects.toMatchObject({ code, status });
  expect(client.pendingRecovery().operation_id).toBe(id);
  await expect(client.resetPassword(combined, password())).rejects.toMatchObject({ code: 'PENDING' });
  expect(posts).toBe(2);
});
it('keeps unknown on revoked receipt access and cannot read with a different challenge', async () => {
  let post = true;
  const fetchImpl = vi.fn(async () => { if (post) { post = false; throw new TypeError(); } return errorReply('RECOVERY_INVALID', 403); });
  const combined = recoveryCode(CHALLENGE, secret()), client = createAccountClient({ fetchImpl });
  await expect(client.resetPassword(combined, password())).rejects.toThrow();
  await expect(client.reconcileReset(recoveryCode('20000000-0000-4000-8000-000000000002', secret()))).rejects.toMatchObject({ code: 'CODE' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(client.reconcileReset(combined)).rejects.toMatchObject({ status: 403 });
  expect(client.pendingRecovery()).not.toBeNull();
});
it('suppresses concurrent reset submits before the first asynchronous boundary', async () => {
  let resolve;
  const fetchImpl = vi.fn((path, options) => new Promise(done => { resolve = () => done(reply(receipt(JSON.parse(options.body), resetEffects))); }));
  const client = createAccountClient({ fetchImpl }), combined = recoveryCode(CHALLENGE, secret());
  const first = client.resetPassword(combined, password());
  await expect(client.resetPassword(combined, password())).rejects.toMatchObject({ code: 'PENDING' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  resolve(); await first;
});
it.each(['write denied', 'readback mismatch', 'corrupt marker'])('sends no reset when marker storage has %s', async mode => {
  const fetchImpl = vi.fn();
  const storage = mode === 'corrupt marker' ? { getItem: () => '{"data":{"new_password":"not-permitted"}}' }
    : { getItem: () => null, setItem: () => { if (mode === 'write denied') throw new Error(); } };
  const client = createAccountClient({ storage, fetchImpl });
  await expect(client.resetPassword(recoveryCode(CHALLENGE, secret()), password())).rejects.toMatchObject({ code: 'STORAGE' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('rejects malformed successful receipts and sanitizes ordinary error text', async () => {
  const client = createAccountClient({ fetchImpl: async () => reply({ outcome: 'applied', effects: resetEffects }) });
  await expect(client.resetPassword(recoveryCode(CHALLENGE, secret()), password())).rejects.toMatchObject({ unknown: true });
  expect(client.pendingRecovery()).not.toBeNull();
  const protectedClient = createAccountClient({ actorId: ACTOR, authorize, fetchImpl: async () => errorReply('FORBIDDEN', 403) });
  await expect(protectedClient.getDirectory()).rejects.toMatchObject({ message: 'This account action is not available to your current account.' });
});
it('refuses secret-bearing receipt extensions and keeps the original unresolved marker', async () => {
  const privateValue = secret();
  const client = createAccountClient({ fetchImpl: async (path, options) => reply({
    ...receipt(JSON.parse(options.body), resetEffects), recovery_secret: privateValue,
  }) });
  await expect(client.resetPassword(recoveryCode(CHALLENGE, secret()), password())).rejects.toMatchObject({ unknown: true });
  expect(client.pendingRecovery()).not.toBeNull();
  expect(JSON.stringify(Object.values(localStorage)).includes(privateValue)).toBe(false);
});
it('reconciles a lost issuance ACK without issuing a replacement challenge or revealing its delivery', async () => {
  let original;
  const effects = { challenge_id: CHALLENGE, expires_at: NOW, provider: 'DEMO_PROVIDER', delivery_state: 'demo_recorded', external_delivery: false, identity_verified: false };
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); throw new TypeError(); }
    return reply(receipt(original, effects));
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(client.issueChallenge(ACTOR)).rejects.toMatchObject({ unknown: true });
  const marker = client.pendingIssue();
  await expect(client.issueChallenge(ACTOR)).rejects.toMatchObject({ code: 'PENDING' });
  await client.reconcileIssue();
  expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET']);
  expect(fetchImpl.mock.calls[1][0]).toBe(`${ACCOUNT_PREFIX}/receipts/${marker.operation_id}`);
  expect(client.pendingIssue()).toBeNull();
});
it('also requires original-ID receipt reconciliation after a reset transaction rollback409', async () => {
  const client = createAccountClient({ fetchImpl: async () => errorReply('TRANSACTION_CONFLICT', 409) });
  const combined = recoveryCode(CHALLENGE, secret());
  await expect(client.resetPassword(combined, password())).rejects.toMatchObject({ code: 'TRANSACTION_CONFLICT', status: 409 });
  const marker = client.pendingRecovery();
  expect(marker).not.toBeNull();
  await expect(client.retryReset(combined, password())).rejects.toMatchObject({ code: 'RETRY' });
  expect(client.pendingRecovery().operation_id).toBe(marker.operation_id);
});
