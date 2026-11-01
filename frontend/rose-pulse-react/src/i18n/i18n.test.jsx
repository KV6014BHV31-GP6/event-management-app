import React from "react";
import i18next from "i18next";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import App from "../App.jsx";
import { createRuntime } from "../service.js";
import {
  resources,
  savedLanguage,
  changeLanguage,
  tr,
  locale,
  LANGUAGE_KEY,
} from "./index.js";
const traverse = traverseModule.default || traverseModule;
describe("central English/Malay resources and controls", () => {
  it("has matching nonempty keys and preserves every interpolation placeholder", () => {
    const en = resources.en.translation,
      ms = resources.ms.translation;
    expect(Object.keys(ms).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(ms[key].trim(), key).not.toBe("");
      expect((ms[key].match(/\{\{\w+\}\}/g) || []).sort(), key).toEqual(
        (en[key].match(/\{\{\w+\}\}/g) || []).sort(),
      );
    }
  });
  it("registers every static translation key used by app/queue/gallery/portal/share source", () => {
    const keys = [];
    for (const file of [
      "src/App.jsx",
      "src/FilePicker.jsx",
      "src/OrganizerWorkspace.jsx",
      "src/EventShare.jsx",
      "src/offline/OfflineWorkspace.jsx",
    ]) {
      const ast = parse(readFileSync(file, "utf8"), {
        sourceType: "module",
        plugins: ["jsx"],
      });
      traverse(ast, {
        CallExpression(path) {
          if (
            path.node.callee.name === "tr" &&
            path.node.arguments[0]?.type === "StringLiteral"
          )
            keys.push(path.node.arguments[0].value);
        },
      });
    }
    expect(
      keys.filter((key) => !Object.hasOwn(resources.en.translation, key)),
    ).toEqual([]);
  });
  it("persists only the language preference, falls back to English, and works when storage is denied", async () => {
    const storage = { getItem: vi.fn(() => "ms"), setItem: vi.fn() };
    expect(savedLanguage(storage)).toBe("ms");
    expect(savedLanguage({ getItem: () => "unsupported" })).toBe("en");
    expect(
      savedLanguage({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe("en");
    await changeLanguage("ms", storage);
    expect(locale()).toBe("ms-MY");
    expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_KEY, "ms");
    expect(tr("Create account")).toBe("Cipta akaun");
    await changeLanguage("unknown", storage);
    expect(locale()).toBe("en-GB");
  });
  it("uses i18next English fallback rather than exposing an absent Malay key", async () => {
    const isolated = i18next.createInstance();
    await isolated.init({
      lng: "ms",
      fallbackLng: "en",
      resources: {
        en: { translation: { fallback: "English fallback" } },
        ms: { translation: {} },
      },
    });
    expect(isolated.t("fallback")).toBe("English fallback");
  });
  it("switches navigation/aria/long helper text and native required validation together", async () => {
    window.history.replaceState({}, "", "/?view=signup");
    const runtime = createRuntime({
      api: {},
      storage: null,
      offlineAccessStorage: null,
    });
    await runtime.restore();
    render(<App runtime={runtime} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "EN" }));
    await user.click(screen.getByRole("button", { name: "Bahasa Melayu" }));
    expect(
      await screen.findByRole("heading", { name: "Cipta akaun anda" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Utama" }).length,
    ).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe("ms");
    const password = screen.getByLabelText("Kata laluan");
    fireEvent.invalid(password);
    expect(password.validationMessage).toBe(
      "Lengkapkan medan yang diperlukan ini.",
    );
    fireEvent.input(password, { target: { value: "synthetic" } });
    expect(password.validationMessage).toBe("");
    expect(screen.queryByText("Username")).not.toBeInTheDocument();
  });
});
