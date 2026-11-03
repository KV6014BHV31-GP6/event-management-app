import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createOfflineStore } from "./queue.js";
const actor = { id: "SYNTHETIC-ACTOR-A", role: "leader" };
const other = { id: "SYNTHETIC-ACTOR-B", role: "organizer" };
const event = {
  id: 1,
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  title: "Synthetic test event",
  status: "active",
  token: "must-not-save",
  medical_record: "must-not-save",
};
const application = {
  first_name: "Synthetic",
  last_name: "Example",
  phone: "TEST",
  address: "Synthetic only",
  national_id: "SYNTHETIC-001",
  gender: "female",
  date_of_birth: "1990-01-01",
};
const store = () =>
  createOfflineStore({ name: `synthetic-${crypto.randomUUID()}` });
async function saved(db, owner = actor, extra = {}) {
  await db.saveEvent(owner, event, { verifiedOnline: true });
  return db.saveDraft(owner, {
    event_public_id: event.public_id,
    application,
    syntheticConfirmed: true,
    ...extra,
  });
}
describe("versioned actor-scoped IndexedDB queue", () => {
  it("requires actual online verification before downloading only public event fields", async () => {
    const db = store();
    await expect(db.saveEvent(actor, event)).rejects.toMatchObject({
      code: "offline_online_verification_required",
    });
    await db.saveEvent(actor, event, { verifiedOnline: true });
    const [read] = await db.events(actor);
    expect(read.event.token).toBeUndefined();
    expect(read.event.medical_record).toBeUndefined();
    await db.close();
  });
  it("persists three drafts across a closed connection with the same submission UUIDs", async () => {
    const name = `synthetic-${crypto.randomUUID()}`;
    let db = createOfflineStore({ name });
    const expected = [];
    for (let index = 0; index < 3; index++)
      expected.push((await saved(db)).client_submission_id);
    await db.close();
    db = createOfflineStore({ name });
    expect(
      (await db.drafts(actor)).map((row) => row.client_submission_id).sort(),
    ).toEqual(expected.sort());
    await db.close();
  });
  it("never shows or mutates another actor’s queue and rejects participant access", async () => {
    const db = store();
    const draft = await saved(db);
    expect(await db.drafts(other)).toEqual([]);
    await expect(
      db.queue(other, draft.client_submission_id),
    ).rejects.toMatchObject({ code: "offline_record_unavailable" });
    await expect(
      db.drafts({ id: actor.id, role: "user" }),
    ).rejects.toMatchObject({ code: "offline_identity_required" });
    await db.close();
  });
  it("requires synthetic confirmation and keeps a stable ID for repeated local saves", async () => {
    const db = store();
    await db.saveEvent(actor, event, { verifiedOnline: true });
    await expect(
      db.saveDraft(actor, { event_public_id: event.public_id, application }),
    ).rejects.toMatchObject({ code: "offline_synthetic_required" });
    const first = await saved(db);
    await saved(db, actor, {
      client_submission_id: first.client_submission_id,
      application: { ...application, first_name: "Synthetic edited" },
    });
    expect(await db.drafts(actor)).toHaveLength(1);
    await db.close();
  });
  it("freezes queued payloads instead of correcting the same submission ID", async () => {
    const db = store();
    const draft = await saved(db);
    await db.queue(actor, draft.client_submission_id);
    await expect(
      saved(db, actor, {
        client_submission_id: draft.client_submission_id,
        application: { ...application, first_name: "Changed" },
      }),
    ).rejects.toMatchObject({ code: "offline_record_locked" });
    await db.close();
  });
  it("persists batch and submission IDs before a send and recovers stale syncing as unknown", async () => {
    const db = store();
    const draft = await saved(db);
    await db.queue(actor, draft.client_submission_id);
    const batch = await db.prepareBatch(actor, event.public_id);
    expect(batch.items[0]).toMatchObject({
      batch_id: batch.batch_id,
      client_submission_id: draft.client_submission_id,
      state: "syncing",
    });
    await db.recover(actor);
    const [recovered] = await db.drafts(actor);
    expect(recovered).toMatchObject({
      state: "needs_review",
      reason_code: "unknown_needs_reconcile",
      batch_id: batch.batch_id,
      client_submission_id: draft.client_submission_id,
    });
    expect(
      (await db.batch(actor, batch.batch_id)).items[0].application,
    ).toEqual(application);
    await db.close();
  });
  it("distinguishes omitted values, null and empty strings in immutable saved applications", async () => {
    const db = store();
    for (const extra of [
      {},
      { income_band_code: null },
      { income_band_code: "" },
    ]) {
      const row = await saved(db, actor, {
        application: { ...application, ...extra },
      });
      expect(Object.hasOwn(row.application, "income_band_code")).toBe(
        Object.hasOwn(extra, "income_band_code"),
      );
      expect(row.application.income_band_code).toBe(extra.income_band_code);
    }
    await db.close();
  });
  it("does not apply partial or malformed receipts and records accepted as synced, never approved", async () => {
    const db = store();
    const draft = await saved(db);
    await db.queue(actor, draft.client_submission_id);
    const batch = await db.prepareBatch(actor, event.public_id);
    await expect(
      db.applyReceipts(actor, batch.batch_id, []),
    ).rejects.toMatchObject({ code: "offline_invalid_receipt" });
    expect((await db.drafts(actor))[0].state).toBe("syncing");
    await db.applyReceipts(actor, batch.batch_id, [
      {
        client_submission_id: draft.client_submission_id,
        outcome: "accepted",
        code: "RECORDED",
        registration_status_at_recording: "pending",
      },
    ]);
    const [read] = await db.drafts(actor);
    expect(read.state).toBe("synced");
    expect(read.receipt.registration_status_at_recording).toBe("pending");
    await db.close();
  });
  it("keeps duplicate outcomes for review rather than representing them as a new success", async () => {
    const db = store();
    const draft = await saved(db);
    await db.queue(actor, draft.client_submission_id);
    const batch = await db.prepareBatch(actor, event.public_id);
    await db.applyReceipts(actor, batch.batch_id, [
      {
        client_submission_id: draft.client_submission_id,
        outcome: "duplicate",
        code: "ALREADY_REGISTERED",
        registration_id: null,
      },
    ]);
    expect((await db.drafts(actor))[0].state).toBe("needs_review");
    await db.close();
  });
  it("requires explicit delete-all confirmation and preserves other actor data", async () => {
    const db = store();
    await saved(db);
    await saved(db, other);
    await expect(db.deleteActor(actor)).rejects.toMatchObject({
      code: "offline_delete_confirmation",
    });
    await db.deleteActor(actor, { confirmed: true });
    expect(await db.drafts(actor)).toEqual([]);
    expect(await db.events(actor)).toEqual([]);
    expect(await db.drafts(other)).toHaveLength(1);
    await db.close();
  });
  it("expires unsynced synthetic drafts under their explicitly chosen retention", async () => {
    let timestamp = 1;
    const db = createOfflineStore({
      name: `synthetic-${crypto.randomUUID()}`,
      now: () => timestamp,
    });
    await saved(db, actor, { retentionDays: 1 });
    timestamp += 86400001;
    expect(await db.purgeExpired(actor)).toBe(1);
    expect(await db.drafts(actor)).toEqual([]);
    await db.close();
  });
});
