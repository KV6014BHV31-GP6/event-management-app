import { locale, tr } from "./i18n/index.js";
import React, { useId, useRef, useState } from "react";
import { downloadEventCalendar, canAddToCalendar } from './event-calendar.js';
import { PRESENTER_TOOLS } from "./demo-transport.js";

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

function eventLink(publicId, origin, referralCode) {
  if (!origin || !/^[A-Za-z0-9_-]{21}$/.test(publicId)) return "";
  const url = new URL("/", origin);
  url.search = new URLSearchParams({ view: "event", event: publicId });
  if (/^[A-Za-z0-9_-]{24}$/.test(referralCode || "")) url.searchParams.set("ref", referralCode);
  return url.href;
}

function localDemoLink(event, referralCode) {
  const { origin, protocol, hostname } = globalThis.location;
  const loopback = hostname === "localhost" || hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname);
  return PRESENTER_TOOLS && loopback && ["http:", "https:"].includes(protocol)
    ? eventLink(event.public_id, origin, referralCode)
    : "";
}

export function publicShare(event, origin = globalThis.location.origin, referralCode) {
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
  const url = title?.trim() && schedule && event.location?.trim()
    ? eventLink(event.public_id, shareOrigin(origin), referralCode)
    : "";
  return { title, text, url, message: url ? `${text}\n${url}` : text };
}

function WhatsAppDemo({ text, url }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const closeButton = useRef(null);
  const titleId = useId();
  const noticeId = useId();
  const messageId = useId();
  const [status, setStatus] = useState("");
  const message = `${text}\n${url}`;
  const close = () => {
    dialog.current.close();
    trigger.current?.focus();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setStatus("Event share message copied.");
    } catch {
      setStatus("Copy is unavailable. Select and copy the message below.");
    }
  };
  return (
    <>
      <button ref={trigger} type="button" className="button button-quiet button-small"
        aria-haspopup="dialog"
        onClick={() => {
          setStatus("");
          dialog.current.showModal();
          closeButton.current?.focus();
        }}>
        {tr("WhatsApp demo")}
      </button>
      <dialog ref={dialog} className="document-viewer whatsapp-demo-dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={noticeId}
        onClose={() => trigger.current?.focus()}
        onCancel={(event) => { event.preventDefault(); close(); }}>
        <div className="section-heading">
          <h2 id={titleId}>{tr("WhatsApp demo")}</h2>
          <button ref={closeButton} type="button" className="button button-quiet button-small" onClick={close}>
            {tr("Close")}
          </button>
        </div>
        <p id={noticeId}>{tr("Simulated WhatsApp preview. No message was sent.")}</p>
        {status && <p className="notice" role="status">{tr(status)}</p>}
        <label htmlFor={messageId}>{tr("WhatsApp demo message")}</label>
        <textarea id={messageId} className="whatsapp-demo-message" rows={5} readOnly value={message} />
        <div className="form-actions">
          <button type="button" className="button button-small" onClick={copy}>{tr("Copy message")}</button>
          <a className="button button-quiet button-small" href={url}>{tr("Open event")}</a>
        </div>
      </dialog>
    </>
  );
}

export default function EventShare({ event, referralCode }) {
  const [message, setMessage] = useState("");
  const previewId = useId();
  const demoLinkId = useId();
  const demoUrl = localDemoLink(event, referralCode);
  const { title, text, url, message: preview } = publicShare(event, undefined, referralCode);
  const data = { title, text, url };
  let canShare = false;
  try {
    canShare = Boolean(url && globalThis.isSecureContext &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(data)));
  } catch {
    // Keep the selectable preview available when Web Share is blocked.
  }
  const copy = async (value, success, fallback = "Copy is unavailable. Select and copy the message below.") => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(success);
    } catch {
      setMessage(fallback);
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
      {canAddToCalendar(event) && <button type="button" className="button button-quiet button-small"
        onClick={() => downloadEventCalendar(event, url)}>
        {tr("Add to calendar")}
      </button>}
      {!url && <p className="small muted">
        {tr(demoUrl
          ? "This local demo link opens on this computer while the demo is running. Another phone cannot open it."
          : "Sharing is available on the HTTPS event site. This preview has no shareable link.")}
      </p>}
      {demoUrl && <>
        <label className="small" htmlFor={demoLinkId}>{tr("Local demo link")}</label>
        <input id={demoLinkId} className="public-share-link" type="url" readOnly value={demoUrl}
          onFocus={(event) => event.currentTarget.select()} />
        <div className="form-actions">
          <button type="button" className="button button-quiet button-small"
            onClick={() => copy(demoUrl, "Local demo link copied.",
              "Copy is unavailable. Select the local demo link and copy it manually.")}>
            {tr("Copy demo link")}
          </button>
        </div>
      </>}
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
        ) : demoUrl ? (
          <WhatsAppDemo text={text} url={demoUrl} />
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
