import React, { useEffect, useId, useRef } from "react";
import { tr } from "./i18n/index.js";

export default function ApplicationSuccess({ eventTitle, reference, onDismiss, onView, onDone }) {
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const panel = dialog.current;
    if (typeof panel.showModal !== "function") {
      onDismiss();
      return;
    }
    panel.showModal();
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (panel.open) panel.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  const close = (action) => {
    dialog.current.close();
    action();
  };

  return (
    <dialog
      ref={dialog}
      className="document-viewer application-success"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close(onDismiss);
      }}
    >
      <div className="section-heading">
        <h2 id={titleId}>{tr("Application submitted successfully")}</h2>
        <button
          ref={closeButton}
          className="button button-quiet button-small"
          type="button"
          onClick={() => close(onDismiss)}
        >
          {tr("Close")}
        </button>
      </div>
      <dl className="receipt">
        <dt>{tr("Event")}</dt>
        <dd>{eventTitle}</dd>
        <dt>{tr("Application reference")}</dt>
        <dd>{reference}</dd>
        <dt>{tr("Status")}</dt>
        <dd><span className="status status-pending">{tr("Pending")}</span></dd>
      </dl>
      <p id={descriptionId}>{tr("Awaiting organiser review. A place is not confirmed.")}</p>
      <div className="form-actions">
        <button className="button" type="button" onClick={() => close(onView)}>
          {tr("View application")}
        </button>
        <button className="button button-quiet" type="button" onClick={() => close(onDone)}>
          {tr("Back to event")}
        </button>
      </div>
    </dialog>
  );
}
