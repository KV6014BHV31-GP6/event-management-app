import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ApiError } from '../api.mjs';
import { createRegistrationsController, mountRegistrationsPage } from '../registrations-page.mjs';

// Controller fixtures are not real Backend, Browser or PostgreSQL acceptance.
const person = { id: 'synthetic-user-a', role: 'user', username: 'synthetic_user' };
const registration = { id: 'synthetic-registration-a', event_id: 42, participant_id: 'synthetic-participant-a',
  created_by_user_id: person.id, status: 'pending', channel: 'online', first_name: 'Synthetic', last_name: 'A',
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup(overrides = {}, mode = 'my') {
  const calls = [];
  const session = {
    user: mode === 'my' ? { ...person } : { ...person, id: 'synthetic-organizer', role: 'organizer' }, revision: 1,
    getMyRegistrations: async options => { calls.push(['my', options]); return [{ ...registration }]; },
    getOrganizerRegistrations: async options => { calls.push(['organizer', options]); return [{ ...registration }]; },
    getRegistration: async id => { calls.push(['detail', id]); return { ...registration }; },
    cancelRegistration: async id => { calls.push(['cancel', id]); return { ...registration, status: 'cancelled' }; },
    approveRegistration: async id => { calls.push(['approve', id]); return { ...registration, status: 'approved' }; },
    ...overrides,
  };
  const controller = createRegistrationsController({ session, mode });
  return { session, controller, calls };
}

test('ordinary account refreshes only its own endpoint and never asks for organizer data', async () => {
  const { controller, calls } = setup();
  await controller.load(); await controller.load();
  assert.equal(controller.state.status, 'ready');
  assert.deepEqual(calls, [['my', {}], ['my', {}]]);
  assert.equal(controller.state.records[0].event_id, 42);
  assert.equal(Object.hasOwn(controller.state.records[0], 'event_url'), false);
});

test('anonymous, organizer, leader and unknown roles cannot use the ordinary list', async () => {
  for (const role of [null, 'organizer', 'leader', 'unknown', undefined]) {
    const { controller, calls } = setup({ user: role === null ? null : { ...person, role } });
    await controller.load(); await controller.cancel(registration.id, { confirmed: true });
    assert.deepEqual(calls, []); assert.equal(controller.state.status, 'blocked');
    assert.deepEqual(controller.state.records, []);
  }
});

test('ordinary, leader, unknown and anonymous accounts cannot request organizer list or details', async () => {
  for (const user of [person, { ...person, role: 'leader' }, { ...person, role: 'unknown' }, null]) {
    const { controller, calls } = setup({ user }, 'organizer');
    await controller.load(); await controller.detail(registration.id); await controller.approve(registration.id);
    assert.deepEqual(calls, []); assert.deepEqual(controller.state.records, []);
  }
});

test('status filter calls the server; invalid filter causes no request', async () => {
  const { controller, calls } = setup();
  await controller.load('pending');
  assert.deepEqual(calls, [['my', { status: 'pending' }]]);
  await controller.load('confirmed');
  assert.equal(calls.length, 1); assert.equal(controller.state.status, 'error');
});

test('empty list and failed refresh clear earlier private records', async () => {
  const { controller, session } = setup(); await controller.load();
  session.getMyRegistrations = async () => [];
  await controller.load(); assert.equal(controller.state.status, 'ready'); assert.match(controller.state.message, /No registrations/);
  session.getMyRegistrations = async () => { throw new ApiError('server', 'Service unavailable.', 500); };
  await controller.load(); assert.equal(controller.state.status, 'error'); assert.deepEqual(controller.state.records, []);
});

test('untrusted own list with another actor is rejected before showing any records', async () => {
  const { controller } = setup({ getMyRegistrations: async () => [{ ...registration, created_by_user_id: 'someone-else' }] });
  await controller.load(); assert.equal(controller.state.status, 'error'); assert.deepEqual(controller.state.records, []);
});

test('mismatched filter data, duplicated references and malformed list fail closed', async () => {
  for (const rows of [[{ ...registration, status: 'approved' }], [registration, registration], {}, [{ ...registration, event_id: '42' }]]) {
    const { controller } = setup({ getMyRegistrations: async () => rows });
    await controller.load('pending'); assert.equal(controller.state.status, 'error'); assert.deepEqual(controller.state.records, []);
  }
});

test('a late list response after logout is discarded and private data stays cleared', async () => {
  const pending = deferred(); const { controller, session } = setup({ getMyRegistrations: () => pending.promise });
  const work = controller.load(); session.user = null; session.revision += 1; controller.accountChanged();
  pending.resolve([registration]); await work;
  assert.equal(controller.state.status, 'blocked'); assert.deepEqual(controller.state.records, []); assert.equal(controller.state.detail, null);
});

test('older read cannot overwrite a newer refresh', async () => {
  const pending = deferred(); const { controller, session } = setup({ getMyRegistrations: () => pending.promise });
  const first = controller.load(); session.getMyRegistrations = async () => [];
  await controller.load(); pending.resolve([registration]); await first;
  assert.deepEqual(controller.state.records, []); assert.equal(controller.state.status, 'ready');
});

test('cancel requires explicit confirmation and locks duplicate calls while waiting', async () => {
  const pending = deferred(); let writes = 0;
  const { controller, session } = setup({ cancelRegistration: () => { writes += 1; return pending.promise; } });
  await controller.load(); await controller.cancel(registration.id); assert.equal(writes, 0);
  const first = controller.cancel(registration.id, { confirmed: true });
  await controller.cancel(registration.id, { confirmed: true }); assert.equal(writes, 1); assert.equal(controller.locked(registration.id), true);
  session.getMyRegistrations = async () => [{ ...registration, status: 'cancelled' }];
  pending.resolve({ ...registration, status: 'cancelled' }); await first;
  assert.equal(controller.state.records[0].status, 'cancelled'); assert.equal(controller.busy, false);
});

test('successful cancellation reloads actual records and does not invent promotion or quota', async () => {
  let reads = 0;
  const { controller } = setup({ getMyRegistrations: async () => { reads += 1; return [{ ...registration, status: reads > 1 ? 'cancelled' : 'approved' }]; } });
  await controller.load(); await controller.cancel(registration.id, { confirmed: true });
  assert.equal(reads, 2); assert.equal(controller.state.records[0].status, 'cancelled');
  assert.equal(Object.hasOwn(controller.state.records[0], 'quota'), false); assert.match(controller.state.actionMessage, /server returned Cancelled/);
});

test('unknown cancellation outcome remains locked across refresh and is never retried automatically', async () => {
  let writes = 0;
  const { controller } = setup({ cancelRegistration: async () => { writes += 1; throw new ApiError('timeout', 'Timed out.'); } });
  await controller.load(); await controller.cancel(registration.id, { confirmed: true });
  await controller.load(); await controller.cancel(registration.id, { confirmed: true });
  assert.equal(writes, 1); assert.equal(controller.locked(registration.id), true); assert.equal(controller.busy, false);
  assert.match(controller.state.actionMessage, /unknown/);
});

test('malformed successful cancellation cannot show success or permit resubmission', async () => {
  const { controller } = setup({ cancelRegistration: async () => ({ ...registration, id: 'wrong-id', status: 'cancelled' }) });
  await controller.load(); await controller.cancel(registration.id, { confirmed: true });
  assert.equal(controller.locked(registration.id), true); assert.equal(controller.state.records[0].status, 'pending');
  assert.match(controller.state.actionMessage, /unknown/);
});

test('known action rejection is visible and does not change the record', async () => {
  const { controller } = setup({ cancelRegistration: async () => { throw new ApiError('forbidden', 'Cannot cancel this registration.', 403); } });
  await controller.load(); await controller.cancel(registration.id, { confirmed: true });
  assert.equal(controller.state.records[0].status, 'pending'); assert.equal(controller.busy, false);
  assert.equal(controller.state.actionError, true); assert.equal(controller.locked(registration.id), false);
});

test('cancelled, rejected, unknown and absent records cannot send cancellation', async () => {
  for (const status of ['cancelled', 'rejected', 'future-state']) {
    const { controller, calls } = setup({ getMyRegistrations: async () => [{ ...registration, status }] });
    await controller.load(); await controller.cancel(registration.id, { confirmed: true });
    await controller.cancel('missing-reference', { confirmed: true });
    assert.deepEqual(calls, []);
  }
});

test('organizer detail uses actual detail method and accepts only the requested record', async () => {
  const { controller, session, calls } = setup({}, 'organizer');
  await controller.load(); await controller.detail(registration.id);
  assert.deepEqual(calls, [['organizer', {}], ['detail', registration.id]]);
  assert.equal(controller.state.detail.id, registration.id);
  session.getRegistration = async () => ({ ...registration, id: 'wrong-id' });
  await controller.detail(registration.id); assert.equal(controller.state.detailStatus, 'error'); assert.equal(controller.state.detail, null);
});

test('organizer approval accepts waiting from the server and re-reads the list', async () => {
  let reads = 0;
  const { controller } = setup({
    getOrganizerRegistrations: async () => { reads += 1; return [{ ...registration, status: reads > 1 ? 'waiting' : 'pending' }]; },
    approveRegistration: async () => ({ ...registration, status: 'waiting' }),
  }, 'organizer');
  await controller.load(); await controller.approve(registration.id);
  assert.equal(reads, 2); assert.equal(controller.state.records[0].status, 'waiting');
  assert.match(controller.state.actionMessage, /server returned Waiting/);
});

test('approval server failure is an unknown result, not approved or a silently retried request', async () => {
  let writes = 0;
  const { controller } = setup({ approveRegistration: async () => { writes += 1; throw new ApiError('server', 'Unavailable.', 500); } }, 'organizer');
  await controller.load(); await controller.approve(registration.id); await controller.approve(registration.id);
  assert.equal(writes, 1); assert.equal(controller.state.records[0].status, 'pending');
  assert.equal(controller.locked(registration.id), true); assert.match(controller.state.actionMessage, /unknown/);
});

test('only pending organizer records can be approved', async () => {
  for (const status of ['approved', 'waiting', 'rejected', 'cancelled', 'unknown']) {
    const { controller, calls } = setup({ getOrganizerRegistrations: async () => [{ ...registration, status }] }, 'organizer');
    await controller.load(); await controller.approve(registration.id); assert.deepEqual(calls, []);
  }
});

test('identity change during action clears private records and suppresses late success', async () => {
  const pending = deferred(); const { controller, session } = setup({ cancelRegistration: () => pending.promise });
  await controller.load(); const action = controller.cancel(registration.id, { confirmed: true });
  session.user = { ...person, id: 'synthetic-user-b' }; session.revision += 1; controller.accountChanged();
  pending.resolve({ ...registration, status: 'cancelled' }); await action;
  assert.deepEqual(controller.state.records, []); assert.equal(controller.state.actionMessage, ''); assert.equal(controller.busy, false);
});

test('late organizer detail cannot survive identity change', async () => {
  const pending = deferred(); const { controller, session } = setup({ getRegistration: () => pending.promise }, 'organizer');
  await controller.load(); const action = controller.detail(registration.id);
  session.user = null; session.revision += 1; controller.accountChanged();
  pending.resolve(registration); await action; assert.equal(controller.state.detail, null); assert.deepEqual(controller.state.records, []);
});

test('page markup keeps English labels, accessible live messages and non-writing filter fallback', async () => {
  for (const [file, mode] of [['my-registrations.html', 'my'], ['organizer-registrations.html', 'organizer']]) {
    const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`data-registration-page="${mode}"`));
    assert.match(html, /method="dialog"/); assert.match(html, /aria-live="polite"/); assert.match(html, /Skip to main content/);
    assert.match(html, /<option value="cancelled">Cancelled<\/option>/);
    assert.doesNotMatch(html, /national_id|medical_record|role="admin"|localStorage/);
  }
});

test('DOM cancel buttons require confirmation and Enter/click duplicates cannot send twice', async () => {
  class Node {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.handlers = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
  }
  const ids = ['account', 'auth-notice', 'registrations-list', 'registrations-message', 'registrations-action-message',
    'registrations-access', 'registrations-filter-form', 'registrations-filter', 'registrations-refresh', 'registration-detail'];
  const nodes = Object.fromEntries(ids.map(id => [`#${id}`, new Node()]));
  const main = new Node('main'); main.dataset.registrationPage = 'my';
  const pending = deferred(); let writes = 0; let confirms = 0; let allow = false;
  const globals = {
    document: { querySelector: selector => selector === '[data-registration-page]' ? main : nodes[selector], createElement: tag => new Node(tag) },
    location: { search: '' }, addEventListener() {}, confirm() { confirms += 1; return allow; },
  };
  const previous = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
    const { session } = setup({ hasToken: true, restore: async () => person,
      cancelRegistration: () => { writes += 1; return pending.promise; },
      logout() { this.user = null; this.hasToken = false; this.revision += 1; return true; } });
    const mounted = mountRegistrationsPage({ session });
    await new Promise(setImmediate);
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    const action = flatten(nodes['#registrations-list']).find(node => node.textContent === 'Cancel registration');
    assert.equal(action.type, 'button'); action.handlers.click(); assert.equal(confirms, 1); assert.equal(writes, 0);
    allow = true; action.handlers.click(); action.handlers.click();
    assert.equal(writes, 1); assert.equal(mounted.controller.busy, true);
    assert.equal(nodes['#registrations-refresh'].disabled, true);
    assert.equal(flatten(nodes['#registrations-list']).find(node => node.textContent === 'Cancel registration').disabled, true);
    pending.reject(new ApiError('timeout', 'Timed out.')); await new Promise(setImmediate);
    assert.equal(nodes['#registrations-refresh'].disabled, false);
    assert.equal(flatten(nodes['#registrations-list']).find(node => node.textContent === 'Cancel registration').disabled, true);
    assert.match(nodes['#registrations-action-message'].textContent, /unknown/);
    mounted.account.logout(); assert.deepEqual(nodes['#registrations-list'].children, []); assert.equal(nodes['#registration-detail'].hidden, true);
  } finally {
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
