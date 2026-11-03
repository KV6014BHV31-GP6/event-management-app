/** Manual-only coordinator. Every send/reconcile starts with fresh server identity. */
export function createManualSync({
  store,
  api,
  verifyIdentity,
  blockAuth = () => {},
}) {
  let busy = false;
  const guarded = async (operation) => {
    if (busy) throw new Error("A manual sync action is already in progress.");
    busy = true;
    try {
      return await operation();
    } finally {
      busy = false;
    }
  };
  async function record(actor, batch, receipt) {
    await store.applyReceipts(actor, batch.batch_id, receipt.items);
    return { state: "recorded", receipt };
  }
  async function unknown(actor, batch, error) {
    blockAuth(error.status);
    await store.markUnknown(
      actor,
      batch.batch_id,
      [401, 403].includes(error.status)
        ? "authentication_blocked"
        : "unknown_needs_reconcile",
    );
    throw error;
  }
  return {
    get busy() {
      return busy;
    },
    sync(actor, eventId) {
      return guarded(async () => {
        const verified = await verifyIdentity(actor);
        const batch = await store.prepareBatch(verified.actor, eventId);
        try {
          return await record(
            verified.actor,
            batch,
            await api.submitOfflineBatch(
              eventId,
              batch.request,
              verified.token,
              verified.actor,
            ),
          );
        } catch (error) {
          return unknown(actor, batch, error);
        }
      });
    },
    reconcile(actor, batchId) {
      return guarded(async () => {
        const verified = await verifyIdentity(actor);
        const batch = await store.batch(verified.actor, batchId);
        try {
          return await record(
            verified.actor,
            batch,
            await api.getOfflineBatch(
              batch.event_public_id,
              batch.request,
              verified.token,
              verified.actor,
            ),
          );
        } catch (error) {
          if (error.status === 404) {
            await store.markReconciledMissing(actor, batchId);
            return { state: "not_found" };
          }
          return unknown(actor, batch, error);
        }
      });
    },
    replayExact(actor, batchId) {
      return guarded(async () => {
        const verified = await verifyIdentity(actor);
        const batch = await store.batch(verified.actor, batchId);
        if (
          batch.state !== "needs_review" ||
          batch.reconcile_status !== "not_found"
        )
          throw new Error(
            "Reconcile this saved batch before an explicit same-ID retry.",
          );
        try {
          const receipt = await api.getOfflineBatch(
            batch.event_public_id,
            batch.request,
            verified.token,
            verified.actor,
          );
          return await record(verified.actor, batch, receipt);
        } catch (error) {
          if (error.status !== 404) return unknown(actor, batch, error);
        }
        await store.markReplayStarted(actor, batchId);
        try {
          return await record(
            verified.actor,
            batch,
            await api.submitOfflineBatch(
              batch.event_public_id,
              batch.request,
              verified.token,
              verified.actor,
            ),
          );
        } catch (error) {
          return unknown(actor, batch, error);
        }
      });
    },
  };
}
