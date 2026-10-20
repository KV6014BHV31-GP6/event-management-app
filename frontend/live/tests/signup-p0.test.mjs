import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApi } from '../api.mjs';
import { createSignupController, mountSignup, signupPayload } from '../signup.mjs';
import { createSession } from '../session.mjs';

// Synthetic unit/component fixtures only. All HTTP is intercepted in memory.
const id = '01M5APAAFBYWKAK9GRXNPSNBAA';
const credentials = { username: ' Unit🌱 ', password: 'unit-only signup regression' };
const profile = {
  id, username: credentials.username, role: 'user',
  created_at: '2026-10-20T01:00:00Z', updated_at: '2026-10-20T01:00:00Z',
};
const json = (body, status = 201) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('P0: Signup rejects every trim-empty username before any POST', async () => {
  let posts = 0;
  const api = createApi({ fetchImpl: async () => { posts += 1; return json(profile); } });
  const controller = createSignupController({ api });
  for (const username of ['   ', '\t\n ', '\u00a0\u2003\u3000']) {
    await controller.submit({ ...credentials, username });
    assert.equal(controller.state.status, 'error');
    assert.equal(controller.state.user, null);
    assert.equal(posts, 0);
  }
});

test('P0: the whitespace check preserves raw valid case, spaces and Unicode', () => {
  for (const username of [' A ', ' Unit🌱 ', 'e\u0301X', 'ÉéX', '\tAb\u3000']) {
    const payload = signupPayload({ ...credentials, username });
    assert.equal(payload.username, username);
    assert.equal(payload.password === credentials.password, true);
  }
});

test('P0: valid raw Signup credentials still support explicit Login and verified /users/me', async () => {
  const requests = [];
  const api = createApi({ fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (url === '/api/v1/users') return json(profile);
    if (url === '/api/v1/auth/login') return json({ access_token: 'unit-session-token', token_type: 'bearer' }, 200);
    if (url === '/api/v1/users/me') return json(profile, 200);
    throw new Error('Unexpected mocked route');
  } });
  const controller = createSignupController({ api });
  await controller.submit({ ...credentials });
  assert.equal(controller.state.status, 'success');
  assert.equal(controller.state.user.id, id);
  assert.deepEqual(requests.map(request => request.url), ['/api/v1/users']);
  const session = createSession({ api });
  await session.signIn({ ...credentials });
  assert.equal(session.user.id, id);
  assert.equal(session.user.username, credentials.username);
  assert.equal(session.user.role, 'user');
  assert.deepEqual(requests.map(request => request.url), ['/api/v1/users', '/api/v1/auth/login', '/api/v1/users/me']);
  for (const { options } of requests.slice(0, 2)) {
    const sent = JSON.parse(options.body);
    assert.equal(sent.username, credentials.username);
    assert.equal(sent.password === credentials.password, true);
    assert.equal(Object.hasOwn(sent, 'role'), false);
  }
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[2].options.headers.Authorization === 'Bearer unit-session-token', true);
});

for (const [label, invalid] of [
  ['single-element ULID array', [id]],
  ['object', { value: id }],
  ['number', 123],
  ['null', null],
  ['missing id', undefined],
]) {
  test(`P0: HTTP201 ${label} ID is uncertain and can never be automatically resent`, async () => {
    let posts = 0;
    const response = { ...profile, id: invalid };
    const api = createApi({ fetchImpl: async () => { posts += 1; return json(response); } });
    const controller = createSignupController({ api });
    await controller.submit({ ...credentials });
    assert.equal(controller.state.status, 'uncertain');
    assert.equal(controller.state.user, null);
    assert.match(controller.state.message, /do not submit/i);
    await controller.submit({ ...credentials });
    assert.equal(posts, 1);
  });
}

test('P0: Signup HTML is disabled before JavaScript and has a non-network native form fallback', async () => {
  const html = await readFile(new URL('../signup.html', import.meta.url), 'utf8');
  const form = html.match(/<form\b[^>]*\bid="signup-form"[^>]*>/)?.[0] ?? '';
  const fields = html.match(/<fieldset\b[^>]*\bid="signup-fields"[^>]*>/)?.[0] ?? '';
  assert.match(form, /\bmethod="dialog"/i);
  assert.match(fields, /\bdisabled(?:\s|=|>)/i);
});

function domFixture({ failToggleSetup = false } = {}) {
  const attached = [];
  const enableSnapshots = [];
  class Element {
    constructor() { this.handlers = {}; this.disabled = false; this.hidden = false; this.type = 'password'; }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    setAttribute() {}
    focus() {}
    reportValidity() { return true; }
  }
  const nodes = Object.fromEntries([
    '#signup-form', '#signup-fields', '#password', '#toggle-password', '#signup-progress', '#signup-result', '#created-username',
  ].map(selector => [selector, new Element()]));
  let fieldsDisabled = true;
  Object.defineProperty(nodes['#signup-fields'], 'disabled', {
    get: () => fieldsDisabled,
    set: next => {
      fieldsDisabled = next;
      if (!next) enableSnapshots.push([...attached]);
    },
  });
  nodes['#signup-form'].addEventListener = (type, handler) => {
    nodes['#signup-form'].handlers[type] = handler;
    attached.push(`form:${type}`);
  };
  nodes['#toggle-password'].addEventListener = (type, handler) => {
    if (failToggleSetup) throw new Error('Synthetic initialization failure');
    nodes['#toggle-password'].handlers[type] = handler;
    attached.push(`toggle:${type}`);
  };
  return { nodes, attached, enableSnapshots, document: {
    querySelector: selector => nodes[selector],
    querySelectorAll: () => [],
  } };
}

function withDom(fixture, action) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fixture.document });
  Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: { search: '' } });
  try { return action(); }
  finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation); else delete globalThis.location;
  }
}

test('P0: Signup enables its initially disabled fieldset only after all handlers attach (DOM component)', () => {
  const fixture = domFixture();
  withDom(fixture, () => mountSignup());
  assert.equal(fixture.nodes['#signup-fields'].disabled, false);
  assert.equal(fixture.enableSnapshots.length, 1);
  assert.deepEqual(fixture.enableSnapshots[0], ['form:submit', 'toggle:click']);
});

test('P0: a partial initialization failure leaves the sensitive fieldset disabled (DOM component)', () => {
  const fixture = domFixture({ failToggleSetup: true });
  withDom(fixture, () => assert.throws(() => mountSignup(), /Synthetic initialization failure/));
  assert.equal(fixture.nodes['#signup-fields'].disabled, true);
  assert.equal(fixture.enableSnapshots.length, 0);
});
