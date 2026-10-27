import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingStatusLabel, createBookingStateView } from '../booking-state-view.mjs';

// Explicit component fixtures. These are not HTTP responses or a live lifecycle demo.
class TextNode {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  set innerHTML(_) { throw new Error('HTML parsing must not be used for booking text'); }
  insertAdjacentHTML() { throw new Error('HTML parsing must not be used for booking text'); }
  setAttribute() { throw new Error('This detached display does not need attributes or actions'); }
}
const documentFixture = {
  createElement(tag) {
    assert.ok(['dl', 'dt', 'dd'].includes(tag), 'Only non-interactive display elements are allowed');
    return new TextNode(tag);
  },
};
const render = value => createBookingStateView(value, documentFixture);
const details = node => node.children.filter(child => child.tag === 'dd').map(child => child.textContent);

for (const [status, label] of [
  ['pending', 'Pending'], ['approved', 'Approved'], ['waiting', 'Waiting'],
  ['rejected', 'Rejected'], ['cancelled', 'Cancelled'],
]) {
  test(`component fixture ${status} displays ${label} without inferring confirmation or quota`, () => {
    const value = Object.freeze({ status });
    assert.equal(bookingStatusLabel(status), label);
    const view = render(value);
    assert.equal(view.tag, 'dl');
    assert.deepEqual(view.children.filter(child => child.tag === 'dt').map(child => child.textContent), ['Registration status', 'Quota']);
    assert.deepEqual(details(view), [label, 'Unavailable']);
    assert.equal(view.children.some(child => /confirmed|offer|accept/i.test(child.textContent)), false);
    assert.equal(value.status, status);
  });
}

test('unknown, missing and non-string labels remain Unknown without coercion or normalization', () => {
  const noCoercion = { toString() { throw new Error('Do not coerce an unknown status'); } };
  for (const status of [undefined, null, '', 'PENDING', ' pending ', 'confirmed', 'offered', 'accepted',
    'unavailable', 'toString', '__proto__', false, 1, {}, ['pending'], new String('pending'), Symbol('pending'), noCoercion]) {
    assert.equal(bookingStatusLabel(status), 'Unknown');
    assert.deepEqual(details(render({ status })), ['Unknown', 'Unavailable']);
  }
});

test('missing component data cannot produce a successful status or quota', () => {
  for (const value of [undefined, null, {}, [], false, 0, 'approved']) {
    assert.deepEqual(details(render(value)), ['Unknown', 'Unavailable']);
  }
});

test('capacity settings and unverified aggregates never become remaining places or pool counts', () => {
  for (const value of [
    { status: 'pending', online_quota: 12, offline_quota: 3 },
    { status: 'waiting', remaining: 9, approved: 3, capacity: 12 },
    { status: 'approved', quota: { online: { approved: 2, capacity: 12 }, waitingCount: 4 } },
    { status: 'cancelled', remaining: 1 },
  ]) {
    Object.freeze(value);
    assert.equal(details(render(value))[1], 'Unavailable');
  }
});

test('markup, quotes and script-like status inputs are replaced by safe text without HTML parsing', () => {
  for (const status of ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>',
    'pending</dd><button>Cancel</button>', '" onclick="alert(1)', '&lt;approved&gt;']) {
    const view = render({ status });
    assert.deepEqual(details(view), ['Unknown', 'Unavailable']);
    assert.equal(view.children.length, 4);
    assert.ok(view.children.every(child => child.children.length === 0));
    assert.equal(view.children.some(child => child.textContent.includes(status)), false);
  }
});

test('module import and detached render need no network, storage, page query or event handler', async () => {
  const names = ['fetch', 'localStorage', 'sessionStorage', 'document'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const name of names) Object.defineProperty(globalThis, name, {
      configurable: true, get() { throw new Error(`Unexpected global access: ${name}`); },
    });
    const isolated = await import('../booking-state-view.mjs?detached-component-check');
    const view = isolated.createBookingStateView({ status: 'waiting' }, documentFixture);
    assert.deepEqual(details(view), ['Waiting', 'Unavailable']);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});
