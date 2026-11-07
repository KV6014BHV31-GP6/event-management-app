import { demoTransport } from './demo-transport.js';

export const ACCOUNT_VERSION = 'rose.demo-journey.v1';
export const ACCOUNT_PREFIX = '/api/v2/operations';
export const RECOVERY_MARKER_KEY = 'rose.demo.account-recovery.v1';
const PROTECTED_RECORD_VERSION = 'rose.account-protected-request.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const languages = new Set(['en', 'ms']);
const roles = new Set(['user', 'leader', 'organizer']);
export const ACCOUNT_MESSAGES = {
  AUTH_REQUIRED: 'Log in again before using this account action.',
  FORBIDDEN: 'This account action is not available to your current account.',
  DEMO_PROFILE_REQUIRED: 'Assisted recovery is available only in the synthetic Demo.',
  RECOVERY_INVALID: 'The recovery code is invalid, expired, replaced or unavailable.',
  RECOVERY_RATE_LIMIT: 'Too many recovery requests. Wait before trying again.',
  INVALID_INPUT: 'Check the account fields and their displayed limits.',
  STALE_VERSION: 'Your profile changed. Read the current profile before saving again.',
  IMMUTABLE_CONFLICT: 'The original request has different values. Keep its reference and check the result.',
  TRANSACTION_CONFLICT: 'The server rolled back this request because of a conflict. Read the current state.',
  NOT_FOUND: 'No committed receipt was found for the original request.',
  UNKNOWN: 'The result is unknown. Check the original request before sending anything again.',
  STORAGE: 'The recovery reference could not be confirmed in this browser. Nothing new was sent.',
  PENDING: 'An original request is unresolved. Check its result before starting another.',
  CODE: 'Enter the complete recovery code supplied by the Demo administrator.',
  PASSWORD: 'Use a new password of 12–72 UTF-8 bytes and enter the same password twice.',
  RETRY: 'Check the original request first, then deliberately retry with the original values.',
  COORDINATION: 'This browser cannot safely coordinate this account request. Keep its reference and use a supported browser.',
  LEGACY: 'The original request data is unavailable. Keep this unresolved reference for manual receipt reconciliation. Do not create a replacement request.',
};
const messages = ACCOUNT_MESSAGES;
export class AccountError extends Error {
  constructor(code, status = 0) {
    super(messages[code] || messages.UNKNOWN);
    this.code = code;
    this.status = status;
    this.unknown = !status || status >= 500;
  }
}
const fail = () => { throw new AccountError('UNKNOWN'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0;
const timestamp = value => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const accountReference = value => text(value) && value.length <= 64 && value.trim() === value && !/\p{Cc}/u.test(value);
const profileKey = actor => `rose.demo.account-profile.v1.${actor}`;
const issueKey = actor => `rose.demo.account-issue.v1.${actor}`;

export function parseRecoveryCode(value) {
  if (typeof value !== 'string') throw new AccountError('CODE', 422);
  const parts = value.trim().split('.');
  if (parts.length !== 2 || !uuid.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]))
    throw new AccountError('CODE', 422);
  try {
    const bytes = atob(parts[1].replaceAll('-', '+').replaceAll('_', '/') + '=');
    const canonical = btoa(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    if (bytes.length !== 32 || canonical !== parts[1]) throw new Error();
  } catch { throw new AccountError('CODE', 422); }
  return { challenge_id: parts[0], secret: parts[1] };
}
export function recoveryCode(challengeId, secret) {
  parseRecoveryCode(`${challengeId}.${secret}`);
  return `${challengeId}.${secret}`;
}
export function validateProfileInput(values) {
  const displayName = typeof values?.display_name === 'string' ? values.display_name.trim() : '';
  if (!displayName || [...displayName].length > 80 || /\p{Cc}/u.test(displayName) || !languages.has(values?.preferred_language))
    throw new AccountError('INVALID_INPUT', 422);
  return { display_name: displayName, preferred_language: values.preferred_language };
}
export function validateNewPassword(password, confirmation = password) {
  if (typeof password !== 'string' || password !== confirmation) throw new AccountError('PASSWORD', 422);
  const bytes = new TextEncoder().encode(password).length;
  if (bytes < 12 || bytes > 72) throw new AccountError('PASSWORD', 422);
  return password;
}

/** Account recovery deliberately never uses the journey client's persisted bodies. */
export function createAccountClient({
  fetchImpl = demoTransport.fetch,
  storage = globalThis.localStorage,
  authorize,
  actorId,
  lockManager = globalThis.navigator?.locks,
} = {}) {
  const requests = new Set();
  const locks = new Set();
  let retryChecked = null;
  let lifecycle = 0;
  const protectedChecks = new Map();
  const resolvedProtected = new Map();
  const endpointFor = kind => kind === 'profile' ? '/me/profile' : '/account-recovery/challenges';
  const keyFor = kind => kind === 'profile' ? profileKey(actorId) : issueKey(actorId);
  const sameKeys = (value, keys) => object(value) && Object.keys(value).sort().join(',') === keys;
  const protectedMarker = record => ({ challenge_id: null, operation_id: record.operation_id, endpoint: record.endpoint, unknown: true });
  function readProtected(kind) {
    const key = keyFor(kind), endpoint = endpointFor(kind);
    let raw, value;
    try { raw = storage?.getItem(key); if (raw == null) return null; value = JSON.parse(raw); }
    catch { throw new AccountError('STORAGE'); }
    const markerKeys = 'challenge_id,endpoint,operation_id,unknown';
    if (!object(value) || !uuid.test(value.operation_id) || value.challenge_id !== null || value.endpoint !== endpoint || value.unknown !== true)
      throw new AccountError('STORAGE');
    if (sameKeys(value, markerKeys)) return { key, raw, value, marker: value, legacy: true, request: null };
    if (!sameKeys(value, 'actor_id,challenge_id,endpoint,fingerprint,operation_id,record_version,request,unknown') ||
      value.record_version !== PROTECTED_RECORD_VERSION || value.actor_id !== actorId || !/^[0-9a-f]{64}$/.test(value.fingerprint))
      throw new AccountError('STORAGE');
    const request = value.request;
    if (!sameKeys(request, kind === 'profile' ? 'contract_version,data,expected_version,operation_id' : 'contract_version,data,operation_id') ||
      request.contract_version !== ACCOUNT_VERSION || request.operation_id !== value.operation_id) throw new AccountError('STORAGE');
    let data;
    if (kind === 'profile') {
      if (!integer(request.expected_version) || !sameKeys(request.data, 'display_name,preferred_language')) throw new AccountError('STORAGE');
      try { data = validateProfileInput(request.data); } catch { throw new AccountError('STORAGE'); }
      if (data.display_name !== request.data.display_name) throw new AccountError('STORAGE');
    } else {
      if (!sameKeys(request.data, 'account_id,synthetic') || !accountReference(request.data.account_id) || request.data.synthetic !== true)
        throw new AccountError('STORAGE');
      data = { account_id: request.data.account_id, synthetic: true };
    }
    const canonical = { contract_version: ACCOUNT_VERSION, operation_id: value.operation_id,
      ...(kind === 'profile' ? { expected_version: request.expected_version } : {}), data };
    if (JSON.stringify(canonical) !== JSON.stringify(request)) throw new AccountError('STORAGE');
    Object.freeze(request.data); Object.freeze(request);
    return { key, raw, value, marker: protectedMarker(value), legacy: false, request };
  }
  async function fingerprintProtected(endpoint, request) {
    try {
      // This digest admits only validated nonsecret profile/issuance envelopes.
      const input = JSON.stringify([PROTECTED_RECORD_VERSION, actorId, endpoint, request]);
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch { throw new AccountError('STORAGE'); }
  }
  async function checkedProtected(kind) {
    const record = readProtected(kind);
    if (record && !record.legacy && await fingerprintProtected(record.value.endpoint, record.request) !== record.value.fingerprint)
      throw new AccountError('STORAGE');
    return record;
  }
  function unchangedProtected(record, epoch) {
    try {
      if (epoch !== lifecycle || storage.getItem(record.key) !== record.raw) throw new Error();
    } catch { throw new AccountError('UNKNOWN'); }
  }
  function finishProtected(record, epoch) {
    unchangedProtected(record, epoch);
    try {
      storage.removeItem(record.key);
      if (storage.getItem(record.key) != null) throw new Error();
    } catch { throw new AccountError('UNKNOWN'); }
  }
  function resolveProtected(kind, record, epoch, result) {
    finishProtected(record, epoch);
    resolvedProtected.set(kind, { operation_id: result.operation_id, request: record.request });
    return result;
  }
  async function protectedExclusive(kind, operation) {
    const epoch = lifecycle;
    return exclusive(kind, async () => {
      if (typeof lockManager?.request !== 'function') throw new AccountError('COORDINATION');
      let entered = false;
      try {
        return await lockManager.request(`rose.account-protected.${actorId}.${kind}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
          if (!lock) throw new AccountError('PENDING');
          entered = true;
          return protectedAction(token => {
            if (epoch !== lifecycle) throw new AccountError('UNKNOWN');
            return operation(token, epoch);
          });
        });
      } catch (error) {
        if (error instanceof AccountError) throw error;
        throw new AccountError(entered ? 'UNKNOWN' : 'COORDINATION');
      }
    });
  }
  function readMarker(key, endpoint) {
    let marker;
    try {
      const raw = storage?.getItem(key);
      if (raw == null) return null;
      marker = JSON.parse(raw);
    } catch { throw new AccountError('STORAGE'); }
    if (!object(marker) || Object.keys(marker).sort().join(',') !== 'challenge_id,endpoint,operation_id,unknown' ||
      !uuid.test(marker.operation_id) || marker.unknown !== true ||
      (endpoint ? marker.endpoint !== endpoint || marker.challenge_id !== null :
        !uuid.test(marker.challenge_id) || marker.endpoint !== `/account-recovery/challenges/${marker.challenge_id}/reset`))
      throw new AccountError('STORAGE');
    return marker;
  }
  function saveMarker(key, marker) {
    const raw = JSON.stringify({
      challenge_id: marker.challenge_id, operation_id: marker.operation_id,
      endpoint: marker.endpoint, unknown: true,
    });
    try {
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) throw new Error();
    } catch { throw new AccountError('STORAGE'); }
  }
  function finish(key, marker) {
    try {
      // A stale completion cannot remove a different operation's reference.
      if (JSON.parse(storage.getItem(key) || 'null')?.operation_id !== marker.operation_id)
        throw new Error();
      storage.removeItem(key);
      if (storage.getItem(key) != null) throw new Error();
    } catch { throw new AccountError('UNKNOWN'); }
  }
  async function exclusive(key, action) {
    if (locks.has(key)) throw new AccountError('PENDING');
    locks.add(key);
    try { return await action(); } finally { locks.delete(key); }
  }
  async function request(path, { token, capability, body, method = 'GET' } = {}) {
    const controller = new AbortController();
    requests.add(controller);
    try {
      const response = await fetchImpl(ACCOUNT_PREFIX + path, {
        method, cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(capability ? { 'X-Account-Recovery': capability } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let value;
      try { value = await response.json(); } catch { fail(); }
      if (!response.ok) {
        const status = response.status;
        const validNotFound = sameKeys(value, 'detail') && sameKeys(value.detail, 'code,message') && value.detail.code === 'NOT_FOUND' && typeof value.detail.message === 'string';
        const code = status >= 500 || (status === 404 && !validNotFound) ? 'UNKNOWN' : object(value?.detail) && Object.hasOwn(messages, value.detail.code)
          ? value.detail.code : status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN'
            : status === 404 ? 'NOT_FOUND' : status === 422 ? 'INVALID_INPUT' : 'UNKNOWN';
        throw new AccountError(code, status);
      }
      return value;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError('UNKNOWN');
    } finally { requests.delete(controller); }
  }
  async function protectedAction(action) {
    if (!actorId || !authorize) throw new AccountError('AUTH_REQUIRED', 401);
    try {
      return await authorize((token, actor) => {
        if (!token || actor?.id !== actorId) throw new AccountError('FORBIDDEN', 403);
        return action(token, actor);
      });
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(error.status === 401 ? 'AUTH_REQUIRED' : error.status === 403 ? 'FORBIDDEN' : 'UNKNOWN', error.status || 0);
    }
  }
  function receipt(value, marker, family, request = null) {
    const validateEffects = family === 'profile' ? profileEffects : family === 'issue' ? issueEffects : resetEffects;
    if (!object(value) || value.contract_version !== ACCOUNT_VERSION || value.operation_id !== marker.operation_id ||
      Object.keys(value).sort().join(',') !== 'contract_version,effects,kind,operation_id,outcome,recorded_at,resource_id,resource_version' ||
      value.outcome !== 'applied' || !text(value.kind) || !text(value.resource_id) ||
      !integer(value.resource_version) || !timestamp(value.recorded_at) || !object(value.effects) || !validateEffects(value.effects)) fail();
    if (family === 'profile' && (value.kind !== 'account_profile_update' || value.resource_id !== actorId ||
      value.resource_version !== value.effects.profile_version || (request && value.resource_version !== request.expected_version + 1))) fail();
    if (family === 'issue' && (value.kind !== 'account_recovery_issue' || value.resource_id !== value.effects.challenge_id || value.resource_version !== 1)) fail();
    if (family === 'reset' && (value.kind !== 'account_password_reset' || value.resource_id !== marker.challenge_id || value.resource_version < 1)) fail();
    return value;
  }
  const profileEffects = effects => effects.account_id === actorId && integer(effects.profile_version) && effects.profile_version > 0 &&
    Object.keys(effects).sort().join(',') === 'account_id,profile_version';
  const issueEffects = effects => uuid.test(effects.challenge_id) && timestamp(effects.expires_at) &&
    effects.provider === 'DEMO_PROVIDER' && effects.delivery_state === 'demo_recorded' &&
    effects.external_delivery === false && effects.identity_verified === false &&
    Object.keys(effects).sort().join(',') === 'challenge_id,delivery_state,expires_at,external_delivery,identity_verified,provider';
  const resetEffects = effects => effects.credentials_changed === true && effects.reauthentication_required === true &&
    Object.keys(effects).sort().join(',') === 'credentials_changed,reauthentication_required';
  async function original(key, endpoint, data, family, { token, expectedVersion, challengeId = null, capability } = {}) {
    if (readMarker(key, challengeId ? undefined : endpoint)) throw new AccountError('PENDING');
    const marker = { challenge_id: challengeId, operation_id: crypto.randomUUID(), endpoint, unknown: true };
    const body = { contract_version: ACCOUNT_VERSION, operation_id: marker.operation_id,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}), data };
    saveMarker(key, marker);
    try {
      const value = receipt(await request(endpoint, { token, capability, method: 'POST', body }), marker, family);
      finish(key, marker);
      return value;
    } catch (error) {
      // Only the first request's explicit rollback/refusal may release its marker.
      // A transport/commit unknown, malformed response or later replay never does.
      if (error instanceof AccountError && error.status >= 400 && error.status < 500 && error.code !== 'UNKNOWN' &&
        !(key === RECOVERY_MARKER_KEY && error.status === 409)) finish(key, marker);
      throw error;
    } finally { if (Object.hasOwn(data, 'new_password')) data.new_password = ''; }
  }
  const protectedReceiptPath = (kind, marker) => kind === 'profile' ? `/me/profile/receipts/${marker.operation_id}` : `/receipts/${marker.operation_id}`;
  async function originalProtected(kind, data, expectedVersion) {
    return protectedExclusive(kind, async (token, epoch) => {
      protectedChecks.delete(kind);
      if (readProtected(kind)) throw new AccountError('PENDING');
      const operationId = crypto.randomUUID(), endpoint = endpointFor(kind);
      const body = { contract_version: ACCOUNT_VERSION, operation_id: operationId,
        ...(kind === 'profile' ? { expected_version: expectedVersion } : {}), data };
      const value = { record_version: PROTECTED_RECORD_VERSION, actor_id: actorId, challenge_id: null,
        operation_id: operationId, endpoint, unknown: true, request: body,
        fingerprint: await fingerprintProtected(endpoint, body) };
      const raw = JSON.stringify(value), key = keyFor(kind);
      if (readProtected(kind)) throw new AccountError('PENDING');
      try { storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw new Error(); }
      catch { throw new AccountError('STORAGE'); }
      const record = await checkedProtected(kind);
      if (!record || record.raw !== raw) throw new AccountError('STORAGE');
      unchangedProtected(record, epoch);
      try {
        const result = receipt(await request(endpoint, { token, method: 'POST', body: record.request }), record.marker, kind, record.request);
        return resolveProtected(kind, record, epoch, result);
      } catch (error) {
        // Only an explicit refusal of this first, previously unsent request may resolve it.
        // Reconciliation and replay below never discard an original on a refusal.
        if (error instanceof AccountError && error.status >= 400 && error.status < 500 && error.status !== 404 && error.code !== 'UNKNOWN')
          finishProtected(record, epoch);
        throw error;
      }
    });
  }
  async function reconcileProtected(kind) {
    protectedChecks.delete(kind);
    return protectedExclusive(kind, async (token, epoch) => {
      const record = await checkedProtected(kind);
      if (!record) throw new AccountError('RETRY', 422);
      try {
        const result = receipt(await request(protectedReceiptPath(kind, record.marker), { token }), record.marker, kind, record.request);
        return resolveProtected(kind, record, epoch, result);
      } catch (error) {
        unchangedProtected(record, epoch);
        if (error.status === 404 && error.code === 'NOT_FOUND' && !record.legacy) protectedChecks.set(kind, { raw: record.raw, epoch });
        throw error;
      }
    });
  }
  async function retryProtected(kind) {
    const proof = protectedChecks.get(kind);
    protectedChecks.delete(kind);
    return protectedExclusive(kind, async (token, epoch) => {
      const record = await checkedProtected(kind);
      if (record?.legacy) throw new AccountError('LEGACY', 422);
      if (!record || !proof || proof.raw !== record.raw || proof.epoch !== epoch) throw new AccountError('RETRY', 422);
      try {
        const result = receipt(await request(protectedReceiptPath(kind, record.marker), { token }), record.marker, kind, record.request);
        return resolveProtected(kind, record, epoch, result);
      } catch (error) { if (error.status !== 404 || error.code !== 'NOT_FOUND') throw error; }
      unchangedProtected(record, epoch);
      const result = receipt(await request(record.value.endpoint, { token, method: 'POST', body: record.request }), record.marker, kind, record.request);
      return resolveProtected(kind, record, epoch, result);
    });
  }
  const protectedPending = kind => {
    // Read-only UI discovery is never permission to write or clear a record.
    const record = readProtected(kind);
    return record ? { ...record.marker, legacy: record.legacy } : null;
  };
  const protectedOriginal = kind => protectedExclusive(kind, async (token, epoch) => {
    const record = await checkedProtected(kind);
    if (!record || record.legacy) return null;
    unchangedProtected(record, epoch);
    return JSON.parse(JSON.stringify(record.request));
  });
  function recoveryBinding(code) {
    const parsed = parseRecoveryCode(code);
    const marker = readMarker(RECOVERY_MARKER_KEY);
    if (!marker || marker.challenge_id !== parsed.challenge_id) throw new AccountError('CODE', 422);
    return { marker, secret: parsed.secret };
  }
  const resetReceiptPath = marker => `/account-recovery/challenges/${marker.challenge_id}/receipts/${marker.operation_id}`;
  async function readReset(marker, secret) {
    return receipt(await request(resetReceiptPath(marker), { capability: secret }), marker, 'reset');
  }
  return {
    cancelRequests() { lifecycle++; for (const controller of requests) controller.abort(); requests.clear(); retryChecked = null; protectedChecks.clear(); resolvedProtected.clear(); },
    pendingRecovery: () => readMarker(RECOVERY_MARKER_KEY),
    pendingProfile: () => protectedPending('profile'),
    pendingIssue: () => protectedPending('issue'),
    profileOriginal: () => protectedOriginal('profile'),
    issueOriginal: () => protectedOriginal('issue'),
    canRetryProfile: () => protectedChecks.has('profile'),
    canRetryIssue: () => protectedChecks.has('issue'),
    resolvedIssueOriginal: operationId => {
      const value = resolvedProtected.get('issue');
      return value?.operation_id === operationId && value.request ? JSON.parse(JSON.stringify(value.request)) : null;
    },
    getProfile: () => protectedAction(async token => {
      const value = await request('/me/profile', { token });
      if (!object(value) || value.contract_version !== ACCOUNT_VERSION || !object(value.account) ||
        value.account.id !== actorId || !text(value.account.username) || !roles.has(value.account.role) ||
        !object(value.profile) || !integer(value.profile.version) ||
        !text(value.profile.display_name) || !value.profile.display_name.trim() || /\p{Cc}/u.test(value.profile.display_name) || [...value.profile.display_name].length > 80 ||
        !languages.has(value.profile.preferred_language) || !timestamp(value.as_of_utc) ||
        (value.profile.version === 0 ? value.profile.updated_at !== null : !timestamp(value.profile.updated_at))) fail();
      return value;
    }),
    saveProfile: (values, expectedVersion) => {
      const data = validateProfileInput(values);
      if (!integer(expectedVersion)) throw new AccountError('INVALID_INPUT', 422);
      return originalProtected('profile', data, expectedVersion);
    },
    reconcileProfile: () => reconcileProtected('profile'),
    retryProfile: () => retryProtected('profile'),
    getDirectory: () => protectedAction(async token => {
      const value = await request('/accounts', { token });
      if (!object(value) || !Array.isArray(value.accounts) || !timestamp(value.as_of_utc) ||
        value.accounts.some(account => !object(account) || !text(account.id) || !text(account.username) ||
          !roles.has(account.role) || typeof account.enabled !== 'boolean' || !integer(account.version))) fail();
      return value;
    }),
    issueChallenge: accountId => {
      if (!accountReference(accountId)) throw new AccountError('INVALID_INPUT', 422);
      return originalProtected('issue', { account_id: accountId, synthetic: true });
    },
    reconcileIssue: () => reconcileProtected('issue'),
    retryIssue: () => retryProtected('issue'),
    revealChallenge: challengeId => protectedAction(async token => {
      if (!uuid.test(challengeId)) throw new AccountError('INVALID_INPUT', 422);
      const value = await request(`/account-recovery/challenges/${challengeId}/demo-message`, { token });
      if (!object(value) || value.challenge_id !== challengeId || value.provider !== 'DEMO_PROVIDER' ||
        value.external_delivery !== false || value.identity_verified !== false) fail();
      recoveryCode(challengeId, value.recovery_secret);
      return value;
    }),
    resetPassword: (code, password) => exclusive('reset', () => {
      const parsed = parseRecoveryCode(code);
      validateNewPassword(password);
      return original(RECOVERY_MARKER_KEY, `/account-recovery/challenges/${parsed.challenge_id}/reset`,
        { new_password: password }, 'reset', { challengeId: parsed.challenge_id, capability: parsed.secret });
    }),
    reconcileReset: code => exclusive('reset', async () => {
      retryChecked = null;
      const { marker, secret } = recoveryBinding(code);
      try {
        const value = await readReset(marker, secret);
        finish(RECOVERY_MARKER_KEY, marker);
        return value;
      } catch (error) {
        if (error.status === 404 && error.code === 'NOT_FOUND') retryChecked = marker.operation_id;
        throw error;
      }
    }),
    retryReset: (code, password) => exclusive('reset', async () => {
      const { marker, secret } = recoveryBinding(code);
      validateNewPassword(password);
      if (retryChecked !== marker.operation_id) throw new AccountError('RETRY', 422);
      retryChecked = null;
      // A fresh read closes the gap between the user's reconciliation and click.
      try {
        const existing = await readReset(marker, secret);
        finish(RECOVERY_MARKER_KEY, marker);
        return existing;
      } catch (error) { if (error.status !== 404 || error.code !== 'NOT_FOUND') throw error; }
      const body = { contract_version: ACCOUNT_VERSION, operation_id: marker.operation_id, data: { new_password: password } };
      try {
        const value = receipt(await request(marker.endpoint, { capability: secret, method: 'POST', body }), marker, 'reset');
        finish(RECOVERY_MARKER_KEY, marker);
        return value;
      } finally { body.data.new_password = ''; }
    }),
  };
}
