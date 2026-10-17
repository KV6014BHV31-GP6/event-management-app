import { IntegrationError } from './http-adapter.mjs';

export const DEMO_PEOPLE = Object.freeze(Array.from({ length: 8 }, (_, index) => `DEMO-${String.fromCharCode(65 + index)}`));
const error = (kind, text) => new IntegrationError(kind, `MOCK: ${text}`);
const clone = value => JSON.parse(JSON.stringify(value));
export const DEMO_POLICY = Object.freeze({
  scope: 'proposal-not-team-approved', totalCapacity: 4, waitlist: 'same-channel-fifo',
  channels: ['public', 'leader'], walkIn: 'blocked-pending-policy', persistence: 'memory-only'
});

/** In-memory synthetic model. These shapes and quota rules are proposals, not API contracts. */
export class MockEventService {
  constructor() {
    this.mode = 'mock';
    this.online = true;
    this.event = { id: 'demo-event', title: 'Community screening preview', slot: 'Demo session · 09:00 to 10:00', publicQuota: 2, leaderQuota: 2, status: 'open', totalCapacity: DEMO_POLICY.totalCapacity };
    this.bookings = [];
    this.reports = [];
    this.queue = [];
    this.receipts = new Map();
    this.sequence = 0;
    this.register({ person: 'DEMO-A', channel: 'public', key: 'seed-a' });
  }
  result(data) { return { mode: 'mock', data: clone(data) }; }
  assertOnline() { if (!this.online) throw error('offline', 'Reconnect the simulation before submitting.'); }
  assertOperationKey(key, signature) {
    if (typeof key !== 'string' || !key.trim()) throw error('validation', 'A demo operation key is required.');
    const cached = this.receipts.get(key);
    const queued = this.queue.find(item => item.key === key);
    if ((cached && cached.signature !== signature) || (queued && JSON.stringify(['checkIn', queued.id]) !== signature)) {
      throw error('idempotency_conflict', 'Operation key reused for different input.');
    }
    return cached;
  }
  once(key, signature, action) {
    const cached = this.assertOperationKey(key, signature);
    if (cached) {
      return clone(cached.result);
    }
    const result = action();
    this.receipts.set(key, { signature, result: clone(result) });
    return result;
  }
  register({ person, channel, key }) {
    this.assertOnline();
    if (!DEMO_PEOPLE.includes(person) || !['public', 'leader'].includes(channel)) throw error('validation', 'Use a listed demo participant and channel.');
    if (this.event.status !== 'open') throw error('event_closed', 'The demo event is closed.');
    return this.once(key, JSON.stringify(['register', person, channel]), () => {
      if (this.bookings.some(b => b.person === person && b.status !== 'cancelled')) throw error('duplicate', 'This demo participant already has an active request.');
      const quota = channel === 'public' ? this.event.publicQuota : this.event.leaderQuota;
      const used = this.bookings.filter(b => b.channel === channel && b.status === 'confirmed').length;
      const booking = { id: `demo-registration-${++this.sequence}`, person, channel, status: used < quota ? 'confirmed' : 'waiting', checkedIn: false, version: 1 };
      this.bookings.push(booking);
      return this.result(booking);
    });
  }
  cancel(id) {
    this.assertOnline();
    const booking = this.bookings.find(b => b.id === id);
    if (!booking) throw error('not_found', 'Registration not found.');
    if (booking.checkedIn) throw error('conflict', 'Checked-in registrations need a reviewed staff process.');
    if (booking.status === 'cancelled') return this.result(booking);
    const freed = booking.status === 'confirmed';
    booking.status = 'cancelled';
    booking.version++;
    if (freed) {
      const next = this.bookings.find(b => b.channel === booking.channel && b.status === 'waiting');
      if (next) { next.status = 'confirmed'; next.version++; }
    }
    return this.result(booking);
  }
  report({ count, key }) {
    this.assertOnline();
    if (!Number.isInteger(count) || count < 1 || count > 500) throw error('validation', 'Choose a count from 1 to 500.');
    return this.once(key, JSON.stringify(['report', count]), () => {
      const report = { id: `demo-report-${++this.sequence}`, channel: 'printed flyers', count, leader: 'DEMO-LEADER' };
      this.reports.push(report);
      return this.result(report);
    });
  }
  checkIn(id, key) {
    const signature = JSON.stringify(['checkIn', id]);
    const cached = this.assertOperationKey(key, signature);
    if (cached) return clone(cached.result);
    const booking = this.bookings.find(b => b.id === id);
    if (!booking || booking.status !== 'confirmed') throw error('conflict', 'Only a confirmed demo registration can be checked in.');
    const known = this.queue.find(q => q.key === key);
    if (known && known.id !== id) throw error('idempotency_conflict', 'Queue key already belongs to another registration.');
    if (known) return this.result(known);
    if (booking.checkedIn) return this.result({ id, status: 'already_checked_in' });
    const pending = this.queue.find(q => q.id === id && ['pending', 'conflict'].includes(q.status));
    if (pending) return this.result(pending);
    if (!this.online) {
      const queued = { id, key, version: booking.version, status: 'pending', attempts: 0 };
      this.queue.push(queued);
      return this.result(queued);
    }
    return this.once(key, signature, () => {
      booking.checkedIn = true;
      booking.version++;
      return this.result({ id, status: 'checked_in' });
    });
  }
  retry({ failFirst = false } = {}) {
    this.assertOnline();
    let shouldFail = failFirst;
    for (const item of this.queue.filter(q => q.status === 'pending')) {
      item.attempts++;
      if (shouldFail) { item.lastError = 'Simulated network failure; still pending'; shouldFail = false; continue; }
      const booking = this.bookings.find(b => b.id === item.id);
      if (!booking || booking.status !== 'confirmed' || booking.version !== item.version) {
        item.status = 'conflict'; item.lastError = 'Registration changed; review required'; continue;
      }
      booking.checkedIn = true;
      booking.version++;
      item.status = 'synced';
      delete item.lastError;
    }
    return this.result(this.queue);
  }
  setQuotas({ publicQuota, leaderQuota }) {
    this.assertOnline();
    if (![publicQuota, leaderQuota].every(n => Number.isInteger(n) && n >= 0) || publicQuota + leaderQuota > this.event.totalCapacity) {
      throw error('validation', 'Quotas must be nonnegative whole numbers within total capacity.');
    }
    const used = channel => this.bookings.filter(b => b.channel === channel && b.status === 'confirmed').length;
    if (publicQuota < used('public') || leaderQuota < used('leader')) throw error('conflict', 'Cannot reduce below confirmed places.');
    this.event.publicQuota = publicQuota; this.event.leaderQuota = leaderQuota;
    // Quota edits do not invent automatic promotion semantics.
    return this.result(this.event);
  }
  walkIn() {
    throw error('policy_pending', 'Walk-in allocation is not approved; no place has been confirmed.');
  }
  snapshot() {
    const confirmed = this.bookings.filter(b => b.status === 'confirmed');
    return this.result({ event: this.event, online: this.online, bookings: this.bookings, reports: this.reports, queue: this.queue,
      summary: { confirmed: confirmed.length, waiting: this.bookings.filter(b => b.status === 'waiting').length,
        checkedIn: confirmed.filter(b => b.checkedIn).length, publicUsed: confirmed.filter(b => b.channel === 'public').length,
        leaderUsed: confirmed.filter(b => b.channel === 'leader').length,
        reportedFlyers: this.reports.reduce((total, r) => total + r.count, 0) } });
  }
}
