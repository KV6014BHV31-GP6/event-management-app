/** Narrow native UI acceptance. No intercepted responses, mocks, direct API creation or SQL writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.env.PR4_BROWSER_TOOLS, 'package.json'));
const { chromium } = require('playwright');
const output = process.env.PR4_EVIDENCE;
const base = 'http://127.0.0.1:5173';
const runId = process.env.PR4_RUN_ID;
const title = `NU Frontend Create Demo ${runId}`;
const report = { status: 'NOT_RUN', scope: 'Real Chrome, HTTP and native PostgreSQL 17; GitHub-hosted Windows, NOT the user E: machine', run_id: runId, checks: {}, network: [], requests: [], browser_errors: [] };
const check = (id, detail) => { report.checks[id] = { status: 'PASS', detail }; };
let browser;
let page;
let posts = 0;
let verifiedToken = null;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
  report.chrome = browser.version();
  const cdp = await browser.newBrowserCDPSession();
  const { arguments: args } = await cdp.send('Browser.getBrowserCommandLine');
  assert.ok(!args.includes('--no-sandbox'), 'Browser sandbox must remain enabled');
  report.sandbox_enabled = true;
  const context = await browser.newContext({ timezoneId: 'Asia/Hong_Kong', viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', error => report.browser_errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) return;
    const entry = { method: request.method(), path: url.pathname + url.search };
    if (request.method() === 'POST' && url.pathname === '/api/v1/events') {
      posts++;
      // Compare in memory; never serialize a password, token, cookie or request headers.
      entry.bearer_present = request.headers().authorization?.startsWith('Bearer ') === true;
      entry.bearer_matches_existing_session = verifiedToken !== null && request.headers().authorization === `Bearer ${verifiedToken}`;
      entry.fields = Object.keys(request.postDataJSON()).sort();
    }
    report.requests.push(entry);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) report.network.push({ method: response.request().method(), path: url.pathname + url.search, status: response.status() });
  });
  const responseFor = (path, method = 'GET') => page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
  const fieldsEnabled = () => page.waitForFunction(() => !document.querySelector('#event-fields').disabled);

  await page.goto(`${base}/live/login.html`);
  assert.equal(await page.getByRole('link', { name: 'Create event', exact: true }).count(), 0);
  await page.goto(`${base}/live/create-event.html`);
  assert.equal(await page.locator('#event-fields').evaluate(node => node.disabled), true, 'fieldset.disabled must be true');
  assert.equal(await page.getByRole('button', { name: 'Create event', exact: true }).isDisabled(), true, 'submit control must be disabled');
  assert.equal(posts, 0);
  check('A1', 'Anonymous Create Event page has a disabled fieldset and no POST.');

  await page.getByRole('link', { name: 'log in', exact: true }).last().click();
  await page.locator('#username').fill('demo_organizer');
  await page.locator('#password').fill(process.env.SEED_PASSWORD);
  const login = responseFor('/api/v1/auth/login', 'POST');
  const profile = responseFor('/api/v1/users/me');
  await page.locator('#login-submit').click();
  assert.equal((await login).status(), 200);
  const verifiedUser = await (await profile).json();
  assert.equal(verifiedUser.username, 'demo_organizer');
  await page.waitForURL('**/live/index.html');
  await page.getByRole('link', { name: 'Create event', exact: true }).waitFor();
  verifiedToken = await page.evaluate(() => sessionStorage.getItem('rose.live.access-token'));
  assert.ok(verifiedToken);
  check('A2', 'Real Login 200 and profile verification produce Create event navigation.');
  await page.getByRole('link', { name: 'Create event', exact: true }).click();
  await fieldsEnabled();
  assert.deepEqual(await page.locator('#event-fields [name]').evaluateAll(nodes => nodes.map(n => n.name).sort()), ['end_time', 'location', 'offline_quota', 'online_quota', 'overview', 'start_time', 'title']);
  check('A3', 'The real form contains exactly the seven agreed named fields.');

  const values = { title, overview: 'Synthetic native PR4 acceptance', location: 'Synthetic hall', start_time: '2027-01-12T09:00', end_time: '2027-01-12T10:00', online_quota: '2', offline_quota: '3' };
  for (const [name, value] of Object.entries(values)) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="title"]').fill('');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  assert.equal(posts, 0);
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="end_time"]').fill(values.start_time);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#create-progress').textContent.includes('later than'));
  assert.equal(posts, 0);
  await page.locator('[name="end_time"]').fill(values.end_time);
  for (const field of ['online_quota', 'offline_quota']) {
    await page.locator(`[name="${field}"]`).fill('2147483648');
    assert.equal(await page.locator(`[name="${field}"]`).evaluate(n => n.validity.rangeOverflow), true);
    await page.getByRole('button', { name: 'Create event', exact: true }).click();
    assert.equal(posts, 0);
    await page.locator(`[name="${field}"]`).fill(values[field]);
  }
  report.timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  report.expected_start = await page.locator('[name="start_time"]').evaluate(n => new Date(n.value).toISOString());
  report.expected_end = await page.locator('[name="end_time"]').evaluate(n => new Date(n.value).toISOString());
  assert.ok((await page.locator('#create-timezone').textContent()).includes(report.timezone));
  check('A4', 'Required/end-after-start/quota-overflow prevent POST; real browser timezone and ISO conversion checked.');

  const createdResponse = responseFor('/api/v1/events', 'POST');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.keyboard.press('Enter');
  const response = await createdResponse;
  assert.equal(response.status(), 201);
  const created = await response.json();
  assert.equal(created.title, title);
  assert.equal(created.organizer_id, verifiedUser.id);
  assert.equal(created.public_id.length, 21);
  assert.equal(new Date(created.start_time).toISOString(), report.expected_start);
  assert.equal(new Date(created.end_time).toISOString(), report.expected_end);
  report.created_event = created;
  report.event_post_count = posts;
  assert.equal(posts, 1);
  const createRequest = report.requests.find(r => r.method === 'POST' && r.path === '/api/v1/events');
  assert.equal(createRequest.bearer_present, true);
  assert.equal(createRequest.bearer_matches_existing_session, true);
  assert.deepEqual(createRequest.fields, Object.keys(values).sort());
  check('A5', 'Form POST uses the existing Bearer session and only seven allowed JSON fields.');
  check('A6', 'Exactly one real form POST returned HTTP 201.');
  await page.locator('#create-result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#created-title').textContent(), title);
  assert.equal(await page.locator('#created-id').textContent(), created.public_id);
  assert.equal(await page.locator('#create-progress').textContent(), 'Event created successfully');
  await page.screenshot({ path: join(output, '01-created.png'), fullPage: true });
  check('A7', 'Visible success message, server title and server public_id match the 201 response.');

  async function readback(action, stage) {
    const pending = responseFor('/api/v1/events');
    await action();
    const response = await pending;
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.page, 1);
    const event = body.data.find(e => e.public_id === created.public_id);
    assert.ok(event, `${stage}: same public_id must be read back`);
    assert.equal(event.title, title);
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    (report.readbacks ??= []).push({ stage, status: 200, page: body.page, public_id: event.public_id, title: event.title });
  }
  await readback(() => page.getByRole('link', { name: 'Back to events', exact: true }).click(), 'back-to-events');
  check('A8', 'Back to events causes a new first-page GET and renders the created record.');
  await readback(() => page.locator('#refresh-events').click(), 'refresh-events');
  await readback(() => page.reload(), 'browser-reload');
  assert.equal(posts, 1);
  await page.screenshot({ path: join(output, '02-reloaded.png'), fullPage: true });
  check('A9', 'The same public_id is visible after new GETs for Back, Refresh and Reload; one POST only.');

  await page.getByRole('link', { name: 'Create event', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Create event', exact: true }).click();
  await fieldsEnabled();
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Create event', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Create event', exact: true }).click();
  await fieldsEnabled();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  assert.equal(await page.locator('#event-fields').evaluate(node => node.disabled), true, 'fieldset.disabled must be true');
  assert.equal(await page.getByRole('button', { name: 'Create event', exact: true }).isDisabled(), true, 'submit control must be disabled');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('rose.live.access-token')), null);
  // Synthetic invalid stored session, real backend 401. This is not a mocked response or an expiry-timer claim.
  await page.evaluate(() => sessionStorage.setItem('rose.live.access-token', 'synthetic-invalid-session'));
  const me401 = responseFor('/api/v1/users/me');
  await page.reload();
  assert.equal((await me401).status(), 401);
  await page.waitForFunction(() => sessionStorage.getItem('rose.live.access-token') === null);
  assert.equal(await page.locator('#event-fields').evaluate(node => node.disabled), true, 'fieldset.disabled must be true');
  assert.equal(await page.getByRole('button', { name: 'Create event', exact: true }).isDisabled(), true, 'submit control must be disabled');
  assert.equal(posts, 1);
  await page.screenshot({ path: join(output, '03-session-blocked.png'), fullPage: true });
  check('A10', 'Native duplicate Enter, Cancel, logout and real invalid-session 401 checked; timeout/403/422/late-response cases are separately covered by Node unit/component tests.');
  assert.deepEqual(report.browser_errors, []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = error.message;
  report.error_stack = error.stack;
  if (page) await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  writeFileSync(join(output, 'browser-result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks, public_id: report.created_event?.public_id, event_post_count: posts, error: report.error }, null, 2));
}
