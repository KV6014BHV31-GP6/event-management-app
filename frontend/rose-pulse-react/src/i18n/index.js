import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ms from "./ms.json";

export const LANGUAGE_KEY = "rose.pulse.language";
export const resources = { en: { translation: en }, ms: { translation: ms } };
export function savedLanguage(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(LANGUAGE_KEY);
    return ["en", "ms"].includes(value) ? value : "en";
  } catch {
    return "en";
  }
}
export const i18n = i18next.createInstance();
i18n
  .use(initReactI18next)
  .init({
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
export const tr = (key, options) =>
  typeof key === "string"
    ? i18n.t(key, { defaultValue: key, ...options })
    : key;
export const locale = () =>
  i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-GB";
export async function changeLanguage(
  language,
  storage = globalThis.localStorage,
) {
  const next = ["en", "ms"].includes(language) ? language : "en";
  await i18n.changeLanguage(next);
  document.documentElement.lang = next;
  try {
    storage?.setItem(LANGUAGE_KEY, next);
  } catch {
    /* still works for this page */
  }
}
document.documentElement.lang = i18n.resolvedLanguage || "en";
