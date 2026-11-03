import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configure, getConfig, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AssistedRecovery, ProfileEditor, RecoveryWorkspace } from './AccountWorkspace.jsx';
import { ACCOUNT_VERSION, RECOVERY_MARKER_KEY, recoveryCode } from './account-api.js';
import { resources, changeLanguage } from './i18n/index.js';
import { DEMO_PROFILE } from './demo-transport.js';

const ACTOR = '01K00000000000000000000001';
const OTHER = '01K00000000000000000000002';
const CHALLENGE = '10000000-0000-4000-8000-000000000001';
const NOW = '2026-11-03T08:00:00Z';
const capability = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const chosenPassword = () => crypto.randomUUID();
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const denied = (code, status) => reply({ detail: { code, message: 'Untrusted server message' } }, status);
const authFor = (id = ACTOR, role = 'user', revision = 1) => ({ user: { id, username: 'synthetic-account', role }, revision, checking: false, hasToken: true });
const anonymous = { user: null, revision: 1, checking: false, hasToken: false };
const runtimeFor = (id = ACTOR, role = 'user') => ({
  withVerifiedAccount: vi.fn(fn => fn('synthetic-token', { id, role })), logout: vi.fn(),
});
const profile = (id = ACTOR, version = 0, displayName = 'Synthetic profile', language = 'en') => ({
  contract_version: ACCOUNT_VERSION, account: { id, username: 'synthetic-account', role: 'user' },
  profile: { display_name: displayName, preferred_language: language, version, updated_at: version ? NOW : null }, as_of_utc: NOW,
});
const receipt = (body, effects) => ({ contract_version: ACCOUNT_VERSION, operation_id: body.operation_id,
  kind: effects.profile_version ? 'account_profile_update' : effects.challenge_id ? 'account_recovery_issue' : 'account_password_reset',
  resource_id: effects.account_id || effects.challenge_id || CHALLENGE, resource_version: effects.profile_version || 1, recorded_at: NOW, outcome: 'applied', effects });
const resetEffects = { credentials_changed: true, reauthentication_required: true };
const issueEffects = { challenge_id: CHALLENGE, expires_at: NOW, provider: 'DEMO_PROVIDER', delivery_state: 'demo_recorded', external_delivery: false, identity_verified: false };
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillReset = (code, password) => {
  change('Recovery code', code); change('New password', password); change('Confirm new password', password);
};
const originalElementError = getConfig().getElementError;
beforeEach(() => {
  configure({ getElementError: message => new Error(message) });
  localStorage.clear(); sessionStorage.clear();
  const held = new Set();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (name, options, callback) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); } finally { held.delete(name); }
  } } });
});
afterEach(() => configure({ getElementError: originalElementError }));

it('saves both own profile fields with version0, reads current data and applies the saved language', async () => {
  let reads = 0, submitted;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (options.method === 'GET') return reply(++reads === 1 ? profile() : profile(ACTOR, 1, 'Edited profile', 'ms'));
    submitted = JSON.parse(options.body);
    return reply(receipt(submitted, { account_id: ACTOR, profile_version: 1 }));
  });
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  change('Display name', ' Edited profile '); change('Preferred language', 'ms');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  await screen.findByText(resources.ms.translation['Your profile was saved. Current information has been read from the server.']);
  expect(submitted).toMatchObject({ expected_version: 0, data: { display_name: 'Edited profile', preferred_language: 'ms' } });
  expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'POST', 'GET']);
  expect(screen.getByLabelText('Nama paparan')).toHaveValue('Edited profile');
});
it('retains edits on stale409 and requires explicit fresh read before another save', async () => {
  let reads = 0, body;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (options.method === 'GET') return reply(++reads === 1 ? profile() : profile(ACTOR, 2, 'Server changed'));
    body = JSON.parse(options.body); return denied('STALE_VERSION', 409);
  });
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile'); change('Display name', 'Local edit');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your profile changed.');
  expect(screen.getByLabelText('Display name')).toHaveValue('Local edit');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Read current profile' }));
  await screen.findByDisplayValue('Server changed');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
  expect(body.expected_version).toBe(0);
});
it('shows known profile validation refusal without locking correction or exposing server text', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => options.method === 'GET' ? reply(profile()) : denied('INVALID_INPUT', 422));
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Display name')).toBeEnabled();
  expect(screen.queryByText('Untrusted server message')).not.toBeInTheDocument();
});
it('distinguishes a committed profile receipt from a failed current read', async () => {
  let reads = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (options.method === 'POST') return reply(receipt(JSON.parse(options.body), { account_id: ACTOR, profile_version: 1 }));
    if (++reads > 1) throw new TypeError();
    return reply(profile());
  });
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The save receipt is confirmed, but the current profile could not be read.');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
});
it('reconciles an unknown profile receipt manually before permitting another save', async () => {
  let original;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); return denied('OPERATION_OUTCOME_UNKNOWN', 500); }
    if (path.includes('/receipts/')) return reply(receipt(original, { account_id: ACTOR, profile_version: 1 }));
    return reply(profile());
  });
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  await screen.findByText('The result is unknown. Check the original request before sending anything again.');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Check profile save result' }));
  await screen.findByText('Your profile was saved. Current information has been read from the server.');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
});
it.each([401, 403])('clears own protected profile when the current server refuses with%s', async status => {
  let reads = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ++reads === 1 ? reply(profile()) : denied(status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', status));
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  fireEvent.click(screen.getByRole('button', { name: 'Read current profile' }));
  await screen.findByRole('alert');
  expect(screen.queryByDisplayValue('Synthetic profile')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
});
it.each([['replacement', OTHER], ['same-actor reauthentication', ACTOR]])('clears the previous profile and ignores its late response on%s', async (kind, nextActor) => {
  let resolve, calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ++calls === 1 ? new Promise(done => { resolve = done; })
    : reply(profile(nextActor, 1, 'Current session profile')));
  const view = render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await waitFor(() => expect(calls).toBe(1));
  view.rerender(<ProfileEditor runtime={runtimeFor(nextActor)} auth={authFor(nextActor, 'user', 2)} />);
  await screen.findByDisplayValue('Current session profile');
  resolve(reply(profile(ACTOR, 1, 'Previous session private value')));
  await waitFor(() => expect(screen.queryByDisplayValue('Previous session private value')).not.toBeInTheDocument());
});
it('uses only named enabled Participants and reveals synthetic delivery explicitly', async () => {
  const privateCapability = capability();
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (path.endsWith('/accounts')) return reply({ accounts: [
      { id: OTHER, username: 'synthetic-participant', role: 'user', enabled: true, version: 1 },
      { id: ACTOR, username: 'synthetic-leader', role: 'leader', enabled: true, version: 1 },
      { id: 'disabled', username: 'synthetic-disabled', role: 'user', enabled: false, version: 1 },
    ], as_of_utc: NOW });
    if (path.endsWith('/demo-message')) return reply({ challenge_id: CHALLENGE, provider: 'DEMO_PROVIDER', recovery_secret: privateCapability, external_delivery: false, identity_verified: false });
    return reply(receipt(JSON.parse(options.body), issueEffects));
  });
  render(<AssistedRecovery runtime={runtimeFor(ACTOR, 'organizer')} auth={authFor(ACTOR, 'organizer')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load recovery accounts' }));
  await screen.findByRole('option', { name: 'synthetic-participant' });
  expect(screen.queryByRole('option', { name: 'synthetic-leader' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'synthetic-disabled' })).not.toBeInTheDocument();
  change('Participant account', OTHER);
  fireEvent.submit(screen.getByRole('form', { name: 'Participant recovery assistance' }));
  await screen.findByRole('button', { name: 'Reveal synthetic recovery code' });
  expect(fetch.mock.calls.some(([path]) => path.endsWith('/demo-message'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Reveal synthetic recovery code' }));
  const code = await screen.findByLabelText('Synthetic recovery code');
  expect(code.value.endsWith(privateCapability)).toBe(true);
  expect(JSON.stringify(Object.values(localStorage)).includes(privateCapability)).toBe(false);
  change('Participant account', '');
  expect(screen.queryByLabelText('Synthetic recovery code')).not.toBeInTheDocument();
});
it('locks administrator assistance on the server403 directory response', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(denied('FORBIDDEN', 403));
  render(<AssistedRecovery runtime={runtimeFor(ACTOR, 'organizer')} auth={authFor(ACTOR, 'organizer')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load recovery accounts' }));
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Participant account')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('ignores an issuer secret completion after an actor switch', async () => {
  let resolve;
  const privateCapability = capability();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (path.endsWith('/accounts')) return reply({ accounts: [{ id: OTHER, username: 'synthetic-participant', role: 'user', enabled: true, version: 1 }], as_of_utc: NOW });
    if (path.endsWith('/demo-message')) return new Promise(done => { resolve = done; });
    return reply(receipt(JSON.parse(options.body), issueEffects));
  });
  const view = render(<AssistedRecovery runtime={runtimeFor(ACTOR, 'organizer')} auth={authFor(ACTOR, 'organizer')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load recovery accounts' }));
  await screen.findByRole('option', { name: 'synthetic-participant' }); change('Participant account', OTHER);
  fireEvent.submit(screen.getByRole('form', { name: 'Participant recovery assistance' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reveal synthetic recovery code' }));
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  view.rerender(<AssistedRecovery runtime={runtimeFor(OTHER, 'organizer')} auth={authFor(OTHER, 'organizer', 2)} />);
  resolve(reply({ challenge_id: CHALLENGE, provider: 'DEMO_PROVIDER', recovery_secret: privateCapability, external_delivery: false, identity_verified: false }));
  await waitFor(() => expect(screen.queryByLabelText('Synthetic recovery code')).not.toBeInTheDocument());
  expect(document.body.textContent.includes(privateCapability)).toBe(false);
});
it('submits one reset, clears secrets and requires an explicit new Login action', async () => {
  let resolve;
  const privateCapability = capability(), selectedPassword = chosenPassword(), code = recoveryCode(CHALLENGE, privateCapability);
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => new Promise(done => {
    resolve = () => done(reply(receipt(JSON.parse(options.body), resetEffects)));
  }));
  const navigate = vi.fn();
  render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={navigate} />);
  fillReset(code, selectedPassword);
  const form = screen.getByRole('form', { name: 'Recover account access' });
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  resolve();
  const login = await screen.findByRole('button', { name: 'Log in with your new password' });
  expect(screen.queryByLabelText('Recovery code')).not.toBeInTheDocument();
  expect(document.body.textContent.includes(privateCapability) || document.body.textContent.includes(selectedPassword)).toBe(false);
  expect(localStorage.getItem(RECOVERY_MARKER_KEY)).toBeNull();
  expect(navigate).not.toHaveBeenCalled(); fireEvent.click(login);
  expect(navigate).toHaveBeenCalledWith('login');
});
it('after unknown ACK and remount, requires code re-entry before a manual receipt GET', async () => {
  let original;
  const privateCapability = capability(), code = recoveryCode(CHALLENGE, privateCapability), selectedPassword = chosenPassword();
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (options.method === 'POST') { original = JSON.parse(options.body); return denied('OPERATION_OUTCOME_UNKNOWN', 500); }
    return reply(receipt(original, resetEffects));
  });
  const props = { runtime: runtimeFor(), auth: anonymous, navigate: vi.fn() };
  const view = render(<RecoveryWorkspace {...props} />);
  fillReset(code, selectedPassword); fireEvent.submit(screen.getByRole('form', { name: 'Recover account access' }));
  await screen.findByText('The result is unknown. Check the original request before sending anything again.');
  expect(screen.getByLabelText('Original new password')).toHaveValue('');
  const originalId = JSON.parse(localStorage.getItem(RECOVERY_MARKER_KEY)).operation_id;
  view.unmount(); render(<RecoveryWorkspace {...props} />);
  expect(screen.getByLabelText('Recovery code')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Check reset result' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  change('Recovery code', code); fireEvent.click(screen.getByRole('button', { name: 'Check reset result' }));
  await screen.findByRole('button', { name: 'Log in with your new password' });
  expect(fetch.mock.calls[1][0].endsWith(`/receipts/${originalId}`)).toBe(true);
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  const serialized = JSON.stringify(Object.values(localStorage)) + JSON.stringify(Object.values(sessionStorage));
  expect(serialized.includes(privateCapability) || serialized.includes(selectedPassword)).toBe(false);
});
it('requires re-entering the original password for deliberate same-ID retry after unused404', async () => {
  let original, posts = 0;
  const code = recoveryCode(CHALLENGE, capability()), selectedPassword = chosenPassword();
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (options.method === 'GET') return denied('NOT_FOUND', 404);
    const body = JSON.parse(options.body);
    if (++posts === 1) { original = body; throw new TypeError(); }
    expect(body.operation_id).toBe(original.operation_id);
    expect(body.data.new_password === selectedPassword).toBe(true);
    return reply(receipt(body, resetEffects));
  });
  render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={vi.fn()} />);
  fillReset(code, selectedPassword); fireEvent.submit(screen.getByRole('form', { name: 'Recover account access' }));
  await screen.findByLabelText('Original new password');
  expect(screen.getByRole('button', { name: 'Retry original reset' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Check reset result' }));
  await screen.findByText(/No committed reset receipt was found/);
  change('Original new password', selectedPassword); change('Confirm new password', selectedPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Retry original reset' }));
  await screen.findByRole('button', { name: 'Log in with your new password' });
  expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET', 'GET', 'POST']);
});
it('cancel clears volatile fields while retaining an unknown original marker', async () => {
  const code = recoveryCode(CHALLENGE, capability()), selectedPassword = chosenPassword(), navigate = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError());
  render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={navigate} />);
  fillReset(code, selectedPassword); fireEvent.submit(screen.getByRole('form', { name: 'Recover account access' }));
  await screen.findByLabelText('Original new password');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel and return to Login' }));
  expect(screen.getByLabelText('Recovery code')).toHaveValue('');
  expect(screen.getByLabelText('Original new password')).toHaveValue('');
  expect(localStorage.getItem(RECOVERY_MARKER_KEY)).not.toBeNull();
  expect(navigate).toHaveBeenCalledWith('login');
});
it('clears recovery inputs on actor replacement and blocks signed-in reset submission', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const view = render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={vi.fn()} />);
  fillReset(recoveryCode(CHALLENGE, capability()), chosenPassword());
  view.rerender(<RecoveryWorkspace runtime={runtimeFor(OTHER)} auth={authFor(OTHER, 'user', 2)} navigate={vi.fn()} />);
  expect(screen.getByLabelText('Recovery code')).toHaveValue('');
  expect(screen.getByLabelText('New password')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Set new password' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('form', { name: 'Recover account access' }));
  expect(fetch).not.toHaveBeenCalled();
});
it('renders the full recovery form and bounded errors in Malay', async () => {
  await changeLanguage('ms');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(denied('RECOVERY_INVALID', 403));
  render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Pulihkan akses akaun' })).toBeInTheDocument();
  change('Kod pemulihan', recoveryCode(CHALLENGE, capability()));
  const password = chosenPassword(); change('Kata laluan baharu', password); change('Sahkan kata laluan baharu', password);
  fireEvent.submit(screen.getByRole('form', { name: 'Pulihkan akses akaun' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(resources.ms.translation['The recovery code is invalid, expired, replaced or unavailable.']);
});
it('never writes recovery capability or password to any browser storage, URL or console even on unknown result', async () => {
  const privateCapability = capability(), password = chosenPassword(), code = recoveryCode(CHALLENGE, privateCapability);
  const writes = [];
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    writes.push({key:String(key),value:String(value),area:this===localStorage?'localStorage':this===sessionStorage?'sessionStorage':'other'});
    return write.call(this, key, value);
  });
  const idb = vi.spyOn(indexedDB, 'open');
  const push = vi.spyOn(window.history, 'pushState'), replace = vi.spyOn(window.history, 'replaceState');
  const consoleCalls = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')].map(spy=>spy.mockImplementation(()=>{}));
  let originalOperation;
  const fetch=vi.spyOn(globalThis, 'fetch').mockImplementation(async(_path,options)=>{
    originalOperation=JSON.parse(options.body).operation_id;
    return denied('OPERATION_OUTCOME_UNKNOWN', 500);
  });
  render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={vi.fn()} />);
  fillReset(code, password); fireEvent.submit(screen.getByRole('form', { name: 'Recover account access' }));
  await screen.findByLabelText('Original new password');
  const diagnostics = JSON.stringify(writes) + JSON.stringify(push.mock.calls) + JSON.stringify(replace.mock.calls) + JSON.stringify(consoleCalls.flatMap(spy => spy.mock.calls));
  expect(diagnostics.includes(privateCapability) || diagnostics.includes(password)).toBe(false);
  const markers=writes.filter(row=>row.area==='localStorage'&&row.key===RECOVERY_MARKER_KEY);
  const modes=writes.filter(row=>row.area==='sessionStorage'&&row.key==='rose.demo.synthetic.network'&&row.value==='connected');
  expect(markers.length===1&&modes.length===(DEMO_PROFILE?1:0)&&writes.length===1+(DEMO_PROFILE?1:0)).toBe(true);
  // Every observed write must be one of these exact public/reference records; never hide arbitrary writes.
  expect(writes.every(row=>markers.includes(row)||modes.includes(row))).toBe(true);
  let marker;try{marker=JSON.parse(markers[0]?.value);}catch{}
  expect(Boolean(marker)&&Object.keys(marker).sort().join(',')==='challenge_id,endpoint,operation_id,unknown'&&
    marker.challenge_id===CHALLENGE&&marker.operation_id===originalOperation&&
    typeof originalOperation==='string'&&/^[0-9a-f-]{36}$/.test(originalOperation)&&
    marker.endpoint===`/account-recovery/challenges/${CHALLENGE}/reset`&&marker.unknown===true&&
    markers[0].value===localStorage.getItem(RECOVERY_MARKER_KEY)).toBe(true);
  expect(fetch.mock.calls.length).toBe(1);
  expect(idb.mock.calls.length).toBe(0);
  expect(push.mock.calls.length).toBe(0); expect(replace.mock.calls.length).toBe(0);
});
it('recovers a precommit404 profile across remount with the exact original request instead of current form values', async () => {
  let posts = 0, originalWire, applied = false;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (path.includes('/receipts/')) return denied('NOT_FOUND', 404);
    if (options.method === 'GET') return reply(profile(ACTOR, applied ? 1 : 0, applied ? 'Synthetic intended profile' : 'Current profile'));
    if (++posts === 1) { originalWire = options.body; throw new TypeError(); }
    expect(options.body === originalWire).toBe(true); applied = true;
    return reply(receipt(JSON.parse(options.body), { account_id: ACTOR, profile_version: 1 }));
  });
  const props = { runtime: runtimeFor(), auth: authFor() };
  const view = render(<ProfileEditor {...props} />);
  await screen.findByDisplayValue('Current profile'); change('Display name', 'Synthetic intended profile');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  await screen.findByRole('heading', { name: 'Original profile request' });
  view.unmount(); render(<ProfileEditor {...props} />);
  await screen.findByRole('heading', { name: 'Original profile request' });
  expect(screen.getByRole('button', { name: 'Retry original profile save' }).disabled).toBe(true);
  change('Display name', 'Changed current form');
  fireEvent.click(screen.getByRole('button', { name: 'Check profile save result' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry original profile save' }).disabled).toBe(false));
  expect(posts).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry original profile save' }));
  await screen.findByText('Your profile was saved. Current information has been read from the server.');
  expect(posts).toBe(2);
  expect(fetch.mock.calls.filter(([path]) => path.includes('/receipts/'))).toHaveLength(2);
});
it('retries the durable original issuance target after remount even when the current dropdown changes', async () => {
  let posts = 0, originalWire;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    if (path.endsWith('/accounts')) return reply({ accounts: [
      { id: OTHER, username: 'Original synthetic Participant', role: 'user', enabled: true, version: 1 },
      { id: ACTOR, username: 'Other current selection', role: 'user', enabled: true, version: 1 },
    ], as_of_utc: NOW });
    if (options.method === 'GET') return denied('NOT_FOUND', 404);
    if (++posts === 1) { originalWire = options.body; throw new TypeError(); }
    expect(options.body === originalWire).toBe(true);
    return reply(receipt(JSON.parse(options.body), issueEffects));
  });
  const props = { runtime: runtimeFor(ACTOR, 'organizer'), auth: authFor(ACTOR, 'organizer') };
  const view = render(<AssistedRecovery {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load recovery accounts' }));
  await screen.findByRole('option', { name: 'Original synthetic Participant' }); change('Participant account', OTHER);
  fireEvent.submit(screen.getByRole('form', { name: 'Participant recovery assistance' }));
  await screen.findByRole('heading', { name: 'Original assistance request' });
  view.unmount(); render(<AssistedRecovery {...props} />);
  await screen.findByRole('heading', { name: 'Original assistance request' });
  fireEvent.click(screen.getByRole('button', { name: 'Load recovery accounts' }));
  await screen.findByRole('option', { name: 'Other current selection' });
  change('Participant account', ACTOR);
  fireEvent.click(screen.getByRole('button', { name: 'Check assistance request' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry original assistance request' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Retry original assistance request' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reveal synthetic recovery code' }).disabled).toBe(false));
  expect(posts).toBe(2);
  expect(document.querySelector('.account-delivery').textContent.includes('Original synthetic Participant')).toBe(true);
  expect(document.querySelector('.account-delivery').textContent.includes('Other current selection')).toBe(false);
});
it('legacy issuance reconciliation never infers its unknown target from the current dropdown', async () => {
  const operationId = crypto.randomUUID();
  localStorage.setItem(`rose.demo.account-issue.v1.${ACTOR}`, JSON.stringify({ challenge_id: null, operation_id: operationId, endpoint: '/account-recovery/challenges', unknown: true }));
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => path.endsWith('/accounts')
    ? reply({ accounts: [{ id: OTHER, username: 'Current unrelated Participant', role: 'user', enabled: true, version: 1 }], as_of_utc: NOW })
    : reply(receipt({ operation_id: operationId }, issueEffects)));
  render(<AssistedRecovery runtime={runtimeFor(ACTOR, 'organizer')} auth={authFor(ACTOR, 'organizer')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load recovery accounts' }));
  await screen.findByRole('option', { name: 'Current unrelated Participant' }); change('Participant account', OTHER);
  fireEvent.click(screen.getByRole('button', { name: 'Check assistance request' }));
  await screen.findByRole('button', { name: 'Reveal synthetic recovery code' });
  expect(screen.getByRole('button', { name: 'Reveal synthetic recovery code' }).disabled).toBe(true);
  expect(document.querySelector('.account-delivery').textContent.includes('Unknown original Participant')).toBe(true);
  expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
it('legacy profile404 keeps its reference and explains that the original cannot be retried', async () => {
  const marker = JSON.stringify({ challenge_id: null, operation_id: crypto.randomUUID(), endpoint: '/me/profile', unknown: true });
  localStorage.setItem(`rose.demo.account-profile.v1.${ACTOR}`, marker);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => path.includes('/receipts/') ? denied('NOT_FOUND', 404) : reply(profile()));
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  fireEvent.click(screen.getByRole('button', { name: 'Check profile save result' }));
  await waitFor(() => expect(document.body.textContent.includes('The original request data is unavailable.')).toBe(true));
  expect(Boolean(screen.queryByRole('button', { name: 'Retry original profile save' }))).toBe(false);
  expect(localStorage.getItem(`rose.demo.account-profile.v1.${ACTOR}`) === marker).toBe(true);
});
it('wrong-family reset receipt never presents confirmed success or removes its reference', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => reply({
    ...receipt(JSON.parse(options.body), resetEffects), kind: 'account_recovery_issue',
  }));
  render(<RecoveryWorkspace runtime={runtimeFor()} auth={anonymous} navigate={vi.fn()} />);
  const code = recoveryCode(CHALLENGE, capability());
  fillReset(code, chosenPassword()); fireEvent.submit(screen.getByRole('form', { name: 'Recover account access' }));
  await screen.findByLabelText('Original new password');
  expect(Boolean(screen.queryByRole('button', { name: 'Log in with your new password' }))).toBe(false);
  expect(screen.getByLabelText('Recovery code').value === code).toBe(true);
  expect(Boolean(localStorage.getItem(RECOVERY_MARKER_KEY))).toBe(true);
});
it('unsupported origin coordination shows an explicit account-write refusal without a POST', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(profile()));
  render(<ProfileEditor runtime={runtimeFor()} auth={authFor()} />);
  await screen.findByDisplayValue('Synthetic profile');
  fireEvent.submit(screen.getByRole('form', { name: 'Personal profile' }));
  await waitFor(() => expect(document.body.textContent.includes('This browser cannot safely coordinate this account request.')).toBe(true));
  expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
