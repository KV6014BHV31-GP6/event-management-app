#!/usr/bin/env node
/**
 * Browser acceptance against an already running frontend + backend.
 * Main flow never intercepts requests. Controlled failure cases use a separate
 * browser context and are reported as synthetic evidence.
 *
 * Required: SEED_USERNAME, SEED_PASSWORD; at least seven seeded public events.
 * Optional: APP_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, EVIDENCE_DIR,
 * EVIDENCE_LABEL (set FIXTURE_ONLY when using a synthetic server),
 * RUN_CONTROLLED_CASES=0 to omit separately labelled failure injection.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = process.env.APP_URL || 'http://127.0.0.1:5173';
const eventsUrl = new URL('/live/index.html', origin).href;
const loginUrl = new URL('/live/login.html', origin).href;
const evidenceDir = resolve(process.env.EVIDENCE_DIR || '/tmp/rose-live-browser-evidence');
const report = {
  evidenceScope: process.env.EVIDENCE_LABEL || 'REAL_BACKEND',
  mainFlowInterception: false,
  checks: [], screenshots: [], expectedResourceErrors: [], unexpectedConsoleErrors: [],
};
const check = name => report.checks.push({ name, status: 'PASS' });
const isApi = (response, path) => new URL(response.url()).pathname === `/api/v1${path}`;

async function noOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport && dimensions.body <= dimensions.viewport,
    `${name}: horizontal overflow (${JSON.stringify(dimensions)})`);
  check(`${name}: no horizontal overflow`);
}

async function screenshot(page, name) {
  // Screenshots are taken only before credentials are entered or after logout.
  const populatedPasswords = await page.locator('input[type="password"]').evaluateAll(
    inputs => inputs.some(input => input.value.length > 0));
  assert.equal(populatedPasswords, false, 'Refusing screenshot with a populated password field');
  const path = resolve(evidenceDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  report.screenshots.push(path);
}

function observePage(page, { controlled = false } = {}) {
  page.on('pageerror', () => report.unexpectedConsoleErrors.push({ kind: 'uncaught-page-error', controlled }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const location = message.location().url;
    const pathname = location ? new URL(location, origin).pathname : '';
    const expectedResource = /Failed to load resource/.test(text)
      && ((pathname === '/api/v1/auth/login' && /401/.test(text))
        || (controlled && pathname === '/api/v1/events' && /502|ERR_FAILED/.test(text)));
    if (expectedResource) {
      report.expectedResourceErrors.push({ path: pathname, controlled });
    } else {
      // Do not copy arbitrary browser console values (which could include secrets).
      report.unexpectedConsoleErrors.push({ kind: 'console-error', path: pathname, controlled });
    }
  });
}

async function eventResponse(page, action, expectedPage) {
  const responsePromise = page.waitForResponse(response => isApi(response, '/events')
    && new URL(response.url()).searchParams.get('page') === String(expectedPage));
  await action();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'Public event request must succeed');
  const payload = await response.json();
  await page.locator('#event-content[aria-busy="false"]').waitFor();
  assert.deepEqual(await page.locator('.event-card h3').allTextContents(),
    payload.data.map(event => event.title || 'Untitled event'), 'Rendered cards must match the API response');
  return payload;
}

async function mainFlow(browser) {
  const username = process.env.SEED_USERNAME;
  const password = process.env.SEED_PASSWORD;
  assert.ok(username && password, 'Set SEED_USERNAME and SEED_PASSWORD to synthetic seed credentials');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Asia/Hong_Kong' });
  try {
    const page = await context.newPage();
    observePage(page);
    let profileRequests = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/v1/users/me') profileRequests += 1;
    });
    const initial = await eventResponse(page, () => page.goto(eventsUrl), 1);
    assert.ok(initial.data.length > 0, 'Seed public events before running browser acceptance');
    assert.equal(profileRequests, 0, 'Public browsing must not require a profile request');
    check('Public events render from server without login');
    const pageSizes = await page.locator('#page-size option').evaluateAll(options => options.map(o => Number(o.value)));
    const smallest = Math.min(...pageSizes);
    const first = await eventResponse(page, () => page.locator('#page-size').selectOption(String(smallest)), 1);
    assert.equal(first.page_size, smallest);
    assert.ok(first.total_count > smallest,
      `Pagination needs more than ${smallest} seeded public events; found ${first.total_count}`);
    await noOverflow(page, 'Events desktop 1440');
    await screenshot(page, 'events-desktop-1440');
    const second = await eventResponse(page, () => page.locator('#next-page').click(), 2);
    assert.equal(second.page, 2);
    assert.equal(await page.locator('#page-number').inputValue(), '2');
    assert.notDeepEqual(second.data.map(e => e.public_id), first.data.map(e => e.public_id));
    check('Smallest page-size selection and Next request/render page 2');
    await eventResponse(page, () => page.locator('#first-page').click(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page, 'Events mobile 390');
    await screenshot(page, 'events-mobile-390');

    await page.goto(loginUrl);
    await page.locator('#login-form').waitFor();
    await noOverflow(page, 'Login mobile 390');
    await screenshot(page, 'login-mobile-390');
    await page.setViewportSize({ width: 1440, height: 1080 });
    await noOverflow(page, 'Login desktop 1440');
    await screenshot(page, 'login-desktop-1440');
    await page.locator('#username').fill(username);
    const wrongPassword = password !== 'wrong-synthetic-password' ? 'wrong-synthetic-password' : 'another-wrong-password';
    await page.locator('#password').fill(wrongPassword);
    const rejected = page.waitForResponse(response => isApi(response, '/auth/login'));
    await page.locator('#login-submit').click();
    assert.equal((await rejected).status(), 401, 'Wrong password should be rejected by the backend');
    await page.locator('#login-error:not([hidden])').waitFor();
    assert.match(await page.locator('#login-error').innerText(), /Incorrect username or password/);
    assert.equal(await page.locator('#password').inputValue(), '');
    assert.equal(await page.evaluate(() => Boolean(sessionStorage.getItem('rose.live.access-token'))), false);
    check('Wrong password shows a safe error and stores no session');

    await page.locator('#password').fill(password);
    const loginResponse = page.waitForResponse(response => isApi(response, '/auth/login'));
    const meResponse = page.waitForResponse(response => isApi(response, '/users/me'));
    const redirectedProfile = page.waitForResponse(response => isApi(response, '/users/me') && page.url() === eventsUrl);
    await page.locator('#login-submit').click();
    assert.equal((await loginResponse).status(), 200);
    const me = await meResponse;
    assert.equal(me.status(), 200, 'Login identity must be verified by /users/me');
    await page.waitForURL(eventsUrl);
    // The login page navigates immediately after its first profile check. Read
    // the redirected event page's fresh /me response before any further navigation.
    const profile = await (await redirectedProfile).json();
    assert.equal(profile.username, username);
    await page.locator('.account-name').waitFor();
    assert.equal(await page.locator('.account-name').innerText(), profile.username);
    check('Successful login verifies server profile and displays identity');
    const restoredResponse = page.waitForResponse(response => isApi(response, '/users/me'));
    await page.reload();
    const restored = await restoredResponse;
    assert.equal(restored.status(), 200);
    const restoredProfile = await restored.json();
    assert.equal(restoredProfile.id, profile.id);
    await page.locator('.account-name').waitFor();
    assert.equal(await page.locator('.account-name').innerText(), profile.username);
    check('Refresh re-verifies the same identity through /users/me');
    // Preserve an authenticated login page in browser history, then ensure Back
    // cannot restore stale signed-in UI after logout. This does not claim that
    // Chromium elected to use its back/forward cache for this navigation.
    await page.goto(loginUrl);
    await page.locator('#signed-in:not([hidden])').waitFor();
    await page.locator('#signed-in').getByRole('link', { name: /Continue to events/ }).click();
    await page.waitForURL(eventsUrl);
    await page.locator('.account-name').waitFor();
    await page.locator('#account').getByRole('button', { name: 'Log out', exact: true }).click();
    await page.locator('#account').getByRole('link', { name: /Log in/ }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(sessionStorage.getItem('rose.live.access-token'))), false);
    const previousProfileRequests = profileRequests;
    await eventResponse(page, () => page.reload(), 1);
    assert.equal(profileRequests, previousProfileRequests, 'Logout must remove identity across refresh');
    assert.equal(await page.locator('.account-name').count(), 0);
    check('Logout clears the session and survives refresh');
    await page.goBack();
    await page.waitForURL(loginUrl);
    await page.locator('#login-fields:not([hidden])').waitFor();
    assert.equal(await page.locator('.account-name').count(), 0);
    assert.equal(await page.locator('#signed-in').isVisible(), false);
    check('Browser Back after logout does not restore signed-in UI');
  } finally {
    await context.close();
  }
}

async function controlledCases(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  observePage(page, { controlled: true });
  let scenario = 'empty';
  const xss = '<img src=x onerror="window.__roseXss=1">';
  await context.route('**/api/v1/events?*', async route => {
    if (scenario === 'network') return route.abort('failed');
    if (scenario === 'backend-502') return route.fulfill({ status: 502, contentType: 'application/json', body: '{"detail":"synthetic unavailable"}' });
    if (scenario === 'invalid-contract') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"unexpected":true}' });
    const url = new URL(route.request().url());
    const data = scenario === 'xss' ? [{
      public_id: 'synthetic-xss-check', title: xss, overview: '<script>window.__roseXss=1</script>',
      location: 'Synthetic test room', status: 'ACTIVE',
      start_time: '2027-01-01T10:00:00Z', end_time: '2027-01-01T11:00:00Z',
    }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      data, total_count: data.length, total_pages: data.length ? 1 : 0,
      page: Number(url.searchParams.get('page')), page_size: Number(url.searchParams.get('pageSize')),
    }) });
  });
  try {
    for (scenario of ['empty', 'network', 'backend-502', 'invalid-contract', 'xss']) {
      await page.goto(eventsUrl);
      await page.locator('#event-content[aria-busy="false"]').waitFor();
      if (scenario === 'empty') {
        assert.equal(await page.locator('.event-card').count(), 0);
        assert.match(await page.locator('#results-summary').innerText(), /No events/);
      } else if (scenario === 'xss') {
        assert.equal(await page.locator('.event-card h3').innerText(), xss);
        assert.equal(await page.locator('#event-content img, #event-content script').count(), 0);
        assert.equal(await page.evaluate(() => typeof window.__roseXss), 'undefined');
      } else {
        assert.equal(await page.locator('.event-card').count(), 0);
        assert.equal(await page.locator('#event-content').getByRole('button', { name: 'Try again' }).count(), 1);
        const message = await page.locator('#event-content').innerText();
        assert.match(message, scenario === 'network' ? /couldn’t reach/ : scenario === 'backend-502' ? /temporarily unavailable/ : /unexpected response/);
      }
      await noOverflow(page, `Controlled ${scenario} mobile 390`);
      check(`SYNTHETIC_INTERCEPTION: ${scenario}`);
    }
  } finally {
    await context.close();
  }
}

export async function run() {
  await mkdir(evidenceDir, { recursive: true });
  const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    args: ['--disable-dev-shm-usage'],
  });
  try {
    report.browserVersion = browser.version();
    await mainFlow(browser);
    if (process.env.RUN_CONTROLLED_CASES !== '0') await controlledCases(browser);
    assert.deepEqual(report.unexpectedConsoleErrors, [], 'Unexpected browser console/page errors');
    check('No unexpected browser console or page errors (expected HTTP failures recorded separately)');
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.failure = error.message;
    throw error;
  } finally {
    await browser.close();
    await writeFile(resolve(evidenceDir, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, evidenceScope: report.evidenceScope,
      checks: report.checks.length, report: resolve(evidenceDir, 'browser-report.json') }));
  }
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
