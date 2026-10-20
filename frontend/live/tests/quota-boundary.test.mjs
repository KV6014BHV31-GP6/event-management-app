import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eventPayload, createEventController } from '../create-event.mjs';

const values = { title: 'Quota boundary', overview: '', location: 'Synthetic hall', start_time: '2027-01-12T09:00', end_time: '2027-01-12T10:00', online_quota: '0', offline_quota: '0' };

test('both quotas accept zero and the PostgreSQL integer maximum', () => {
  for (const quota of ['0', '2147483647']) {
    const payload = eventPayload({ ...values, online_quota: quota, offline_quota: quota });
    assert.equal(payload.online_quota, Number(quota));
    assert.equal(payload.offline_quota, Number(quota));
  }
});

test('either quota above PostgreSQL integer maximum is rejected before any POST', async () => {
  let posts = 0;
  const session = { user: { id: 'synthetic-user', role: 'organizer' }, createEvent: async () => { posts++; } };
  for (const field of ['online_quota', 'offline_quota']) {
    for (const value of ['2147483648', '9007199254740991']) {
      const input = { ...values, [field]: value };
      assert.throws(() => eventPayload(input), error => error.kind === 'validation');
      const controller = createEventController({ session });
      await controller.submit(input);
      assert.equal(controller.state.status, 'error');
    }
  }
  assert.equal(posts, 0);
});

test('both native HTML quota inputs expose the same maximum', () => {
  const html = readFileSync(new URL('../create-event.html', import.meta.url), 'utf8');
  for (const field of ['online_quota', 'offline_quota']) {
    const tag = html.match(new RegExp(`<input[^>]+name="${field}"[^>]*>`))?.[0];
    assert.ok(tag);
    assert.match(tag, /max="2147483647"/);
    assert.match(tag, /min="0"/);
    assert.match(tag, /step="1"/);
  }
});
