import { beforeEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
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
const receipt = (body, effects, kind = effects.profile_version ? 'account_profile_update' : effects.challenge_id ? 'account_recovery_issue' : 'account_password_reset') => ({
  contract_version: ACCOUNT_VERSION, operation_id: body.operation_id, kind,
  resource_id: effects.account_id || effects.challenge_id || CHALLENGE, resource_version: effects.profile_version || 1, recorded_at: NOW, outcome: 'applied', effects,
});
const resetEffects = { credentials_changed: true, reauthentication_required: true };
const profile = (version = 0) => ({ contract_version: ACCOUNT_VERSION,
  account: { id: ACTOR, username: 'synthetic-account', role: 'user' },
  profile: { display_name: 'Synthetic account', preferred_language: 'en', version, updated_at: version ? NOW : null }, as_of_utc: NOW });
const authorize = fn => fn('synthetic-bearer', { id: ACTOR, role: 'user' });
const originLocks = () => {
  const held = new Set();
  return { request: vi.fn(async (name, options, callback) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); } finally { held.delete(name); }
  }) };
};
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: originLocks() });
});

it.each(['profile', 'issuance'])('follow-up RED: retains a durable original and offers deliberate retry after precommit404 for%s', async family => {
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') throw new TypeError();
    return errorReply('NOT_FOUND', 404);
  });
  const first = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  if (family === 'profile') await expect(first.saveProfile({ display_name: 'Synthetic original', preferred_language: 'en' }, 0)).rejects.toThrow();
  else await expect(first.issueChallenge(ACTOR)).rejects.toThrow();
  const next = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(family === 'profile' ? next.reconcileProfile() : next.reconcileIssue()).rejects.toMatchObject({ status: 404 });
  const raw = localStorage.getItem(`rose.demo.account-${family === 'profile' ? 'profile' : 'issue'}.v1.${ACTOR}`);
  expect(Boolean(JSON.parse(raw)?.request)).toBe(true);
  expect(typeof (family === 'profile' ? next.retryProfile : next.retryIssue)).toBe('function');
});
it.each(['kind', 'resource', 'version'])('follow-up RED: refuses a matching-ID reset receipt with wrong%s', async defect => {
  const fetchImpl = async (path, options) => {
    const value = { ...receipt(JSON.parse(options.body), resetEffects, 'account_password_reset'), resource_id: CHALLENGE };
    if (defect === 'kind') value.kind = 'account_recovery_issue';
    if (defect === 'resource') value.resource_id = '20000000-0000-4000-8000-000000000002';
    if (defect === 'version') value.resource_version = 0;
    return reply(value);
  };
  const client = createAccountClient({ fetchImpl });
  let refused = false;
  try { await client.resetPassword(recoveryCode(CHALLENGE, secret()), password()); } catch { refused = true; }
  expect(refused).toBe(true);
  expect(Boolean(client.pendingRecovery())).toBe(true);
});

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

const protectedKey = family => `rose.demo.account-${family === 'profile' ? 'profile' : 'issue'}.v1.${ACTOR}`;
const submitProtected = (client, family) => family === 'profile'
  ? client.saveProfile({ display_name: 'Synthetic original', preferred_language: 'en' }, 0) : client.issueChallenge(ACTOR);
const reconcile = (client, family) => family === 'profile' ? client.reconcileProfile() : client.reconcileIssue();
const retry = (client, family) => family === 'profile' ? client.retryProfile() : client.retryIssue();
const effectsFor = family => family === 'profile' ? { account_id: ACTOR, profile_version: 1 }
  : { challenge_id: CHALLENGE, expires_at: NOW, provider: 'DEMO_PROVIDER', delivery_state: 'demo_recorded', external_delivery: false, identity_verified: false };
it.each(['profile', 'issue'])('reloads the immutable%s original and sends identical bytes only after two explicit receipt observations', async family => {
  let original, wire, posts = 0;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'GET') return errorReply('NOT_FOUND', 404);
    const body = JSON.parse(options.body);
    if (++posts === 1) { original = body; wire = options.body; throw new TypeError(); }
    expect(options.body === wire).toBe(true);
    return reply(receipt(body, effectsFor(family)));
  });
  await expect(submitProtected(createAccountClient({ actorId: ACTOR, authorize, fetchImpl }), family)).rejects.toThrow();
  const saved = localStorage.getItem(protectedKey(family));
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(retry(client, family)).rejects.toMatchObject({ code: 'RETRY' });
  await expect(reconcile(client, family)).rejects.toMatchObject({ status: 404 });
  expect(localStorage.getItem(protectedKey(family)) === saved).toBe(true);
  await retry(client, family);
  expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET', 'GET', 'POST']);
  expect(localStorage.getItem(protectedKey(family))).toBeNull();
  if (family === 'issue') expect(client.resolvedIssueOriginal(original.operation_id).data.account_id === ACTOR).toBe(true);
});
it.each(['profile', 'issue'])('resolves%s from the fresh retry receipt without another POST', async family => {
  let original, reads = 0;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); throw new TypeError(); }
    return ++reads === 1 ? errorReply('NOT_FOUND', 404) : reply(receipt(original, effectsFor(family)));
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, family)).rejects.toThrow();
  await expect(reconcile(client, family)).rejects.toMatchObject({ status: 404 });
  await retry(client, family);
  expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET', 'GET']);
});
it.each(['401', '403', '409', '500', 'malformed404', 'wrong kind', 'transport'])('a fresh protected retry GET%s preserves the original and sends no POST', async failure => {
  let original, reads = 0;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); throw new TypeError(); }
    if (++reads === 1) return errorReply('NOT_FOUND', 404);
    if (failure === 'transport') throw new TypeError();
    if (failure === 'malformed404') return reply({}, 404);
    if (failure === 'wrong kind') return reply({ ...receipt(original, effectsFor('profile')), kind: 'account_recovery_issue' });
    const status = Number(failure);
    return errorReply(status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'IMMUTABLE_CONFLICT' : 'OPERATION_OUTCOME_UNKNOWN', status);
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, 'profile')).rejects.toThrow();
  const raw = localStorage.getItem(protectedKey('profile'));
  await expect(client.reconcileProfile()).rejects.toMatchObject({ status: 404 });
  await expect(client.retryProfile()).rejects.toThrow();
  expect(localStorage.getItem(protectedKey('profile')) === raw).toBe(true);
  expect(fetchImpl.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(client.canRetryProfile()).toBe(false);
});
it.each([401, 403, 409, 500])('a protected replay refusal%s never retires the unknown original', async status => {
  let posts = 0;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'GET') return errorReply('NOT_FOUND', 404);
    if (++posts === 1) throw new TypeError();
    return errorReply(status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'TRANSACTION_CONFLICT' : 'OPERATION_OUTCOME_UNKNOWN', status);
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, 'issue')).rejects.toThrow();
  const raw = localStorage.getItem(protectedKey('issue'));
  await expect(client.reconcileIssue()).rejects.toMatchObject({ status: 404 });
  await expect(client.retryIssue()).rejects.toMatchObject({ status });
  expect(localStorage.getItem(protectedKey('issue')) === raw).toBe(true);
  await expect(client.retryIssue()).rejects.toMatchObject({ code: 'RETRY' });
  expect(posts).toBe(2);
});
it.each(['profile', 'issue'])('legacy%s markers reconcile but cannot reconstruct or retry their missing original', async family => {
  const marker = { challenge_id: null, operation_id: crypto.randomUUID(), endpoint: family === 'profile' ? '/me/profile' : '/account-recovery/challenges', unknown: true };
  localStorage.setItem(protectedKey(family), JSON.stringify(marker));
  let committed = false;
  const fetchImpl = vi.fn(async () => committed ? reply(receipt({ operation_id: marker.operation_id }, effectsFor(family))) : errorReply('NOT_FOUND', 404));
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  expect(await (family === 'profile' ? client.profileOriginal() : client.issueOriginal())).toBeNull();
  await expect(reconcile(client, family)).rejects.toMatchObject({ status: 404 });
  await expect(retry(client, family)).rejects.toMatchObject({ code: 'LEGACY' });
  expect(fetchImpl.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  committed = true;
  const resolved = await reconcile(client, family);
  expect(localStorage.getItem(protectedKey(family))).toBeNull();
  if (family === 'issue') expect(client.resolvedIssueOriginal(resolved.operation_id)).toBeNull();
});
it.each(['profile kind', 'profile actor', 'profile version', 'profile expected', 'issue kind', 'issue challenge', 'issue version'])('strictly rejects%s receipt binding', async defect => {
  const family = defect.startsWith('profile') ? 'profile' : 'issue';
  const fetchImpl = async (path, options) => {
    const value = receipt(JSON.parse(options.body), effectsFor(family));
    if (defect.endsWith('kind')) value.kind = 'account_password_reset';
    if (defect.endsWith('actor') || defect.endsWith('challenge')) value.resource_id = '20000000-0000-4000-8000-000000000002';
    if (defect === 'profile version') value.resource_version = 0;
    if (defect === 'profile expected') { value.resource_version = 2; value.effects.profile_version = 2; }
    if (defect === 'issue version') value.resource_version = 2;
    return reply(value);
  };
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, family)).rejects.toMatchObject({ code: 'UNKNOWN' });
  expect(Boolean(localStorage.getItem(protectedKey(family)))).toBe(true);
});
it('accepts a bound reset receipt at credential generation3', async () => {
  const client = createAccountClient({ fetchImpl: async (path, options) => reply({ ...receipt(JSON.parse(options.body), resetEffects), resource_version: 3 }) });
  await client.resetPassword(recoveryCode(CHALLENGE, secret()), password());
  expect(client.pendingRecovery()).toBeNull();
});
it.each(['missing', 'rejected', 'busy'])('fails closed when required origin coordination is%s', async mode => {
  const fetchImpl = vi.fn();
  const lockManager = mode === 'missing' ? null : { request: mode === 'rejected' ? async () => { throw new Error(); } : async (name, options, callback) => callback(null) };
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  await expect(submitProtected(client, 'profile')).rejects.toMatchObject({ code: mode === 'busy' ? 'PENDING' : 'COORDINATION' });
  expect(fetchImpl).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
});
it('two client instances cannot queue a second initial POST or overwrite the first original', async () => {
  const lockManager = originLocks(); let rejectFirst;
  const fetchImpl = vi.fn(() => new Promise((resolve, reject) => { rejectFirst = reject; }));
  const first = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  const second = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  const initial = first.issueChallenge(ACTOR).catch(error => error);
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  const raw = localStorage.getItem(protectedKey('issue'));
  await expect(second.issueChallenge('different-target')).rejects.toMatchObject({ code: 'PENDING' });
  expect(localStorage.getItem(protectedKey('issue')) === raw).toBe(true);
  expect(lockManager.request.mock.calls.every(([, options]) => options.mode === 'exclusive' && options.ifAvailable === true)).toBe(true);
  rejectFirst(new TypeError()); await initial;
  await expect(second.issueChallenge('different-target')).rejects.toMatchObject({ code: 'PENDING' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('holds the origin lock through reconciliation and cannot clear a newer stored operation', async () => {
  let original, release;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); throw new TypeError(); }
    return new Promise(resolve => { release = () => resolve(reply(receipt(original, effectsFor('profile')))); });
  });
  const lockManager = originLocks(), first = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  await expect(submitProtected(first, 'profile')).rejects.toThrow();
  const second = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  const checking = first.reconcileProfile().catch(error => error);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  await expect(second.reconcileProfile()).rejects.toMatchObject({ code: 'PENDING' });
  const newer = JSON.stringify({ challenge_id: null, operation_id: crypto.randomUUID(), endpoint: '/me/profile', unknown: true });
  localStorage.setItem(protectedKey('profile'), newer);
  release(); expect((await checking).code).toBe('UNKNOWN');
  expect(localStorage.getItem(protectedKey('profile')) === newer).toBe(true);
});
it('cancellation during fresh authorization prevents a stale initial POST', async () => {
  let release;
  const fetchImpl = vi.fn();
  const client = createAccountClient({ actorId: ACTOR, fetchImpl, authorize: fn => new Promise((resolve, reject) => {
    release = () => Promise.resolve().then(() => fn('token', { id: ACTOR })).then(resolve, reject);
  }) });
  const submitting = submitProtected(client, 'profile').catch(error => error);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  client.cancelRequests(); release();
  expect((await submitting).code).toBe('UNKNOWN');
  expect(fetchImpl).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
});
it.each(['denied', 'readback mismatch'])('fails before initial protected POST on storage%s', async mode => {
  let raw = null;
  const fetchImpl = vi.fn(), storage = { getItem: () => raw, setItem: (key, value) => {
    if (mode === 'denied') throw new Error(); raw = value + ' ';
  } };
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, storage });
  await expect(submitProtected(client, 'profile')).rejects.toMatchObject({ code: 'STORAGE' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('refuses a corrupted nonsecret original digest without a receipt GET or POST', async () => {
  const fetchImpl = vi.fn(async () => { throw new TypeError(); });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, 'profile')).rejects.toThrow();
  const key = protectedKey('profile'), value = JSON.parse(localStorage.getItem(key));
  value.request.data.display_name = 'Changed local original';
  localStorage.setItem(key, JSON.stringify(value));
  fetchImpl.mockClear();
  await expect(client.reconcileProfile()).rejects.toMatchObject({ code: 'STORAGE' });
  await expect(client.profileOriginal()).rejects.toMatchObject({ code: 'STORAGE' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('a reference changed during the fresh retry GET is never overwritten or sent', async () => {
  let reads = 0;
  const newer = JSON.stringify({ challenge_id: null, operation_id: crypto.randomUUID(), endpoint: '/me/profile', unknown: true });
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') throw new TypeError();
    if (++reads === 2) localStorage.setItem(protectedKey('profile'), newer);
    return errorReply('NOT_FOUND', 404);
  });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, 'profile')).rejects.toThrow();
  await expect(client.reconcileProfile()).rejects.toMatchObject({ status: 404 });
  await expect(client.retryProfile()).rejects.toMatchObject({ code: 'UNKNOWN' });
  expect(localStorage.getItem(protectedKey('profile')) === newer).toBe(true);
  expect(fetchImpl.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});
it('holds the origin lock through the fresh retry GET, original POST and matching cleanup', async () => {
  let original, reads = 0, posts = 0, releaseRead, releasePost;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') {
      if (++posts === 1) { original = JSON.parse(options.body); throw new TypeError(); }
      return new Promise(resolve => { releasePost = () => resolve(reply(receipt(JSON.parse(options.body), effectsFor('issue')))); });
    }
    if (++reads === 1) return errorReply('NOT_FOUND', 404);
    return new Promise(resolve => { releaseRead = () => resolve(errorReply('NOT_FOUND', 404)); });
  });
  const lockManager = originLocks();
  const first = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  const second = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, lockManager });
  await expect(submitProtected(first, 'issue')).rejects.toThrow();
  await expect(first.reconcileIssue()).rejects.toMatchObject({ status: 404 });
  const raw = localStorage.getItem(protectedKey('issue'));
  const retrying = first.retryIssue();
  await waitFor(() => expect(releaseRead).toBeTypeOf('function'));
  await expect(second.reconcileIssue()).rejects.toMatchObject({ code: 'PENDING' });
  expect(localStorage.getItem(protectedKey('issue')) === raw).toBe(true);
  releaseRead(); await waitFor(() => expect(releasePost).toBeTypeOf('function'));
  await expect(second.issueChallenge('other')).rejects.toMatchObject({ code: 'PENDING' });
  releasePost(); const result = await retrying;
  expect(result.operation_id === original.operation_id).toBe(true);
  expect(localStorage.getItem(protectedKey('issue'))).toBeNull();
  expect(posts).toBe(2); expect(reads).toBe(2);
});
it('does not overwrite a reference that appears during initial fingerprint preparation', async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle); let release;
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce((...args) => new Promise(resolve => { release = () => digest(...args).then(resolve); }));
  const fetchImpl = vi.fn(), client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  const saving = submitProtected(client, 'profile').catch(error => error);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  const other = JSON.stringify({ challenge_id: null, operation_id: crypto.randomUUID(), endpoint: '/me/profile', unknown: true });
  localStorage.setItem(protectedKey('profile'), other); release();
  expect((await saving).code).toBe('PENDING');
  expect(localStorage.getItem(protectedKey('profile')) === other).toBe(true);
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each(['actor', 'endpoint', 'operation', 'unknown request field', 'unknown record field'])('rejects a typed original with invalid%s before hashing or network use', async defect => {
  const fetchImpl = vi.fn(async () => { throw new TypeError(); });
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl });
  await expect(submitProtected(client, 'profile')).rejects.toThrow();
  const key = protectedKey('profile'), record = JSON.parse(localStorage.getItem(key));
  if (defect === 'actor') record.actor_id = 'another';
  if (defect === 'endpoint') record.endpoint = '/account-recovery/challenges';
  if (defect === 'operation') record.request.operation_id = crypto.randomUUID();
  if (defect === 'unknown request field') record.request.data.unapproved = 'blocked';
  if (defect === 'unknown record field') record.unapproved = 'blocked';
  const raw = JSON.stringify(record); localStorage.setItem(key, raw);
  fetchImpl.mockClear(); const digest = vi.spyOn(crypto.subtle, 'digest');
  await expect(client.reconcileProfile()).rejects.toMatchObject({ code: 'STORAGE' });
  expect(digest).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  expect(localStorage.getItem(key) === raw).toBe(true);
});
it('an actorA late receipt after cancellation cannot clear actorB original or its own unresolved reference', async () => {
  const OTHER_ACTOR = '01K00000000000000000000002'; let originalA, release;
  const fetchImpl = vi.fn(async (path, options) => {
    if (options.method === 'POST') {
      if (options.headers.Authorization === 'Bearer tokenA') originalA = JSON.parse(options.body);
      throw new TypeError();
    }
    return new Promise(resolve => { release = () => resolve(reply(receipt(originalA, effectsFor('profile')))); });
  });
  const actorA = createAccountClient({ actorId: ACTOR, authorize: fn => fn('tokenA', { id: ACTOR }), fetchImpl });
  const actorB = createAccountClient({ actorId: OTHER_ACTOR, authorize: fn => fn('tokenB', { id: OTHER_ACTOR }), fetchImpl });
  await expect(submitProtected(actorA, 'profile')).rejects.toThrow();
  const checking = actorA.reconcileProfile().catch(error => error);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  await expect(actorB.saveProfile({ display_name: 'Synthetic actorB', preferred_language: 'ms' }, 0)).rejects.toThrow();
  const keyB = `rose.demo.account-profile.v1.${OTHER_ACTOR}`, rawB = localStorage.getItem(keyB), rawA = localStorage.getItem(protectedKey('profile'));
  actorA.cancelRequests(); release(); expect((await checking).code).toBe('UNKNOWN');
  expect(localStorage.getItem(keyB) === rawB).toBe(true);
  expect(localStorage.getItem(protectedKey('profile')) === rawA).toBe(true);
});
it('failed storage cleanup after a valid receipt preserves the original instead of inventing another operation', async () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: () => { throw new Error(); } };
  const fetchImpl = vi.fn(async (path, options) => reply(receipt(JSON.parse(options.body), effectsFor('profile'))));
  const client = createAccountClient({ actorId: ACTOR, authorize, fetchImpl, storage });
  await expect(submitProtected(client, 'profile')).rejects.toMatchObject({ code: 'UNKNOWN' });
  const raw = storage.getItem(protectedKey('profile'));
  await expect(submitProtected(client, 'profile')).rejects.toMatchObject({ code: 'PENDING' });
  expect(storage.getItem(protectedKey('profile')) === raw).toBe(true); expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each(['0', '2026-02-30T08:00:00Z', '2026-11-03T24:00:00Z'])('rejects a noncanonical receipt UTC timestamp', async invalid => {
  const client = createAccountClient({ fetchImpl: async (path, options) => reply({ ...receipt(JSON.parse(options.body), resetEffects), recorded_at: invalid }) });
  await expect(client.resetPassword(recoveryCode(CHALLENGE, secret()), password())).rejects.toMatchObject({ code: 'UNKNOWN' });
  expect(Boolean(client.pendingRecovery())).toBe(true);
});
it('accepts actual Backend UTC microseconds and a later credential generation', async () => {
  const client = createAccountClient({ fetchImpl: async (path, options) => reply({ ...receipt(JSON.parse(options.body), resetEffects), recorded_at: '2026-11-03T08:00:00.123456Z', resource_version: 4 }) });
  await client.resetPassword(recoveryCode(CHALLENGE, secret()), password());
  expect(client.pendingRecovery()).toBeNull();
});
