import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpAdapter } from '../src/http-adapter.mjs';
import { operationPath, OPERATIONS } from '../src/operations.mjs';

// Test-only contract. It is deliberately NOT shipped as an enabled real-server contract.
const contract = {
  evidenceRef: 'TEST-ONLY synthetic fixture', authReviewed: true, responseType: 'json',
  validateRequest: () => true, toWire: () => undefined,
  validateResponse: value => value?.ok === true, fromWire: value => ({ accepted: value.ok })
};
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const adapter = (fetchImpl, extra = {}) => createHttpAdapter({ baseURL: 'https://example.invalid', contracts: { getEvent: contract, createRegistration: contract }, fetchImpl, ...extra });
const get = api => api.invoke('getEvent', { params: { public_id: 'demo' } });
const kind = expected => error => error.kind === expected;

test('handoff records exactly eleven unique HTTP operations without synthetic API paths', () => {
  assert.equal(Object.keys(OPERATIONS).length, 11);
  assert.equal(new Set(Object.values(OPERATIONS).map(op => `${op.method} ${op.path}`)).size, 11);
  assert.equal(OPERATIONS.generateBrochure.path, '/api/v1/events/{eventId}/brochures/generations');
  assert.equal(OPERATIONS.getRegistrationForm.path, '/api/v1/events/{eventId}/registration-form');
});
test('contract gate prevents network access when evidence, auth decision, validators or mappers are absent', async () => {
  let calls = 0;
  for (const missing of ['evidenceRef', 'authReviewed', 'validateRequest', 'toWire', 'validateResponse', 'fromWire', 'responseType']) {
    const incomplete = { ...contract }; delete incomplete[missing];
    const api = adapter(() => { calls++; }, { contracts: { getEvent: incomplete } });
    await assert.rejects(get(api), kind('contract_gate'));
  }
  assert.equal(calls, 0);
});
test('base URL and credentials fail closed, cookie credentials require opt-in', () => {
  assert.throws(() => createHttpAdapter(), kind('configuration'));
  assert.throws(() => createHttpAdapter({ baseURL: 'http://example.invalid' }), kind('configuration'));
  assert.throws(() => createHttpAdapter({ baseURL: 'https://user:secret@example.invalid' }), kind('configuration'));
  assert.throws(() => adapter(() => {}, { credentials: 'include' }), kind('configuration'));
});
test('path parameters are encoded as one segment and cannot become query or fragment', async () => {
  let seen;
  const api = adapter(async (url, options) => { seen = { url, options }; return json({ ok: true }); });
  const result = await api.invoke('getEvent', { params: { public_id: 'a/b ?#名' } });
  assert.equal(seen.url, 'https://example.invalid/events/a%2Fb%20%3F%23%E5%90%8D');
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.redirect, 'error');
  assert.equal(result.mode, 'http');
  assert.deepEqual(result.data, { accepted: true });
  assert.throws(() => operationPath('getEvent', { public_id: '..' }));
});
test('invalid input and missing path parameters never fetch', async () => {
  let calls = 0;
  const api = adapter(() => { calls++; });
  await assert.rejects(api.invoke('getEvent'), kind('request_validation'));
  const rejected = adapter(() => { calls++; }, { contracts: { getEvent: { ...contract, validateRequest: () => false } } });
  await assert.rejects(get(rejected), kind('request_validation'));
  assert.equal(calls, 0);
});
test('HTTP failure is distinct and a write is attempted only once without mock fallback', async () => {
  let calls = 0;
  const api = adapter(async () => { calls++; return new Response('busy', { status: 503 }); });
  await assert.rejects(api.invoke('createRegistration', { input: {} }), error => error.kind === 'http' && error.status === 503 && error.outcome === 'unknown');
  assert.equal(calls, 1);
});
test('transport failure is distinct and never silently switches to mock', async () => {
  const api = adapter(async () => { throw new TypeError('Simulated connection failure'); });
  await assert.rejects(get(api), kind('network'));
  assert.equal(api.mode, 'http');
});
test('timeout aborts a pending read and is reported separately', async () => {
  const api = adapter((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), { timeoutMs: 15 });
  await assert.rejects(get(api), kind('timeout'));
});
test('malformed JSON, unexpected response format and valid but wrong shape are distinct', async () => {
  await assert.rejects(get(adapter(async () => new Response('{bad', { headers: { 'Content-Type': 'application/json' } }))), kind('malformed_json'));
  await assert.rejects(get(adapter(async () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }))), kind('unexpected_content_type'));
  await assert.rejects(get(adapter(async () => json({ success: 'wrong shape' }))), kind('response_validation'));
});
test('request and response mapping are explicit at the boundary', async () => {
  let sent;
  const writeContract = { ...contract, validateRequest: input => input?.sample === 'demo', toWire: input => ({ wire_sample: input.sample }) };
  const api = adapter(async (_url, options) => { sent = options; return json({ ok: true }); }, { contracts: { createRegistration: writeContract } });
  const result = await api.invoke('createRegistration', { input: { sample: 'demo' } });
  assert.equal(sent.body, '{"wire_sample":"demo"}');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(result.data, { accepted: true });
});

test('JSON media type gate rejects prefix and suffix lookalikes', async () => {
  for (const contentType of ['application/json-extra', 'text/application/json', 'application/json.foo']) {
    const api = adapter(async () => new Response('{"ok":true}', { headers: { 'Content-Type': contentType } }));
    await assert.rejects(get(api), kind('unexpected_content_type'));
  }
  for (const contentType of ['application/json; charset=utf-8', 'application/problem+json']) {
    const api = adapter(async () => new Response('{"ok":true}', { headers: { 'Content-Type': contentType } }));
    assert.deepEqual((await get(api)).data, { accepted: true });
  }
});

test('unsupported async request mapper fails before a write can send an empty object', async () => {
  let calls = 0;
  const writeContract = { ...contract, toWire: async () => ({ required_field: 42 }) };
  const api = adapter(async () => { calls++; return json({ ok: true }); }, { contracts: { createRegistration: writeContract } });
  await assert.rejects(api.invoke('createRegistration', { input: {} }), kind('request_validation'));
  assert.equal(calls, 0);
});

test('unsupported async response mapper cannot produce a reported success with unresolved data', async () => {
  const api = adapter(async () => json({ ok: true }), { contracts: { getEvent: { ...contract, fromWire: async value => value } } });
  await assert.rejects(get(api), kind('response_validation'));
});

test('auth-header preparation is bounded and a timeout happens before any write is sent', async () => {
  let calls = 0;
  const api = adapter(async () => { calls++; return json({ ok: true }); }, {
    timeoutMs: 15, authHeaders: () => new Promise(() => {})
  });
  let guard;
  try {
    const observed = await Promise.race([
      api.invoke('createRegistration', { input: {} }).then(() => ({ kind: 'unexpected_success' }), error => error),
      new Promise(resolve => { guard = setTimeout(() => resolve({ kind: 'hung' }), 250); })
    ]);
    assert.equal(observed.kind, 'timeout');
    assert.equal(observed.outcome, 'none');
    assert.equal(calls, 0);
  } finally { clearTimeout(guard); }
});

test('recorded HTTP method and path pairs cannot be mutated by an importer', () => {
  for (const operation of Object.values(OPERATIONS)) assert.equal(Object.isFrozen(operation), true);
  assert.throws(() => { OPERATIONS.getEvent.path = '/changed/{public_id}'; }, TypeError);
});

test('rejected async contract functions fail closed without an unhandled rejection', async () => {
  for (const mapper of ['validateRequest', 'toWire', 'validateResponse', 'fromWire']) {
    let calls = 0;
    const api = adapter(async () => { calls++; return json({ ok: true }); }, {
      contracts: { getEvent: { ...contract, [mapper]: async () => { throw new Error('fixture failure'); } } }
    });
    const beforeFetch = ['validateRequest', 'toWire'].includes(mapper);
    await assert.rejects(get(api), kind(beforeFetch ? 'request_validation' : 'response_validation'));
    assert.equal(calls, beforeFetch ? 0 : 1);
  }
});
