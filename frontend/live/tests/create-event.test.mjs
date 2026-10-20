import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { ApiError, createApi } from '../api.mjs';
import { createSession, TOKEN_KEY } from '../session.mjs';
import { eventPayload, createEventController } from '../create-event.mjs';

const values = { title: ' Synthetic event ', overview: ' ', location: ' Hall ', start_time: '2027-01-12T09:00', end_time: '2027-01-12T10:00', online_quota: '0', offline_quota: '2' };
const profile = { id: 'synthetic-user', username: 'demo', role: 'organizer' };
const response = { ...eventPayload(values), id: 1, public_id: 'synthetic-event-00001', organizer_id: profile.id, status: 'ACTIVE', created_at: '2027-01-01T00:00:00Z', updated_at: '2027-01-01T00:00:00Z' };
const json = (body, status = 201) => new Response(JSON.stringify(body), { status });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function storedSession(api) {
  const data = new Map([[TOKEN_KEY, 'synthetic-token']]);
  const session = createSession({ api: { getMe: async () => profile, ...api }, storage: { getItem: k => data.get(k), removeItem: k => data.delete(k) } });
  return { session, data };
}

test('payload trims text, defaults blank overview to null and sends only seven fields', () => {
  const payload = eventPayload({ ...values, id: 9, status: 'ACTIVE' });
  assert.equal(payload.title, 'Synthetic event'); assert.equal(payload.location, 'Hall'); assert.equal(payload.overview, null);
  assert.equal(payload.offline_quota, 2); assert.equal(Object.keys(payload).length, 7);
});

test('invalid fields, impossible dates, reversed/equal times and quotas are rejected', () => {
  for (const patch of [{ title: ' ' }, { title: 'a'.repeat(256) }, { location: '' }, { location: 'a'.repeat(256) }, { start_time: '' }, { start_time: '2027-02-30T09:00' }, { start_time: '2027-01-12T09:00Z' }, { end_time: values.start_time }, { end_time: '2027-01-11T10:00' }, ...['-1', '1.5', '', 'NaN', 'Infinity', '9007199254740992'].map(online_quota => ({ online_quota }))]) {
    assert.throws(() => eventPayload({ ...values, ...patch }), e => e.kind === 'validation');
  }
});

test('datetime-local uses actual timezone offset and rejects DST gaps', () => {
  const moduleUrl = new URL('../create-event.mjs', import.meta.url).href;
  const script = `import { eventPayload } from ${JSON.stringify(moduleUrl)}; console.log(eventPayload(${JSON.stringify(values)}).start_time);`;
  for (const [TZ, expected] of [['Asia/Hong_Kong', '2027-01-12T01:00:00.000Z'], ['America/New_York', '2027-01-12T14:00:00.000Z']]) {
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }).trim(), expected);
  }
  const gap = `import { eventPayload } from ${JSON.stringify(moduleUrl)}; import assert from 'node:assert/strict'; assert.throws(() => eventPayload(${JSON.stringify({ ...values, start_time: '2027-03-14T02:30', end_time: '2027-03-14T04:00' })}));`;
  execFileSync(process.execPath, ['--input-type=module', '-e', gap], { env: { ...process.env, TZ: 'America/New_York' } });
});

test('create sends one Bearer JSON POST through existing client and requires valid 201', async () => {
  let calls = 0;
  const api = createApi({ fetchImpl: async (url, options) => {
    calls++; assert.equal(url, '/api/v1/events'); assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), eventPayload(values)); return json(response);
  } });
  assert.deepEqual(await api.createEvent({ ...eventPayload(values), id: 99, organizer_id: 'bad', status: 'bad' }, 'synthetic-token'), response);
  assert.equal(calls, 1);
  for (const status of [200, 202]) await assert.rejects(createApi({ fetchImpl: async () => json(response, status) }).createEvent(eventPayload(values), 'token'), e => e.kind === 'contract');
  for (const body of [{}, { ...response, public_id: '' }, { ...response, online_quota: -1 }, { ...response, organizer_id: null }]) await assert.rejects(createApi({ fetchImpl: async () => json(body) }).createEvent(eventPayload(values), 'token'), e => e.kind === 'contract');
  await assert.rejects(createApi({ fetchImpl: async () => new Response('bad JSON', { status: 201 }) }).createEvent(eventPayload(values), 'token'), e => e.kind === 'contract');
});

test('token alone, unverified identity, logged out and invalid forms never POST', async () => {
  let calls = 0;
  const { session } = storedSession({ createEvent: async () => { calls++; return response; } });
  await assert.rejects(session.createEvent(eventPayload(values)), e => e.status === 401);
  const controller = createEventController({ session });
  await controller.submit(values); assert.equal(controller.state.status, 'error');
  await session.restore(); await controller.submit({ ...values, title: ' ' });
  session.logout(); await controller.submit(values); assert.equal(calls, 0);
});

test('double click/Enter is guarded during POST and successful form cannot be resubmitted', async () => {
  const pending = deferred(); let calls = 0;
  const { session } = storedSession({ createEvent: () => { calls++; return pending.promise; } });
  await session.restore(); const controller = createEventController({ session });
  const first = controller.submit(values); await controller.submit(values);
  assert.equal(controller.state.message, 'Creating event…'); assert.equal(calls, 1);
  pending.resolve(response); await first; await controller.submit(values);
  assert.equal(controller.state.status, 'success'); assert.equal(controller.state.event.public_id, response.public_id); assert.equal(calls, 1);
});

test('401 clears Session; 403 and 422 preserve input and allow deliberate correction', async () => {
  for (const [status, kind] of [[401, 'unauthorized'], [403, 'forbidden'], [422, 'validation']]) {
    let calls = 0; const input = { ...values };
    const api = createApi({ fetchImpl: async () => { calls++; return json({}, status); } });
    const { session, data } = storedSession({ createEvent: api.createEvent }); await session.restore();
    const controller = createEventController({ session }); await controller.submit(input);
    assert.equal(controller.state.status, 'error'); assert.deepEqual(input, values); assert.equal(calls, 1);
    if (status === 401) { assert.equal(session.user, null); assert.equal(data.size, 0); }
    else { assert.deepEqual(session.user, profile); await controller.submit(input); assert.equal(calls, 2); }
  }
});

test('network, timeout, 5xx and malformed success are uncertain and never retried', async () => {
  const fetchers = [async () => { throw new TypeError('offline'); },
    (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))),
    async () => json({}, 500), async () => json({}, 201), async () => json(response, 200)];
  for (const fetcher of fetchers) {
    let calls = 0;
    const api = createApi({ timeoutMs: 5, fetchImpl: (...args) => { calls++; return fetcher(...args); } });
    const { session } = storedSession({ createEvent: api.createEvent }); await session.restore();
    const controller = createEventController({ session }); await controller.submit(values); await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain'); assert.match(controller.state.message, /Check Events/); assert.equal(calls, 1);
  }
});

test('logout during POST discards late success or failure without restoring identity', async () => {
  for (const fail of [false, true]) {
    const pending = deferred(); const { session, data } = storedSession({ createEvent: () => pending.promise });
    await session.restore(); const controller = createEventController({ session }); const submit = controller.submit(values);
    session.logout();
    if (fail) pending.reject(new ApiError('unauthorized', 'Expired', 401)); else pending.resolve(response);
    await submit; assert.equal(session.user, null); assert.equal(data.size, 0); assert.equal(controller.state.event, null); assert.equal(controller.state.status, 'uncertain');
  }
});

test('mounted form disables before verification and immediately on logout; late POST never shows success (DOM component)', async () => {
  const { mountCreateEvent } = await import('../create-event.mjs');
  class Node {
    constructor() { this.handlers = {}; this.children = []; this.disabled = false; this.hidden = false; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this[name] = value; }
    reportValidity() { return true; }
  }
  const ids = ['create-event-form', 'event-fields', 'create-progress', 'create-result', 'login-prompt', 'organizer-prompt', 'account', 'auth-notice', 'create-timezone', 'created-title', 'created-id'];
  const nodes = Object.fromEntries(ids.map(id => [`#${id}`, new Node()]));
  nodes['#event-fields'].disabled = true; // HTML's initial disabled fieldset.
  const original = Object.fromEntries(['document', 'fetch', 'sessionStorage', 'addEventListener', 'FormData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const pendingMe = deferred(), pendingPost = deferred(); let posts = 0;
  const globals = {
    document: { querySelector: id => nodes[id], createElement: () => new Node() },
    sessionStorage: { getItem: () => 'synthetic-token', removeItem: () => {} },
    addEventListener: () => {}, FormData: class { constructor() { return Object.entries(values); } },
    fetch: async url => { if (url.endsWith('/users/me')) return pendingMe.promise; posts++; return pendingPost.promise; },
  };
  try {
    for (const [k, value] of Object.entries(globals)) Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
    mountCreateEvent(); const submit = () => nodes['#create-event-form'].handlers.submit({ preventDefault() {} });
    submit(); assert.equal(posts, 0); assert.equal(nodes['#event-fields'].disabled, true);
    pendingMe.resolve(json(profile, 200)); await new Promise(setImmediate);
    assert.equal(nodes['#event-fields'].disabled, false);
    assert(nodes['#account'].children.some(n => n.textContent === 'Create event'));
    submit(); submit(); assert.equal(posts, 1); assert.equal(nodes['#event-fields'].disabled, true);
    nodes['#account'].children.find(n => n.textContent === 'Log out').handlers.click();
    assert.equal(nodes['#event-fields'].disabled, true); assert.equal(nodes['#login-prompt'].hidden, false);
    pendingPost.resolve(json(response)); await new Promise(setImmediate);
    assert.equal(nodes['#create-result'].hidden, true); assert.equal(nodes['#event-fields'].disabled, true);
    assert(!nodes['#account'].children.some(n => n.textContent === 'Create event'));
  } finally {
    for (const [k, descriptor] of Object.entries(original)) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
  }
});
