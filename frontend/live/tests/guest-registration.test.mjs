import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ApiError, createApi } from '../api.mjs';
import { createSession, TOKEN_KEY } from '../session.mjs';
import { registrationPayload, createRegistrationController, createGuestRegistrationController, mountRegistration } from '../registration.mjs';

// Synthetic unit fixtures only. No live browser, API, database or private fixture is used.
const publicId = 'G'.repeat(21);
const profile = { id: '01M5APAAFBYWKAK9GRXNPSNBAA', username: 'synthetic_guest_test', role: 'user' };
const event = {
  id: 7, public_id: publicId, organizer_id: '01M5APAAFBYWKAK9GRXNPSNBAA',
  title: 'Synthetic guest activity', overview: null, location: 'Synthetic hall', status: 'active',
  start_time: '2027-01-12T09:00:00Z', end_time: '2027-01-12T10:00:00Z',
  online_quota: 3, offline_quota: 0, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z',
};
const values = {
  first_name: 'SYNTHETIC', last_name: 'Guest Unit', gender: 'female', date_of_birth: '1990-01-01',
  phone: 'SYNTH-NO-PHONE', address: 'SYNTHETIC UNIT ADDRESS', national_id: 'SYNTH-GUEST-UNIT',
  income_band_code: 'SYNTH_TEST_ONLY', marriage_status: 'single',
};
const payload = registrationPayload(values);
const receipt = {
  ...payload, id: '01M5APAF7XKMZ01FHE45ENV0Z4', participant_id: '01M5APAF6EEGGRNMCEJHJ235GT',
  event_id: event.id, created_by_user_id: null, channel: 'online', status: 'pending',
  created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00.123456Z',
};
const json = (body, status = 201) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const contract = error => error instanceof ApiError && error.kind === 'contract';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const anonymous = () => ({ user: null, hasToken: false, revision: 0 });
const returning = (body = receipt, status = 201) => createApi({ fetchImpl: async () => json(body, status) });
function storedSession(api) {
  const saved = new Map([[TOKEN_KEY, 'synthetic-unit-token']]);
  return {
    session: createSession({ api, storage: {
      getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key),
    } }), saved,
  };
}

test('Guest API uses one explicit anonymous registration POST without Signup, Login or identity fields', async () => {
  const calls = [];
  const api = createApi({ fetchImpl: async (url, options) => { calls.push({ url, options }); return json(receipt); } });
  const result = await api.registerGuestForEvent(publicId, {
    ...payload, username: 'discard', password: 'unit-only discard', token: 'discard', role: 'guest',
    user_id: profile.id, created_by_user_id: profile.id, event_id: 999, channel: 'offline', status: 'confirmed',
  }, event.id);
  assert.deepEqual(result, receipt);
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, `/api/v1/events/${publicId}/registrations`);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(options.body), payload);
  assert.equal(url.includes(values.national_id), false);
  assert.equal(calls.some(call => /\/users|\/auth\/login/.test(call.url)), false);
});

test('Guest API validates the selected public ID and numeric event ID before a request', async () => {
  let calls = 0;
  const api = createApi({ fetchImpl: async () => { calls++; return json(receipt); } });
  for (const id of [null, '', '../event', 'G'.repeat(20), 'G'.repeat(22), ['G'.repeat(21)]]) {
    await assert.rejects(api.registerGuestForEvent(id, payload, event.id), error => error.kind === 'validation');
  }
  for (const id of [undefined, null, '7', 0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(api.registerGuestForEvent(publicId, payload, id), error => error.kind === 'validation');
  }
  assert.equal(calls, 0);
});

test('Guest success requires exactly HTTP201 and cannot accept HTTP200 or another 2xx', async () => {
  for (const status of [200, 202, 206]) {
    await assert.rejects(returning(receipt, status).registerGuestForEvent(publicId, payload, event.id), contract);
  }
  const api = createApi({ fetchImpl: async () => new Response(null, { status: 204 }) });
  await assert.rejects(api.registerGuestForEvent(publicId, payload, event.id), contract);
});

test('Guest receipt requires typed valid registration and participant IDs without array coercion', async () => {
  for (const key of ['id', 'participant_id']) {
    for (const value of [undefined, null, 123, {}, [receipt[key]], '', 'not-an-id', receipt[key].toLowerCase()]) {
      await assert.rejects(returning({ ...receipt, [key]: value }).registerGuestForEvent(publicId, payload, event.id), contract);
    }
  }
  for (const body of [null, [], 'not a receipt', 1, {}]) {
    await assert.rejects(returning(body).registerGuestForEvent(publicId, payload, event.id), contract);
  }
});

test('Guest receipt actor is explicitly null and its event matches the selected event', async () => {
  for (const patch of [
    { created_by_user_id: undefined }, { created_by_user_id: profile.id }, { created_by_user_id: '' },
    { created_by_user_id: [profile.id] }, { created_by_user_id: false },
    { event_id: event.id + 1 }, { event_id: String(event.id) }, { event_id: 0 }, { event_id: null },
  ]) {
    await assert.rejects(returning({ ...receipt, ...patch }).registerGuestForEvent(publicId, payload, event.id), contract);
  }
  assert.deepEqual(await returning().registerGuestForEvent(publicId, payload, event.id), receipt);
});

test('Guest receipt keeps online, pending, timestamp and echoed participant-field contracts', async () => {
  for (const patch of [
    { channel: 'offline' }, { channel: null }, { status: 'confirmed' }, { status: 'PENDING' },
    { created_at: undefined }, { updated_at: null }, { created_at: 'not-a-date' }, { updated_at: 123 },
    ...Object.keys(payload).map(key => ({ [key]: key === 'medical_record' ? 'unexpected medical record' : 'mismatched echo' })),
  ]) {
    await assert.rejects(returning({ ...receipt, ...patch }).registerGuestForEvent(publicId, payload, event.id), contract);
  }
});

test('Guest API uses reviewed duplicate, quota, inactive, missing-event and validation error mappings', async () => {
  for (const [status, detail, kind] of [
    [400, 'This participant already holds an active registration record for this event.', 'duplicate'],
    [400, 'Registration full. Online quota limits for this event are exhausted.', 'full'],
    [400, 'Registration rejected. This event is not currently accepting entries.', 'inactive'],
    [404, `Event with public identifier '${publicId}' was not found.`, 'not_found'],
    [409, 'UNIT_PRIVATE_DETAIL', 'validation'],
    [422, [{ input: 'UNIT_PRIVATE_DETAIL', msg: 'UNIT_PRIVATE_DETAIL' }], 'validation'],
  ]) {
    await assert.rejects(returning({ detail }, status).registerGuestForEvent(publicId, payload, event.id), error =>
      error.kind === kind && error.status === status && !error.message.includes('UNIT_PRIVATE_DETAIL'));
  }
});

test('signed-in identity conflicts are controlled rejections without exposing identity details', async () => {
  await assert.rejects(returning({ detail: 'UNIT_PRIVATE_DETAIL' }, 409)
    .registerForEvent(publicId, payload, 'test-token'), error =>
    error.kind === 'validation' && error.status === 409 && !error.message.includes('UNIT_PRIVATE_DETAIL'));
});

test('Guest API does not echo arbitrary server details or credentials into errors', async () => {
  for (const [status, kind] of [[400, 'server'], [401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limit'], [500, 'server']]) {
    await assert.rejects(returning({ detail: '<script>UNIT_PRIVATE_DETAIL</script>' }, status)
      .registerGuestForEvent(publicId, payload, event.id), error =>
      error.kind === kind && error.status === status && !error.message.includes('UNIT_PRIVATE_DETAIL'));
  }
});

test('Guest controller sends a valid no-token application without using Session registration or auth', async () => {
  let posts = 0;
  const session = { ...anonymous(), registerForEvent: () => assert.fail('Guest must not call authenticated registration') };
  const api = {
    registerGuestForEvent: async (id, body, expectedId) => {
      posts++; assert.equal(id, publicId); assert.deepEqual(body, payload); assert.equal(expectedId, event.id); return receipt;
    },
    createUser: () => assert.fail('Guest must not Signup'), login: () => assert.fail('Guest must not Login'),
    getMe: () => assert.fail('Guest must not borrow an identity'),
  };
  const controller = createGuestRegistrationController({ api, session, event });
  await controller.submit(values);
  assert.equal(posts, 1);
  assert.equal(controller.state.status, 'success');
  assert.deepEqual(controller.state.receipt, receipt);
});

test('Guest controller rejects token-only, signed-in and privileged identities instead of silently downgrading', async () => {
  for (const session of [
    { ...anonymous(), hasToken: true },
    ...['user', 'organizer', 'leader', 'unknown'].map(role => ({ ...anonymous(), user: { ...profile, role }, hasToken: true })),
    { ...anonymous(), user: profile, hasToken: false },
  ]) {
    let posts = 0;
    const controller = createGuestRegistrationController({ session, event, api: { registerGuestForEvent: async () => { posts++; return receipt; } } });
    await controller.submit(values);
    assert.equal(posts, 0);
    assert.equal(controller.state.status, 'error');
    assert.equal(controller.state.receipt, null);
  }
});

test('Guest controller respects explicit mode and initialization gates before any application POST', async () => {
  let allowed = false, posts = 0;
  const controller = createGuestRegistrationController({ session: anonymous(), event,
    canSubmit: () => allowed, api: { registerGuestForEvent: async () => { posts++; return receipt; } } });
  await controller.submit(values);
  assert.equal(posts, 0);
  assert.equal(controller.state.status, 'error');
  allowed = true;
  await controller.submit(values);
  assert.equal(posts, 1);
  assert.equal(controller.state.status, 'success');
});

test('Guest controller validates the shared participant form and active event before sending', async () => {
  for (const selected of [null, { ...event, status: 'inactive' }]) {
    let posts = 0;
    const controller = createGuestRegistrationController({ session: anonymous(), event: selected,
      api: { registerGuestForEvent: async () => { posts++; return receipt; } } });
    await controller.submit(values);
    assert.equal(posts, 0); assert.equal(controller.state.status, 'error');
  }
  let posts = 0;
  const controller = createGuestRegistrationController({ session: anonymous(), event,
    api: { registerGuestForEvent: async () => { posts++; return receipt; } } });
  await controller.submit({ ...values, date_of_birth: '1990-02-30' });
  assert.equal(posts, 0); assert.equal(controller.state.status, 'error');
  await controller.submit(values);
  assert.equal(posts, 1); assert.equal(controller.state.status, 'success');
});

test('Guest in-flight double clicks and Enter attempts produce one POST and success remains locked', async () => {
  const pending = deferred(); let posts = 0;
  const controller = createGuestRegistrationController({ session: anonymous(), event,
    api: { registerGuestForEvent: () => { posts++; return pending.promise; } } });
  const first = controller.submit(values);
  assert.equal(controller.state.status, 'submitting');
  await Promise.all([controller.submit(values), controller.submit({ ...values, national_id: 'ANOTHER-UNIT-ID' })]);
  assert.equal(posts, 1);
  pending.resolve(receipt); await first;
  assert.equal(controller.state.status, 'success');
  await controller.submit(values);
  assert.equal(posts, 1);
});

test('Guest timeout, connection loss and server errors remain uncertain with no retry POST', async () => {
  for (const [kind, status] of [['timeout', 0], ['network', 0], ['server', 500], ['server', 503], ['contract', 0]]) {
    let posts = 0;
    const controller = createGuestRegistrationController({ session: anonymous(), event,
      api: { registerGuestForEvent: async () => { posts++; throw new ApiError(kind, 'UNIT_PRIVATE_DETAIL', status); } } });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain', `${kind}/${status}`);
    assert.equal(controller.state.receipt, null);
    assert.match(controller.state.message, /do not submit/i);
    assert.equal(controller.state.message.includes('UNIT_PRIVATE_DETAIL'), false);
    await controller.submit(values);
    assert.equal(posts, 1, `${kind}/${status}`);
  }
});

test('Guest malformed 201 or wrong actor remains uncertain through real API/controller validation', async () => {
  for (const body of [{ ...receipt, id: [receipt.id] }, { ...receipt, created_by_user_id: profile.id },
    { ...receipt, event_id: 99 }, { ...receipt, status: 'confirmed' }]) {
    let posts = 0;
    const api = createApi({ fetchImpl: async () => { posts++; return json(body); } });
    const controller = createGuestRegistrationController({ session: anonymous(), event, api });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain');
    assert.equal(controller.state.receipt, null);
    await controller.submit(values);
    assert.equal(posts, 1);
  }
});

test('Guest reviewed rejections have no automatic retry or false pending receipt', async () => {
  for (const [status, detail] of [
    [400, 'This participant already holds an active registration record for this event.'],
    [400, 'Registration full. Online quota limits for this event are exhausted.'],
    [422, [{ input: 'UNIT_PRIVATE_DETAIL' }]], [401, 'Unauthorized'],
  ]) {
    let posts = 0;
    const api = createApi({ fetchImpl: async () => { posts++; return json({ detail }, status); } });
    const controller = createGuestRegistrationController({ session: anonymous(), event, api });
    await controller.submit(values);
    assert.equal(posts, 1);
    assert.equal(controller.state.status, 'error');
    assert.equal(controller.state.receipt, null);
    assert.equal(controller.state.message.includes('UNIT_PRIVATE_DETAIL'), false);
  }
});

test('Guest late success is discarded if account identity, token, revision or explicit mode changes', async () => {
  for (const change of [
    (session, mode) => { session.user = profile; session.hasToken = true; },
    session => { session.hasToken = true; },
    session => { session.revision++; },
    (_session, mode) => { mode.allowed = false; },
  ]) {
    let posts = 0;
    const session = anonymous(), mode = { allowed: true }, pending = deferred();
    const controller = createGuestRegistrationController({ session, event, canSubmit: () => mode.allowed,
      api: { registerGuestForEvent: () => { posts++; return pending.promise; } } });
    const first = controller.submit(values);
    change(session, mode); pending.resolve(receipt); await first;
    assert.equal(controller.state.status, 'uncertain');
    assert.equal(controller.state.receipt, null);
    await controller.submit(values);
    assert.equal(posts, 1);
  }
});

test('Guest late failure after a mode or revision change keeps uncertain locking', async () => {
  for (const change of ['revision', 'mode']) {
    const session = anonymous(), pending = deferred(); let allowed = true, posts = 0;
    const controller = createGuestRegistrationController({ session, event, canSubmit: () => allowed,
      api: { registerGuestForEvent: () => { posts++; return pending.promise; } } });
    const first = controller.submit(values);
    if (change === 'revision') session.revision++; else allowed = false;
    pending.reject(new ApiError('validation', 'Old response', 422)); await first;
    assert.equal(controller.state.status, 'uncertain');
    assert.equal(controller.state.receipt, null);
    allowed = true;
    await controller.submit(values);
    assert.equal(posts, 1);
  }
});

test('Session revision exposes authentication transitions without exposing or changing token storage', async () => {
  const saved = new Map();
  const session = createSession({ api: { login: async () => 'synthetic-unit-token', getMe: async () => profile },
    storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) } });
  const initial = session.revision;
  assert.equal(Number.isSafeInteger(initial), true);
  await session.signIn({ username: profile.username, password: 'unit-only password' });
  assert(session.revision > initial);
  const signedIn = session.revision;
  await session.restore();
  assert(session.revision > signedIn);
  const restored = session.revision;
  session.logout();
  assert(session.revision > restored);
  assert.equal(session.user, null); assert.equal(session.hasToken, false); assert.equal(saved.size, 0);
  assert.equal('token' in session, false); assert.equal('getToken' in session, false);
  assert.throws(() => { session.revision = 0; }, TypeError);
});

test('Guest cannot receive a late receipt after a real Session login and logout returns to anonymous', async () => {
  const session = createSession({ api: { login: async () => 'synthetic-unit-token', getMe: async () => profile } });
  const pending = deferred(); let posts = 0;
  const controller = createGuestRegistrationController({ session, event,
    api: { registerGuestForEvent: () => { posts++; return pending.promise; } } });
  const first = controller.submit(values);
  await session.signIn({ username: profile.username, password: 'unit-only password' });
  session.logout();
  assert.equal(session.user, null); assert.equal(session.hasToken, false);
  pending.resolve(receipt); await first;
  assert.equal(controller.state.status, 'uncertain'); assert.equal(controller.state.receipt, null);
  await controller.submit(values); assert.equal(posts, 1);
});

test('Authenticated participant registration still freshly verifies identity, uses bearer and owns its receipt', async () => {
  const calls = [], authenticatedReceipt = { ...receipt, created_by_user_id: profile.id };
  const api = createApi({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/users/me') ? json(profile, 200) : json(authenticatedReceipt);
  } });
  const { session, saved } = storedSession(api);
  await session.restore();
  const controller = createRegistrationController({ session, event });
  await controller.submit(values);
  assert.equal(controller.state.status, 'success');
  assert.equal(controller.state.receipt.created_by_user_id, profile.id);
  assert.deepEqual(calls.map(call => call.url), ['/api/v1/users/me', '/api/v1/users/me', `/api/v1/events/${publicId}/registrations`]);
  assert(calls.every(call => call.options.headers.Authorization === 'Bearer synthetic-unit-token'));
  assert.deepEqual([...saved], [[TOKEN_KEY, 'synthetic-unit-token']]);
});

test('Failed authenticated profile verification never falls back to Guest or sends an anonymous application', async () => {
  for (const failure of [new ApiError('unauthorized', 'Expired', 401), new ApiError('network', 'Unavailable')]) {
    let checks = 0, authenticatedPosts = 0, guestPosts = 0;
    const { session } = storedSession({
      getMe: async () => { if (++checks > 1) throw failure; return profile; },
      registerForEvent: async () => { authenticatedPosts++; return { ...receipt, created_by_user_id: profile.id }; },
      registerGuestForEvent: async () => { guestPosts++; return receipt; },
    });
    await session.restore();
    const controller = createRegistrationController({ session, event });
    await controller.submit(values);
    assert.equal(controller.state.status, 'error'); assert.equal(controller.state.receipt, null);
    assert.equal(authenticatedPosts, 0); assert.equal(guestPosts, 0);
  }
});

test('An authenticated registration POST401 never causes a second Guest POST', async () => {
  let authenticatedPosts = 0, guestPosts = 0;
  const { session } = storedSession({
    getMe: async () => profile,
    registerForEvent: async () => { authenticatedPosts++; throw new ApiError('unauthorized', 'Expired', 401); },
    registerGuestForEvent: async () => { guestPosts++; return receipt; },
  });
  await session.restore();
  const controller = createRegistrationController({ session, event });
  await controller.submit(values);
  assert.equal(controller.state.status, 'error'); assert.equal(controller.state.receipt, null);
  assert.equal(authenticatedPosts, 1); assert.equal(guestPosts, 0); assert.equal(session.hasToken, false);
});

test('Authenticated receipt with null Guest actor cannot become a signed-in user success', async () => {
  let posts = 0;
  const { session } = storedSession({ getMe: async () => profile, registerForEvent: async () => { posts++; return receipt; } });
  await session.restore();
  const controller = createRegistrationController({ session, event });
  await controller.submit(values);
  assert.equal(controller.state.status, 'uncertain'); assert.equal(controller.state.receipt, null);
  await controller.submit(values); assert.equal(posts, 1);
});

test('Registration HTML remains locked before initialization and has a non-network native form fallback', async () => {
  const html = await readFile(new URL('../registration.html', import.meta.url), 'utf8');
  const form = html.match(/<form\b[^>]*\bid="registration-form"[^>]*>/)?.[0];
  const fields = html.match(/<fieldset\b[^>]*\bid="registration-fields"[^>]*>/)?.[0];
  assert(form); assert.match(form, /\bmethod="dialog"/);
  assert(fields); assert.match(fields, /\bdisabled(?:\s|>)/);
  assert.match(html, /Continue as guest/);
  assert.match(html, /Create account/);
  assert.doesNotMatch(html, /name="(?:username|password|email|otp)"/);
});

class FixtureNode {
  constructor() { this.handlers = {}; this.children = []; this.disabled = false; this.hidden = false; this.textContent = ''; this.resets = 0; }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this[key] = value; }
  reportValidity() { return true; }
  reset() { this.resets++; }
}
const tick = () => new Promise(setImmediate);
const domSubmit = nodes => nodes['#registration-form'].handlers.submit({ preventDefault() {} });
async function withRegistrationDOM(callback, overrides = {}) {
  const html = await readFile(new URL('../registration.html', import.meta.url), 'utf8');
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [`#${match[1]}`, new FixtureNode()]));
  nodes['#registration-fields'].disabled = true;
  nodes['#continue-as-guest'].disabled = true;
  const globals = {
    document: { querySelector: selector => nodes[selector], createElement: () => new FixtureNode() },
    location: { search: `?event=${publicId}` }, addEventListener() {},
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() { assert.fail('Guest must not store personal data or a receipt'); } },
    FormData: class { constructor() { return Object.entries(values); } }, ...overrides,
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    await callback(nodes);
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test('Anonymous registration page requires explicit Guest choice before enabling the shared form', async () => {
  const calls = [];
  await withRegistrationDOM(async nodes => {
    await mountRegistration();
    assert.equal(nodes['#registration-fields'].disabled, true);
    assert.equal(nodes['#registration-login'].hidden, false);
    assert.equal(nodes['#registration-login-link'].href, `./login.html?event=${publicId}`);
    assert.equal(nodes['#registration-signup-link'].href, `./signup.html?event=${publicId}`);
    nodes['#registration-fields'].disabled = false;
    domSubmit(nodes); await tick();
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
    nodes['#continue-as-guest'].handlers.click();
    assert.equal(nodes['#registration-fields'].disabled, false);
    assert.equal(nodes['#registration-guest-note'].hidden, false);
    domSubmit(nodes); domSubmit(nodes);
    await tick();
    const posts = calls.filter(call => call.options.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, `/api/v1/events/${publicId}/registrations`);
    assert.equal(posts[0].options.headers.Authorization, undefined);
    assert.equal(nodes['#registration-result'].hidden, false);
    assert.equal(nodes['#receipt-id'].textContent, receipt.id);
    assert.equal(nodes['#receipt-status'].textContent, 'pending');
    assert.equal(nodes['#receipt-public-id'].textContent, publicId);
    assert.equal(nodes['#registration-fields'].disabled, true);
    assert.equal(nodes['#registration-form'].hidden, true);
    assert.equal(calls.some(call => /\/users|\/auth\/login/.test(call.url)), false);
    domSubmit(nodes); await tick();
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  }, { fetch: async (url, options) => { calls.push({ url, options }); return json(options.method === 'POST' ? receipt : event, options.method === 'POST' ? 201 : 200); } });
});

test('Guest choice and direct submit stay blocked until selected event loading has completed', async () => {
  const selected = deferred(); let posts = 0;
  await withRegistrationDOM(async nodes => {
    const mounted = mountRegistration();
    assert.equal(nodes['#registration-fields'].disabled, true);
    nodes['#continue-as-guest'].disabled = false;
    nodes['#continue-as-guest'].handlers.click();
    nodes['#registration-fields'].disabled = false;
    domSubmit(nodes);
    assert.equal(posts, 0);
    selected.resolve(json(event, 200)); await mounted;
    assert.equal(nodes['#registration-fields'].disabled, true);
    nodes['#continue-as-guest'].handlers.click();
    assert.equal(nodes['#registration-fields'].disabled, false);
    assert.equal(posts, 0);
  }, { fetch: async (_url, options) => { if (options.method === 'POST') { posts++; return json(receipt); } return selected.promise; } });
});

test('Failed or expired stored identity cannot become Guest until the user explicitly logs out', async () => {
  for (const failure of ['expired', 'unavailable']) {
    let posts = 0, removals = 0;
    await withRegistrationDOM(async nodes => {
      await mountRegistration();
      assert.equal(nodes['#registration-identity-blocked'].hidden, false, failure);
      assert.equal(nodes['#continue-as-guest'].disabled, true, failure);
      assert.equal(nodes['#registration-fields'].disabled, true, failure);
      nodes['#continue-as-guest'].disabled = false;
      nodes['#continue-as-guest'].handlers.click();
      nodes['#registration-fields'].disabled = false;
      domSubmit(nodes); await tick();
      assert.equal(posts, 0, failure);
      nodes['#registration-clear-identity'].handlers.click();
      assert.equal(nodes['#registration-identity-blocked'].hidden, true, failure);
      assert.equal(nodes['#registration-fields'].disabled, true, failure);
      nodes['#continue-as-guest'].handlers.click();
      assert.equal(nodes['#registration-fields'].disabled, false, failure);
      domSubmit(nodes); await tick();
      assert.equal(posts, 1, failure);
      assert.equal(nodes['#registration-result'].hidden, false, failure);
      assert(removals >= 1);
    }, {
      sessionStorage: { getItem: () => 'synthetic-expired-token', removeItem: () => { removals++; }, setItem() { assert.fail('No Guest identity may be persisted'); } },
      fetch: async (url, options) => {
        if (url.endsWith('/users/me')) {
          if (failure === 'unavailable') throw new TypeError('Synthetic connection failure');
          return json({}, 401);
        }
        if (options.method === 'POST') { posts++; assert.equal(options.headers.Authorization, undefined); return json(receipt); }
        return json(event, 200);
      },
    });
  }
});

test('Organizer and Leader pages never expose or submit an implicit Guest application', async () => {
  for (const role of ['organizer', 'leader']) {
    let posts = 0;
    await withRegistrationDOM(async nodes => {
      await mountRegistration();
      assert.equal(nodes['#registration-fields'].disabled, true);
      assert.equal(nodes['#registration-login'].hidden, true);
      assert.equal(nodes['#participant-account-note'].hidden, false);
      nodes['#continue-as-guest'].disabled = false;
      nodes['#continue-as-guest'].handlers.click();
      nodes['#registration-fields'].disabled = false;
      domSubmit(nodes); await tick();
      assert.equal(posts, 0, role);
      assert.equal(nodes['#registration-guest-note'].hidden, true, role);
    }, {
      sessionStorage: { getItem: () => 'synthetic-unit-token', removeItem() {} },
      fetch: async (url, options) => {
        if (url.endsWith('/users/me')) return json({ ...profile, role }, 200);
        if (options.method === 'POST') { posts++; return json(receipt); }
        return json(event, 200);
      },
    });
  }
});

test('Guest late receipt stays hidden after explicit logout changes the current mode', async () => {
  const pending = deferred(); let posts = 0;
  await withRegistrationDOM(async nodes => {
    await mountRegistration();
    nodes['#continue-as-guest'].handlers.click();
    domSubmit(nodes);
    assert.equal(posts, 1);
    nodes['#registration-clear-identity'].handlers.click();
    pending.resolve(json(receipt)); await tick();
    assert.equal(nodes['#registration-result'].hidden, true);
    assert.equal(nodes['#registration-fields'].disabled, true);
    nodes['#continue-as-guest'].handlers.click();
    nodes['#registration-fields'].disabled = false;
    domSubmit(nodes); await tick();
    assert.equal(posts, 1);
  }, { fetch: async (_url, options) => { if (options.method === 'POST') { posts++; return pending.promise; } return json(event, 200); } });
});
