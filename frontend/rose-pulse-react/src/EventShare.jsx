import { tr } from "./i18n/index.js";
import React, { useState } from "react";
export function publicShare(event, origin = window.location.origin) {
  const url = new URL("/", origin);
  url.search = new URLSearchParams({
    view: "event",
    event: event.public_id,
  }).toString();
  return {
    url: url.href,
    text: `${event.title}\n${url.href}`,
  };
}
export default function EventShare({ event }) {
  const [message, setMessage] = useState("");
  const share = publicShare(event);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(
    window.location.hostname,
  );
  return (
    <section className="event-share">
      <h3>{tr("Share this event")}</h3>
      {local && (
        <p className="small muted">
          {tr(
            "This is a localhost demo link. It is not publicly reachable from another device.",
          )}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button button-quiet button-small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(share.url);
              setMessage("Public event link copied.");
            } catch {
              setMessage(
                "Copy is unavailable. Select and copy the public link below.",
              );
            }
          }}
        >
          {tr("Copy event link")}
        </button>
        <a
          className="button button-quiet button-small"
          href={`https://wa.me/?text=${encodeURIComponent(share.text)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tr("Share on WhatsApp")}
        </a>
      </div>
      <p className="small muted">
        {tr(
          "Sharing opens only after your click. Only the public event title and link are included; no application or account details are shared.",
        )}
      </p>
      {message && (
        <div className="notice" role="status">
          {tr(message)}
          <input
            className="public-share-link"
            readOnly
            value={share.url}
            aria-label={tr("Public event link")}
          />
        </div>
      )}
    </section>
  );
}
