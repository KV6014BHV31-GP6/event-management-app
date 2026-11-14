import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import { tr } from "./i18n/index.js";
import { PrivateDocuments } from "./PrivateDocuments.jsx";

export default function ApplicationSuccess({ eventTitle, reference, runtime, files = [], onDismiss, onView, onDone }) {
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const timer = useRef(null);
  const finished = useRef(false);
  const latestDone = useRef(onDone);
  const titleId = useId();
  const descriptionId = useId();
  const returnId = useId();

  useLayoutEffect(() => {
    latestDone.current = onDone;
  }, [onDone]);

  const close = (action) => {
    if (finished.current) return;
    finished.current = true;
    window.clearTimeout(timer.current);
    if (dialog.current?.open) dialog.current.close();
    action();
  };

  useEffect(() => {
    const panel = dialog.current;
    if (typeof panel.showModal !== "function") {
      onDismiss();
      return;
    }
    finished.current = false;
    panel.showModal();
    closeButton.current?.focus();
    timer.current = window.setTimeout(() => close(latestDone.current), 5000);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      finished.current = true;
      window.clearTimeout(timer.current);
      if (panel.open) panel.close();
      document.body.style.overflow = overflow;
    };
  }, []);


  return (
    <dialog
      ref={dialog}
      className="document-viewer application-success"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId} ${returnId}`}
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
      <p id={returnId}>{tr("Returning to the event in 5 seconds.")}</p>
      {runtime && files.length > 0 && (
        <section>
          <h3>{tr("Supporting documents")}</h3>
          <PrivateDocuments runtime={runtime} files={files} recordId={reference} thumbnailOnly />
        </section>
      )}
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
