import { DemoImage, DemoControls } from "./DemoControls.jsx";
import { tr } from "./i18n/index.js";
import React, { useEffect, useRef, useState, useId } from "react";
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
  const input = useRef(null);
  const busy = useRef(false);
  const objectUrls = useRef(new Set());
  const locked = entries.some((entry) =>
    ["uploading", "uncertain"].includes(entry.status),
  );
  useEffect(() => {
    onChange(
      entries
        .filter((entry) => entry.reference)
        .map((entry) => entry.reference),
    );
    onBlocked(locked || entries.some((entry) => !entry.reference));
  }, [entries, locked, onChange, onBlocked]);
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const remove = (key) => {
    if (locked || disabled) return;
    setEntries((current) =>
      current.filter((entry) => {
        if (entry.key !== key) return true;
        if (entry.localUrl) {
          URL.revokeObjectURL(entry.localUrl);
          objectUrls.current.delete(entry.localUrl);
        }
        return false;
      }),
    );
  };
  const select = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length + entries.length > 3) {
      setMessage("Choose no more than three files.");
      event.target.value = "";
      return;
    }
    const supported = image
      ? ["image/png", "image/jpeg", "image/webp", "image/gif"]
      : [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "application/pdf",
        ];
    if (
      files.some(
        (file) =>
          !supported.includes(file.type) ||
          file.size < 1 ||
          file.size > 8 * 1024 * 1024,
      )
    ) {
      setMessage("Choose a supported file up to 8 MiB.");
      event.target.value = "";
      return;
    }
    setMessage("");
    setEntries((current) => [
      ...current,
      ...files.map((file) => {
        const localUrl =
          image && URL.createObjectURL ? URL.createObjectURL(file) : null;
        if (localUrl) objectUrls.current.add(localUrl);
        return {
          key: crypto.randomUUID(),
          file,
          localUrl,
          status: "selected",
        };
      }),
    ]);
    event.target.value = "";
  };
  const upload = async () => {
    if (busy.current || locked || disabled || !synthetic) return;
    busy.current = true;
    setMessage("");
    for (const entry of entries.filter(
      (item) => item.file && !item.reference,
    )) {
      setEntries((current) =>
        current.map((item) =>
          item.key === entry.key
            ? {
                ...item,
                status: "uploading",
              }
            : item,
        ),
      );
      try {
        const reference = await runtime.withVerifiedAccount(
          (token) => runtime.api.uploadFile(entry.file, purpose, token),
          {
            roles: image ? ["organizer"] : ["user", "organizer", "leader"],
          },
        );
        setEntries((current) =>
          current.map((item) =>
            item.key === entry.key
              ? {
                  ...item,
                  reference,
                  status: "uploaded",
                }
              : item,
          ),
        );
      } catch (error) {
        const known = [
          "validation",
          "unauthorized",
          "forbidden",
          "verification",
        ].includes(error.kind);
        setEntries((current) =>
          current.map((item) =>
            item.key === entry.key
              ? {
                  ...item,
                  status: known ? "error" : "uncertain",
                }
              : item,
          ),
        );
        setMessage(
          known
            ? error.message
            : "The file upload result is unknown. Do not upload it again or save this association until checked.",
        );
        break;
      }
    }
    busy.current = false;
  };
  return (
    <section className="image-upload file-picker">
      <label htmlFor={inputId}>
        {tr(image ? "Event image" : "Supporting documents")}{" "}
        <span className="muted">{tr("(optional)")}</span>
      </label>
      <p className="small muted">
        {tr(
          image
            ? "Up to three event images. Remove an image before selecting a replacement."
            : "Up to three synthetic supporting documents. Uploads are optional; evidence and onsite-original policies remain pending.",
        )}
      </p>
      <div className="file-previews">
        {entries.map((entry, index) => (
          <div className="file-preview" key={entry.key}>
            {image && (entry.localUrl || entry.reference?.url) ? (
              <DemoImage
                src={entry.localUrl || entry.reference.url}
                alt={tr("Selected event image {{number}}", {
                  number: index + 1,
                })}
              />
            ) : (
              <div className="document-symbol">
                {tr("PDF /")} {tr("Document")}
              </div>
            )}
            <span>{entry.file?.name || entry.reference.name}</span>
            <small>
              {tr(
                entry.status === "uncertain"
                  ? "Unknown upload result"
                  : entry.reference
                    ? "Uploaded file"
                    : "Not uploaded",
              )}
            </small>
            <button
              className="text-button"
              type="button"
              disabled={disabled || locked}
              onClick={() => remove(entry.key)}
              aria-label={tr("Remove file {{number}}", {
                number: index + 1,
              })}
            >
              {tr("Remove")}
            </button>
          </div>
        ))}
      </div>
      <input
        ref={input}
        id={inputId}
        type="file"
        multiple
        accept={
          image
            ? "image/png,image/jpeg,image/webp,image/gif"
            : "image/png,image/jpeg,image/webp,image/gif,application/pdf"
        }
        disabled={disabled || locked || entries.length >= 3}
        onChange={select}
      />
      <p className="small muted">
        {tr(
          "Maximum 8 MiB per file. Removing a selection does not delete an uploaded server file.",
        )}
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={synthetic}
          disabled={disabled || locked}
          onChange={(event) => setSynthetic(event.target.checked)}
        />
        {tr("I confirm these files contain synthetic test data only.")}
      </label>
      <div className="form-inline-actions">
        <button
          className="button button-quiet button-small"
          type="button"
          disabled={
            disabled ||
            locked ||
            !synthetic ||
            !entries.some((entry) => entry.file && !entry.reference)
          }
          onClick={upload}
        >
          {tr("Upload selected files")}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={
            disabled ||
            locked ||
            !entries.some((entry) => entry.file && !entry.reference)
          }
          onClick={() => {
            for (const entry of entries.filter(
              (item) => item.file && !item.reference,
            ))
              remove(entry.key);
          }}
        >
          {tr("Clear selection")}
        </button>
      </div>
      {message && (
        <div className="notice notice-error" role="alert">
          {tr(message)}
        </div>
      )}
    </section>
  );
}
export { PrivateDocuments } from "./PrivateDocuments.jsx";
