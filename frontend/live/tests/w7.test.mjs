import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../api.mjs';
import { createSession, TOKEN_KEY } from '../session.mjs';
import { createEventsController } from '../events-state.mjs';
import { createDetailController } from '../event-detail.mjs';
import { validPublicId, selectedPublicId, eventRoute, registrationRoute, loginRoute } from '../event-navigation.mjs';
import { registrationPayload, createRegistrationController } from '../registration.mjs';

// Unit fixtures only: these tests never call the native API or database.
const publicId = 'A'.repeat(21);
const otherPublicId = 'B'.repeat(21);
const profile = { id: '01M5APAAFBYWKAK9GRXNPSNBAA', username: 'synthetic_w7', role: 'user' };
const event = {
  id: 7, public_id: publicId, organizer_id: '01M5APAAFBYWKAK9GRXNPSNBAA',
  title: 'Synthetic W7 activity', overview: 'A synthetic searchable overview', location: 'Synthetic hall',
  start_time: '2027-01-12T09:00:00Z', end_time: '2027-01-12T10:00:00Z',
  online_quota: 100, offline_quota: 0, status: 'active',
  created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', image_path: null,
};
const values = {
  first_name: 'SYNTHETIC', last_name: 'W7 Participant', gender: 'female', date_of_birth: '1990-01-01',
  phone: 'SYNTH-NO-PHONE', address: 'SYNTHETIC TEST ADDRESS ONLY', national_id: 'SYNTH-W7-UNIT',
  income_band_code: 'SYNTH_TEST_ONLY', marriage_status: 'single',
};
const receipt = {
  ...values, medical_record: null,
  id: '01M5APAF7XKMZ01FHE45ENV0Z4', event_id: 7,
  participant_id: '01M5APAF6EEGGRNMCEJHJ235GT', created_by_user_id: profile.id,
  channel: 'online', status: 'pending', created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const page = (number = 1, size = 6, total = 13) => ({
  page: number, page_size: size, total_count: total, total_pages: Math.ceil(total / size),
  data: Array.from({ length: Math.max(0, Math.min(size, total - (number - 1) * size)) }, () => ({ ...event })),
});
function storedSession(overrides = {}) {
  const saved = new Map([[TOKEN_KEY, 'synthetic-unit-token']]);
  const session = createSession({
    storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    api: { getMe: async () => profile, registerForEvent: async () => receipt, ...overrides },
  });
  return { session, saved };
}

test('W7 selected event intent accepts one NanoID and only fixed internal destinations', () => {
  assert.equal(validPublicId(publicId), true);
  assert.equal(selectedPublicId(`?event=${publicId}`), publicId);
  assert.equal(eventRoute(publicId), `./event.html?event=${publicId}`);
  assert.equal(registrationRoute(publicId), `./registration.html?event=${publicId}`);
  assert.equal(loginRoute(publicId), `./login.html?event=${publicId}`);
  for (const bad of [null, undefined, '', 'A'.repeat(20), 'A'.repeat(22), '../event', 'https://example.test/', '//example.test/', `${'A'.repeat(20)}/`, `${'A'.repeat(20)}%`]) {
    assert.equal(validPublicId(bad), false);
    for (const route of [eventRoute, registrationRoute, loginRoute]) assert.throws(() => route(bad), error => error.kind === 'validation');
  }
});

test('W7 missing, duplicate, traversal or encoded external return intent is rejected', () => {
  for (const search of ['', '?next=https://example.test/', '?event=', '?event=..%2Fevent', '?event=https%3A%2F%2Fexample.test',
    `?event=${publicId}&event=${otherPublicId}`, `?event=${publicId}&event=${publicId}`, `?event=${'A'.repeat(20)}%2F`]) {
    assert.equal(selectedPublicId(search), null);
  }
});

test('W7 search sends the server keyword and keeps it separate from query syntax', async () => {
  let request;
  const keyword = 'overview & title/+?=#';
  const api = createApi({ fetchImpl: async (url, options) => { request = { url, options }; return json(page(2, 6)); } });
  await api.getEvents({ page: 2, pageSize: 6, keyword });
  const url = new URL(request.url, 'http://127.0.0.1');
  assert.equal(url.pathname, '/api/v1/events');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('pageSize'), '6');
  assert.equal(url.searchParams.get('keyword'), keyword);
  assert.equal(url.searchParams.size, 3);
  assert.equal(request.options.headers.Authorization, undefined);
});

test('W7 search resets page one, then pagination and page size keep the keyword', async () => {
  const calls = [];
  const controller = createEventsController({ onChange() {}, api: { getEvents: async request => { calls.push(request); return page(request.page, request.pageSize); } } });
  await controller.load(2);
  await controller.search('Synthetic');
  assert.equal(controller.state.page, 1);
  assert.equal(controller.state.keyword, 'Synthetic');
  await controller.load(2);
  await controller.load(1, 12);
  assert.deepEqual(calls.slice(1).map(({ page, pageSize, keyword }) => ({ page, pageSize, keyword })), [
    { page: 1, pageSize: 6, keyword: 'Synthetic' }, { page: 2, pageSize: 6, keyword: 'Synthetic' }, { page: 1, pageSize: 12, keyword: 'Synthetic' },
  ]);
});

test('W7 a slow older keyword response cannot replace the newer search or empty result', async () => {
  const older = deferred();
  let oldSignal;
  const controller = createEventsController({ onChange() {}, api: { getEvents: request => {
    if (request.keyword === 'old') { oldSignal = request.signal; return older.promise; }
    return Promise.resolve(page(1, 6, 0));
  } } });
  const pending = controller.search('old');
  await controller.search('new');
  assert.equal(oldSignal.aborted, true);
  older.resolve(page());
  await pending;
  assert.equal(controller.state.keyword, 'new');
  assert.equal(controller.state.result.total_count, 0);
  assert.equal(controller.state.status, 'ready');
});

test('W7 detail uses the selected public ID and rejects bad IDs before a network call', async () => {
  const calls = [];
  const api = createApi({ fetchImpl: async (url, options) => { calls.push({ url, options }); return json(event); } });
  assert.deepEqual(await api.getEvent(publicId), event);
  assert.equal(calls[0].url, `/api/v1/events/${publicId}`);
  for (const bad of ['../events', 'A'.repeat(20), `A${'/'.repeat(20)}`]) await assert.rejects(api.getEvent(bad), error => error.kind === 'validation');
  assert.equal(calls.length, 1);
});

test('W7 detail mismatching the requested ID cannot silently become the selected event', async () => {
  const api = createApi({ fetchImpl: async () => json({ ...event, public_id: otherPublicId }) });
  await assert.rejects(api.getEvent(publicId), error => error.kind === 'contract');
});

test('W7 late detail success or failure cannot replace a newer selected activity', async () => {
  for (const failure of [false, true]) {
    const old = deferred(); let oldSignal;
    const selected = { ...event, id: 8, public_id: otherPublicId, title: 'Newer selected activity' };
    const controller = createDetailController({ api: { getEvent: (id, { signal }) => {
      if (id === publicId) { oldSignal = signal; return old.promise; }
      return Promise.resolve(selected);
    } } });
    const oldLoad = controller.load(publicId);
    await controller.load(otherPublicId);
    assert.equal(oldSignal.aborted, true);
    if (failure) old.reject(new ApiError('network', 'Older request failed')); else old.resolve(event);
    await oldLoad;
    assert.equal(controller.state.status, 'ready');
    assert.equal(controller.state.event.public_id, otherPublicId);
    assert.equal(controller.state.error, null);
  }
});

test('W7 current detail failures clear the previous activity and a deliberate retry can recover', async () => {
  let failed = false;
  const controller = createDetailController({ api: { getEvent: async () => {
    if (failed) throw new ApiError('not_found', 'This activity was not found.', 404);
    return event;
  } } });
  await controller.load(publicId);
  failed = true;
  await controller.load(otherPublicId);
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.event, null);
  assert.equal(controller.state.error.kind, 'not_found');
  failed = false;
  await controller.load(publicId);
  assert.equal(controller.state.status, 'ready');
  assert.equal(controller.state.event.public_id, publicId);
});

test('W7 participant payload has only schema fields and no client-provided status or identity', () => {
  const payload = registrationPayload({ ...values, id: 'injected', event_id: 99, channel: 'offline', status: 'confirmed', created_by_user_id: 'injected' });
  assert.deepEqual(payload, { ...values, medical_record: null });
  for (const key of ['id', 'event_id', 'channel', 'status', 'created_by_user_id']) assert.equal(Object.hasOwn(payload, key), false);
});

test('W7 participant validation follows schema length, enum and date boundaries', () => {
  for (const patch of [
    { first_name: 'a'.repeat(21) }, { last_name: 'a'.repeat(21) }, { phone: 'a'.repeat(21) },
    { national_id: 'a'.repeat(51) }, { income_band_code: 'a'.repeat(21) },
    { gender: 'other' }, { marriage_status: 'unknown' }, { date_of_birth: '1990-02-30' },
    { date_of_birth: '2027-02-29' }, { date_of_birth: '1990-01-01T00:00:00Z' }, { phone: 12345 },
  ]) assert.throws(() => registrationPayload({ ...values, ...patch }), error => error.kind === 'validation');
  for (const key of Object.keys(values)) {
    const missing = { ...values }; delete missing[key];
    assert.throws(() => registrationPayload(missing), error => error.kind === 'validation');
  }
  assert.equal(registrationPayload({ ...values, date_of_birth: '1992-02-29' }).date_of_birth, '1992-02-29');
});

test('W7 does not invent approved income codes, phone syntax or age eligibility', () => {
  assert.equal(registrationPayload({ ...values, income_band_code: 'UNAPPROVED_TEXT', phone: 'x', date_of_birth: '2027-01-01' }).income_band_code, 'UNAPPROVED_TEXT');
  for (const marriage_status of ['single', 'married', 'divorced', 'widowed']) assert.equal(registrationPayload({ ...values, marriage_status }).marriage_status, marriage_status);
  for (const gender of ['male', 'female']) assert.equal(registrationPayload({ ...values, gender }).gender, gender);
  for (const key of ['first_name', 'last_name', 'phone', 'address', 'national_id', 'income_band_code']) assert.equal(registrationPayload({ ...values, [key]: '' })[key], '');
  assert.equal(registrationPayload({ ...values, first_name: '🌱'.repeat(20) }).first_name, '🌱'.repeat(20));
  assert.throws(() => registrationPayload({ ...values, first_name: '🌱'.repeat(21) }), error => error.kind === 'validation');
});

test('W7 registration sends one authenticated JSON POST and requires a pending online 201 receipt', async () => {
  let request;
  const api = createApi({ fetchImpl: async (url, options) => { request = { url, options }; return json(receipt, 201); } });
  const payload = registrationPayload(values);
  assert.deepEqual(await api.registerForEvent(publicId, { ...payload, id: 'injected', channel: 'offline', status: 'confirmed' }, 'synthetic-unit-token'), receipt);
  assert.equal(request.url, `/api/v1/events/${publicId}/registrations`);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer synthetic-unit-token');
  assert.deepEqual(JSON.parse(request.options.body), payload);
  assert.equal(request.options.credentials, 'omit');
});

test('W7 invalid success status and malformed registration receipts are contract failures', async () => {
  const payload = registrationPayload(values);
  for (const status of [200, 202]) {
    await assert.rejects(createApi({ fetchImpl: async () => json(receipt, status) }).registerForEvent(publicId, payload, 'unit-token'), error => error.kind === 'contract');
  }
  for (const body of [{}, { ...receipt, id: '' }, { ...receipt, participant_id: '' }, { ...receipt, event_id: '7' },
    { ...receipt, status: 'confirmed' }, { ...receipt, channel: 'offline' }, { ...receipt, created_at: 'not-a-date' }]) {
    await assert.rejects(createApi({ fetchImpl: async () => json(body, 201) }).registerForEvent(publicId, payload, 'unit-token'), error => error.kind === 'contract');
  }
});

test('W7 business rejections are bounded mappings and arbitrary detail or validation input is not echoed', async () => {
  const cases = [
    [400, 'This participant already holds an active registration record for this event.', 'duplicate'],
    [400, 'Registration full. Online quota limits for this event are exhausted.', 'full'],
    [400, 'Registration rejected. This event is not currently accepting entries.', 'inactive'],
    [404, `Event with public identifier '${publicId}' was not found.`, 'not_found'],
  ];
  for (const [status, detail, kind] of cases) {
    const api = createApi({ fetchImpl: async () => json({ detail }, status) });
    await assert.rejects(api.registerForEvent(publicId, registrationPayload(values), 'unit-token'), error => error.kind === kind && error.status === status);
  }
  for (const [status, detail] of [[400, '<script>PRIVATE_UNTRUSTED_DETAIL</script>'], [422, [{ loc: ['body', 'phone'], input: 'PRIVATE_UNTRUSTED_DETAIL', msg: 'PRIVATE_UNTRUSTED_DETAIL' }]]]) {
    const api = createApi({ fetchImpl: async () => json({ detail }, status) });
    await assert.rejects(api.registerForEvent(publicId, registrationPayload(values), 'unit-token'), error => !error.message.includes('PRIVATE_UNTRUSTED_DETAIL'));
  }
});

test('W7 timeout while reading a registration business-error body remains a timeout', async () => {
  const api = createApi({ timeoutMs: 5, fetchImpl: async (url, { signal }) => ({
    ok: false, status: 400,
    json: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
  }) });
  await assert.rejects(api.registerForEvent(publicId, registrationPayload(values), 'unit-token'), error => error.kind === 'timeout');
});

test('W7 token-only or privileged-role sessions cannot submit this ordinary-user UI flow', async () => {
  let posts = 0;
  const { session } = storedSession({ registerForEvent: async () => { posts++; return receipt; } });
  await assert.rejects(session.registerForEvent(event, registrationPayload(values)), error => error.kind === 'unauthorized');
  for (const role of ['organizer', 'leader']) {
    const privileged = storedSession({ getMe: async () => ({ ...profile, role }), registerForEvent: async () => { posts++; return receipt; } }).session;
    await privileged.restore();
    await assert.rejects(privileged.registerForEvent(event, registrationPayload(values)), error => error.kind === 'forbidden');
  }
  assert.equal(posts, 0);
});

test('W7 Session re-verifies profile before the POST and keeps all secret handling inside Session', async () => {
  const calls = [];
  const { session, saved } = storedSession({
    getMe: async token => { calls.push(['me', token]); return profile; },
    registerForEvent: async (id, payload, token) => { calls.push(['post', id, payload, token]); return receipt; },
  });
  await session.restore();
  assert.deepEqual(await session.registerForEvent(event, registrationPayload(values)), receipt);
  assert.deepEqual(calls.map(call => call[0]), ['me', 'me', 'post']);
  assert.equal(calls[2][1], publicId);
  assert.equal(calls[2][3], 'synthetic-unit-token');
  assert.equal('token' in session, false);
  assert.equal('getToken' in session, false);
  assert.deepEqual([...saved], [[TOKEN_KEY, 'synthetic-unit-token']]);
});

test('W7 failed fresh profile verification prevents the registration POST', async () => {
  for (const error of [new ApiError('unauthorized', 'Expired', 401), new ApiError('forbidden', 'Forbidden', 403), new ApiError('network', 'Unavailable')]) {
    let calls = 0, posts = 0;
    const { session } = storedSession({ getMe: async () => { if (++calls > 1) throw error; return profile; }, registerForEvent: async () => { posts++; return receipt; } });
    await session.restore();
    await assert.rejects(session.registerForEvent(event, registrationPayload(values)));
    assert.equal(posts, 0);
    if (error.status === 401) assert.equal(session.hasToken, false);
  }
});

test('W7 network or timeout before POST is a recoverable verification failure, never an uncertain write', async () => {
  for (const kind of ['network', 'timeout']) {
    let checks = 0, posts = 0;
    const { session } = storedSession({
      getMe: async () => { if (++checks === 2) throw new ApiError(kind, 'Synthetic verification failure'); return profile; },
      registerForEvent: async () => { posts++; return receipt; },
    });
    await session.restore();
    const controller = createRegistrationController({ event, session });
    await controller.submit(values);
    assert.equal(controller.state.status, 'error');
    assert.equal(posts, 0);
    assert.match(controller.state.message, /No application was sent/);
    await controller.submit(values);
    assert.equal(controller.state.status, 'success');
    assert.equal(posts, 1);
  }
});

test('W7 profile identity or role changed during fresh verification cannot be used for a write', async () => {
  for (const next of [{ ...profile, id: '01M5APAF6EEGGRNMCEJHJ235GT' }, { ...profile, role: 'organizer' }]) {
    let checks = 0, posts = 0;
    const { session } = storedSession({ getMe: async () => ++checks === 1 ? profile : next, registerForEvent: async () => { posts++; return receipt; } });
    await session.restore();
    await assert.rejects(session.registerForEvent(event, registrationPayload(values)));
    assert.equal(posts, 0);
  }
});

test('W7 logout while fresh verification is pending stops the POST', async () => {
  const pending = deferred(); let checks = 0, posts = 0;
  const { session, saved } = storedSession({ getMe: () => ++checks === 1 ? Promise.resolve(profile) : pending.promise, registerForEvent: async () => { posts++; return receipt; } });
  await session.restore();
  const submit = session.registerForEvent(event, registrationPayload(values));
  session.logout();
  pending.resolve(profile);
  await assert.rejects(submit);
  assert.equal(posts, 0);
  assert.equal(session.user, null);
  assert.equal(saved.size, 0);
});

test('W7 stale profile rejection cannot clear a newer login after logout', async () => {
  const oldProfile = deferred();
  const nextUser = { id: '01M5APAF6EEGGRNMCEJHJ235GT', username: 'synthetic_w7_next', role: 'user' };
  let originalChecks = 0, posts = 0;
  const { session, saved } = storedSession({
    login: async () => 'synthetic-next-token',
    getMe: token => token === 'synthetic-next-token' ? Promise.resolve(nextUser)
      : ++originalChecks === 1 ? Promise.resolve(profile) : oldProfile.promise,
    registerForEvent: async () => { posts++; return receipt; },
  });
  await session.restore();
  const staleSubmit = session.registerForEvent(event, registrationPayload(values));
  session.logout();
  await session.signIn({ username: nextUser.username, password: 'synthetic-next-password' });
  oldProfile.reject(new ApiError('unauthorized', 'Old verification expired', 401));
  await assert.rejects(staleSubmit, error => error.kind === 'unauthorized');
  assert.equal(posts, 0);
  assert.deepEqual(session.user, nextUser);
  assert.equal(session.hasToken, true);
  assert.equal(saved.get(TOKEN_KEY), 'synthetic-next-token');
});

test('W7 logout after POST discards a late success or rejection and keeps outcome uncertain', async () => {
  for (const reject of [false, true]) {
    const pending = deferred(); const started = deferred();
    const { session, saved } = storedSession({ registerForEvent: () => { started.resolve(); return pending.promise; } });
    await session.restore();
    const submit = session.registerForEvent(event, registrationPayload(values));
    await started.promise;
    session.logout();
    if (reject) pending.reject(new ApiError('unauthorized', 'Expired', 401)); else pending.resolve(receipt);
    await assert.rejects(submit, error => error.kind === 'uncertain');
    assert.equal(session.user, null);
    assert.equal(saved.size, 0);
  }
});

test('W7 receipt attribution must match selected event and verified ordinary user', async () => {
  for (const patch of [{ created_by_user_id: null }, { created_by_user_id: '01M5APAF6EEGGRNMCEJHJ235GT' }, { event_id: 8 }, { channel: 'offline' }, { status: 'confirmed' }]) {
    const { session } = storedSession({ registerForEvent: async () => ({ ...receipt, ...patch }) });
    await session.restore();
    await assert.rejects(session.registerForEvent(event, registrationPayload(values)), error => ['contract', 'uncertain'].includes(error.kind));
  }
});

test('W7 registration double click or Enter during write and after success sends exactly once', async () => {
  const pending = deferred(); let posts = 0;
  const controller = createRegistrationController({ event, session: { user: profile, registerForEvent: () => { posts++; return pending.promise; } } });
  const first = controller.submit(values);
  await controller.submit(values);
  assert.equal(controller.state.status, 'submitting');
  assert.equal(posts, 1);
  pending.resolve(receipt);
  await first;
  await controller.submit(values);
  assert.equal(controller.state.status, 'success');
  assert.equal(posts, 1);
});

test('W7 invalid registration form and logged-out user never send a POST', async () => {
  let posts = 0;
  const session = { user: null, registerForEvent: async () => { posts++; return receipt; } };
  const controller = createRegistrationController({ event, session });
  await controller.submit(values);
  assert.equal(controller.state.status, 'error');
  session.user = profile;
  await controller.submit({ ...values, date_of_birth: 'bad-date' });
  assert.equal(controller.state.status, 'error');
  assert.equal(posts, 0);
});

test('W7 known registration rejection states stay failures and allow deliberate correction', async () => {
  for (const kind of ['duplicate', 'full', 'inactive', 'not_found', 'unauthorized', 'forbidden', 'validation', 'rate_limit']) {
    let calls = 0;
    const controller = createRegistrationController({ event, session: { user: profile, registerForEvent: async () => { calls++; throw new ApiError(kind, 'Known rejection', 400); } } });
    await controller.submit(values);
    assert.equal(controller.state.status, 'error', kind);
    await controller.submit(values);
    assert.equal(calls, 2, kind);
  }
});

test('W7 unknown write outcomes stay uncertain and cannot be resent', async () => {
  for (const kind of ['network', 'timeout', 'server', 'contract', 'uncertain']) {
    let calls = 0;
    const controller = createRegistrationController({ event, session: { user: profile, registerForEvent: async () => { calls++; throw new ApiError(kind, 'Unknown outcome'); } } });
    await controller.submit(values);
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain', kind);
    assert.equal(calls, 1, kind);
  }
});

test('W7 a second distinct activity uses a fresh controller without overwriting the first receipt', async () => {
  const events = [{ ...event }, { ...event, id: 8, public_id: otherPublicId }];
  const records = events.map((value, index) => ({ ...receipt, id: `${index ? '02' : '01'}M5APAF7XKMZ01FHE45ENV0Z4`, event_id: value.id }));
  const posts = [];
  const session = { user: profile, registerForEvent: async value => { posts.push(value.public_id); return records.find(record => record.event_id === value.id); } };
  const first = createRegistrationController({ session, event: events[0] });
  const second = createRegistrationController({ session, event: events[1] });
  await first.submit(values);
  await second.submit(values);
  assert.equal(first.state.status, 'success');
  assert.equal(second.state.status, 'success');
  assert.deepEqual(posts, [publicId, otherPublicId]);
  assert.notEqual(records[0].id, records[1].id);
  assert.equal(records[0].participant_id, records[1].participant_id);
});
