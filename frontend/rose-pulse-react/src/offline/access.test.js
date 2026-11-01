import { describe, expect, it, vi } from "vitest";
import { createSyntheticAccess, OFFLINE_ACCESS_KEY } from "./access.js";
import { createRuntime } from "../service.js";
const actor = {
  id: "01K00000000000000000000001",
  role: "leader",
  username: "must-not-persist",
};
const memory = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    map,
  };
};
describe("bounded synthetic local access after browser-process restart", () => {
  it("persists only a previously server-verified actor reference, never bearer or profile values", () => {
    const storage = memory();
    const access = createSyntheticAccess({ storage });
    access.remember(actor);
    const saved = JSON.parse(storage.getItem(OFFLINE_ACCESS_KEY));
    expect(saved.actor).toEqual({ id: actor.id, role: actor.role });
    expect(JSON.stringify(saved)).not.toContain("must-not-persist");
    expect(saved.token).toBeUndefined();
  });
  it("requires an explicit synthetic acknowledgement after a fresh process with empty tab storage", async () => {
    const persistent = memory();
    const session = memory();
    const api = {
      login: vi.fn().mockResolvedValue("synthetic-tab-token"),
      getMe: vi.fn().mockResolvedValue(actor),
    };
    const original = createRuntime({
      api,
      storage: session,
      offlineAccessStorage: persistent,
    });
    await original.signIn({ username: "synthetic", password: "synthetic" });
    const calls = api.getMe.mock.calls.length;
    const restarted = createRuntime({
      api,
      storage: memory(),
      offlineAccessStorage: persistent,
    });
    await restarted.restore();
    expect(restarted.getSnapshot()).toMatchObject({
      user: null,
      hasToken: false,
      offlineActor: null,
    });
    expect(restarted.getSnapshot().offlineCandidate.id).toBe(actor.id);
    expect(() => restarted.unlockSyntheticWorkspace()).toThrow();
    restarted.unlockSyntheticWorkspace({ syntheticConfirmed: true });
    expect(restarted.getSnapshot().offlineActor.id).toBe(actor.id);
    expect(api.getMe).toHaveBeenCalledTimes(calls);
    await expect(restarted.freshOfflineIdentity(actor)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("persists the explicit Logout lock across new processes", async () => {
    const persistent = memory();
    const api = {
      login: vi.fn().mockResolvedValue("synthetic"),
      getMe: vi.fn().mockResolvedValue(actor),
    };
    const runtime = createRuntime({
      api,
      storage: memory(),
      offlineAccessStorage: persistent,
    });
    await runtime.signIn({});
    runtime.logout();
    const restarted = createRuntime({
      api,
      storage: memory(),
      offlineAccessStorage: persistent,
    });
    await restarted.restore();
    expect(restarted.getSnapshot().offlineCandidate).toBeNull();
    expect(() =>
      restarted.unlockSyntheticWorkspace({ syntheticConfirmed: true }),
    ).toThrow();
  });
  it("locks the previous local actor on an unsuccessful account-switch attempt", async () => {
    const persistent = memory();
    const api = {
      login: vi
        .fn()
        .mockResolvedValueOnce("synthetic")
        .mockRejectedValueOnce(new Error("offline")),
      getMe: vi.fn().mockResolvedValue(actor),
    };
    const runtime = createRuntime({
      api,
      storage: memory(),
      offlineAccessStorage: persistent,
    });
    await runtime.signIn({});
    await expect(runtime.signIn({})).rejects.toThrow("offline");
    expect(createSyntheticAccess({ storage: persistent }).candidate).toBeNull();
  });
  it("expires cached local access after seven days and refuses corrupt/role-user records", () => {
    let now = 1;
    const storage = memory();
    const access = createSyntheticAccess({ storage, now: () => now });
    access.remember(actor);
    now += 7 * 86400000 + 1;
    expect(
      createSyntheticAccess({ storage, now: () => now }).candidate,
    ).toBeNull();
    storage.setItem(
      OFFLINE_ACCESS_KEY,
      JSON.stringify({
        version: 1,
        actor: { id: actor.id, role: "user" },
        expires_at: now + 100,
        locked: false,
      }),
    );
    expect(createSyntheticAccess({ storage }).candidate).toBeNull();
  });
});
