import React, { useEffect, useId, useRef, useState } from "react";
import { useDemoTool } from "./DemoControls.jsx";
import { DEMO_PROFILE } from "./demo-transport.js";
import { PrivateDocuments } from "./PrivateDocuments.jsx";
import { RegistrationGroups } from "./RegistrationGroups.jsx";
import { tr } from "./i18n/index.js";

const participantFields = [
  { name: "first_name", label: "First name", maxLength: 20, autoComplete: "given-name" },
  { name: "last_name", label: "Last name", maxLength: 20, autoComplete: "family-name" },
  { name: "phone", label: "Phone", type: "tel", maxLength: 20, autoComplete: "tel" },
  { name: "national_id", label: "National ID", maxLength: 50 },
];

const genderChoices = [["male", "Male"], ["female", "Female"]];
export const applicationSources = [["direct", "Direct"], ["unknown", "Unknown"]];

export function ApplicationOptions({ label, name, choices, defaultValue }) {
  return (
    <fieldset className="application-options">
      <legend>{tr(label)}</legend>
      <div className="application-options-row">
        {choices.map(([value, text]) => (
          <label key={value}>
            <input
              name={name}
              type="radio"
              value={value}
              required
              defaultChecked={value === defaultValue}
            />
            <span>{tr(text)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DemoFormTemplate({ preserveNationalId = false, account, disabled = false }) {
  const localFixture = DEMO_PROFILE && preserveNationalId &&
    ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location.hostname) &&
    account?.role === "user" && account.username === "ac40s1_px";
  const control = useRef(null);
  const fill = () => {
    const button = control.current;
    if (!button || button.matches(":disabled")) return;
    const form = button.form;
    const section = form.closest("details");
    if (section) section.open = true;
    const current = new FormData(form);
    const id = crypto.randomUUID();
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const values = {
      first_name: "Demo",
      last_name: `Sample ${id.slice(0, 8)}`,
      phone: `0000${String(random % 100000000).padStart(8, "0")}`,
      gender: random % 2 ? "female" : "male",
      ...(localFixture
        ? { national_id: "SYNTHETIC_AC40_PX" }
        : preserveNationalId ? {} : { national_id: `DEMO-${id}` }),
    };
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements.namedItem(name);
      if (!field || current.get(name) || field.matches?.(":disabled")) continue;
      field.value = value;
      field.setCustomValidity?.("");
    }
    form.dispatchEvent(new Event("input", { bubbles: true }));
  };

  useDemoTool("Fill synthetic demo details", fill, !disabled);
  if (!DEMO_PROFILE) return null;

  return (
    <div>
      <button ref={control} className="button button-quiet button-small" type="button" disabled={disabled} onClick={fill}>
        {tr("Fill synthetic demo details")}
      </button>
      <p className="small muted">{tr(preserveNationalId && !localFixture
        ? "Fills blank demo fields. Enter the National ID linked to this account yourself."
        : "Fills blank fields with fictional details for review.")}</p>
    </div>
  );
}

export function ParticipantFields({ preserveNationalId = false, account }) {
  const prefix = useId();
  return (
    <>
      <DemoFormTemplate preserveNationalId={preserveNationalId} account={account} />
      <div className="form-grid participant-fields">
        {participantFields.map(({ label, name, type = "text", maxLength, autoComplete }) => {
          const id = prefix + name;
          return (
            <div className="field" key={name}>
              <label htmlFor={id}>{tr(label)}</label>
              <input
                id={id}
                name={name}
                type={type}
                autoComplete={autoComplete || "off"}
                aria-describedby={maxLength ? id + "-limit" : undefined}
                pattern={maxLength ? `(?=.*\\S).{1,${maxLength}}` : undefined}
                required
              />
              {maxLength && <small id={id + "-limit"}>{tr("Up to {{number}} characters", { number: maxLength })}</small>}
            </div>
          );
        })}
        <RegistrationGroups />
        <ApplicationOptions label="Gender" name="gender" choices={genderChoices} />
      </div>
    </>
  );
}

export function ApplicationSummary({ files = [], runtime, source }) {
  const section = useRef(null);
  const [review, setReview] = useState(null);
  const update = () => {
    if (section.current?.open)
      setReview(Object.fromEntries(new FormData(section.current.closest("form"))));
    else
      setReview(null);
  };
  useEffect(() => {
    const form = section.current.closest("form");
    const refresh = () => {
      if (section.current?.open) update();
    };
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    return () => {
      form.removeEventListener("input", refresh);
      form.removeEventListener("change", refresh);
    };
  }, []);
  const gender = genderChoices.find(([value]) => value === review?.gender);
  const attribution = applicationSources.find(([value]) => value === review?.source_kind);
  return (
    <details ref={section} className="application-summary" onToggle={update}>
      <summary>{tr("Review your application")}</summary>
      {review && (
        <dl className="receipt">
          {participantFields.map(({ name, label }) => (
            <React.Fragment key={name}>
              <dt>{tr(label)}</dt><dd>{review[name] || "—"}</dd>
            </React.Fragment>
          ))}
          <dt>{tr("Age group")}</dt><dd>{review.age_group_code || "—"}</dd>
          <dt>{tr("Income group (optional)")}</dt><dd>{review.income_band_code || tr("Not provided")}</dd>
          <dt>{tr("Gender")}</dt><dd>{gender ? tr(gender[1]) : "—"}</dd>
          {(source || attribution) && <><dt>{tr("Source")}</dt><dd>{source || tr(attribution[1])}</dd></>}
          <dt>{tr("Supporting documents")}</dt>
          <dd>{runtime && files.length
            ? <PrivateDocuments runtime={runtime} files={files} thumbnailOnly />
            : tr("No uploaded files")}</dd>
        </dl>
      )}
      <button className="text-button" type="button" onClick={() => {
        section.current.open = false;
        section.current.closest("form").querySelector("input[name=first_name]")?.focus();
      }}>
        {tr("Edit application details")}
      </button>
    </details>
  );
}
