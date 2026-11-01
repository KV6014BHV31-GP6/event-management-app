import "@testing-library/jest-dom/vitest";
import 'fake-indexeddb/auto';
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { changeLanguage } from './i18n/index.js';
afterEach(async () => { cleanup(); await changeLanguage('en'); localStorage.clear(); vi.unstubAllGlobals(); });
window.scrollTo = vi.fn();
if(!URL.createObjectURL) URL.createObjectURL=vi.fn(()=>`blob:synthetic-test-${crypto.randomUUID()}`);
if(!URL.revokeObjectURL) URL.revokeObjectURL=vi.fn();
