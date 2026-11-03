import { it, expect, vi } from 'vitest';
import { createDemoTransport } from './demo-transport.js';
it('blocks v1 v2 and file paths offline without a request', async () => {
  const fetch = vi.fn();
  const t = createDemoTransport({
    enabled: true,
    fetchImpl: fetch,
    storage: null
  });
  t.offline();
  for (const path of ['/api/v1/events', '/api/v2/events', '/uploads/a']) await expect(t.fetch(path)).rejects.toThrow(/Simulated offline/);
  expect(fetch).not.toHaveBeenCalled();
});
it('drops only a successful sync acknowledgement, preserving auth failures', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({
    ok: false,
    status: 403
  }).mockResolvedValueOnce({
    ok: true,
    status: 200
  });
  const t = createDemoTransport({
    enabled: true,
    fetchImpl: fetch,
    storage: null
  });
  t.loseNextAck();
  expect((await t.fetch('/api/v2/events/a/offline-batches', {
    method: 'POST'
  })).status).toBe(403);
  await expect(t.fetch('/api/v2/events/a/offline-batches', {
    method: 'POST'
  })).rejects.toThrow(/acknowledgement/);
});
