import { tr } from "../i18n/index.js";
import React, { useEffect, useRef, useState } from "react";
const messages = {
  offline_storage_full:
    "Device storage is full. This draft was not confirmed saved. Free space and check the local queue before saving again.",
  offline_storage_unavailable:
    "Local storage is unavailable. Private browsing, browser policy or device settings may prevent saving.",
  offline_synthetic_required:
    "Confirm that every value is synthetic before saving.",
  offline_identity_required:
    "Log in online as a community leader or organizer before using this workspace.",
  offline_reconcile_before_delete:
    "Reconcile this unknown server result before deleting the individual record, or explicitly delete all local data for this account.",
  offline_record_locked:
    "This queued record is immutable. Use an explicit new draft for a correction.",
};
const localMessage = (error) =>
  messages[error?.code] ||
  error?.message ||
  "The local operation could not be confirmed.";
const stateLabels = {
  draft: "Draft",
  pending_sync: "Pending sync",
  syncing: "Syncing",
  synced: "Synced — not approved",
  failed: "Failed",
  needs_review: "Needs review / reconcile",
};
export default function OfflineWorkspace({
  runtime,
  auth,
  initialEvent = "",
  navigate,
}) {
  const actor = auth.offlineActor;
  const [events, setEvents] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [eventId, setEventId] = useState(initialEvent);
  const [downloadId, setDownloadId] = useState(initialEvent);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [storage, setStorage] = useState(null);
  const [retentionDays, setRetentionDays] = useState(7);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const form = useRef(null);
  const submission = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const refresh = async () => {
    if (!actor) {
      setEvents([]);
      setDrafts([]);
      return;
    }
    const [savedEvents, savedDrafts] = await Promise.all([
      runtime.offline.events(actor),
      runtime.offline.drafts(actor),
    ]);
    setEvents(savedEvents);
    setDrafts(savedDrafts);
  };
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    return () => {
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  useEffect(() => {
    let current = true;
    if (!actor) {
      setEvents([]);
      setDrafts([]);
      return;
    }
    (async () => {
      try {
        await runtime.offline.purgeExpired(actor);
        await runtime.offline.recover(actor);
        if (current) await refresh();
      } catch (failure) {
        if (current) setError(localMessage(failure));
      }
    })();
    return () => {
      current = false;
    };
  }, [runtime, actor?.id]);
  const operate = async (operation) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      await refresh();
    } catch (failure) {
      setError(localMessage(failure));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const download = () =>
    operate(async () => {
      if (!online) throw new Error("Reconnect before downloading an event.");
      const verified = await runtime.freshOfflineIdentity(actor);
      const event = await runtime.api.getEvent(downloadId);
      await runtime.offline.saveEvent(verified.actor, event, {
        verifiedOnline: true,
      });
      setEventId(event.public_id);
      setMessage(
        "Public event details downloaded and read back locally. Availability may change while offline.",
      );
    });
  const save = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    operate(async () => {
      await runtime.offline.saveDraft(actor, {
        event_public_id: eventId,
        application: values,
        client_submission_id: submission.current,
        syntheticConfirmed: consent,
        retentionDays,
      });
      setMessage(
        "Synthetic draft saved and read back from this device. Nothing has been sent to the server.",
      );
      form.current?.reset();
      setConsent(false);
      submission.current = crypto.randomUUID();
    });
  };
  const inspectStorage = async (persist = false) => {
    try {
      const retained = persist
        ? await navigator.storage?.persist?.()
        : await navigator.storage?.persisted?.();
      const estimate = await navigator.storage?.estimate?.();
      setStorage({
        retained: Boolean(retained),
        usage: estimate?.usage ?? null,
        quota: estimate?.quota ?? null,
      });
    } catch {
      setError(
        "This browser cannot report or persist local storage. Keep a separate synthetic test record.",
      );
    }
  };
  const selected = events.find((row) => row.event.public_id === eventId)?.event;
  return (
    <section className="offline-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{tr("LOCAL SYNTHETIC WORKSPACE")}</p>
          <h1>{tr("Offline registration drafts")}</h1>
          <p className="muted">
            {tr(
              "Capture synthetic test data on this device, then manually sync after reconnecting.",
            )}
          </p>
        </div>
        <span
          className={`status ${online ? "status-active" : "status-pending"}`}
        >
          {online ? tr("Connection available") : tr("Offline")}
        </span>
      </div>
      <div className="notice notice-error">
        <strong>{tr("SYNTHETIC DATA ONLY")}</strong>
        <p>
          {tr(
            "Do not enter real names, identity numbers, phone numbers, health information or documents. IndexedDB is not encrypted. Anyone with access to this device or browser tools may read local data.",
          )}
        </p>
        <p>
          {tr(
            "Browser eviction, private browsing, cleared site data or device failure can erase unsynced drafts. This localhost demonstration does not prove LAN, iPhone or production offline readiness.",
          )}
        </p>
      </div>
      {!actor ? (
        <div className="empty-state">
          <h2>{tr("Online login required to unlock local drafts")}</h2>
          <p>
            {tr(
              "Log in as the same leader or organizer that captured them. Logout retains drafts but locks access. A different account cannot open that queue through this app.",
            )}
          </p>
          <button className="button" onClick={() => navigate("login")}>
            {tr("Log in online")}
          </button>
        </div>
      ) : (
        <>
          <div className="notice">
            <strong>
              {auth.user
                ? tr("Account verified for this page")
                : tr("Cached local identity only")}
            </strong>
            <p>
              {tr(
                "Local capture may use your last verified identity. Every sync and event download requires a fresh online account and role check. Logout locks retained drafts; it does not encrypt them.",
              )}
            </p>
          </div>
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
          <section className="form-surface offline-download">
            <h2>{tr("1. Download public event details")}</h2>
            <p className="small muted">
              {tr(
                "Download while online before capturing drafts. Only the selected event\u2019s public details are saved.",
              )}
            </p>
            <div className="offline-download-controls">
              <label className="field">
                <span>{tr("Event public reference")}</span>
                <input
                  value={downloadId}
                  onChange={(event) => setDownloadId(event.target.value)}
                  placeholder={tr("21-character public event ID")}
                  maxLength={21}
                />
              </label>
              <button
                className="button"
                onClick={download}
                disabled={busy || !online || downloadId.length !== 21}
              >
                {tr("Download selected event")}
              </button>
            </div>
          </section>
          <div className="editor-layout offline-capture">
            <section className="form-surface">
              <h2>{tr("2. Capture a synthetic draft")}</h2>
              <label className="field">
                <span>{tr("Downloaded event")}</span>
                <select
                  value={eventId}
                  onChange={(event) => setEventId(event.target.value)}
                  disabled={busy}
                >
                  <option value="">{tr("Choose a downloaded event")}</option>
                  {events.map((row) => (
                    <option
                      key={row.event.public_id}
                      value={row.event.public_id}
                    >
                      {row.event.title}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <p className="small muted">
                  {selected.location}{" "}
                  {tr("\xB7 Downloaded availability is not a reservation.")}
                </p>
              )}
              <form
                method="dialog"
                ref={form}
                onSubmit={save}
                autoComplete="off"
              >
                <fieldset disabled={busy || !selected}>
                  <legend className="sr-only">
                    {tr("Synthetic participant details")}
                  </legend>
                  <div className="form-grid">
                    {[
                      ["first_name", "First name"],
                      ["last_name", "Last name"],
                      ["phone", "Phone"],
                      ["national_id", "National ID"],
                    ].map(([name, label]) => (
                      <label className="field" key={name}>
                        <span>{label}</span>
                        <input
                          name={name}
                          required
                          maxLength={name === "national_id" ? 50 : 20}
                        />
                      </label>
                    ))}
                    <label className="field">
                      <span>{tr("Gender")}</span>
                      <select name="gender" required defaultValue="">
                        <option value="" disabled>
                          {tr("Choose an option")}
                        </option>
                        <option value="female">{tr("Female")}</option>
                        <option value="male">{tr("Male")}</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{tr("Date of birth")}</span>
                      <input name="date_of_birth" type="date" required />
                    </label>
                    <label className="field field-wide">
                      <span>{tr("Address")}</span>
                      <textarea name="address" required rows={2} />
                    </label>
                  </div>
                  <label className="field">
                    <span>{tr("Local retention")}</span>
                    <select
                      value={retentionDays}
                      onChange={(event) =>
                        setRetentionDays(Number(event.target.value))
                      }
                    >
                      <option value="7">{tr("7 days")}</option>
                      <option value="1">{tr("1 day")}</option>
                    </select>
                    <small>
                      {tr(
                        "Expired local drafts are deleted when this account\u2019s workspace opens, including unsynced records.",
                      )}
                    </small>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    {tr("I confirm every value is synthetic test data.")}
                  </label>
                  <button
                    className="button"
                    type="submit"
                    disabled={!consent || busy || !selected}
                  >
                    {tr("Save draft on this device")}
                  </button>
                </fieldset>
              </form>
            </section>
            <aside className="form-context">
              <h3>{tr("Local storage")}</h3>
              <p>
                {tr(
                  "No automatic background sync runs. Saving locally does not submit an application or confirm a place.",
                )}
              </p>
              <button
                className="text-button"
                onClick={() => inspectStorage(false)}
              >
                {tr("Check storage")}
              </button>
              <button
                className="text-button"
                onClick={() => inspectStorage(true)}
              >
                {tr("Request persistent storage")}
              </button>
              {storage && (
                <p className="small">
                  {storage.retained
                    ? tr("Persistence granted by browser.")
                    : tr("Persistence not granted; eviction remains possible.")}
                  {storage.quota !== null &&
                    ` ${Math.round(storage.usage / 1024)} KiB used of ${Math.round(storage.quota / 1024)} KiB reported.`}
                </p>
              )}
            </aside>
          </div>
          <section className="offline-queue">
            <div className="section-heading">
              <h2>{tr("3. Local queue")}</h2>
              <button
                className="button button-quiet button-small"
                disabled={busy}
                onClick={() => operate(refresh)}
              >
                {tr("Read local records")}
              </button>
            </div>
            <p className="small muted">
              {drafts.length}{" "}
              {tr(
                "local records. Names and identity details are hidden from this summary. Synced means recorded by the server, not approved.",
              )}
            </p>
            <div className="registration-list">
              {drafts.map((draft, index) => (
                <article
                  className="registration-row"
                  key={draft.client_submission_id}
                >
                  <div className="record-main">
                    <h3>
                      {tr("Local synthetic draft")} {index + 1}
                    </h3>
                    <p className="small muted">
                      {tr("Reference ending")}{" "}
                      {draft.client_submission_id.slice(-8)}
                    </p>
                    <p className="small muted">
                      {events.find(
                        (row) => row.event.public_id === draft.event_public_id,
                      )?.event.title || "Downloaded event"}
                    </p>
                    {draft.reason_code && (
                      <p className="small muted">
                        {draft.reason_code === "unknown_needs_reconcile"
                          ? tr(
                              "Unknown result after restart. Reconcile before another send.",
                            )
                          : tr(
                              "Review the server outcome before starting a new draft.",
                            )}
                      </p>
                    )}
                  </div>
                  <span className="status">{stateLabels[draft.state]}</span>
                  <div className="record-actions">
                    {draft.state === "draft" && (
                      <button
                        className="button button-small"
                        disabled={busy}
                        onClick={() =>
                          operate(async () => {
                            await runtime.offline.queue(
                              actor,
                              draft.client_submission_id,
                            );
                            setMessage(
                              "Draft added to the local pending queue. Nothing has been sent.",
                            );
                          })
                        }
                      >
                        {tr("Queue for manual sync")}
                      </button>
                    )}
                    {!["syncing", "needs_review"].includes(draft.state) && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          operate(() =>
                            runtime.offline.deleteDraft(
                              actor,
                              draft.client_submission_id,
                            ),
                          )
                        }
                      >
                        {tr("Delete local draft")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled
                title={tr("The admitted sync adapter is being connected.")}
              >
                {tr("Manual sync \u2014 not connected yet")}
              </button>
            </div>
          </section>
          <section className="offline-data-controls">
            <h2>{tr("Delete local data")}</h2>
            <p className="small muted">
              {tr(
                "Deletes downloaded events, drafts and local receipts for this account on this device. It does not cancel server registrations. Unknown results may still exist on the server.",
              )}
            </p>
            {deleteConfirm ? (
              <div className="form-actions">
                <button
                  className="button button-quiet"
                  disabled={busy}
                  onClick={() =>
                    operate(async () => {
                      await runtime.offline.deleteActor(actor, {
                        confirmed: true,
                      });
                      setDeleteConfirm(false);
                      setMessage(
                        "This account’s local data was deleted. Server registrations were not changed.",
                      );
                    })
                  }
                >
                  {tr("Confirm delete all local data")}
                </button>
                <button
                  className="text-button"
                  onClick={() => setDeleteConfirm(false)}
                >
                  {tr("Keep local data")}
                </button>
              </div>
            ) : (
              <button
                className="button button-quiet"
                disabled={busy}
                onClick={() => setDeleteConfirm(true)}
              >
                {tr("Delete all local data for this account")}
              </button>
            )}
          </section>
        </>
      )}
    </section>
  );
}
