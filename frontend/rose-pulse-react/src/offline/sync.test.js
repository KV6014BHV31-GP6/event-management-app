import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createOfflineStore } from "./queue.js";
import { createManualSync } from "./sync.js";
import { ApiError } from "../../../live/api.mjs";
const actor = { id: "01K00000000000000000000001", role: "leader" };
const event = {
  id: 1,
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  title: "Synthetic event",
};
async function fixture(api = {}, verifier) {
  const store = createOfflineStore({
    name: `sync-test-${crypto.randomUUID()}`,
  });
  await store.saveEvent(actor, event, { verifiedOnline: true });
  const draft = await store.saveDraft(actor, {
    event_public_id: event.public_id,
    application: { first_name: "Synthetic", income_band_code: null },
    syntheticConfirmed: true,
  });
  await store.queue(actor, draft.client_submission_id);
  const verifyIdentity =
    verifier || vi.fn(async () => ({ actor, token: "synthetic-token" }));
  return {
    store,
    draft,
    verifyIdentity,
    sync: createManualSync({ store, api, verifyIdentity }),
  };
}
const receipt = (id) => ({
  items: [
    {
      client_submission_id: id,
      outcome: "accepted",
      code: "RECORDED",
      registration_status_at_recording: "pending",
    },
  ],
});
describe("manual sync and lost-response recovery", () => {
  it("sends nothing when fresh identity fails and leaves pending records intact", async () => {
    const api = { submitOfflineBatch: vi.fn() };
    const { sync, store } = await fixture(
      api,
      vi.fn().mockRejectedValue(new ApiError("unauthorized", "Expired", 401)),
    );
    await expect(sync.sync(actor, event.public_id)).rejects.toMatchObject({
      status: 401,
    });
    expect(api.submitOfflineBatch).not.toHaveBeenCalled();
    expect((await store.drafts(actor))[0].state).toBe("pending_sync");
    await store.close();
  });
  it("requires a fresh identity check before send and records server acceptance as pending", async () => {
    const api = {
      submitOfflineBatch: vi.fn(async (_, body) =>
        receipt(body.items[0].client_submission_id),
      ),
    };
    const { sync, store, verifyIdentity } = await fixture(api);
    await sync.sync(actor, event.public_id);
    expect(verifyIdentity).toHaveBeenCalledTimes(1);
    const [row] = await store.drafts(actor);
    expect(row.state).toBe("synced");
    expect(row.receipt.registration_status_at_recording).toBe("pending");
    expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
    await store.close();
  });
  it("keeps a lost response unknown and recovers a committed receipt using GET without replay", async () => {
    let saved;
    const api = {
      submitOfflineBatch: vi.fn(async (_, body) => {
        saved = structuredClone(body);
        throw new ApiError("network", "Lost response");
      }),
      getOfflineBatch: vi.fn(async () =>
        receipt(saved.items[0].client_submission_id),
      ),
    };
    const { sync, store, verifyIdentity } = await fixture(api);
    await expect(sync.sync(actor, event.public_id)).rejects.toMatchObject({
      kind: "network",
    });
    const [batch] = await store.batches(actor);
    expect((await store.drafts(actor))[0].state).toBe("needs_review");
    await sync.reconcile(actor, batch.batch_id);
    expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
    expect(api.getOfflineBatch).toHaveBeenCalledTimes(1);
    expect(verifyIdentity).toHaveBeenCalledTimes(2);
    expect((await store.drafts(actor))[0].state).toBe("synced");
    await store.close();
  });
  it("after explicit404 reconciliation repeats the exact saved request and IDs, with a fresh GET first", async () => {
    const bodies = [];
    let attempts = 0;
    const api = {
      submitOfflineBatch: vi.fn(async (_, body) => {
        bodies.push(JSON.stringify(body));
        if (!attempts++) throw new ApiError("network", "Lost before commit");
        return receipt(body.items[0].client_submission_id);
      }),
      getOfflineBatch: vi
        .fn()
        .mockRejectedValue(new ApiError("not_found", "Unknown batch", 404)),
    };
    const { sync, store, verifyIdentity } = await fixture(api);
    await expect(sync.sync(actor, event.public_id)).rejects.toBeInstanceOf(
      ApiError,
    );
    const [batch] = await store.batches(actor);
    await expect(sync.replayExact(actor, batch.batch_id)).rejects.toThrow(
      "Reconcile",
    );
    expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
    expect((await sync.reconcile(actor, batch.batch_id)).state).toBe(
      "not_found",
    );
    await sync.replayExact(actor, batch.batch_id);
    expect(bodies[0]).toBe(bodies[1]);
    expect(api.getOfflineBatch).toHaveBeenCalledTimes(2);
    expect(verifyIdentity).toHaveBeenCalledTimes(4);
    await store.close();
  });
  it("does not replay if a receipt appears between explicit reconciliation and Retry", async () => {
    let saved;
    const api = {
      submitOfflineBatch: vi.fn(async (_, body) => {
        saved = body;
        throw new ApiError("network", "Lost response");
      }),
      getOfflineBatch: vi
        .fn()
        .mockRejectedValueOnce(new ApiError("not_found", "Not found", 404))
        .mockImplementationOnce(async () =>
          receipt(saved.items[0].client_submission_id),
        ),
    };
    const { sync, store } = await fixture(api);
    await expect(sync.sync(actor, event.public_id)).rejects.toBeInstanceOf(
      ApiError,
    );
    const [batch] = await store.batches(actor);
    await sync.reconcile(actor, batch.batch_id);
    await sync.replayExact(actor, batch.batch_id);
    expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
    expect((await store.drafts(actor))[0].state).toBe("synced");
    await store.close();
  });
  it("blocks concurrent manual actions and does not automatically retry a rejected envelope", async () => {
    let reject;
    const api = {
      submitOfflineBatch: vi.fn(
        () =>
          new Promise((_, failed) => {
            reject = failed;
          }),
      ),
    };
    const { sync, store } = await fixture(api);
    const first = sync.sync(actor, event.public_id);
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    await expect(sync.sync(actor, event.public_id)).rejects.toThrow(
      "already in progress",
    );
    reject(new ApiError("validation", "Fingerprint conflict", 409));
    await expect(first).rejects.toMatchObject({ status: 409 });
    expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
    expect((await store.drafts(actor))[0].state).toBe("needs_review");
    await store.close();
  });
});
