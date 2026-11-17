import "@testing-library/jest-dom/vitest";
import 'fake-indexeddb/auto';
import { cleanup } from "@testing-library/react";
import { beforeEach, afterEach, vi } from "vitest";
import { changeLanguage } from './i18n/index.js';
afterEach(async () => { cleanup(); await changeLanguage('en'); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
window.scrollTo = vi.fn();
if(!URL.createObjectURL) URL.createObjectURL=vi.fn(()=>`blob:synthetic-test-${crypto.randomUUID()}`);
if(!URL.revokeObjectURL) URL.revokeObjectURL=vi.fn();

// jsdom has the element but no top-layer implementation. Real browser verifies modality.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}

// Explicit isolated synthetic reference fixture; never used by a runtime seed.
import { demoTransport } from './demo-transport.js';
import { loadRegistrationOptions } from './RegistrationGroups.jsx';
beforeEach(async () => {
  const original = demoTransport.fetch.bind(demoTransport);
  vi.spyOn(demoTransport, 'fetch').mockImplementation((path, options) => path === '/api/v1/registration-options'
    ? Promise.resolve({ok:true,json:async()=>({age_groups:[{code:'18_29',name:'Synthetic 18–29'}],income_bands:[]})})
    : original(path, options));
  await loadRegistrationOptions();
});
