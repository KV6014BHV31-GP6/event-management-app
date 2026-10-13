import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api.mjs';

const event = {
  public_id: 'synthetic-event-000001', title: 'Synthetic community event', overview: null,
  location: 'Synthetic hall', status: 'ACTIVE', start_time: '2027-01-12T09:00:00Z', end_time: '2027-01-12T10:00:00Z',
};
const page = { data: [event], total_count: 1, total_pages: 1, page: 1, page_size: 6 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('event request follows the reviewed page/pageSize contract and does not attach credentials', async () => {
  let called;
  const api = createApi({ fetchImpl: async (url, options) => { called = { url, options }; return json(page); } });
  assert.deepEqual(await api.getEvents(), page);
  assert.equal(called.url, '/api/v1/events?page=1&pageSize=6');
  assert.equal(called.options.method, 'GET');
  assert.equal(called.options.headers.Authorization, undefined);
  assert.equal(called.options.credentials, 'omit');
  assert.equal(called.options.cache, 'no-store');
  assert.equal(called.options.redirect, 'error');
});

test('empty backend page uses zero total pages', async () => {
  const empty = { data: [], total_count: 0, total_pages: 0, page: 1, page_size: 6 };
  const api = createApi({ fetchImpl: async () => json(empty) });
  assert.deepEqual(await api.getEvents(), empty);
});

test('login sends JSON credentials and accepts only the bearer token response', async () => {
  let called;
  const api = createApi({ fetchImpl: async (url, options) => { called = { url, options }; return json({ access_token: 'synthetic-token', token_type: 'bearer' }); } });
  assert.equal(await api.login({ username: 'synthetic_user', password: 'synthetic-password' }), 'synthetic-token');
  assert.equal(called.url, '/api/v1/auth/login');
  assert.equal(called.options.method, 'POST');
  assert.equal(called.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(called.options.body), { username: 'synthetic_user', password: 'synthetic-password' });
});

test('/users/me sends bearer authentication and verifies the account shape', async () => {
  let called;
  const profile = { id: 'synthetic-id', username: 'synthetic_user', role: 'organizer' };
  const api = createApi({ fetchImpl: async (url, options) => { called = { url, options }; return json(profile); } });
  assert.deepEqual(await api.getMe('synthetic-token'), profile);
  assert.equal(called.url, '/api/v1/users/me');
  assert.equal(called.options.headers.Authorization, 'Bearer synthetic-token');
});

test('failed login gives a credentials error without rendering the server detail', async () => {
  const api = createApi({ fetchImpl: async () => json({ detail: '<script>private server detail</script>' }, 401) });
  await assert.rejects(api.login({ username: 'synthetic_user', password: 'synthetic-password' }), error => {
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Incorrect username or password. Please try again.');
    return true;
  });
});

test('invalid /users/me token is distinguishable from a bad-password error', async () => {
  const api = createApi({ fetchImpl: async () => json({}, 401) });
  await assert.rejects(api.getMe('synthetic-token'), error => error.status === 401 && error.message.includes('expired'));
});

test('network failure is surfaced without returning mock events', async () => {
  const api = createApi({ fetchImpl: async () => { throw new TypeError('private connection detail'); } });
  await assert.rejects(api.getEvents(), error => error.kind === 'network' && !error.message.includes('private'));
});

test('server failure does not echo sensitive error JSON or HTML', async () => {
  const api = createApi({ fetchImpl: async () => new Response('private exception and credentials', { status: 500 }) });
  await assert.rejects(api.getEvents(), error => error.kind === 'server' && !error.message.includes('private'));
});

test('HTML in a successful API response is a contract failure', async () => {
  const api = createApi({ fetchImpl: async () => new Response('<html>proxy fallback</html>') });
  await assert.rejects(api.getEvents(), error => error.kind === 'contract');
});

test('malformed page and event shapes cannot silently appear as an empty list', async () => {
  for (const invalid of [[], {}, { ...page, total_pages: 3 }, { ...page, page: 2 }, { ...page, data: [{}] }, { ...page, data: [{ ...event, start_time: 'bad-date' }] }]) {
    const api = createApi({ fetchImpl: async () => json(invalid) });
    await assert.rejects(api.getEvents(), error => error.kind === 'contract');
  }
});

test('pagination values are checked before any network call', async () => {
  let called = false;
  const api = createApi({ fetchImpl: async () => { called = true; return json(page); } });
  for (const options of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 }]) {
    await assert.rejects(api.getEvents(options), error => error.kind === 'validation');
  }
  assert.equal(called, false);
});

test('malformed login and profile responses cannot establish authentication', async () => {
  for (const invalid of [{}, { access_token: 'token', token_type: 'Basic' }, { access_token: 'two tokens', token_type: 'bearer' }]) {
    const api = createApi({ fetchImpl: async () => json(invalid) });
    await assert.rejects(api.login({ username: 'synthetic_user', password: 'synthetic-password' }), error => error.kind === 'contract');
  }
  const api = createApi({ fetchImpl: async () => json({ id: 'synthetic-id', username: 'synthetic_user', role: 'coordinator' }) });
  await assert.rejects(api.getMe('synthetic-token'), error => error.kind === 'contract');
});

test('timeout is distinguished from a manual abort', async () => {
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const api = createApi({ fetchImpl, timeoutMs: 5 });
  await assert.rejects(api.getEvents(), error => error.kind === 'timeout');
  const controller = new AbortController();
  const request = api.getEvents({ signal: controller.signal });
  controller.abort();
  await assert.rejects(request, error => error.kind === 'aborted');
});

test('timeout while reading the response body remains a timeout, not a contract failure', async () => {
  const fetchImpl = async (url, { signal }) => ({
    ok: true,
    json: () => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
  });
  const api = createApi({ fetchImpl, timeoutMs: 5 });
  await assert.rejects(api.getEvents(), error => error.kind === 'timeout');
});
