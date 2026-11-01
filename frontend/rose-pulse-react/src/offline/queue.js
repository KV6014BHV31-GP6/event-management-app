import { openDB } from "idb";

export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_STATES = [
  "draft",
  "pending_sync",
  "syncing",
  "synced",
  "failed",
  "needs_review",
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^[A-Za-z0-9_-]{21}$/;
const allowedFields = [
  "first_name",
  "last_name",
  "gender",
  "date_of_birth",
  "phone",
  "address",
  "national_id",
  "income_band_code",
  "marriage_status",
  "medical_record",
  "file_ids",
];
export class LocalStoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const requireActor = (actor) => {
  if (
    !actor ||
    typeof actor.id !== "string" ||
    !["organizer", "leader"].includes(actor.role)
  )
    throw new LocalStoreError("offline_identity_required");
  return actor.id;
};
const requireUUID = (value) => {
  if (!UUID.test(value) || value !== value.toLowerCase())
    throw new LocalStoreError("offline_invalid_reference");
};
const keyFor = (actor, id) => `${actor}:${id}`;
const safeFailure = (error) => {
  throw error instanceof LocalStoreError
    ? error
    : new LocalStoreError(
        error?.name === "QuotaExceededError"
          ? "offline_storage_full"
          : "offline_storage_unavailable",
      );
};
const applicationCopy = (input) => {
  const copy = Object.fromEntries(
    allowedFields
      .filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, input[key]]),
  );
  if (
    Object.values(copy).some(
      (value) => value !== null && !["string", "object"].includes(typeof value),
    )
  )
    throw new LocalStoreError("offline_invalid_application");
  if (
    copy.file_ids &&
    (!Array.isArray(copy.file_ids) ||
      copy.file_ids.length > 3 ||
      copy.file_ids.some((id) => typeof id !== "string"))
  )
    throw new LocalStoreError("offline_invalid_application");
  return structuredClone(copy);
};

/** Actor partitioning is a UI boundary, not encryption or protection from device access. */
export function createOfflineStore({
  name = "rose-pulse-offline-v1",
  now = () => Date.now(),
  uuid = () => crypto.randomUUID(),
} = {}) {
  let opening;
  const db = () =>
    (opening ||= openDB(name, OFFLINE_DB_VERSION, {
      upgrade(database) {
        for (const store of ["events", "drafts", "batches"]) {
          const table = database.createObjectStore(store, { keyPath: "key" });
          table.createIndex("actor_id", "actor_id");
        }
      },
      blocked() {
        /* Keep existing data; UI operations report unavailable rather than deleting it. */
      },
    }));
  async function getOwned(store, actor, id) {
    const actorId = requireActor(actor);
    const row = await (await db()).get(store, keyFor(actorId, id));
    if (!row || row.actor_id !== actorId)
      throw new LocalStoreError("offline_record_unavailable");
    return row;
  }
  async function saveReadback(store, row) {
    const database = await db();
    await database.put(store, row);
    const read = await database.get(store, row.key);
    if (!read || read.updated_at !== row.updated_at)
      throw new LocalStoreError("offline_readback_failed");
    return read;
  }
  const api = {
    async saveEvent(actor, event, { verifiedOnline = false } = {}) {
      try {
        const actorId = requireActor(actor);
        if (
          !verifiedOnline ||
          !PUBLIC_ID.test(event?.public_id) ||
          !Number.isSafeInteger(event.id)
        )
          throw new LocalStoreError("offline_online_verification_required");
        const publicEvent = Object.fromEntries(
          [
            "id",
            "public_id",
            "title",
            "overview",
            "location",
            "start_time",
            "end_time",
            "status",
            "online_quota",
            "offline_quota",
          ].map((key) => [key, event[key]]),
        );
        return await saveReadback("events", {
          key: keyFor(actorId, event.public_id),
          actor_id: actorId,
          event: publicEvent,
          updated_at: now(),
          downloaded_at: now(),
        });
      } catch (error) {
        return safeFailure(error);
      }
    },
    async events(actor) {
      try {
        return await (
          await db()
        ).getAllFromIndex("events", "actor_id", requireActor(actor));
      } catch (error) {
        return safeFailure(error);
      }
    },
    async drafts(actor) {
      try {
        return (
          await (
            await db()
          ).getAllFromIndex("drafts", "actor_id", requireActor(actor))
        ).sort((a, b) => b.created_at - a.created_at);
      } catch (error) {
        return safeFailure(error);
      }
    },
    async saveDraft(
      actor,
      {
        event_public_id,
        application,
        client_submission_id,
        syntheticConfirmed,
        retentionDays = 7,
      },
    ) {
      try {
        const actorId = requireActor(actor);
        if (!syntheticConfirmed || ![1, 7].includes(retentionDays))
          throw new LocalStoreError("offline_synthetic_required");
        await getOwned("events", actor, event_public_id);
        const id = client_submission_id || uuid();
        requireUUID(id);
        const existing = await (await db()).get("drafts", keyFor(actorId, id));
        if (existing && existing.state !== "draft")
          throw new LocalStoreError("offline_record_locked");
        const timestamp = now();
        return await saveReadback("drafts", {
          key: keyFor(actorId, id),
          actor_id: actorId,
          actor_role: actor.role,
          event_public_id,
          client_submission_id: id,
          application: applicationCopy(application),
          state: "draft",
          batch_id: null,
          reason_code: null,
          receipt: null,
          created_at: existing?.created_at ?? timestamp,
          updated_at: timestamp,
          expires_at:
            existing?.expires_at ?? timestamp + retentionDays * 86400000,
          synthetic_only: true,
        });
      } catch (error) {
        return safeFailure(error);
      }
    },
    async queue(actor, id) {
      try {
        const row = await getOwned("drafts", actor, id);
        if (row.state !== "draft")
          throw new LocalStoreError("offline_record_locked");
        return await saveReadback("drafts", {
          ...row,
          state: "pending_sync",
          updated_at: now(),
        });
      } catch (error) {
        return safeFailure(error);
      }
    },
    async prepareBatch(actor, eventId) {
      try {
        const actorId = requireActor(actor);
        const database = await db();
        const transaction = database.transaction(
          ["drafts", "batches"],
          "readwrite",
        );
        const entries = (
          await transaction
            .objectStore("drafts")
            .index("actor_id")
            .getAll(actorId)
        )
          .filter(
            (row) =>
              row.event_public_id === eventId &&
              row.state === "pending_sync" &&
              !row.batch_id,
          )
          .slice(0, 25);
        if (!entries.length) {
          await transaction.done;
          throw new LocalStoreError("offline_no_pending");
        }
        const batchId = uuid();
        requireUUID(batchId);
        const timestamp = now();
        const batch = {
          key: keyFor(actorId, batchId),
          actor_id: actorId,
          event_public_id: eventId,
          batch_id: batchId,
          client_submission_ids: entries.map((row) => row.client_submission_id),
          state: "syncing",
          created_at: timestamp,
          updated_at: timestamp,
          expires_at: Math.min(...entries.map((row) => row.expires_at)),
          request: {
            contract_version: "rose.offline-sync.v2",
            batch_id: batchId,
            items: entries.map((row) => ({
              client_submission_id: row.client_submission_id,
              application: structuredClone(row.application),
            })),
          },
        };
        for (const row of entries)
          await transaction.objectStore("drafts").put({
            ...row,
            batch_id: batchId,
            state: "syncing",
            updated_at: timestamp,
          });
        await transaction.objectStore("batches").put(batch);
        await transaction.done;
        return await api.batch(actor, batchId);
      } catch (error) {
        return safeFailure(error);
      }
    },
    async batch(actor, id) {
      try {
        requireUUID(id);
        const batch = await getOwned("batches", actor, id);
        const items = await Promise.all(
          batch.client_submission_ids.map((submission) =>
            getOwned("drafts", actor, submission),
          ),
        );
        return { ...batch, items };
      } catch (error) {
        return safeFailure(error);
      }
    },
    async batches(actor) {
      try {
        return await (
          await db()
        ).getAllFromIndex("batches", "actor_id", requireActor(actor));
      } catch (error) {
        return safeFailure(error);
      }
    },
    async markUnknown(actor, id, reason = "unknown_needs_reconcile") {
      try {
        const batch = await api.batch(actor, id);
        const transaction = (await db()).transaction(
          ["drafts", "batches"],
          "readwrite",
        );
        const timestamp = now();
        for (const item of batch.items)
          if (item.state !== "synced")
            await transaction.objectStore("drafts").put({
              ...item,
              state: "needs_review",
              reason_code: reason,
              updated_at: timestamp,
            });
        const { items, ...saved } = batch;
        await transaction.objectStore("batches").put({
          ...saved,
          state: "needs_review",
          reason_code: reason,
          updated_at: timestamp,
        });
        await transaction.done;
      } catch (error) {
        return safeFailure(error);
      }
    },
    async markReconciledMissing(actor, id) {
      const batch = await api.batch(actor, id);
      const { items, ...saved } = batch;
      await api.markUnknown(actor, id);
      return saveReadback("batches", {
        ...saved,
        state: "needs_review",
        reconcile_status: "not_found",
        updated_at: now(),
      });
    },
    async markReplayStarted(actor, id) {
      const batch = await api.batch(actor, id);
      if (
        batch.state !== "needs_review" ||
        batch.reconcile_status !== "not_found"
      )
        throw new LocalStoreError("offline_record_locked");
      const transaction = (await db()).transaction(
        ["drafts", "batches"],
        "readwrite",
      );
      const timestamp = now();
      for (const item of batch.items)
        await transaction
          .objectStore("drafts")
          .put({ ...item, state: "syncing", updated_at: timestamp });
      const { items, ...saved } = batch;
      await transaction
        .objectStore("batches")
        .put({
          ...saved,
          state: "syncing",
          reconcile_status: null,
          updated_at: timestamp,
        });
      await transaction.done;
    },
    async recover(actor) {
      try {
        const batches = await api.batches(actor);
        for (const batch of batches.filter((row) => row.state === "syncing"))
          await api.markUnknown(actor, batch.batch_id);
        return await api.drafts(actor);
      } catch (error) {
        return safeFailure(error);
      }
    },
    async applyReceipts(actor, id, receipts) {
      try {
        const batch = await api.batch(actor, id);
        if (
          !Array.isArray(receipts) ||
          receipts.length !== batch.items.length ||
          new Set(receipts.map((row) => row.client_submission_id)).size !==
            receipts.length ||
          receipts.some(
            (row) =>
              !batch.client_submission_ids.includes(row.client_submission_id) ||
              !["accepted", "rejected", "duplicate"].includes(row.outcome),
          )
        )
          throw new LocalStoreError("offline_invalid_receipt");
        const transaction = (await db()).transaction(
          ["drafts", "batches"],
          "readwrite",
        );
        const timestamp = now();
        for (const item of batch.items) {
          const receipt = receipts.find(
            (row) => row.client_submission_id === item.client_submission_id,
          );
          await transaction.objectStore("drafts").put({
            ...item,
            state:
              receipt.outcome === "accepted"
                ? "synced"
                : receipt.outcome === "duplicate"
                  ? "needs_review"
                  : "failed",
            receipt: structuredClone(receipt),
            reason_code: receipt.code ?? null,
            updated_at: timestamp,
          });
        }
        const { items, ...saved } = batch;
        await transaction
          .objectStore("batches")
          .put({ ...saved, state: "synced", updated_at: timestamp });
        await transaction.done;
        return await api.drafts(actor);
      } catch (error) {
        return safeFailure(error);
      }
    },
    async deleteDraft(actor, id) {
      try {
        const row = await getOwned("drafts", actor, id);
        if (row.batch_id)
          throw new LocalStoreError("offline_reconcile_before_delete");
        await (await db()).delete("drafts", row.key);
      } catch (error) {
        return safeFailure(error);
      }
    },
    async deleteActor(actor, { confirmed = false } = {}) {
      try {
        const actorId = requireActor(actor);
        if (!confirmed)
          throw new LocalStoreError("offline_delete_confirmation");
        const transaction = (await db()).transaction(
          ["drafts", "events", "batches"],
          "readwrite",
        );
        for (const store of ["drafts", "events", "batches"])
          for (const key of await transaction
            .objectStore(store)
            .index("actor_id")
            .getAllKeys(actorId))
            await transaction.objectStore(store).delete(key);
        await transaction.done;
      } catch (error) {
        return safeFailure(error);
      }
    },
    async purgeExpired(actor) {
      try {
        const entries = await api.drafts(actor);
        const batches = await api.batches(actor);
        const expiredBatches = new Set(
          batches
            .filter((batch) => batch.expires_at <= now())
            .map((batch) => batch.batch_id),
        );
        let count = 0;
        const transaction = (await db()).transaction(
          ["drafts", "batches"],
          "readwrite",
        );
        for (const item of entries)
          if (item.expires_at <= now() || expiredBatches.has(item.batch_id)) {
            await transaction.objectStore("drafts").delete(item.key);
            count++;
          }
        for (const batch of batches)
          if (expiredBatches.has(batch.batch_id))
            await transaction.objectStore("batches").delete(batch.key);
        await transaction.done;
        return count;
      } catch (error) {
        return safeFailure(error);
      }
    },
    async close() {
      if (opening) (await opening).close();
      opening = undefined;
    },
  };
  return api;
}
