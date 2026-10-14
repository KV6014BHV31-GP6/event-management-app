import test from 'node:test';
import assert from 'node:assert/strict';
import { MockEventService } from '../src/mock-service.mjs';

test('public requests wait at quota and cancellation promotes same-channel waiting request', () => {
  const api = new MockEventService();
  api.register({ person: 'DEMO-B', channel: 'public', key: 'b' });
  const c = api.register({ person: 'DEMO-C', channel: 'public', key: 'c' });
  assert.equal(c.mode, 'mock');
  assert.equal(c.data.status, 'waiting');
  api.cancel('demo-registration-1');
  const state = api.snapshot().data;
  assert.equal(state.bookings.find(b => b.person === 'DEMO-C').status, 'confirmed');
  assert.equal(state.summary.publicUsed, 2);
  assert.equal(state.summary.leaderUsed, 0);
});
test('leader quota is independent; active duplicates across channels are rejected', () => {
  const api = new MockEventService();
  assert.throws(() => api.register({ person: 'DEMO-A', channel: 'leader', key: 'a-again' }), error => error.kind === 'duplicate');
  api.register({ person: 'DEMO-D', channel: 'leader', key: 'd' });
  api.register({ person: 'DEMO-E', channel: 'leader', key: 'e' });
  assert.equal(api.register({ person: 'DEMO-F', channel: 'leader', key: 'f' }).data.status, 'waiting');
  assert.equal(api.snapshot().data.summary.leaderUsed, 2);
  assert.equal(api.snapshot().data.summary.publicUsed, 1);
});
test('registration idempotency avoids duplicate writes and catches changed payload', () => {
  const api = new MockEventService();
  const input = { person: 'DEMO-B', channel: 'public', key: 'same' };
  const first = api.register(input), second = api.register(input);
  assert.deepEqual(first, second);
  assert.equal(api.snapshot().data.bookings.length, 2);
  assert.throws(() => api.register({ ...input, person: 'DEMO-C' }), error => error.kind === 'idempotency_conflict');
});
test('arbitrary personal data is rejected before it can enter the mock model', () => {
  const api = new MockEventService();
  assert.throws(() => api.register({ person: 'Real Person', channel: 'public', key: 'x' }), error => error.kind === 'validation');
  assert.equal(api.snapshot().data.bookings.length, 1);
});
test('offline check-in stays pending, manual failure preserves it and later retry applies once', () => {
  const api = new MockEventService();
  api.online = false;
  const result = api.checkIn('demo-registration-1', 'queue-1');
  assert.equal(result.mode, 'mock');
  assert.equal(result.data.status, 'pending');
  api.checkIn('demo-registration-1', 'queue-1');
  assert.equal(api.snapshot().data.queue.length, 1);
  assert.equal(api.snapshot().data.summary.checkedIn, 0);
  assert.throws(() => api.retry(), error => error.kind === 'offline');
  api.online = true;
  api.retry({ failFirst: true });
  assert.equal(api.snapshot().data.queue[0].status, 'pending');
  api.retry(); api.retry();
  const state = api.snapshot().data;
  assert.equal(state.queue[0].status, 'synced');
  assert.equal(state.queue[0].attempts, 2);
  assert.equal(state.summary.checkedIn, 1);
  assert.equal(state.bookings[0].version, 2);
});
test('remote cancellation creates a visible conflict and retry does not overwrite it', () => {
  const api = new MockEventService();
  api.online = false; api.checkIn('demo-registration-1', 'queue-conflict');
  api.online = true; api.cancel('demo-registration-1'); api.retry(); api.retry();
  const state = api.snapshot().data;
  assert.equal(state.queue[0].status, 'conflict');
  assert.equal(state.queue[0].attempts, 1);
  assert.equal(state.bookings[0].status, 'cancelled');
  assert.equal(state.summary.checkedIn, 0);
});
test('outreach reports validate counts and replay safely', () => {
  const api = new MockEventService();
  assert.throws(() => api.report({ count: -10, key: 'invalid' }), error => error.kind === 'validation');
  api.report({ count: 25, key: 'report-1' }); api.report({ count: 25, key: 'report-1' });
  assert.equal(api.snapshot().data.summary.reportedFlyers, 25);
  assert.equal(api.snapshot().data.reports.length, 1);
});
test('returned snapshots cannot mutate authoritative mock state', () => {
  const api = new MockEventService();
  api.snapshot().data.bookings[0].status = 'cancelled';
  assert.equal(api.snapshot().data.bookings[0].status, 'confirmed');
});

test('offline check-in requires a nonblank string operation key', () => {
  const api = new MockEventService();
  api.online = false;
  for (const key of [undefined, '', '  ', 7, {}]) {
    assert.throws(() => api.checkIn('demo-registration-1', key), error => error.kind === 'validation');
  }
  assert.equal(api.snapshot().data.queue.length, 0);
});

test('queue and completed writes share one operation-key namespace', () => {
  const api = new MockEventService();
  api.report({ count: 25, key: 'used-report' });
  api.online = false;
  assert.throws(() => api.checkIn('demo-registration-1', 'used-report'), error => error.kind === 'idempotency_conflict');
  api.checkIn('demo-registration-1', 'queued-checkin');
  api.online = true;
  assert.throws(() => api.report({ count: 25, key: 'queued-checkin' }), error => error.kind === 'idempotency_conflict');
  assert.equal(api.snapshot().data.reports.length, 1);
  assert.equal(api.snapshot().data.queue.length, 1);
});

test('online check-in replays its receipt and rejects key reuse after arrival', () => {
  const api = new MockEventService();
  const first = api.checkIn('demo-registration-1', 'arrive');
  assert.deepEqual(api.checkIn('demo-registration-1', 'arrive'), first);
  api.report({ count: 10, key: 'other-operation' });
  assert.throws(() => api.checkIn('demo-registration-1', 'other-operation'), error => error.kind === 'idempotency_conflict');
  assert.equal(api.snapshot().data.bookings[0].version, 2);
});
