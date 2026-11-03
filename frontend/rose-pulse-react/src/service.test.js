import { describe, expect, it, vi } from "vitest";
import { createApi } from "../../live/api.mjs";
import {
  ApiError,
  createRuntime,
  createSignupController,
  signupPayload,
} from "./service.js";

const ID = "01K00000000000000000000001";
const ORGANIZER = {
  id: ID,
  username: "synthetic-organizer",
  role: "organizer",
};
const USER = { id: ID, username: "synthetic-user", role: "user" };
const EVENT = {
  id: 1,
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  organizer_id: ID,
  title: "Synthetic community activity",
  overview: null,
  location: "Synthetic hall",
  start_time: "2027-03-15T10:00:00Z",
  end_time: "2027-03-15T12:00:00Z",
  online_quota: 1,
  offline_quota: 0,
  status: "active",
  created_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
};
const PARTICIPANT = {
  first_name: "Synthetic",
  last_name: "Example",
  gender: "female",
  date_of_birth: "1990-01-01",
  phone: "TEST",
  address: "",
  national_id: "SYNTHETIC-ONLY-001",
  income_band_code: "",
  marriage_status: "single",
};
const values = {
  title: EVENT.title,
  location: EVENT.location,
  overview: "",
  start_time: "2027-03-15T10:00",
  end_time: "2027-03-15T12:00",
  online_quota: "1",
  offline_quota: "0",
};
const storage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    map,
  };
};
async function runtimeFor(role = USER, methods = {}) {
  const api = {
    login: vi.fn().mockResolvedValue("synthetic-token"),
    getMe: vi.fn().mockResolvedValue(role),
    ...methods,
  };
  const runtime = createRuntime({ api, storage: storage() });
  await runtime.signIn({
    username: role.username,
    password: "synthetic-password",
  });
  await runtime.restore();
  return { runtime, api };
}

describe("React adapter preserves the reviewed write boundary", () => {
  it("preserves exact username Unicode and rejects whitespace-only and bcrypt byte overflow", () => {
    expect(
      signupPayload({ username: " ABC ", password: "123456" }).username,
    ).toBe(" ABC ");
    expect(() =>
      signupPayload({ username: "   ", password: "123456" }),
    ).toThrow("3–20");
    expect(() =>
      signupPayload({ username: "測試用戶", password: "密".repeat(25) }),
    ).toThrow("72 UTF-8");
  });
  it("sends signup once while in flight and retains an uncertain lock", async () => {
    let reject;
    const api = {
      createUser: vi.fn(
        () =>
          new Promise((_, failed) => {
            reject = failed;
          }),
      ),
    };
    const controller = createSignupController({ api });
    const first = controller.submit({
      username: "synthetic",
      password: "123456",
    });
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(api.createUser).toHaveBeenCalledTimes(1);
    reject(new ApiError("network", "Lost response"));
    await first;
    expect(controller.state.status).toBe("uncertain");
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(api.createUser).toHaveBeenCalledTimes(1);
  });
  it("allows correcting a known duplicate rejection without an automatic retry", async () => {
    const api = {
      createUser: vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("duplicate", "Duplicate username", 400),
        )
        .mockResolvedValue({ id: ID, username: "changed", role: "user" }),
    };
    const controller = createSignupController({ api });
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(controller.state.status).toBe("error");
    expect(api.createUser).toHaveBeenCalledTimes(1);
    await controller.submit({ username: "changed", password: "123456" });
    expect(controller.state.status).toBe("success");
  });
  it("uses strict API signup validation, including rejection of a privileged success response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: ID,
          username: "synthetic",
          role: "organizer",
          created_at: EVENT.created_at,
          updated_at: EVENT.updated_at,
        }),
        { status: 201 },
      ),
    );
    const api = createApi({ fetchImpl });
    const controller = createSignupController({ api });
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(controller.state.status).toBe("uncertain");
    const options = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(options.body)).toEqual({
      username: "synthetic",
      password: "123456",
    });
    expect(options.headers.Authorization).toBeUndefined();
  });
  it("retains failed identity instead of allowing anonymous guest submission", async () => {
    const kept = storage();
    kept.setItem("rose.live.access-token", "synthetic-token");
    const api = {
      getMe: vi
        .fn()
        .mockRejectedValue(new ApiError("network", "No connection")),
      registerGuestForEvent: vi.fn(),
    };
    const runtime = createRuntime({ api, storage: kept });
    await runtime.restore();
    expect(runtime.getSnapshot()).toMatchObject({
      hasToken: true,
      user: null,
      checking: false,
    });
    const controller = runtime.store("guest", { event: EVENT }).controller;
    await controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
    runtime.logout();
    expect(runtime.getSnapshot()).toMatchObject({
      hasToken: false,
      user: null,
    });
  });
  it("retains a sticky failed identity after restore401 removes the token, until explicit Logout", async () => {
    const kept = storage();
    kept.setItem("rose.live.access-token", "synthetic-token");
    const api = {
      getMe: vi
        .fn()
        .mockRejectedValue(new ApiError("unauthorized", "Expired login", 401)),
      registerGuestForEvent: vi.fn().mockResolvedValue({
        event_id: 1,
        created_by_user_id: null,
        channel: "online",
        status: "pending",
      }),
    };
    const runtime = createRuntime({ api, storage: kept });
    await runtime.restore();
    expect(runtime.getSnapshot()).toMatchObject({
      identityBlocked: true,
      hasToken: false,
      user: null,
    });
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
    runtime.logout();
    expect(runtime.getSnapshot().identityBlocked).toBe(false);
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).toHaveBeenCalledTimes(1);
  });
  it("does not turn an authenticated registration401 into Guest mode", async () => {
    const { runtime, api } = await runtimeFor(USER, {
      registerForEvent: vi
        .fn()
        .mockRejectedValue(new ApiError("unauthorized", "Expired login", 401)),
      registerGuestForEvent: vi.fn(),
    });
    await runtime
      .store("registration", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(runtime.getSnapshot()).toMatchObject({
      identityBlocked: true,
      hasToken: false,
      user: null,
    });
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
  });
  it("resets only completed Signup and Edit operations and preserves uncertain Signup locks", async () => {
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      createUser: vi
        .fn()
        .mockResolvedValue({ id: ID, username: "synthetic", role: "user" }),
      getEvent: vi.fn().mockResolvedValue(EVENT),
      updateEvent: vi.fn().mockResolvedValue({ ...EVENT, title: "Changed" }),
    });
    const signup = runtime.store("signup");
    expect(runtime.beginAnotherSignup()).toBe(false);
    await signup.controller.submit({
      username: "synthetic",
      password: "123456",
    });
    expect(runtime.beginAnotherSignup()).toBe(true);
    expect(runtime.store("signup")).not.toBe(signup);
    api.createUser.mockRejectedValueOnce(
      new ApiError("network", "Lost response"),
    );
    await runtime
      .store("signup")
      .controller.submit({ username: "synthetic", password: "123456" });
    expect(runtime.beginAnotherSignup()).toBe(false);
    const edit = runtime.store("edit", { event: EVENT });
    expect(runtime.beginAnotherEdit(EVENT.public_id)).toBe(false);
    await edit.controller.load(EVENT.public_id);
    api.getEvent.mockResolvedValueOnce({ ...EVENT, title: "Changed" });
    await edit.controller.submit({ title: "Changed" });
    expect(edit.controller.state.status).toBe("success");
    expect(runtime.beginAnotherEdit(EVENT.public_id)).toBe(true);
    expect(runtime.store("edit", { event: EVENT })).not.toBe(edit);
  });
  it("retains the same guest uncertain controller across route visits and never resends", async () => {
    const api = {
      registerGuestForEvent: vi
        .fn()
        .mockRejectedValue(new ApiError("timeout", "Lost response")),
    };
    const runtime = createRuntime({ api, storage: storage() });
    await runtime.restore();
    const first = runtime.store("guest", { event: EVENT });
    await first.controller.submit(PARTICIPANT);
    const revisited = runtime.store("guest", { event: { ...EVENT } });
    expect(revisited).toBe(first);
    await revisited.controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).toHaveBeenCalledTimes(1);
    expect(first.controller.state.status).toBe("uncertain");
  });
  it("suppresses a guest receipt if the account changes during its write", async () => {
    let resolve;
    const api = {
      registerGuestForEvent: vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    const runtime = createRuntime({ api, storage: storage() });
    await runtime.restore();
    const controller = runtime.store("guest", { event: EVENT }).controller;
    const write = controller.submit(PARTICIPANT);
    runtime.logout();
    resolve({
      event_id: 1,
      created_by_user_id: null,
      channel: "online",
      status: "pending",
    });
    await write;
    expect(controller.state).toMatchObject({
      status: "uncertain",
      receipt: null,
    });
  });
  it("does not persist participant values or receipts in browser storage", async () => {
    const kept = storage();
    const api = {
      registerGuestForEvent: vi.fn().mockResolvedValue({
        id: ID,
        event_id: 1,
        created_by_user_id: null,
        channel: "online",
        status: "pending",
      }),
    };
    const runtime = createRuntime({ api, storage: kept });
    await runtime.restore();
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(kept.map.size).toBe(0);
  });
  it("blocks create for leader and participant identities", async () => {
    for (const role of ["leader", "user"]) {
      const { runtime, api } = await runtimeFor(
        { ...USER, role },
        { createEvent: vi.fn() },
      );
      await runtime.store("create").controller.submit(values);
      expect(api.createEvent).not.toHaveBeenCalled();
    }
  });
  it("offers an explicit new create only after a confirmed success", async () => {
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      createEvent: vi.fn().mockResolvedValue(EVENT),
    });
    const first = runtime.store("create");
    expect(runtime.beginAnotherEvent()).toBe(false);
    await first.controller.submit(values);
    expect(api.createEvent).toHaveBeenCalledTimes(1);
    expect(runtime.beginAnotherEvent()).toBe(true);
    expect(runtime.store("create")).not.toBe(first);
    expect(runtime.store("create").controller.state.status).toBe("idle");
  });
  it("does not unlock an uncertain create through the new-event action", async () => {
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      createEvent: vi
        .fn()
        .mockRejectedValue(new ApiError("network", "Lost response")),
    });
    const store = runtime.store("create");
    await store.controller.submit(values);
    expect(runtime.beginAnotherEvent()).toBe(false);
    await store.controller.submit(values);
    expect(api.createEvent).toHaveBeenCalledTimes(1);
  });
  it("re-verifies participant identity before an application and makes no write on verification failure", async () => {
    const { runtime, api } = await runtimeFor(USER, {
      registerForEvent: vi.fn(),
    });
    api.getMe.mockRejectedValueOnce(new ApiError("network", "Lost profile"));
    await runtime
      .store("registration", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerForEvent).not.toHaveBeenCalled();
  });
  it("re-verifies the organizer before approval and locks a lost result across a reread", async () => {
    const record = {
      id: ID,
      event_id: 1,
      participant_id: ID,
      created_by_user_id: null,
      status: "pending",
    };
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      getOrganizerRegistrations: vi.fn().mockResolvedValue([record]),
      approveRegistration: vi
        .fn()
        .mockRejectedValue(new ApiError("network", "Lost response")),
    });
    const controller = runtime.store("records", {
      mode: "organizer",
    }).controller;
    await controller.load();
    await controller.approve(ID);
    await controller.load();
    await controller.approve(ID);
    expect(api.approveRegistration).toHaveBeenCalledTimes(1);
    expect(controller.locked(ID)).toBe(true);
    expect(api.getMe.mock.calls.length).toBeGreaterThan(3);
  });
  it("requires explicit cancellation confirmation and server ownership", async () => {
    const record = {
      id: ID,
      event_id: 1,
      participant_id: ID,
      created_by_user_id: USER.id,
      status: "pending",
    };
    const { runtime, api } = await runtimeFor(USER, {
      getMyRegistrations: vi.fn().mockResolvedValue([record]),
      cancelRegistration: vi
        .fn()
        .mockResolvedValue({ ...record, status: "cancelled" }),
    });
    const controller = runtime.store("records", { mode: "my" }).controller;
    await controller.load();
    await controller.cancel(ID);
    expect(api.cancelRegistration).not.toHaveBeenCalled();
    await controller.cancel(ID, { confirmed: true });
    expect(api.cancelRegistration).toHaveBeenCalledTimes(1);
  });
  it("refuses to display a participant list attributed to a different account", async () => {
    const { runtime } = await runtimeFor(USER, {
      getMyRegistrations: vi.fn().mockResolvedValue([
        {
          id: ID,
          event_id: 1,
          participant_id: ID,
          created_by_user_id: "different",
          status: "pending",
        },
      ]),
    });
    const controller = runtime.store("records", { mode: "my" }).controller;
    await controller.load();
    expect(controller.state.status).toBe("error");
    expect(controller.state.records).toEqual([]);
  });
});
