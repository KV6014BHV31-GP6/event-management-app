import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  act,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { ApiError, createRuntime } from "./service.js";
import { createPhase2Api } from "./phase2-api.js";
import { changeLanguage, tr } from "./i18n/index.js";

const ID = "01K00000000000000000000001";
const event = {
  id: 1,
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  organizer_id: ID,
  title: "Synthetic community gathering",
  overview: "A synthetic event for UI testing.",
  location: "Synthetic community hall",
  start_time: "2027-03-15T10:00:00Z",
  end_time: "2027-03-15T12:00:00Z",
  online_quota: 1,
  offline_quota: 0,
  status: "active",
  image_path: null,
  created_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
};
const record = {
  id: ID,
  event_id: 1,
  participant_id: ID,
  created_by_user_id: ID,
  channel: "online",
  status: "pending",
  created_at: event.created_at,
  updated_at: event.updated_at,
};
async function setup({ view = "home", params = "", role, methods = {} } = {}) {
  window.history.replaceState({}, "", `/?view=${view}${params}`);
  const profile = { id: ID, username: "synthetic-user", role: role || "user" };
  const api = {
    getEvents: vi
      .fn()
      .mockImplementation(async ({ page = 1, pageSize = 6 }) => ({
        data: [event],
        page,
        page_size: pageSize,
        total_count: 1,
        total_pages: 1,
      })),
    getEvent: vi.fn().mockResolvedValue(event),
    login: vi.fn().mockResolvedValue("synthetic-token"),
    getMe: vi.fn().mockResolvedValue(profile),
    ...methods,
  };
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  const runtime = createRuntime({ api, storage });
  if (role)
    await runtime.signIn({
      username: profile.username,
      password: "synthetic-password",
    });
  await runtime.restore();
  render(<App runtime={runtime} />);
  return { user: userEvent.setup(), runtime, api, storage };
}
beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

async function loginApp(fetchImpl, params = '') {
  window.history.replaceState({}, '', `/?view=login${params}`);
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
  const runtime = createRuntime({ api: createPhase2Api({ fetchImpl }), storage });
  await runtime.restore();
  const view = render(<App runtime={runtime} />);
  return { ...view, runtime, storage, user: userEvent.setup() };
}

it('LF01 keeps the real App401 refusal visible after the real runtime advances its security revision without reading the body', async () => {
  const json = vi.fn(() => new Promise(() => {}));
  const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json }));
  const { user, runtime, storage } = await loginApp(fetchImpl);
  const before = runtime.getSnapshot().revision, subtree = document.querySelector('.view-transition');
  await user.type(screen.getByLabelText('Username'), 'synthetic-denied');
  const password = crypto.randomUUID();
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: /^Log in/ }));
  await waitFor(() => expect(runtime.getSnapshot().revision > before).toBe(true), { onTimeout: error => error });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/auth/login');
  expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
  expect(json).not.toHaveBeenCalled();
  expect(document.querySelector('.view-transition') !== subtree).toBe(true);
  expect(runtime.getSnapshot()).toMatchObject({ user: null, hasToken: false, identityBlocked: true });
  expect(screen.getByLabelText('Password').value === '').toBe(true);
  expect(screen.getByRole('button', { name: /^Log in/ })).toBeEnabled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes('Incorrect username or password. Please try again.'))).toBe(true);
});

const loginRefusal = 'Incorrect username or password. Please try again.';
const httpReply = data => ({ ok: true, status: 200, json: async () => data });
function publicLoginRead(path, profile = { id: ID, username: 'synthetic-user', role: 'user' }) {
  if (path === '/api/v1/users/me') return httpReply(profile);
  if (path.startsWith('/api/v1/events/')) return httpReply(event);
  if (path.startsWith('/api/v1/events')) {
    const query = new URL(path, 'http://localhost').searchParams;
    return httpReply({ data: [event], page: Number(query.get('page')) || 1,
      page_size: Number(query.get('page_size')) || 24, total_count: 1, total_pages: 1 });
  }
  throw new TypeError('Unexpected controlled read.');
}
function fillLogin() {
  fireEvent.change(screen.getByLabelText(tr('Username')), { target: { value: 'synthetic-login' } });
  fireEvent.change(screen.getByLabelText(tr('Password')), { target: { value: crypto.randomUUID() } });
  return screen.getByLabelText(tr('Password')).form;
}

it('LF03 bounds pending double submit and clears old feedback for an intentional successful retry', async () => {
  let posts = 0, releaseFirst, releaseSecond;
  const json401 = vi.fn(() => new Promise(() => {}));
  const fetchImpl = vi.fn(async path => {
    if (path === '/api/v1/auth/login') {
      posts++;
      return new Promise(resolve => {
        if (posts === 1) releaseFirst = () => resolve({ ok: false, status: 401, json: json401 });
        else releaseSecond = () => resolve(httpReply({ access_token: crypto.randomUUID(), token_type: 'bearer' }));
      });
    }
    return publicLoginRead(path);
  });
  const { runtime, storage } = await loginApp(fetchImpl);
  const form = fillLogin(), submittedPassword = screen.getByLabelText('Password');
  fireEvent.click(screen.getByRole('button', { name: 'Show' }));
  fireEvent.submit(form); fireEvent.submit(form);
  expect(posts).toBe(1);
  expect(screen.getByRole('button', { name: /^Please wait/ })).toBeDisabled();
  await act(async () => releaseFirst());
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(true);
  expect(submittedPassword.value === '').toBe(true);
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  fireEvent.submit(fillLogin());
  expect(posts).toBe(2);
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(false);
  expect(screen.getByRole('button', { name: /^Please wait/ })).toBeDisabled();
  await act(async () => releaseSecond());
  await waitFor(() => expect(runtime.getSnapshot().user?.id === ID).toBe(true), { onTimeout: error => error });
  expect(window.location.search.includes('view=home')).toBe(true);
  expect(posts).toBe(2);
  expect(json401).not.toHaveBeenCalled();
  expect(Boolean(screen.queryByLabelText('Password'))).toBe(false);
  expect(storage.setItem.mock.calls.every(([key]) => key === 'rose.live.access-token')).toBe(true);
});

it.each(['failure', 'success'])('LF04 a late%s cannot navigate or repaint after leaving Login', async outcome => {
  let release;
  const fetchImpl = vi.fn(async path => path === '/api/v1/auth/login'
    ? new Promise(resolve => { release = () => resolve(outcome === 'failure'
      ? { ok: false, status: 401, json: vi.fn() }
      : httpReply({ access_token: crypto.randomUUID(), token_type: 'bearer' })); }) : publicLoginRead(path));
  const { user } = await loginApp(fetchImpl);
  fireEvent.submit(fillLogin());
  await user.click(screen.getByRole('link', { name: 'Recover account access' }));
  expect(window.location.search).toBe('?view=recovery');
  await act(async () => release());
  expect(window.location.search).toBe('?view=recovery');
  expect(Boolean(Array.from(document.querySelectorAll('[role="alert"]')).find(node => node.textContent.includes(loginRefusal)))).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Cancel and return to Login' }));
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(false);
  expect(screen.getByLabelText('Password').value === '').toBe(true);
});

it('LF04 popstate exit and re-entry invalidate an older pending failure on the same Login route', async () => {
  let release;
  const fetchImpl = vi.fn(async () => new Promise(resolve => { release = () => resolve({ ok: false, status: 401, json: vi.fn() }); }));
  await loginApp(fetchImpl);
  fireEvent.submit(fillLogin());
  act(() => { window.history.pushState({}, '', '?view=help'); window.dispatchEvent(new PopStateEvent('popstate')); });
  act(() => { window.history.pushState({}, '', '?view=login'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await act(async () => release());
  expect(window.location.search).toBe('?view=login');
  expect(Boolean(screen.queryByRole('alert'))).toBe(false);
  expect(screen.getByRole('button', { name: /^Log in/ }).disabled).toBe(false);
});

it('LF04 an older transport failure cannot replace the refusal from a newer explicit login attempt', async () => {
  let posts = 0, rejectOld;
  const fetchImpl = vi.fn(async () => {
    if (++posts === 1) return new Promise((resolve, reject) => { rejectOld = reject; });
    return { ok: false, status: 401, json: vi.fn() };
  });
  const { user } = await loginApp(fetchImpl);
  fireEvent.submit(fillLogin());
  await user.click(screen.getByRole('link', { name: 'Recover account access' }));
  await user.click(screen.getByRole('button', { name: 'Cancel and return to Login' }));
  fireEvent.submit(fillLogin());
  await waitFor(() => expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(true), { onTimeout: error => error });
  await act(async () => rejectOld(new TypeError()));
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(true);
  expect(posts).toBe(2);
});

it.each(['logout', 'another actor'])('LF04 late failure cannot repaint after%s changes the session revision', async transition => {
  let posts = 0, releaseOld, currentToken;
  const other = { id: '01K00000000000000000000002', username: 'synthetic-other', role: 'user' };
  const fetchImpl = vi.fn(async path => {
    if (path === '/api/v1/auth/login') {
      if (++posts === 1) return new Promise(resolve => { releaseOld = () => resolve({ ok: false, status: 401, json: vi.fn() }); });
      currentToken = crypto.randomUUID();
      return httpReply({ access_token: currentToken, token_type: 'bearer' });
    }
    return publicLoginRead(path, other);
  });
  const { runtime } = await loginApp(fetchImpl);
  fireEvent.submit(fillLogin());
  await act(async () => {
    if (transition === 'logout') runtime.logout();
    else await runtime.signIn({ username: 'synthetic-other', password: crypto.randomUUID() });
  });
  const currentRevision = runtime.getSnapshot().revision;
  await act(async () => releaseOld());
  expect(runtime.getSnapshot().revision).toBe(currentRevision);
  expect(runtime.getSnapshot().user?.id === other.id).toBe(transition === 'another actor');
  expect(runtime.getSnapshot().identityBlocked).toBe(false);
  if (transition === 'another actor') {
    let calls = 0, correct = false;
    await runtime.withVerifiedAccount(async (token, profile) => { calls++; correct = token === currentToken && profile.id === other.id; });
    expect(calls).toBe(1); expect(correct).toBe(true);
  }
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(false);
  expect(window.location.search).toBe('?view=login');
});

it('LF05 the visible rejected account switch keeps the previous offline actor locked', async () => {
  let posts = 0;
  const leader = { id: ID, username: 'synthetic-leader', role: 'leader' };
  const fetchImpl = vi.fn(async path => path === '/api/v1/auth/login'
    ? ++posts === 1 ? httpReply({ access_token: crypto.randomUUID(), token_type: 'bearer' }) : { ok: false, status: 401, json: vi.fn() }
    : publicLoginRead(path, leader));
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
  const runtime = createRuntime({ api: createPhase2Api({ fetchImpl }), storage });
  await runtime.signIn({ username: 'synthetic-leader', password: crypto.randomUUID() });
  await runtime.restore();
  window.history.replaceState({}, '', '?view=login'); render(<App runtime={runtime} />);
  const revision = runtime.getSnapshot().revision;
  fireEvent.submit(fillLogin());
  await waitFor(() => expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(true), { onTimeout: error => error });
  expect(runtime.getSnapshot().revision > revision).toBe(true);
  expect(runtime.getSnapshot()).toMatchObject({ identityBlocked: true, hasToken: false, user: null, offlineActor: null });
  await expect(runtime.freshOfflineIdentity(leader)).rejects.toMatchObject({ status: 401 });
  const restarted = createRuntime({ api: createPhase2Api({ fetchImpl }), storage: { getItem: () => null } });
  expect(() => restarted.unlockSyntheticWorkspace({ syntheticConfirmed: true })).toThrow();
});

it('LF04 a successful old runtime cannot navigate the App after its runtime prop is replaced', async () => {
  let releaseOld;
  const oldFetch = vi.fn(async path => path === '/api/v1/auth/login'
    ? new Promise(resolve => { releaseOld = () => resolve(httpReply({ access_token: crypto.randomUUID(), token_type: 'bearer' })); })
    : publicLoginRead(path));
  const view = await loginApp(oldFetch);
  fireEvent.submit(fillLogin());
  const other = { id: '01K00000000000000000000002', username: 'synthetic-replacement', role: 'user' };
  const replacement = createRuntime({ api: createPhase2Api({ fetchImpl: async path => path === '/api/v1/auth/login'
    ? httpReply({ access_token: crypto.randomUUID(), token_type: 'bearer' }) : publicLoginRead(path, other) }),
    storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() } });
  await replacement.signIn({ username: 'synthetic-replacement', password: crypto.randomUUID() });
  await replacement.restore();
  view.rerender(<App runtime={replacement} />);
  await act(async () => releaseOld());
  expect(window.location.search).toBe('?view=login');
  expect(replacement.getSnapshot().user?.id === other.id).toBe(true);
  expect(Boolean(screen.queryByRole('alert')?.textContent.includes(loginRefusal))).toBe(false);
});

it('LF06 Malay refusal uses the existing translation and retains the selected event route', async () => {
  await changeLanguage('ms');
  const json = vi.fn(() => new Promise(() => {}));
  const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json }));
  await loginApp(fetchImpl, `&event=${event.public_id}`);
  fireEvent.submit(fillLogin());
  await waitFor(() => expect(Boolean(screen.queryByRole('alert')?.textContent.includes(tr(loginRefusal)))).toBe(true), { onTimeout: error => error });
  expect(window.location.search.includes(`event=${event.public_id}`)).toBe(true);
  expect(screen.getByLabelText(tr('Password')).value === '').toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1); expect(json).not.toHaveBeenCalled();
});

it('discovers assisted account recovery from Login and keeps its code out of the route', async () => {
  const { user } = await setup({ view: 'login' });
  await user.click(screen.getByRole('link', { name: 'Recover account access' }));
  expect(await screen.findByRole('heading', { name: 'Recover account access' })).toBeInTheDocument();
  expect(screen.getByLabelText('Recovery code')).toHaveAttribute('type', 'password');
  expect(window.location.search).toBe('?view=recovery');
  expect(screen.getByText(/No real message or identity verification is provided/)).toBeInTheDocument();
});
it('keeps verified Profile identity and local Logout alongside the real own-profile form', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({
    contract_version: 'rose.demo-journey.v1', account: { id: ID, username: 'synthetic-user', role: 'user' },
    profile: { display_name: 'Editable synthetic display', preferred_language: 'en', version: 0, updated_at: null },
    as_of_utc: '2026-11-03T08:00:00Z',
  }) });
  const { user, storage } = await setup({ view: 'profile', role: 'user' });
  expect(screen.getByRole('heading', { name: 'synthetic-user' })).toBeInTheDocument();
  await screen.findByDisplayValue('Editable synthetic display');
  await user.click(screen.getByRole('button', { name: 'Log out locally' }));
  expect(screen.queryByRole('form', { name: 'Personal profile' })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Editable synthetic display')).not.toBeInTheDocument();
  expect(storage.removeItem).toHaveBeenCalledWith('rose.live.access-token');
});

describe("React application workflows (controlled API fixtures)", () => {
  it.each([
    [undefined, "en"],
    ["user", "ms"],
  ])(
    "shows public detail sharing before application for role %s in %s",
    async (role, language) => {
      await changeLanguage(language);
      const canary = "synthetic-private-must-not-share";
      const registerGuestForEvent = vi.fn();
      const registerForEvent = vi.fn();
      const { user, api } = await setup({
        view: "event",
        role,
        params: `&event=${event.public_id}&token=${canary}&registration=${canary}&national_id=${canary}`,
        methods: {
          getEvent: vi
            .fn()
            .mockResolvedValue({
              ...event,
              national_id: canary,
              token: canary,
              registration_id: canary,
            }),
          registerGuestForEvent,
          registerForEvent,
        },
      });
      const copy = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue();
      const share = await screen.findByRole("link", {
        name: tr("Share on WhatsApp"),
      });
      const publicUrl = `${window.location.origin}/?view=event&event=${event.public_id}`;
      const destination = new URL(share.href);
      expect(destination.origin).toBe("https://wa.me");
      expect([...destination.searchParams.keys()]).toEqual(["text"]);
      expect(destination.searchParams.get("text")).toBe(
        `${event.title}\n${publicUrl}`,
      );
      expect(share.href).not.toContain(canary);
      expect(copy).not.toHaveBeenCalled();
      expect(api.getEvent).toHaveBeenCalledWith(
        event.public_id,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(registerGuestForEvent).not.toHaveBeenCalled();
      expect(registerForEvent).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("button", { name: tr("Copy event link") }),
      );
      expect(copy).toHaveBeenCalledExactlyOnceWith(publicUrl);
      expect(registerGuestForEvent).not.toHaveBeenCalled();
      expect(registerForEvent).not.toHaveBeenCalled();
    },
  );
  it("renders the live list and explicit EN/MS choices with formal review still pending", async () => {
    const { user, api } = await setup();
    expect(
      await screen.findByRole("heading", { name: event.title }),
    ).toBeVisible();
    expect(api.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 24, keyword: "" }),
    );
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(
      screen.getByText(/NGO language and sensitive-consent review are pending/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bahasa Melayu" })).toBeEnabled();
    expect(screen.queryByText("5,000")).not.toBeInTheDocument();
  });
  it("uses only the server keyword search contract and resets pagination", async () => {
    const { user, api } = await setup({
      view: "events",
      params: "&page=3&pageSize=12&keyword=old",
    });
    await screen.findByRole("heading", { name: event.title });
    const search = screen.getByRole("searchbox", { name: "Search events" });
    await user.clear(search);
    await user.type(search, "health");
    await user.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() =>
      expect(api.getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 12, keyword: "health" }),
      ),
    );
    expect(window.location.search).toContain("keyword=health");
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
  });
  it("keeps API failure visible and provides a read-only retry without mock fallback", async () => {
    const getEvents = vi
      .fn()
      .mockRejectedValue(
        new ApiError("server", "The service is temporarily unavailable."),
      );
    const { user } = await setup({ methods: { getEvents } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(
      screen.queryByRole("heading", { name: event.title }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try reading again" }));
    await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(2));
  });
  it("requires an explicit guest choice and submits exactly one application", async () => {
    const registerGuestForEvent = vi
      .fn()
      .mockResolvedValue({ ...record, created_by_user_id: null });
    const { user, storage } = await setup({
      view: "apply",
      params: `&event=${event.public_id}`,
      methods: { registerGuestForEvent },
    });
    await screen.findByRole("button", { name: /Continue as guest/ });
    expect(registerGuestForEvent).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continue as guest/ }));
    await user.type(screen.getByLabelText("First name"), "Synthetic");
    await user.type(screen.getByLabelText("Last name"), "Example");
    await user.type(screen.getByLabelText("Phone"), "TEST");
    await user.type(screen.getByLabelText("National ID"), "SYNTHETIC-ONLY-001");
    fireEvent.change(screen.getByLabelText("Date of birth"), {
      target: { value: "1990-01-01" },
    });
    await user.selectOptions(screen.getByLabelText("Gender"), "female");
    for (const field of ["Marital status", "Address", "Income band code"])
      expect(screen.queryByLabelText(field)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Submit application/ }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Your application is pending.",
      }),
    ).toBeVisible();
    expect(registerGuestForEvent).toHaveBeenCalledTimes(1);
    expect(registerGuestForEvent).toHaveBeenCalledWith(
      event.public_id,
      expect.objectContaining({
        first_name: "Synthetic",
      }),
      1,
    );
    for (const field of [
      "address",
      "income_band_code",
      "marriage_status",
      "medical_record",
    ])
      expect(Object.hasOwn(registerGuestForEvent.mock.calls[0][1], field)).toBe(
        false,
      );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Guest applications cannot be retrieved here after you leave/,
      ),
    ).toBeInTheDocument();
  });
  it("retains selected event through Signup → Login and does not automatically log in", async () => {
    const createUser = vi
      .fn()
      .mockResolvedValue({ id: ID, username: "synthetic-new", role: "user" });
    const { user, api } = await setup({
      view: "signup",
      params: `&event=${event.public_id}`,
      methods: { createUser },
    });
    await user.type(screen.getByLabelText("Username"), "synthetic-new");
    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    expect(
      await screen.findByRole("heading", { name: "You’re ready to connect." }),
    ).toBeVisible();
    expect(api.login).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Create another account" }),
    ).toBeEnabled();
    const panel = screen.getByRole("heading", {
      name: "You’re ready to connect.",
    }).parentElement;
    await user.click(within(panel).getByRole("link", { name: /Log in/ }));
    expect(window.location.search).toContain(`event=${event.public_id}`);
    await user.type(screen.getByLabelText("Username"), "synthetic-new");
    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: /^Log in/ }));
    await screen.findByRole("heading", { name: "Join this event" });
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("view=apply");
  });
  it("blocks leader create without sending a write and opens the synthetic local workspace", async () => {
    const createEvent = vi.fn();
    const { user } = await setup({
      view: "create",
      role: "leader",
      methods: { createEvent },
    });
    expect(
      await screen.findByRole("heading", {
        name: "Organizer account required",
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Event title")).not.toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
    await user.click(screen.getByRole("link", { name: "Leader workspace" }));
    expect(
      screen.getByRole("heading", { name: "Offline registration drafts" }),
    ).toBeVisible();
  });
  it("clears a selected upload before Create and enables an explicit second event after success", async () => {
    const createEvent = vi.fn().mockResolvedValue(event);
    const { user } = await setup({
      view: "create",
      role: "organizer",
      methods: { createEvent },
    });
    await screen.findByLabelText("Event title");
    await user.type(screen.getByLabelText("Event title"), event.title);
    await user.type(screen.getByLabelText("Location"), event.location);
    fireEvent.change(screen.getByLabelText("Start date and time"), {
      target: { value: "2027-03-15T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End date and time"), {
      target: { value: "2027-03-15T12:00" },
    });
    const file = new File(["synthetic image"], "synthetic.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText(/Event image/), file);
    const submit = screen.getByRole("button", { name: /^Create event/ });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(
      await screen.findByRole("heading", { name: /Your event is ready/ }),
    ).toBeVisible();
    expect(createEvent).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Create another event" }),
    );
    expect(screen.getByLabelText("Event title")).toHaveValue("");
  });
  it("requires cancellation confirmation and rereads the authoritative status", async () => {
    let status = "pending";
    const getMyRegistrations = vi.fn(async () => [{ ...record, status }]);
    const cancelRegistration = vi.fn(async () => {
      status = "cancelled";
      return { ...record, status };
    });
    const { user } = await setup({
      view: "registrations",
      role: "user",
      methods: { getMyRegistrations, cancelRegistration },
    });
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(cancelRegistration).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Cancelled", { selector: ".status" }),
      ).toBeVisible(),
    );
    expect(cancelRegistration).toHaveBeenCalledTimes(1);
    expect(getMyRegistrations).toHaveBeenCalledTimes(2);
  });
  it("loads organizer details and displays a server waiting response after approval", async () => {
    let status = "pending";
    const getOrganizerRegistrations = vi.fn(async () => [
      { ...record, first_name: "Synthetic", last_name: "Example", status },
    ]);
    const getRegistration = vi.fn(async () => ({ ...record, status }));
    const approveRegistration = vi.fn(async () => {
      status = "waiting";
      return { ...record, status };
    });
    const { user } = await setup({
      view: "manage",
      role: "organizer",
      methods: {
        getOrganizerRegistrations,
        getRegistration,
        approveRegistration,
      },
    });
    await user.click(await screen.findByRole("button", { name: "View" }));
    expect(
      await screen.findByRole("heading", { name: "Application details" }),
    ).toBeVisible();
    expect(getRegistration).toHaveBeenCalledWith(ID, "synthetic-token");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(
        screen.getByText("Waiting", { selector: ".status" }),
      ).toBeVisible(),
    );
    expect(approveRegistration).toHaveBeenCalledTimes(1);
  });
  it("updates a current event and reads it back without rounding unchanged server seconds", async () => {
    let current = { ...event, start_time: "2027-03-15T10:00:31Z" };
    const getEvent = vi.fn(async () => current);
    const updateEvent = vi.fn(async (_, patch) => {
      current = { ...current, ...patch };
      return current;
    });
    const { user } = await setup({
      view: "edit",
      role: "organizer",
      params: `&event=${event.public_id}`,
      methods: { getEvent, updateEvent },
    });
    await screen.findByDisplayValue(event.title);
    await user.clear(screen.getByLabelText("Event title"));
    await user.type(
      screen.getByLabelText("Event title"),
      "Synthetic revised event",
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByRole("heading", { name: "Your event is updated." }),
    ).toBeVisible();
    expect(updateEvent).toHaveBeenCalledWith(
      event.public_id,
      { title: "Synthetic revised event" },
      "synthetic-token",
    );
    expect(getEvent).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Make another edit" }));
    expect(
      await screen.findByDisplayValue("Synthetic revised event"),
    ).toBeVisible();
    expect(getEvent).toHaveBeenCalledTimes(3);
  });
  it("does not offer Guest after restore401 until explicit Logout", async () => {
    window.history.replaceState(
      {},
      "",
      `/?view=apply&event=${event.public_id}`,
    );
    const api = {
      getEvent: vi.fn().mockResolvedValue(event),
      getMe: vi
        .fn()
        .mockRejectedValue(new ApiError("unauthorized", "Expired login", 401)),
      registerGuestForEvent: vi.fn(),
    };
    const runtime = createRuntime({
      api,
      storage: {
        getItem: () => "synthetic-expired-token",
        removeItem: vi.fn(),
      },
    });
    render(<App runtime={runtime} />);
    expect(
      await screen.findByText(/Your saved login could not be verified/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Continue as guest/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Log out before choosing Guest" }),
    );
    expect(
      await screen.findByRole("button", { name: /Continue as guest/ }),
    ).toBeVisible();
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
  });
  it("keeps a closed mobile drawer inert and gives every icon navigation item an accessible name", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const { user } = await setup();
    const sidebar = document.querySelector(".sidebar");
    expect(sidebar).toHaveAttribute("inert");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(sidebar).not.toHaveAttribute("inert");
    expect(
      within(sidebar).getByRole("link", { name: "Events" }),
    ).toHaveAttribute("aria-label", "Events");
    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(sidebar).toHaveAttribute("inert");
    vi.unstubAllGlobals();
  });
  it("local Logout removes private registration content from the UI", async () => {
    const { user, storage } = await setup({
      view: "registrations",
      role: "user",
      methods: { getMyRegistrations: vi.fn().mockResolvedValue([record]) },
    });
    await screen.findByText(ID);
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.queryByText(ID)).not.toBeInTheDocument();
    expect(storage.removeItem).toHaveBeenCalledWith("rose.live.access-token");
  });
});
it('shows safe managed workflow state and registration window instead of legacy Active',async()=>{await setup({view:'events',methods:{getEvents:vi.fn(async()=>({data:[{...event,workflow:{state:'postponed',timezone:'Asia/Kuala_Lumpur',registration_opens_at:'2026-11-01T00:00:00Z',registration_closes_at:'2027-03-14T00:00:00Z'}}],page:1,page_size:6,total_count:1,total_pages:1}))}});expect(await screen.findByText('Postponed')).toBeInTheDocument();expect(screen.queryByText('Active')).not.toBeInTheDocument();expect(screen.getByText(/Registration closes/)).toBeInTheDocument();});
it('home selects upcoming published events and excludes cancelled, completed and postponed records',async()=>{const upcoming={...event,title:'Upcoming published',workflow:{state:'published'}};await setup({methods:{getEvents:vi.fn(async()=>({data:[{...event,title:'Cancelled should not feature',status:'cancelled'}, {...event,title:'Postponed should not feature',workflow:{state:'postponed'}},upcoming],page:1,page_size:24,total_count:3,total_pages:1}))}});expect(await screen.findByText('Upcoming published')).toBeInTheDocument();expect(screen.queryByText('Cancelled should not feature')).not.toBeInTheDocument();expect(screen.queryByText('Postponed should not feature')).not.toBeInTheDocument();});
it('primary Apply opens the managed Guest form with public context and returns a usable reference',async()=>{const managed={...event,workflow:{state:'published',timezone:'Asia/Kuala_Lumpur',registration_opens_at:'2026-11-01T00:00:00Z',registration_closes_at:'2027-03-14T00:00:00Z'}};const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(path,options)=>{const body=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({contract_version:body.contract_version,operation_id:body.operation_id,outcome:'applied',effects:{registration_id:'managed-guest-reference',status:'pending'}})};});const {user}=await setup({view:'event',params:'&event='+event.public_id,methods:{getEvent:vi.fn(async()=>managed)}});await user.click(await screen.findByRole('link',{name:'Apply for this event'}));const form=await screen.findByRole('form',{name:'Submit application'});expect(screen.getByText('Guest application — no account will be created.')).toBeInTheDocument();expect(screen.getByText(event.overview)).toBeInTheDocument();for(const [label,value] of [['First name','Siti'],['Last name','Demo'],['Phone','00000001'],['National ID','SIM-0001']])await user.type(within(form).getByLabelText(label),value);fireEvent.change(within(form).getByLabelText('Date of birth'),{target:{value:'1990-01-01'}});await user.click(within(form).getByRole('button',{name:'Submit application'}));expect(await screen.findByText('managed-guest-reference')).toBeInTheDocument();expect(fetch.mock.calls[0][0]).toBe('/api/v2/operations/events/'+event.public_id+'/applications');expect(fetch.mock.calls[0][1].headers['X-Application-Key']).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(screen.getByLabelText('Registration reference')).toHaveValue('managed-guest-reference');});
