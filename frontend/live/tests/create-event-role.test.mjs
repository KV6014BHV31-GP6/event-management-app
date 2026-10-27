import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api.mjs';
import { createSession, TOKEN_KEY } from '../session.mjs';
import { createEventController, eventPayload, mountCreateEvent } from '../create-event.mjs';
import { createEventsController } from '../events-state.mjs';
import { mountAccount } from '../ui.mjs';

const values = { title: 'Role guard synthetic event', overview: '', location: 'Synthetic Hall', start_time: '2027-02-02T09:00', end_time: '2027-02-02T10:00', online_quota: '3', offline_quota: '0' };
const organizer = { id: 'synthetic-organizer', username: 'another_organizer', role: 'organizer' };
const ordinary = { id: 'synthetic-user', username: 'demo_organizer', role: 'user' };
const receipt = { ...eventPayload(values), id: 1, public_id: 'synthetic-event-00001', organizer_id: organizer.id, status: 'active', created_at: '2027-01-01T00:00:00Z', updated_at: '2027-01-01T00:00:00Z' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

class Node {
  constructor() { this.handlers = {}; this.children = []; this.disabled = false; this.hidden = false; this.textContent = ''; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this[name] = value; }
  reportValidity() { return true; }
}

async function withDOM(callback, extra = {}) {
  const ids = ['create-event-form', 'event-fields', 'create-progress', 'create-result', 'login-prompt', 'organizer-prompt', 'account', 'auth-notice', 'create-timezone', 'created-title', 'created-id'];
  const nodes = Object.fromEntries(ids.map(id => [`#${id}`, new Node()]));
  nodes['#event-fields'].disabled = true;
  nodes['#organizer-prompt'].textContent = 'Organizer account required.';
  const globals = { document: { querySelector: id => nodes[id], createElement: () => new Node() },
    addEventListener() {}, location: { search: '' },
    sessionStorage: { getItem: () => null, removeItem() {} },
    FormData: class { constructor() { return Object.entries(values); } }, ...extra };
  const original = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    await callback(nodes);
  } finally {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

const labels = nodes => nodes['#account'].children.map(node => node.textContent);
const submit = nodes => nodes['#create-event-form'].handlers.submit({ preventDefault() {} });

test('logged-out account keeps Login and Signup while Events load without authentication', async () => {
  await withDOM(async nodes => {
    let restores = 0, events = 0;
    const session = { user: null, hasToken: false, restore: async () => { restores++; }, logout: () => true };
    await mountAccount(session).check();
    assert.deepEqual(labels(nodes), ['Create account', 'Log in ↗']);
    assert.equal(nodes['#account'].children[0].href, './signup.html');
    assert.equal(nodes['#account'].children[1].href, './login.html');
    const api = createApi({ fetchImpl: async (url, options) => {
      events++; assert.equal(url, '/api/v1/events?page=1&pageSize=6');
      assert.equal(options.headers.Authorization, undefined);
      return json({ data: [], total_count: 0, total_pages: 0, page: 1, page_size: 6 });
    } });
    const controller = createEventsController({ api, onChange() {} });
    await controller.load();
    assert.equal(controller.state.status, 'ready'); assert.equal(events, 1); assert.equal(restores, 0);
    assert(!labels(nodes).includes('Create event'));
  });
});

test('account navigation uses verified organizer role, never the username', async () => {
  for (const profile of [ordinary, { ...ordinary, role: 'leader' }, { ...ordinary, role: 'other' }, { ...ordinary, role: undefined }, { ...ordinary, role: null }]) {
    await withDOM(async nodes => {
      const account = mountAccount({ user: profile, hasToken: true });
      account.render();
      assert.deepEqual(labels(nodes), [...(profile.role === 'user' ? ['My registrations'] : []), profile.username, 'Log out']);
      assert(!labels(nodes).includes('Create event'));
    });
  }
  await withDOM(async nodes => {
    mountAccount({ user: organizer, hasToken: true }).render();
    assert.deepEqual(labels(nodes), ['Create event', 'Manage registrations', organizer.username, 'Log out']);
    assert.equal(nodes['#account'].children[0].href, './create-event.html');
    assert.equal(nodes['#account'].children[1].href, './organizer-registrations.html');
    assert.equal(nodes['#account'].children[2].title, `Logged in as ${organizer.username}`);
  });
});

test('logged-out controller rejects even valid fields without invoking Create Event', async () => {
  let posts = 0;
  const controller = createEventController({ session: { user: null, createEvent: async () => { posts++; return receipt; } } });
  await controller.submit(values);
  assert.equal(posts, 0); assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.message, 'Please log in and verify your account first.');
});

test('user, leader, missing and unknown roles are rejected before validation or a POST', async () => {
  for (const role of ['user', 'leader', 'other', undefined, null, 'Organizer']) {
    let posts = 0;
    const controller = createEventController({ session: { user: { ...ordinary, role }, createEvent: async () => { posts++; return receipt; } } });
    await controller.submit(values); await controller.submit({ ...values, title: '' });
    assert.equal(posts, 0, `No POST for role ${String(role)}`);
    assert.equal(controller.state.status, 'error'); assert.equal(controller.state.event, null);
    assert.equal(controller.state.message, 'Organizer account required.');
  }
});

test('token with a pending /users/me profile cannot submit; verified organizer sends exactly one valid POST', async () => {
  const me = deferred(), post = deferred(); let posts = 0;
  const api = createApi({ fetchImpl: async (url, options) => {
    if (url.endsWith('/users/me')) return me.promise;
    posts++; assert.equal(url, '/api/v1/events'); assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.deepEqual(JSON.parse(options.body), eventPayload(values)); return post.promise;
  } });
  const session = createSession({ api, storage: { getItem: key => key === TOKEN_KEY ? 'synthetic-token' : null, removeItem() {} } });
  const restoring = session.restore();
  const controller = createEventController({ session });
  await controller.submit(values); assert.equal(posts, 0);
  me.resolve(json(organizer)); await restoring;
  const first = controller.submit(values); await controller.submit(values);
  assert.equal(posts, 1); assert.equal(controller.state.status, 'submitting');
  post.resolve(json(receipt, 201)); await first; await controller.submit(values);
  assert.equal(posts, 1); assert.equal(controller.state.status, 'success'); assert.deepEqual(controller.state.event, receipt);
});

test('changed role or identity during pending creation discards late success and locks retries', async () => {
  for (const next of [null, { ...ordinary }, { ...organizer, role: 'leader' }, { ...organizer, role: undefined }, { ...organizer, id: 'another-verified-organizer' }]) {
    const pending = deferred(); let posts = 0;
    const session = { user: { ...organizer }, createEvent: () => { posts++; return pending.promise; } };
    const controller = createEventController({ session }); const first = controller.submit(values);
    session.user = next; pending.resolve(receipt); await first; await controller.submit(values);
    assert.equal(posts, 1); assert.equal(controller.state.status, 'uncertain'); assert.equal(controller.state.event, null);
    assert.match(controller.state.message, /Check Events/);
  }
});

test('a later role change prevents a fresh controller from submitting', async () => {
  let posts = 0;
  const session = { user: { ...organizer }, createEvent: async () => { posts++; return receipt; } };
  session.user = { ...ordinary };
  const controller = createEventController({ session }); await controller.submit(values);
  assert.equal(posts, 0); assert.equal(controller.state.message, 'Organizer account required.');
});

test('direct create page remains blocked for a verified ordinary user even if fieldset disabled is removed', async () => {
  let posts = 0;
  await withDOM(async nodes => {
    mountCreateEvent(); await tick();
    assert.equal(nodes['#event-fields'].disabled, true);
    assert.equal(nodes['#login-prompt'].hidden, true);
    assert.equal(nodes['#organizer-prompt'].hidden, false);
    assert.equal(nodes['#organizer-prompt'].textContent, 'Organizer account required.');
    assert.deepEqual(labels(nodes), ['My registrations', ordinary.username, 'Log out']);
    nodes['#event-fields'].disabled = false; submit(nodes); submit(nodes);
    await tick(); assert.equal(posts, 0); assert.equal(nodes['#create-result'].hidden, true);
  }, { sessionStorage: { getItem: () => 'synthetic-token', removeItem() {} },
    fetch: async url => { if (url.endsWith('/users/me')) return json(ordinary); posts++; return json(receipt, 201); } });
});

test('direct create page blocks leader and unverified unknown or missing profiles', async () => {
  for (const role of ['leader', 'other', undefined, null]) {
    let posts = 0;
    await withDOM(async nodes => {
      mountCreateEvent(); await tick();
      assert.equal(nodes['#event-fields'].disabled, true); assert(!labels(nodes).includes('Create event'));
      if (role === 'leader') {
        assert.equal(nodes['#organizer-prompt'].hidden, false); assert.equal(nodes['#login-prompt'].hidden, true);
      } else {
        assert.equal(nodes['#organizer-prompt'].hidden, true); assert.equal(nodes['#login-prompt'].hidden, false);
        assert.match(nodes['#auth-notice'].textContent, /couldn’t verify/);
      }
      nodes['#event-fields'].disabled = false; submit(nodes); await tick(); assert.equal(posts, 0);
    }, { sessionStorage: { getItem: () => 'synthetic-token', removeItem() {} },
      fetch: async url => { if (url.endsWith('/users/me')) return json({ ...ordinary, role }); posts++; return json(receipt, 201); } });
  }
});

test('direct logged-out page preserves login prompt and cannot submit after fieldset tampering', async () => {
  let requests = 0;
  await withDOM(async nodes => {
    mountCreateEvent(); await tick();
    assert.equal(nodes['#event-fields'].disabled, true); assert.equal(nodes['#login-prompt'].hidden, false);
    assert.equal(nodes['#organizer-prompt'].hidden, true); assert(!labels(nodes).includes('Create event'));
    nodes['#event-fields'].disabled = false; submit(nodes); await tick(); assert.equal(requests, 0);
  }, { fetch: async () => { requests++; throw new Error('A logged-out form must not send requests'); } });
});

test('page waits for organizer verification, then retains valid form success and duplicate-submit lock', async () => {
  const me = deferred(), post = deferred(); let posts = 0;
  await withDOM(async nodes => {
    mountCreateEvent(); submit(nodes);
    assert.equal(nodes['#event-fields'].disabled, true); assert.equal(posts, 0); assert(!labels(nodes).includes('Create event'));
    me.resolve(json(organizer)); await tick();
    assert.equal(nodes['#event-fields'].disabled, false); assert(labels(nodes).includes('Create event'));
    assert.equal(nodes['#login-prompt'].hidden, true); assert.equal(nodes['#organizer-prompt'].hidden, true);
    submit(nodes); submit(nodes); assert.equal(posts, 1); assert.equal(nodes['#event-fields'].disabled, true);
    post.resolve(json(receipt, 201)); await tick();
    assert.equal(nodes['#create-result'].hidden, false); assert.equal(nodes['#create-event-form'].hidden, true);
    assert.equal(nodes['#created-title'].textContent, receipt.title); assert.equal(nodes['#created-id'].textContent, receipt.public_id);
    submit(nodes); assert.equal(posts, 1);
  }, { sessionStorage: { getItem: () => 'synthetic-token', removeItem() {} },
    fetch: async (url, options) => {
      if (url.endsWith('/users/me')) return me.promise;
      posts++; assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), eventPayload(values)); return post.promise;
    } });
});

test('logout immediately removes organizer entry and submit capability; late success stays hidden', async () => {
  const post = deferred(); let posts = 0, cleared = 0;
  await withDOM(async nodes => {
    mountCreateEvent(); await tick(); assert(labels(nodes).includes('Create event'));
    submit(nodes); assert.equal(posts, 1);
    nodes['#account'].children.find(node => node.textContent === 'Log out').handlers.click();
    assert.equal(cleared, 1); assert.equal(nodes['#event-fields'].disabled, true);
    assert.equal(nodes['#login-prompt'].hidden, false); assert.equal(nodes['#organizer-prompt'].hidden, true);
    assert(!labels(nodes).includes('Create event')); assert(labels(nodes).includes('Log in ↗'));
    nodes['#event-fields'].disabled = false; submit(nodes); assert.equal(posts, 1);
    post.resolve(json(receipt, 201)); await tick();
    assert.equal(nodes['#event-fields'].disabled, true); assert.equal(nodes['#create-result'].hidden, true);
    assert.doesNotMatch(nodes['#create-progress'].textContent, /created successfully/);
  }, { sessionStorage: { getItem: () => 'synthetic-token', removeItem: () => { cleared++; } },
    fetch: async url => { if (url.endsWith('/users/me')) return json(organizer); posts++; return post.promise; } });
});
