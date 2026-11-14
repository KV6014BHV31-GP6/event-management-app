import { DemoImage } from "./DemoControls.jsx";
import { locale, tr } from "./i18n/index.js";
import React, { useEffect, useRef, useState, useId } from "react";
import { documentFileAccept, imageFileAccept, uploadFileProblem } from "./phase2-api.js";

const uploadLabels = {
  existing: "Uploaded file",
  selected: "Selected file — awaiting upload",
  uploading: "Uploading file…",
  uploaded: "Uploaded file",
  error: "Upload failed",
  uncertain: "Unknown upload result",
};

export function FilePicker({
  runtime,
  purpose,
  initialFiles = [],
  onChange,
  onBlocked,
  disabled = false,
}) {
  const image = purpose === "event_image";
  const inputId = `${purpose}-${useId()}`;
  const [entries, setEntries] = useState(() =>
    initialFiles.map((reference) => ({
      key: reference.id,
      reference,
      status: "existing",
    })),
  );
  const [message, setMessage] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const replacement = useRef(null);
  const replaceKey = useRef(null);
  const photo = useRef(null);
  const camera = useRef(null);
  const busy = useRef(false);
  const active = useRef(false);
  const objectUrls = useRef(new Set());
  const locked = entries.some((entry) =>
    ["uploading", "uncertain"].includes(entry.status),
  );
  const canChoose = !disabled && !locked && entries.length < 3;
  const useCamera = navigator.maxTouchPoints > 0 && "capture" in HTMLInputElement.prototype;
  const pending = entries.some((entry) => !entry.reference);

  useEffect(() => {
    onChange(entries.filter((entry) => entry.reference).map((entry) => entry.reference));
    onBlocked(locked || pending);
  }, [entries, locked, pending, onChange, onBlocked]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    };
  }, []);

  const revoke = (entry) => {
    if (!entry.localUrl) return;
    URL.revokeObjectURL(entry.localUrl);
    objectUrls.current.delete(entry.localUrl);
  };
  const remove = (key) => {
    if (busy.current || locked || disabled) return;
    const entry = entries.find((item) => item.key === key);
    if (!entry) return;
    revoke(entry);
    setEntries((current) => current.filter((item) => item.key !== key));
  };

  const select = (event, key = null) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || busy.current || locked || disabled) return;
    if (files.length + entries.length - (key ? 1 : 0) > 3) {
      setMessage("Choose no more than three files.");
      return;
    }
    const problem = files.map((file) => uploadFileProblem(file, purpose)).find(Boolean);
    if (problem) {
      setMessage(image ? "Choose a supported file up to 8 MiB." : problem);
      return;
    }
    setMessage("");
    const selected = files.map((file) => {
      const localUrl = URL.createObjectURL?.(file);
      if (localUrl) objectUrls.current.add(localUrl);
      return { key: crypto.randomUUID(), file, localUrl, status: "selected" };
    });
    if (key) {
      const previous = entries.find((entry) => entry.key === key);
      if (previous) revoke(previous);
      setEntries((current) => current.map((entry) => entry.key === key ? selected[0] : entry));
    } else {
      setEntries((current) => [...current, ...selected]);
    }
  };

  const upload = async () => {
    if (busy.current || locked || disabled || !synthetic) return;
    const identity = runtime.getSnapshot?.();
    const isCurrent = () => {
      const current = runtime.getSnapshot?.();
      return active.current && current?.revision === identity?.revision &&
        current?.user?.id === identity?.user?.id;
    };
    const update = (key, changes) => {
      setEntries((current) => current.map((item) => item.key === key ? { ...item, ...changes } : item));
    };
    busy.current = true;
    setMessage("");
    try {
      for (const entry of entries.filter((item) => item.file && !item.reference)) {
        if (!isCurrent()) return;
        update(entry.key, { status: "uploading", error: "" });
        try {
          const reference = await runtime.withVerifiedAccount(
            (token) => runtime.api.uploadFile(entry.file, purpose, token),
            { roles: image ? ["organizer"] : ["user", "organizer", "leader"] },
          );
          if (!isCurrent()) return;
          update(entry.key, { reference, status: "uploaded" });
        } catch (error) {
          if (!isCurrent()) return;
          const known = ["validation", "unauthorized", "forbidden", "verification"].includes(error.kind);
          update(entry.key, {
            status: known ? "error" : "uncertain",
            error: known ? error.message : "",
          });
          if (!known) {
            setMessage("The file upload result is unknown. Do not upload it again or save this association until checked.");
          }
          if (image || !known || error.kind !== "validation") break;
        }
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <section className={`image-upload file-picker${image ? "" : " supporting-file-picker"}`}>
      <label htmlFor={inputId}>
        {tr(image ? "Event image" : "Supporting documents")}{" "}
        <span className="muted">{tr("(optional)")}</span>
      </label>
      <p className="small muted">
        {tr(image
          ? "Up to three event images. Remove an image before selecting a replacement."
          : "Choose up to three synthetic documents (PNG, JPEG, GIF, WebP or PDF). Uploads are optional.")}
      </p>
      <div className="file-previews">
        {entries.map((entry, index) => {
          const name = entry.file?.name || entry.reference.name;
          const mime = entry.file?.type || entry.reference.mime_type;
          const size = entry.file?.size || entry.reference.size;
          return (
            <div className="file-preview" key={entry.key}>
              {image && (entry.localUrl || entry.reference?.url) ? (
                <DemoImage src={entry.localUrl || entry.reference.url}
                  alt={tr("Selected event image {{number}}", { number: index + 1 })} />
              ) : mime.startsWith("image/") && entry.localUrl ? (
                <img src={entry.localUrl} alt={tr("Selected document image {{number}}", { number: index + 1 })} />
              ) : (
                <div className="document-symbol">{tr(mime === "application/pdf" ? "PDF document" : "Image")}</div>
              )}
              <span>{name}</span>
              {!image && <small>{mime} · {new Intl.NumberFormat(locale(), {
                style: "unit", unit: "byte", unitDisplay: "short",
              }).format(size)}</small>}
              <small role={image ? undefined : "status"}>{tr(uploadLabels[entry.status])}</small>
              {entry.error && <small role="alert">{tr(entry.error)}</small>}
              {!image && mime === "application/pdf" && entry.localUrl && (
                <a className="text-link" href={entry.localUrl} download={name}>{tr("Download to view PDF")}</a>
              )}
              <button
                className="text-button" type="button" disabled={disabled || locked}
                onClick={() => remove(entry.key)}
                aria-label={tr("Remove file {{number}}", { number: index + 1 })}
              >
                {tr("Remove")}
              </button>
              {!image && <button
                className="text-button" type="button" disabled={disabled || locked}
                onClick={() => {
                  replaceKey.current = entry.key;
                  replacement.current.click();
                }}
                aria-label={tr("Replace file {{number}}", { number: index + 1 })}
              >
                {tr("Replace")}
              </button>}
            </div>
          );
        })}
      </div>
      <input
        id={inputId} type="file" multiple accept={image ? imageFileAccept : documentFileAccept}
        disabled={!canChoose} onChange={select}
      />
      {!image && <>
        <input ref={replacement} type="file" hidden aria-label={tr("Choose replacement file")}
          accept={documentFileAccept} disabled={disabled || locked}
          onChange={(event) => {
            const key = replaceKey.current;
            replaceKey.current = null;
            if (key) select(event, key);
          }} />
        <input ref={photo} type="file" hidden accept={imageFileAccept}
          disabled={!canChoose} onChange={select} />
        <input ref={camera} type="file" hidden accept={imageFileAccept} capture="environment"
          disabled={!canChoose} onChange={select} />
        <div className="form-inline-actions">
          <button type="button" className="text-button" disabled={!canChoose} onClick={() => photo.current.click()}>
            {tr("Choose a photo")}
          </button>
          {useCamera && <button type="button" className="text-button" disabled={!canChoose} onClick={() => camera.current.click()}>
            {tr("Take a photo")}
          </button>}
        </div>
      </>}
      <p className="small muted">
        {tr("Maximum 8 MiB per file. Removing a selection does not delete an uploaded server file.")}
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox" checked={synthetic} disabled={disabled || locked}
          onChange={(event) => setSynthetic(event.target.checked)}
        />
        {tr("I confirm these files contain synthetic test data only.")}
      </label>
      <div className="form-inline-actions">
        <button className="button button-quiet button-small" type="button"
          disabled={disabled || locked || !synthetic || !pending} onClick={upload}>
          {tr(!image && entries.some((entry) => entry.status === "error") ? "Retry upload" : "Upload selected files")}
        </button>
        <button className="text-button" type="button" disabled={disabled || locked || !pending}
          onClick={() => {
            for (const entry of entries.filter((item) => item.file && !item.reference)) remove(entry.key);
          }}>
          {tr("Clear selection")}
        </button>
      </div>
      {message && <div className="notice notice-error" role="alert">{tr(message)}</div>}
    </section>
  );
}
export { PrivateDocuments } from "./PrivateDocuments.jsx";
