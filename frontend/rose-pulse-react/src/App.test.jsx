import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { ApiError, createRuntime } from "./service.js";

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

describe("React application workflows (controlled API fixtures)", () => {
  it("renders the live list and an honest English-only language control", async () => {
    const { user, api } = await setup();
    expect(
      await screen.findByRole("heading", { name: event.title }),
    ).toBeVisible();
    expect(api.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 3, keyword: "" }),
    );
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(
      screen.getByText(/More languages are not yet available/),
    ).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Date of birth"), {
      target: { value: "1990-01-01" },
    });
    await user.selectOptions(screen.getByLabelText("Gender"), "female");
    await user.selectOptions(screen.getByLabelText("Marital status"), "single");
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
        medical_record: null,
      }),
      1,
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
  it("blocks leader create without sending a write and explains unavailable leader tools", async () => {
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
      screen.getByText("Leader tools are not available yet."),
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
