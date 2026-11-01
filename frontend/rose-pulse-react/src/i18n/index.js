import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ms from "./ms.json";

export const LANGUAGE_KEY = "rose.pulse.language";
export const resources = { en: { translation: en }, ms: { translation: ms } };
export function savedLanguage(storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    const value = storage?.getItem(LANGUAGE_KEY);
    return ["en", "ms"].includes(value) ? value : "en";
  } catch {
    return "en";
  }
}
export const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage(),
  fallbackLng: "en",
  supportedLngs: ["en", "ms"],
  keySeparator: false,
  nsSeparator: false,
  initImmediate: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});
export const tr = (key, options) => {
  if (typeof key !== "string") return key;
  const match = key.match(
    /^The server returned (Pending|Approved|Waiting|Cancelled|Rejected)\. Records are being read again\.$/,
  );
  if (match)
    return i18n.t(
      "The server returned {{status}}. Records are being read again.",
      { status: i18n.t(match[1]), defaultValue: key },
    );
  return i18n.t(key, { defaultValue: key, ...options });
};
export const locale = () =>
  i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-GB";
export function localizeInvalid(event) {
  const field = event.target;
  if (!field?.validity || typeof field.setCustomValidity !== "function") return;
  const validity = field.validity;
  const key = validity.valueMissing
    ? "Complete this required field."
    : validity.typeMismatch || validity.badInput
      ? "Enter a valid value."
      : validity.rangeUnderflow || validity.rangeOverflow
        ? "Enter a value within the displayed limits."
        : validity.stepMismatch
          ? "Enter a whole number."
          : validity.tooLong
            ? "This value exceeds the displayed maximum length."
            : "Check this field.";
  field.setCustomValidity(tr(key));
}
export function clearInvalid(event) {
  event.target?.setCustomValidity?.("");
}
export async function changeLanguage(language, storage) {
  const next = ["en", "ms"].includes(language) ? language : "en";
  await i18n.changeLanguage(next);
  document.documentElement.lang = next;
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    storage?.setItem(LANGUAGE_KEY, next);
  } catch {
    /* still works for this page */
  }
}
document.documentElement.lang = i18n.resolvedLanguage || "en";
