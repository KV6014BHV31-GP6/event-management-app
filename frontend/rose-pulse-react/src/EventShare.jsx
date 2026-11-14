import { locale, tr } from "./i18n/index.js";
import React, { useId, useState } from "react";

function shareOrigin(value) {
  try {
    const address = new URL(value);
    const host = address.hostname.replace(/\.$/, "");
    if (
      address.origin === value &&
      address.protocol === "https:" &&
      !address.port &&
      host.includes(".") &&
      !/^[\d.]+$/.test(host) &&
      !/^localhost\./.test(host) &&
      !/\.(?:localhost|local|localdomain|test|invalid|example)$/.test(host)
    ) return address.origin;
  } catch {
    // An invalid origin has no external share destination.
  }
  return "";
}

export function publicShare(event, origin = globalThis.location.origin) {
  const title = event.title;
  const zone = event.workflow?.timezone || "UTC";
  let schedule = "";
  try {
    const format = new Intl.DateTimeFormat(locale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    });
    if (event.start_time && event.end_time)
      schedule = `${format.format(new Date(event.start_time))} – ${format.format(new Date(event.end_time))} (${zone})`;
  } catch {
    // Display only verified schedule data.
  }
  const text = [title, schedule, event.location].filter(Boolean).join("\n");
  const base = shareOrigin(origin);
  if (!base || !title?.trim() || !schedule || !event.location?.trim() ||
      !/^[A-Za-z0-9_-]{21}$/.test(event.public_id))
    return { title, text, url: "", message: text };

  const url = new URL("/", base);
  url.search = new URLSearchParams({ view: "event", event: event.public_id });
  return { title, text, url: url.href, message: `${text}\n${url.href}` };
}

export default function EventShare({ event }) {
  const [message, setMessage] = useState("");
  const previewId = useId();
  const { title, text, url, message: preview } = publicShare(event);
  const data = { title, text, url };
  let canShare = false;
  try {
    canShare = Boolean(url && globalThis.isSecureContext &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(data)));
  } catch {
    // Keep the selectable preview available when Web Share is blocked.
  }
  const copy = async (value, success) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(success);
    } catch {
      setMessage("Copy is unavailable. Select and copy the message below.");
    }
  };
  const messages = async () => {
    if (!canShare) return;
    try {
      // The native call must run in the original click, before any await.
      await navigator.share(data);
      setMessage("Handed off to the system share sheet.");
    } catch (error) {
      setMessage(error?.name === "AbortError"
        ? "Sharing cancelled."
        : "The system share sheet could not open. Copy the message below.");
    }
  };
  return (
    <section className="event-share">
      <h3>{tr("Share this event")}</h3>
      {!url && <p className="small muted">
        {tr("Sharing is available on the HTTPS event site. This preview has no shareable link.")}
      </p>}
      <div className="form-actions">
        {url ? (
          <a
            className="button button-quiet button-small"
            href={`https://wa.me/?text=${encodeURIComponent(preview)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMessage("Opening WhatsApp. Choose a recipient there.")}
          >
            {tr("Share on WhatsApp")}
          </a>
        ) : (
          <button type="button" className="button button-quiet button-small" disabled>
            {tr("Share on WhatsApp")}
          </button>
        )}
        <button type="button" className="button button-quiet button-small" disabled={!canShare} onClick={messages}>
          {tr("Messages / SMS")}
        </button>
        <button type="button" className="button button-quiet button-small" disabled={!url}
          onClick={() => copy(url, "Public event link copied.")}>
          {tr("Copy event link")}
        </button>
        <button type="button" className="button button-quiet button-small" disabled={!url}
          onClick={() => copy(preview, "Event share message copied.")}>
          {tr("Copy share message")}
        </button>
      </div>
      {url && <p className="small muted">
        {tr(canShare
          ? "Choose Messages in the system share sheet. Your device chooses the delivery channel."
          : "The system share sheet is unavailable here. Copy the message and paste it into Messages.")}
      </p>}
      {url && new URL(url).hostname.endsWith(".ts.net") &&
        <p className="small muted">{tr("Recipients need access to this private event site.")}</p>}
      <label className="small" htmlFor={previewId}>{tr("Event share message")}</label>
      <textarea id={previewId} className="public-share-link" readOnly value={preview} rows={4} />
      {message && <p className="notice" role="status">{tr(message)}</p>}
    </section>
  );
}
