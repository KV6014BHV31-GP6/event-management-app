/** Limited W7 stage-2 checks. Real writes require explicit opt-in and synthetic local fixtures.
 * No trace/HAR/storage export, secret headers, registration GET, DB restart or video.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

assert.ok(process.argv.includes('--allow-synthetic-writes'), 'Explicit synthetic-write opt-in required');
const base = process.env.APP_URL;
assert.ok(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local frontend required');
const evidence = resolve(process.env.EVIDENCE_DIR);
const runId = process.env.W7_RUN_ID;
assert.match(runId || '', /^\d{8}-\d{6}$/);
assert.ok(process.env.W7_ACCOUNTS_FILE && process.env.W7_PARTICIPANT_FILE && process.env.PLAYWRIGHT_MODULE);
const accounts = JSON.parse(await readFile(process.env.W7_ACCOUNTS_FILE, 'utf8'));
const participant = JSON.parse(await readFile(process.env.W7_PARTICIPANT_FILE, 'utf8'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
await mkdir(evidence, { recursive: true });
const report = { stage: 2, started_at: new Date().toISOString(), scope: 'Limited W7 implementation checks, not complete E2E / Security / UAT',
  source_backend_sha: 'd2f924bc6d7fb73e4c54da6fa0d73fd7ea8639a0', main_flow_interception: false, checks: [], http: [], fixtures: [], receipts: [], controlled: [] };
const save = async () => writeFile(resolve(evidence, 'browser-results.json'), JSON.stringify(report, null, 2));
const pass = async (id, actual, layer = 'ACTUAL_HTTP / PROXY / BROWSER') => { report.checks.push({ id, status: 'PASS', layer, actual, time: new Date().toISOString() }); await save(); console.log(JSON.stringify({ id, status: 'PASS' })); };
const isPath = (response, suffix) => new URL(response.url()).pathname === '/api/v1' + suffix;
const counts = page => {
  const writes = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname); });
  page.on('response', response => { const u = new URL(response.url()); if (u.pathname.startsWith('/api/v1/')) report.http.push({ method: response.request().method(), path: u.pathname + u.search, status: response.status(), time: new Date().toISOString() }); });
  return writes;
};
async function shot(page, name) {
  assert.equal(await page.locator('input[type="password"]').evaluateAll(nodes => nodes.some(n => n.value)), false, 'No populated password screenshots');
  await page.screenshot({ path: resolve(evidence, name + '.png'), fullPage: true });
}
async function login(page, account, selected) {
  await page.goto(base + '/live/login.html' + (selected ? '?event=' + selected : ''));
  await page.locator('#username').fill(account.username); await page.locator('#password').fill(account.password);
  const response = page.waitForResponse(r => isPath(r, '/auth/login'));
  await page.locator('#login-submit').click(); assert.equal((await response).status(), 200);
  await page.waitForURL(selected ? '**/live/registration.html?event=' + selected : '**/live/index.html');
  await page.locator('.account-name').waitFor();
}
async function search(page, keyword) {
  await page.locator('#event-keyword').fill(keyword);
  const response = page.waitForResponse(r => isPath(r, '/events') && new URL(r.url()).searchParams.get('keyword') === keyword);
  await page.locator('#event-search').getByRole('button', { name: 'Search', exact: true }).click();
  const r = await response; assert.equal(r.status(), 200);
  await page.locator('#event-content[aria-busy="false"]').waitFor(); return r.json();
}
async function fillParticipant(page, override = {}) {
  for (const [key, value] of Object.entries({ ...participant, ...override })) {
    if (key === 'medical_record') continue;
    if (['gender', 'marriage_status'].includes(key)) await page.locator('#' + key).selectOption(value);
    else await page.locator('#' + key).fill(value);
  }
}
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: false, chromiumSandbox: true });
report.browser_version = browser.version();
const contexts = [];
const context = async () => { const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Hong_Kong' }); contexts.push(c); return c; };
try {
  // Refuse to rerun writes after a partial run; retained IDs allow read-only diagnosis.
  try { const previous = JSON.parse(await readFile(resolve(evidence, 'fixtures.json'), 'utf8')); assert.equal(previous.length, 0, 'Existing W7 fixtures: do not blindly rerun writes'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const org = await context(), op = await org.newPage(), ow = counts(op);
  await op.goto(base + '/live/create-event.html'); assert.equal(await op.locator('#event-fields').evaluate(n => n.disabled), true);
  await pass('CREATE_LOGGED_OUT_GATE', { post_count: ow.filter(p => p === '/api/v1/events').length });
  await login(op, accounts.organizer);
  for (const [index, name] of ['Alpha', 'Beta', 'Gamma'].entries()) {
    await op.goto(base + '/live/create-event.html'); await op.waitForFunction(() => !document.querySelector('#event-fields').disabled);
    const start = new Date(Date.now() + (index + 2) * 86400000); start.setUTCHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    const title = `NU W7 ${runId} ${name}`;
    const values = { title, overview: `Synthetic lesson fixture. OVERVIEW-${runId}-${name}`, location: 'Synthetic W7 community room', start_time: start.toISOString().slice(0, 16), end_time: end.toISOString().slice(0, 16), online_quota: '8', offline_quota: '0' };
    for (const [key, value] of Object.entries(values)) await op.locator('#' + key).fill(value);
    if (index === 0) {
      await op.locator('#online_quota').fill('2147483648');
      assert.equal(await op.locator('#online_quota').evaluate(n => n.checkValidity()), false);
      await op.locator('#create-event-form button[type="submit"]').click(); await op.waitForTimeout(150);
      assert.equal(ow.filter(p => p === '/api/v1/events').length, 0); await op.locator('#online_quota').fill('8');
      await pass('CREATE_INT32_REGRESSION', { invalid_quota_post_count: 0 });
    }
    const pending = op.waitForResponse(r => isPath(r, '/events') && r.request().method() === 'POST');
    await op.locator('#create-event-form button[type="submit"]').click({ clickCount: 2 });
    const r = await pending; assert.equal(r.status(), 201); const event = await r.json();
    await op.locator('#create-result:not([hidden])').waitFor();
    assert.equal(await op.locator('#created-id').textContent(), event.public_id); assert.equal(event.title, title);
    report.fixtures.push({ id: event.id, public_id: event.public_id, title, overview: event.overview, status: event.status });
    await writeFile(resolve(evidence, 'fixtures.json'), JSON.stringify(report.fixtures, null, 2));
    assert.equal(ow.filter(p => p === '/api/v1/events').length, index + 1);
    await pass('CREATE_UI_' + name.toUpperCase(), { public_id: event.public_id, event_id: event.id, status: 201, once: true });
  }
  await shot(op, 'create-event-result');
  const ordinary = await context(), page = await ordinary.newPage(), writes = counts(page);
  await page.goto(base + '/live/index.html'); await page.locator('#event-content[aria-busy="false"]').waitFor();
  const matching = await search(page, runId); assert.equal(matching.total_count, 3);
  assert.deepEqual(new Set(matching.data.map(e => e.public_id)), new Set(report.fixtures.map(e => e.public_id)));
  await pass('SEARCH_TITLE_MATCH', { total_count: 3, keyword: runId });
  const overview = await search(page, `OVERVIEW-${runId}-Alpha`); assert.equal(overview.total_count, 1); assert.equal(overview.data[0].public_id, report.fixtures[0].public_id);
  await pass('SEARCH_OVERVIEW_MATCH', { public_id: overview.data[0].public_id });
  const empty = await search(page, 'NO_MATCH_' + runId); assert.equal(empty.total_count, 0); assert.equal(empty.total_pages, 0);
  await page.getByRole('heading', { name: 'No matching events.', exact: true }).waitFor(); await shot(page, 'search-empty');
  await pass('SEARCH_EMPTY', { total_count: 0, total_pages: 0 });
  const full = await search(page, runId);
  for (const p of [1, 2]) {
    const query = `/api/v1/events?page=${p}&pageSize=1&keyword=${runId}`;
    const proxied = await ordinary.request.get(base + query), direct = await ordinary.request.get('http://127.0.0.1:8017' + query);
    assert.equal(proxied.status(), 200); assert.equal(direct.status(), 200);
    const body = await proxied.json(); assert.deepEqual(body, await direct.json()); assert.equal(body.page, p); assert.equal(body.page_size, 1); assert.equal(body.total_count, 3); assert.equal(body.total_pages, 3);
    await pass('SEARCH_PAGINATION_' + p, { page: p, public_id: body.data[0].public_id, direct_proxy_equal: true });
  }
  assert.equal(full.total_count, 3); await shot(page, 'search-matching');
  const first = report.fixtures[0];
  await page.getByRole('link', { name: 'View event: ' + first.title, exact: true }).click();
  await page.locator('#detail-content:not([hidden])').waitFor(); assert.equal(await page.locator('#detail-title').textContent(), first.title);
  assert.equal(await page.locator('#detail-status').textContent(), first.status); await shot(page, 'event-detail');
  await page.locator('#choose-event').click(); await page.locator('#registration-login-link').waitFor();
  assert.equal(await page.locator('#registration-fields').evaluate(n => n.disabled), true); await page.locator('#registration-login-link').click();
  assert.equal(new URL(page.url()).searchParams.get('event'), first.public_id);
  await page.locator('#username').fill(accounts.ordinary.username); await page.locator('#password').fill(accounts.ordinary.password);
  await page.locator('#login-submit').click(); await page.waitForURL('**/live/registration.html?event=' + first.public_id);
  await page.waitForFunction(() => !document.querySelector('#registration-fields').disabled);
  assert.equal(await page.locator('#selected-event-title').textContent(), first.title);
  await pass('DETAIL_LOGIN_RETURN', { selected_public_id: first.public_id, form_enabled_after_verified_login: true });
  let participantId;
  for (const [index, fixture] of report.fixtures.entries()) {
    if (index > 0) {
      await page.getByRole('link', { name: 'Browse another event', exact: false }).click();
      await page.locator('#event-content[aria-busy="false"]').waitFor(); await search(page, runId);
      await page.getByRole('link', { name: 'View event: ' + fixture.title, exact: true }).click();
      await page.locator('#choose-event').click(); await page.waitForFunction(() => !document.querySelector('#registration-fields').disabled);
    }
    await fillParticipant(page);
    if (index === 0) {
      await page.locator('#first_name').fill('A'.repeat(21)); await page.locator('#registration-submit').click();
      await page.locator('#registration-progress').filter({ hasText: 'maximum lengths' }).waitFor();
      assert.equal(writes.filter(p => p.endsWith('/registrations')).length, 0); await page.locator('#first_name').fill(participant.first_name);
      await pass('REGISTRATION_VALIDATION', { invalid_name_post_count: 0 });
    }
    const pending = page.waitForResponse(r => isPath(r, '/events/' + fixture.public_id + '/registrations'));
    await page.locator('#registration-submit').click({ clickCount: 2 }); const response = await pending;
    assert.equal(response.status(), 201); const receipt = await response.json();
    await page.locator('#registration-result:not([hidden])').waitFor();
    assert.equal(await page.locator('#receipt-status').textContent(), 'pending'); assert.equal(await page.locator('#receipt-public-id').textContent(), fixture.public_id);
    assert.equal(receipt.event_id, fixture.id); assert.equal(receipt.created_by_user_id, '01M5APAAFBYWKAK9GRXNPSNBAA'); assert.equal(receipt.channel, 'online'); assert.equal(receipt.status, 'pending');
    if (index === 0) participantId = receipt.participant_id; assert.equal(receipt.participant_id, participantId);
    assert.equal(writes.filter(p => p.endsWith('/registrations')).length, index + 1);
    report.receipts.push({ public_id: fixture.public_id, event_id: receipt.event_id, registration_id: receipt.id, participant_id: receipt.participant_id, created_by_user_id: receipt.created_by_user_id, channel: receipt.channel, status: receipt.status, http_status: response.status(), post_count_for_new_event: 1 });
    await writeFile(resolve(evidence, 'ui-receipts.json'), JSON.stringify(report.receipts, null, 2));
    await shot(page, 'pending-' + (index + 1)); await pass('UI_REGISTRATION_' + (index + 1), report.receipts.at(-1));
  }
  assert.equal(new Set(report.receipts.map(r => r.registration_id)).size, 3);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#registration-fields').disabled);
  assert.equal(await page.locator('#registration-result').isHidden(), true);
  const storageKeys = await page.evaluate(() => ({ session: Object.keys(sessionStorage), local: Object.keys(localStorage) }));
  assert.deepEqual(storageKeys.session, ['rose.live.access-token']); assert.deepEqual(storageKeys.local, []);
  await pass('NO_FAKE_SAVED_READBACK', { reload_receipt_hidden: true, stored_keys_only_token: true });
  await page.goto(base + '/live/registration.html?event=' + first.public_id); await page.waitForFunction(() => !document.querySelector('#registration-fields').disabled); await fillParticipant(page);
  const duplicate = page.waitForResponse(r => isPath(r, '/events/' + first.public_id + '/registrations'));
  await page.locator('#registration-submit').click(); assert.equal((await duplicate).status(), 400);
  await page.locator('#registration-progress').filter({ hasText: 'already exists' }).waitFor(); assert.equal(await page.locator('#registration-result').isHidden(), true);
  await pass('DUPLICATE_REJECTION', { http_status: 400, success_not_shown: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot(page, 'application-small-viewport');
  await pass('SMALL_VIEWPORT_SANITY', { width: 390, horizontal_overflow: false }, 'BROWSER_LAYOUT_ONLY');
  await page.locator('#account').getByRole('button', { name: 'Log out', exact: true }).click(); assert.equal(await page.locator('#registration-fields').evaluate(n => n.disabled), true);
  await pass('LOGOUT_GATE_REGRESSION', { form_disabled: true });
  // Controlled cases use separate contexts and never forward the intercepted POST.
  for (const kind of ['loading', 'connection', 'full', 'inactive', 'uncertain']) {
    const c = await context(), p = await c.newPage(); await login(p, accounts.ordinary, first.public_id);
    await p.waitForFunction(() => !document.querySelector('#registration-fields').disabled);
    if (kind === 'loading' || kind === 'connection') {
      await p.route('**/api/v1/events?*', async route => { if (kind === 'loading') { await new Promise(r => setTimeout(r, 600)); await route.continue(); } else await route.abort('failed'); });
      await p.goto(base + '/live/index.html');
      if (kind === 'loading') { await p.locator('#event-content[aria-busy="true"]').waitFor(); await p.locator('#event-content[aria-busy="false"]').waitFor(); }
      else await p.getByRole('heading', { name: 'Let’s try that again.', exact: true }).waitFor();
    } else {
      await fillParticipant(p); let intercepted = 0;
      await p.route('**/api/v1/events/' + first.public_id + '/registrations', async route => {
        intercepted++; const detail = kind === 'full' ? 'Registration full. Online quota limits for this event are exhausted.' : 'Registration rejected. This event is not currently accepting entries.';
        if (kind === 'uncertain') await route.abort('failed'); else await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail }) });
      });
      await p.locator('#registration-submit').click();
      await p.locator('#registration-progress').filter({ hasText: kind === 'full' ? 'not accepting more' : kind === 'inactive' ? 'not currently accepting' : 'result is unknown' }).waitFor();
      assert.equal(await p.locator('#registration-result').isHidden(), true);
      if (kind === 'uncertain') assert.equal(await p.locator('#registration-fields').evaluate(n => n.disabled), true);
      assert.equal(intercepted, 1);
    }
    report.controlled.push({ kind, status: 'PASS', layer: 'SYNTHETIC_INTERCEPTION', native_backend_claim: false, intercepted_writes_forwarded: false }); await save(); await c.close();
  }
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  // Assertion summaries are bounded; do not dump Playwright call logs/credentials.
  report.failure = { name: error.name, message: 'Limited W7 browser check failed; last completed case: ' + (report.checks.at(-1)?.id || 'none'), stack_location: String(error.stack).split('\n').find(line => line.includes('w7_browser.mjs:'))?.trim() };
  console.error(JSON.stringify(report.failure)); process.exitCode = 1;
} finally {
  report.ended_at = new Date().toISOString(); await save();
  for (const c of contexts) try { await c.close(); } catch { /* Already closed. */ }
  await browser.close(); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, controlled: report.controlled.length, evidence }));
}
