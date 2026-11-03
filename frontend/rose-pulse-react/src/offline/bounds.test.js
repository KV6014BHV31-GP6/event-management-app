import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { createOfflineStore } from './queue.js';
it('persists schema and deterministic bounded fingerprinted envelopes before POST', async () => {
  let n = 0;
  const store = createOfflineStore({
    name: 'bounded-' + crypto.randomUUID(),
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  });
  const actor = {
    id: 'actor',
    role: 'leader'
  };
  const event = {
    id: 1,
    public_id: '123456789012345678901'
  };
  await store.saveEvent(actor, event, {
    verifiedOnline: true
  });
  for (let i = 0; i < 26; i++) {
    const draft = await store.saveDraft(actor, {
      event_public_id: event.public_id,
      application: {
        first_name: 'x'
      },
      syntheticConfirmed: true
    });
    expect(draft.schema_version).toBe('rose.offline-draft.v1');
    await store.queue(actor, draft.client_submission_id);
  }
  const batch = await store.prepareBatch(actor, event.public_id);
  expect(batch.request.items).toHaveLength(25);
  expect(batch.payload_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(new TextEncoder().encode(JSON.stringify(batch.request)).length).toBeLessThanOrEqual(131072);
  await store.close();
});
