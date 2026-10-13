import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventsController, paginationModel } from '../events-state.mjs';

function result(page = 1, total = 14, pageSize = 6) {
  return { page, total_count: total, page_size: pageSize, total_pages: Math.ceil(total / pageSize), data: Array.from({ length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) }, () => ({})) };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('pagination describes beginning, middle, final partial page and empty state', () => {
  assert.deepEqual(paginationModel(result()), { first: 1, last: 6, total: 14, pages: 3, page: 1, hasPrevious: false, hasNext: true });
  assert.deepEqual(paginationModel(result(2)), { first: 7, last: 12, total: 14, pages: 3, page: 2, hasPrevious: true, hasNext: true });
  assert.deepEqual(paginationModel(result(3)), { first: 13, last: 14, total: 14, pages: 3, page: 3, hasPrevious: true, hasNext: false });
  assert.deepEqual(paginationModel(result(1, 0)), { first: 0, last: 0, total: 0, pages: 0, page: 0, hasPrevious: false, hasNext: false });
});

test('load emits loading then real API result and forwards page size', async () => {
  const states = [];
  const controller = createEventsController({ onChange: value => states.push(value), api: { getEvents: async ({ page, pageSize }) => result(page, 14, pageSize) } });
  await controller.load(2, 12);
  assert.deepEqual(states.map(state => state.status), ['loading', 'ready']);
  assert.equal(controller.state.result.data.length, 2);
  assert.equal(controller.state.pageSize, 12);
});

test('failed page loads clear old results and can retry the same page', async () => {
  let fails = false;
  const controller = createEventsController({ onChange() {}, api: { getEvents: async ({ page, pageSize }) => { if (fails) throw new Error('Network unavailable'); return result(page, 14, pageSize); } } });
  await controller.load(1);
  fails = true;
  await controller.load(2);
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.result, null);
  assert.equal(controller.state.page, 2);
  fails = false;
  await controller.load();
  assert.equal(controller.state.status, 'ready');
  assert.equal(controller.state.page, 2);
});

test('a stale response cannot replace a more recent page', async () => {
  const first = deferred();
  let initialSignal;
  const controller = createEventsController({ onChange() {}, api: { getEvents: ({ page, signal }) => { if (page === 1) { initialSignal = signal; return first.promise; } return Promise.resolve(result(page)); } } });
  const request = controller.load(1);
  await controller.load(2);
  assert.equal(initialSignal.aborted, true);
  first.resolve(result(1));
  await request;
  assert.equal(controller.state.page, 2);
  assert.equal(controller.state.result.page, 2);
});

test('last-page deletion retrieves the new last page once', async () => {
  const pages = [];
  const controller = createEventsController({ onChange() {}, api: { getEvents: async ({ page }) => { pages.push(page); return result(page, 7); } } });
  await controller.load(3);
  assert.deepEqual(pages, [3, 2]);
  assert.equal(controller.state.page, 2);
  assert.equal(controller.state.result.data.length, 1);
});

test('empty list beyond page one does not enter an endless clamp loop', async () => {
  let calls = 0;
  const controller = createEventsController({ onChange() {}, api: { getEvents: async ({ page }) => { calls++; return result(page, 0); } } });
  await controller.load(4);
  assert.equal(calls, 1);
  assert.equal(controller.state.status, 'ready');
  assert.equal(controller.state.result.total_count, 0);
});
