import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, TOKEN_KEY } from '../session.mjs';
import { ApiError } from '../api.mjs';

const profile = { id: 'synthetic-id', username: 'synthetic_user', role: 'user' };
const credentials = { username: 'synthetic_user', password: 'synthetic-password' };
function storage(initial) {
  const values = new Map(initial ? [[TOKEN_KEY, initial]] : []);
  return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('login verifies identity before saving only the token', async () => {
  const store = storage();
  const checks = [];
  const session = createSession({ storage: store, api: {
    login: async value => { assert.deepEqual(value, credentials); checks.push('login'); return 'synthetic-token'; },
    getMe: async token => { assert.equal(token, 'synthetic-token'); assert.equal(store.values.size, 0); checks.push('me'); return profile; },
  } });
  assert.deepEqual(await session.signIn(credentials), { user: profile, persistent: true });
  assert.deepEqual(checks, ['login', 'me']);
  assert.deepEqual([...store.values], [[TOKEN_KEY, 'synthetic-token']]);
});

test('a token alone never supplies account identity', async () => {
  const pending = deferred();
  const session = createSession({ storage: storage('synthetic-token'), api: { getMe: () => pending.promise } });
  assert.equal(session.user, null);
  const restore = session.restore();
  assert.equal(session.user, null);
  pending.resolve(profile);
  assert.deepEqual(await restore, profile);
});

test('/me failure immediately after login never persists the token or a profile', async () => {
  const store = storage();
  const session = createSession({ storage: store, api: { login: async () => 'synthetic-token', getMe: async () => { throw new ApiError('unauthorized', 'Expired', 401); } } });
  await assert.rejects(session.signIn(credentials));
  assert.equal(session.user, null);
  assert.equal(session.hasToken, false);
  assert.equal(store.values.size, 0);
});

test('expired session clears the persisted token', async () => {
  const store = storage('expired-synthetic-token');
  const session = createSession({ storage: store, api: { getMe: async () => { throw new ApiError('unauthorized', 'Expired', 401); } } });
  await assert.rejects(session.restore(), error => error.status === 401);
  assert.equal(session.hasToken, false);
  assert.equal(session.user, null);
  assert.equal(store.values.size, 0);
});

test('transient identity lookup failure keeps token for retry but does not claim logged-in identity', async () => {
  const store = storage('synthetic-token');
  let fail = false;
  const session = createSession({ storage: store, api: { getMe: async () => { if (fail) throw new ApiError('network', 'Offline'); return profile; } } });
  await session.restore();
  fail = true;
  await assert.rejects(session.restore());
  assert.equal(session.user, null);
  assert.equal(session.hasToken, true);
  assert.equal(store.values.get(TOKEN_KEY), 'synthetic-token');
});

test('blocked sessionStorage gracefully uses memory for this page only', async () => {
  const blocked = () => { throw new Error('Storage is blocked'); };
  const session = createSession({ storage: { getItem: blocked, setItem: blocked, removeItem: blocked }, api: { login: async () => 'synthetic-token', getMe: async () => profile } });
  assert.deepEqual(await session.signIn(credentials), { user: profile, persistent: false });
  assert.equal(session.hasToken, true);
  assert.equal(session.logout(), false);
  assert.equal(session.user, null);
  assert.equal(session.hasToken, false);
});

test('unavailable storage is a working memory-only session', async () => {
  const session = createSession({ api: { login: async () => 'synthetic-token', getMe: async () => profile } });
  assert.deepEqual(await session.signIn(credentials), { user: profile, persistent: false });
});

test('logout clears both the verified identity and persisted token', async () => {
  const store = storage('synthetic-token');
  const session = createSession({ storage: store, api: { getMe: async () => profile } });
  await session.restore();
  assert.equal(session.logout(), true);
  assert.equal(session.user, null);
  assert.equal(session.hasToken, false);
  assert.equal(store.values.size, 0);
});

test('slow /me cannot restore an account after logout', async () => {
  const pending = deferred();
  const session = createSession({ storage: storage('synthetic-token'), api: { getMe: () => pending.promise } });
  const restore = session.restore();
  session.logout();
  pending.resolve(profile);
  assert.equal(await restore, null);
  assert.equal(session.user, null);
});

test('logout during login prevents a late token from being stored', async () => {
  const pending = deferred();
  const store = storage();
  const session = createSession({ storage: store, api: { login: () => pending.promise, getMe: async () => profile } });
  const login = session.signIn(credentials);
  session.logout();
  pending.resolve('synthetic-token');
  await assert.rejects(login, error => error.kind === 'aborted');
  assert.equal(session.user, null);
  assert.equal(store.values.size, 0);
});
