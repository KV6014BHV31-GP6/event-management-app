import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { registerPublicShell } from "./register.js";
function harness() {
  const handlers = {};
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(new Response("public static shell")),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  };
  const context = {
    self: {
      location: { origin: "http://127.0.0.1:5205" },
      addEventListener: (name, callback) => {
        handlers[name] = callback;
      },
      clients: { claim: vi.fn() },
    },
    caches,
    URL,
    Request: class extends Request {
      constructor(path, options) {
        super(new URL(path, "http://127.0.0.1:5205"), options);
      }
    },
    fetch: vi.fn().mockRejectedValue(new Error("offline")),
  };
  const source = readFileSync("src/pwa/sw-template.js", "utf8")
    .replace("__REVISION__", "synthetic-test")
    .replace(
      "__SHELL_ASSETS__",
      JSON.stringify([
        "/index.html",
        "/assets/app.js",
        "/assets/app.css",
        "/icon.svg",
      ]),
    );
  vm.runInNewContext(source, context);
  return { handlers, cache, caches, context };
}
describe("production public AppShell boundary", () => {
  it("never registers in Vite development mode", async () => {
    const register = vi.fn();
    expect(
      await registerPublicShell({
        production: false,
        navigatorImpl: { serviceWorker: { register } },
      }),
    ).toEqual({ available: false });
    expect(register).not.toHaveBeenCalled();
  });
  it("pre-caches a finite public build list without API, token or uploaded records", async () => {
    const { handlers, cache } = harness();
    let work;
    handlers.install({
      waitUntil: (promise) => {
        work = promise;
      },
    });
    await work;
    const requests = cache.addAll.mock.calls[0][0];
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/index.html",
      "/assets/app.js",
      "/assets/app.css",
      "/icon.svg",
    ]);
    expect(
      requests.every(
        (request) =>
          request.credentials === "omit" &&
          !request.headers.has("Authorization"),
      ),
    ).toBe(true);
  });
  it("does not intercept private APIs, uploaded content, authenticated requests or writes", () => {
    const { handlers } = harness();
    for (const [path, method, authorization] of [
      ["/api/v1/me/registrations", "GET"],
      ["/api/v2/files/abc/content", "GET"],
      ["/uploads/events/demo.png", "GET"],
      ["/assets/app.js", "GET", "Bearer synthetic"],
      ["/index.html", "POST"],
    ]) {
      const respondWith = vi.fn();
      handlers.fetch({
        request: {
          method,
          url: `http://127.0.0.1:5205${path}`,
          headers: new Headers(
            authorization ? { Authorization: authorization } : {},
          ),
          mode: "cors",
        },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });
  it("serves the static shell on an offline query-route navigation without caching its response", async () => {
    const { handlers, cache, context } = harness();
    let response;
    handlers.fetch({
      request: {
        method: "GET",
        url: "http://127.0.0.1:5205/?view=offline",
        headers: new Headers(),
        mode: "navigate",
      },
      respondWith: (promise) => {
        response = promise;
      },
    });
    expect(await (await response).text()).toBe("public static shell");
    expect(cache.match).toHaveBeenCalledWith("/index.html");
    expect(context.fetch).toHaveBeenCalledTimes(1);
  });
});
