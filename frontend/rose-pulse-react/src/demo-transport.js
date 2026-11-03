export const DEMO_PROFILE = import.meta.env.VITE_DEMO_PROFILE === 'synthetic';
export function createDemoTransport({
  enabled = DEMO_PROFILE,
  fetchImpl = (...args) => globalThis.fetch(...args),
  storage = globalThis.sessionStorage
} = {}) {
  let mode = 'connected',
    loseAck = false,
    requests = 0,
    blocked = 0;
  const listeners = new Set();
  try {
    if (enabled && storage?.getItem('rose.demo.synthetic.network') === 'offline') mode = 'offline';
  } catch {}
  let snapshot = {
    enabled,
    mode,
    loseAck,
    requests,
    blocked
  };
  const publish = () => {
    snapshot = {
      enabled,
      mode,
      loseAck,
      requests,
      blocked
    };
    try {
      if (enabled) storage?.setItem('rose.demo.synthetic.network', mode);
    } catch {}
    for (const fn of listeners) fn();
  };
  const api = {
    subscribe: fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => snapshot,
    offline() {
      if (enabled) {
        mode = 'offline';
        publish();
      }
    },
    restore() {
      mode = 'connected';
      publish();
    },
    loseNextAck() {
      if (enabled) {
        loseAck = true;
        publish();
      }
    },
    async fetch(input, options = {}) {
      const path = typeof input === 'string' ? input : input.url;
      const protectedPath = /^\/(api\/v[12](\/|$)|uploads\/)/.test(new URL(path, globalThis.location?.origin || 'http://localhost').pathname);
      if (enabled && mode === 'offline' && protectedPath) {
        blocked++;
        publish();
        throw new TypeError('Simulated offline: app request blocked.');
      }
      requests++;
      publish();
      const response = await fetchImpl(input, options);
      if (enabled && loseAck && response.ok && options.method === 'POST' && /\/offline-batches$/.test(path)) {
        loseAck = false;
        publish();
        await response.arrayBuffer?.();
        throw new TypeError('Demo: successful sync acknowledgement deliberately lost. Reconcile the saved batch.');
      }
      return response;
    }
  };
  return api;
}
export const demoTransport = createDemoTransport();
