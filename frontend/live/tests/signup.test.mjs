import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../api.mjs';
import { signupPayload, createSignupController } from '../signup.mjs';
import { selectedPublicId, loginRoute, signupRoute } from '../event-navigation.mjs';

// Synthetic unit fixtures only; no native API, browser storage or database calls.
const values = { username: 'Synthetic_User', password: 'unit-only password 🌱' };
const user = {
  id: '01M5APAAFBYWKAK9GRXNPSNBAA', username: values.username, role: 'user',
  created_at: '2026-10-20T01:00:00Z', updated_at: '2026-10-20T01:00:00.123456Z',
};
const json = (value, status = 201) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const validation = error => error instanceof ApiError && error.kind === 'validation';
const contract = error => error instanceof ApiError && error.kind === 'contract';
const apiReturning = (value, status = 201) => createApi({ fetchImpl: async () => json(value, status) });

test('Signup payload contains only the two contract fields and leaves input unchanged', () => {
  const supplied = Object.freeze({ ...values, role: 'organizer', token: 'unit-token', email: 'synthetic.invalid' });
  assert.deepEqual(signupPayload(supplied), values);
  assert.equal(supplied.role, 'organizer');
  assert.equal(supplied.password, values.password);
});

test('Signup username length uses Unicode code points including twenty astral characters', () => {
  for (const username of ['abc', '🌱'.repeat(3), '🌱'.repeat(20), 'a'.repeat(20), 'e\u0301x']) {
    assert.equal(signupPayload({ ...values, username }).username, username);
  }
  for (const username of ['ab', '🌱🌱', 'a'.repeat(21), '🌱'.repeat(21)]) {
    assert.throws(() => signupPayload({ ...values, username }), validation);
  }
});

test('Signup has no unapproved username regex, trim or case normalization', () => {
  for (const username of [' A ', 'Case_+@', 'éÉ🌱', 'e\u0301X']) {
    assert.equal(signupPayload({ ...values, username }).username, username);
  }
});

test('Signup rejects missing or non-string username and password before any request', () => {
  for (const field of ['username', 'password']) {
    for (const invalid of [undefined, null, 0, false, {}, ['synthetic']]) {
      assert.throws(() => signupPayload({ ...values, [field]: invalid }), validation);
    }
  }
  assert.throws(() => signupPayload({ username: values.username }), validation);
  assert.throws(() => signupPayload({ password: values.password }), validation);
});

test('Signup password minimum is six Unicode code points rather than six UTF-16 units', () => {
  for (const password of ['', '12345', '🌱🌱🌱', '🌱'.repeat(5)]) {
    assert.throws(() => signupPayload({ ...values, password }), validation);
  }
  for (const password of ['123456', '🌱'.repeat(6), '      ']) {
    assert.equal(signupPayload({ ...values, password }).password, password);
  }
});

test('Signup accepts the exact 72-byte bcrypt boundary without truncation', () => {
  for (const password of ['a'.repeat(72), '🌱'.repeat(18), 'é'.repeat(36), `${'🌱'.repeat(17)}abcd`]) {
    assert.equal(new TextEncoder().encode(password).byteLength, 72);
    assert.equal(signupPayload({ ...values, password }).password, password);
  }
});

test('Signup rejects over-72-byte passwords even when their character count is short', () => {
  for (const password of ['a'.repeat(73), `${'🌱'.repeat(18)}a`, `${'é'.repeat(36)}a`, '🌱'.repeat(19)]) {
    assert.ok(new TextEncoder().encode(password).byteLength > 72);
    assert.throws(() => signupPayload({ ...values, password }), validation);
  }
});

test('Signup preserves password spaces, case and Unicode normalization form', () => {
  for (const password of ['  A b  ', 'é'.repeat(6), 'e\u0301'.repeat(6), '......']) {
    assert.equal(signupPayload({ ...values, password }).password, password);
  }
});

test('Signup API sends one public two-field JSON POST without role, token or credentials', async () => {
  const requests = [];
  const api = createApi({ fetchImpl: async (url, options) => { requests.push({ url, options }); return json(user); } });
  assert.deepEqual(await api.createUser({ ...values, role: 'leader', token: 'unit-token', other: 'discard' }), user);
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, '/api/v1/users');
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), values);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.equal(url.includes(values.password), false);
});

test('Signup creation requires exactly HTTP201 rather than any successful HTTP status', async () => {
  for (const status of [200, 202, 206]) {
    await assert.rejects(apiReturning(user, status).createUser(values), contract);
  }
  const api = createApi({ fetchImpl: async () => new Response(null, { status: 204 }) });
  await assert.rejects(api.createUser(values), contract);
});

test('Signup accepts the ordinary-user response with valid ISO datetimes', async () => {
  const result = await apiReturning(user).createUser(values);
  assert.equal(result.id, user.id);
  assert.equal(result.username, values.username);
  assert.equal(result.role, 'user');
  assert.equal(result.created_at, user.created_at);
  assert.equal(result.updated_at, user.updated_at);
});

test('Signup rejects empty, primitive, array and malformed JSON HTTP201 bodies', async () => {
  for (const body of [null, [], 'not a user', 1, {}, { ...user, id: undefined }]) {
    await assert.rejects(apiReturning(body).createUser(values), contract);
  }
  const api = createApi({ fetchImpl: async () => new Response('<html>untrusted</html>', { status: 201 }) });
  await assert.rejects(api.createUser(values), error => contract(error) && !error.message.includes('untrusted'));
});

test('Signup user ID must be a canonical 26-character ULID within its leading range', async () => {
  for (const id of ['', user.id.slice(1), `${user.id}A`, `8${user.id.slice(1)}`, `Z${user.id.slice(1)}`,
    user.id.toLowerCase(), `I${user.id.slice(1)}`, `${user.id.slice(0, 25)}/`]) {
    await assert.rejects(apiReturning({ ...user, id }).createUser(values), contract);
  }
});

test('Signup binds the returned username exactly and accepts only the ordinary user role', async () => {
  for (const patch of [{ username: values.username.toLowerCase() }, { username: `${values.username} ` },
    { username: null }, { role: 'organizer' }, { role: 'leader' }, { role: 'USER' }, { role: null }]) {
    await assert.rejects(apiReturning({ ...user, ...patch }).createUser(values), contract);
  }
});

test('Signup rejects missing, invalid or non-datetime creation and update timestamps', async () => {
  for (const key of ['created_at', 'updated_at']) {
    for (const value of [undefined, null, 123, '', 'not-a-date', '2026-10-20', '2026-99-99T25:99:99Z']) {
      await assert.rejects(apiReturning({ ...user, [key]: value }).createUser(values), contract);
    }
  }
});

test('Signup rejects password or password_hash in a successful server response even when empty', async () => {
  for (const key of ['password', 'password_hash']) {
    for (const value of [values.password, '', null, false]) {
      await assert.rejects(apiReturning({ ...user, [key]: value }).createUser(values), contract);
    }
  }
});

test('Signup duplicate mapping requires the exact reviewed HTTP400 detail', async () => {
  await assert.rejects(apiReturning({ detail: 'Username is already registered.' }, 400).createUser(values), error =>
    error.kind === 'duplicate' && error.status === 400 && /username/i.test(error.message));
  for (const detail of ['Username is already registered', 'username is already registered.',
    'Username is already registered. ', '<script>unit-only secret</script>', { message: 'Username is already registered.' }]) {
    await assert.rejects(apiReturning({ detail }, 400).createUser(values), error =>
      error.kind === 'server' && !error.message.includes('unit-only secret'));
  }
});

test('Signup cannot misclassify event or registration HTTP400 details as a retryable signup rejection', async () => {
  for (const detail of [
    'Invalid identifier structure. Expected a 21-character public NanoID ID.',
    'This participant already holds an active registration record for this event.',
    'Registration full. Online quota limits for this event are exhausted.',
    'Registration rejected. This event is not currently accepting entries.',
  ]) {
    await assert.rejects(apiReturning({ detail }, 400).createUser(values), error => error.kind === 'server' && error.status === 400);
    let calls = 0;
    const api = createApi({ fetchImpl: async () => { calls += 1; return json({ detail }, 400); } });
    const controller = createSignupController({ api });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain');
    await controller.submit(values);
    assert.equal(calls, 1);
  }
});

test('Signup HTTP422 uses a static validation message without echoing response input', async () => {
  const secret = 'unit-only untrusted password detail';
  const api = apiReturning({ detail: [{ loc: ['body', 'password'], input: secret, msg: `<b>${secret}</b>` }] }, 422);
  await assert.rejects(api.createUser(values), error =>
    error.kind === 'validation' && error.status === 422 && !error.message.includes(secret) && !error.message.includes('<b>'));
});

test('Signup API handles authentication, rate-limit and server failures without echoing raw data', async () => {
  for (const [status, kind] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limit'], [500, 'server'], [503, 'server']]) {
    await assert.rejects(apiReturning({ detail: `<script>${values.password}</script>` }, status).createUser(values), error =>
      error.kind === kind && error.status === status && !error.message.includes(values.password) && !error.message.includes('<script>'));
  }
});

test('Signup API reports connection failure and timeout without leaking the rejected payload', async () => {
  const networkApi = createApi({ fetchImpl: async () => { throw new Error(values.password); } });
  await assert.rejects(networkApi.createUser(values), error => error.kind === 'network' && !error.message.includes(values.password));
  const timeoutApi = createApi({ timeoutMs: 5, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException(values.password, 'AbortError')), { once: true });
  }) });
  await assert.rejects(timeoutApi.createUser(values), error => error.kind === 'timeout' && !error.message.includes(values.password));
});

test('Signup immediately locks simultaneous submissions before awaiting the single API write', async () => {
  const pending = deferred();
  let calls = 0;
  const controller = createSignupController({ api: { createUser: async payload => {
    calls += 1; assert.deepEqual(payload, values); return pending.promise;
  } } });
  const first = controller.submit(values);
  assert.equal(controller.state.status, 'submitting');
  await Promise.all([controller.submit(values), controller.submit({ ...values, username: 'Another_User' })]);
  assert.equal(calls, 1);
  pending.resolve(user);
  await first;
  assert.equal(controller.state.status, 'success');
});

test('Signup local validation rejects before POST and permits a deliberate corrected submission', async () => {
  let calls = 0;
  const controller = createSignupController({ api: { createUser: async () => { calls += 1; return user; } } });
  await controller.submit({ ...values, username: 'ab' });
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.user, null);
  assert.equal(calls, 0);
  await controller.submit(values);
  assert.equal(calls, 1);
  assert.equal(controller.state.status, 'success');
});

test('Signup successful controller state is projected, contains no password and stays permanently locked', async () => {
  const changes = [];
  let creates = 0, logins = 0;
  const controller = createSignupController({ api: {
    createUser: async () => { creates += 1; return { ...user, debug: 'discard-this-extra-field' }; },
    login: async () => { logins += 1; throw new Error('Signup must not login'); },
    getMe: async () => { throw new Error('Signup must not verify a Login it did not perform'); },
  }, onChange: state => changes.push(state) });
  await controller.submit(values);
  assert.deepEqual(controller.state.user, user);
  assert.equal(controller.state.status, 'success');
  assert.match(controller.state.message, /created/i);
  assert.match(controller.state.message, /log\s*in/i);
  await controller.submit({ ...values, username: 'Another_User' });
  assert.equal(creates, 1);
  assert.equal(logins, 0);
  assert.equal(JSON.stringify(changes).includes(values.password), false);
  assert.equal(JSON.stringify(changes).includes('discard-this-extra-field'), false);
  assert.deepEqual(changes.map(state => state.status), ['submitting', 'success']);
});

test('Signup exact duplicate rejection permits a deliberate new username without automatic retry', async () => {
  let calls = 0;
  const controller = createSignupController({ api: { createUser: async payload => {
    calls += 1;
    if (calls === 1) throw new ApiError('duplicate', 'Known duplicate', 400);
    return { ...user, username: payload.username };
  } } });
  await controller.submit(values);
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.user, null);
  assert.equal(calls, 1);
  await controller.submit({ ...values, username: 'Another_User' });
  assert.equal(controller.state.status, 'success');
  assert.equal(calls, 2);
});

test('Signup HTTP422 rejection permits correction and never echoes untrusted exception text', async () => {
  let calls = 0;
  const controller = createSignupController({ api: { createUser: async () => {
    calls += 1;
    if (calls === 1) throw new ApiError('validation', `<html>${values.password}</html>`, 422);
    return user;
  } } });
  await controller.submit(values);
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.message.includes(values.password), false);
  assert.equal(controller.state.message.includes('<html>'), false);
  assert.equal(calls, 1);
  await controller.submit(values);
  assert.equal(controller.state.status, 'success');
  assert.equal(calls, 2);
});

test('Signup possibly committed writes become uncertain and forbid further submissions', async () => {
  for (const [kind, status] of [['server', 400], ['unauthorized', 401], ['forbidden', 403], ['rate_limit', 429],
    ['server', 500], ['network', 0], ['timeout', 0], ['contract', 0], ['aborted', 0]]) {
    let calls = 0;
    const controller = createSignupController({ api: { createUser: async () => {
      calls += 1; throw new ApiError(kind, values.password, status);
    } } });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain', `${kind}/${status}`);
    assert.equal(controller.state.user, null);
    assert.match(controller.state.message, /do not submit/i);
    assert.equal(controller.state.message.includes(values.password), false);
    await controller.submit(values);
    assert.equal(calls, 1, `${kind}/${status}`);
  }
});

test('Signup retry decisions bind known error kinds to their reviewed status codes', async () => {
  for (const error of [new ApiError('duplicate', 'untrusted', 500), new ApiError('duplicate', 'untrusted', 0),
    new ApiError('validation', 'untrusted', 400), new ApiError('validation', 'untrusted', 0),
    Object.assign(new Error('untrusted'), { kind: 'duplicate', status: 400 }),
    Object.assign(new Error('untrusted'), { kind: 'validation', status: 422 })]) {
    let calls = 0;
    const controller = createSignupController({ api: { createUser: async () => { calls += 1; throw error; } } });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain');
    await controller.submit(values);
    assert.equal(calls, 1);
  }
});

test('Signup unexpected thrown values are safe uncertain outcomes rather than raw HTML or secrets', async () => {
  for (const failure of [new Error(`<b>${values.password}</b>`), values.password, null, undefined]) {
    const controller = createSignupController({ api: { createUser: async () => { throw failure; } } });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain');
    assert.equal(controller.state.user, null);
    assert.equal(controller.state.message.includes(values.password), false);
    assert.equal(controller.state.message.includes('<b>'), false);
  }
});

test('Signup API contract failures remain locked uncertain outcomes through the real controller path', async () => {
  for (const [response, status] of [[{ ...user, role: 'organizer' }, 201], [{ ...user, username: 'Other_User' }, 201],
    [{ ...user, password_hash: 'unit-only-hash' }, 201], [user, 200]]) {
    let calls = 0;
    const api = createApi({ fetchImpl: async () => { calls += 1; return json(response, status); } });
    const controller = createSignupController({ api });
    await controller.submit(values);
    assert.equal(controller.state.status, 'uncertain');
    assert.equal(controller.state.user, null);
    await controller.submit(values);
    assert.equal(calls, 1);
  }
});

test('Signup retains only a validated selected event and the fixed existing Login destination', () => {
  const id = 'A'.repeat(21);
  assert.equal(selectedPublicId(`?event=${id}`), id);
  assert.equal(signupRoute(id), `./signup.html?event=${id}`);
  assert.equal(loginRoute(id), `./login.html?event=${id}`);
  for (const bad of ['../login', 'https://example.test/', 'A'.repeat(20), 'A'.repeat(22)]) {
    assert.throws(() => signupRoute(bad), validation);
  }
  assert.equal(selectedPublicId(`?event=${id}&event=${id}`), null);
  assert.equal(selectedPublicId('?event=https%3A%2F%2Fexample.test'), null);
});
