import React, { useEffect, useId, useRef, useState } from "react";
import { tr } from "./i18n/index.js";

const participantFields = [
  { name: "first_name", label: "First name", maxLength: 20, autoComplete: "given-name" },
  { name: "last_name", label: "Last name", maxLength: 20, autoComplete: "family-name" },
  { name: "date_of_birth", label: "Date of birth", type: "date" },
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

export function ParticipantFields() {
  const prefix = useId();
  return (
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
      <ApplicationOptions label="Gender" name="gender" choices={genderChoices} />
    </div>
  );
}

export function ApplicationSummary({ files = [], source }) {
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
          <dt>{tr("Gender")}</dt><dd>{gender ? tr(gender[1]) : "—"}</dd>
          {(source || attribution) && <><dt>{tr("Source")}</dt><dd>{source || tr(attribution[1])}</dd></>}
          <dt>{tr("Supporting documents")}</dt>
          <dd>{files.length ? files.map((file) => file.name).join(", ") : tr("No uploaded files")}</dd>
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
