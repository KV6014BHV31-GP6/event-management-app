const CACHE = "rose-public-shell-__REVISION__";
const SHELL = __SHELL_ASSETS__;
const allowed = new Set(SHELL);

// Explicit public build assets only. No runtime API/upload/file/image discovery.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          SHELL.map(
            (path) =>
              new Request(path, { credentials: "omit", cache: "reload" }),
          ),
        ),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("rose-public-shell-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_PUBLIC_SHELL") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("Authorization") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/")
  )
    return;
  if (
    request.mode === "navigate" &&
    ["/", "/index.html"].includes(url.pathname)
  ) {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.open(CACHE)).match("/index.html"),
      ),
    );
    return;
  }
  if (!allowed.has(url.pathname) || url.search) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) => (await cache.match(url.pathname)) || fetch(request),
      ),
  );
});
