// Explicit release metadata from EVENT_SOURCE_MANIFEST.json; never infer from titles.
export const COMMUNITY_EVENT_IDS = new Set([
  'nu26_9e2df27817a19d6a', 'nu26_f8eddfff6a6f9f0c',
  'nu26_a3be1706dde219c3', 'nu26_5f4182417579f5e0',
  'nu26_d45df20b703e6a31', 'nu26_2e5bc6a07cdb4f66',
]);
export const EXERCISE_EVENT_IDS = new Set(['-AmZswKlKz_Z5Qrzir9US', 'G-jh8E9o09Kb6IeT_rBK8']);
export const eventGroup = event => COMMUNITY_EVENT_IDS.has(event.public_id) ? 'community'
  : EXERCISE_EVENT_IDS.has(event.public_id) ? 'demo' : 'other';
const priority = {community: 0, other: 1, demo: 2};
export function discoveryView(records, group = 'all') {
  return records.filter(event => group === 'all' || eventGroup(event) === group)
    .sort((a, b) => priority[eventGroup(a)] - priority[eventGroup(b)]);
}
export const publicDiscovery = records =>
  discoveryView(records).filter(event => !EXERCISE_EVENT_IDS.has(event.public_id));

const bootstrapVenue = {
  dev_synthetic_event_1: 'Community hall 1',
  dev_synthetic_event_2: 'Community hall 2',
  dev_synthetic_event_3: 'Community hall 3',
};
const fixtureNotice = " Synthetic demonstration event; no real appointment or medical service is offered. Images are AI-generated demonstration artwork.";
export function eventPresentation(event) {
  if (COMMUNITY_EVENT_IDS.has(event.public_id) && event.overview?.endsWith(fixtureNotice))
    return { ...event, overview: event.overview.slice(0, -fixtureNotice.length) };
  const venue = Object.hasOwn(bootstrapVenue, event.public_id) && bootstrapVenue[event.public_id];
  if (venue && event.location === 'Demo ' + venue.toLowerCase())
    return { ...event, location: venue };
  return event;
}

// Read every matching server page before grouping; a failed page fails the whole read.
export async function readDiscovery(api, options) {
  const first = await api.getEvents(options);
  const pages = new Map();
  if (first.page >= 1 && first.page <= first.total_pages) pages.set(first.page, first.data);
  for (let page = 1; page <= first.total_pages; page++) {
    if (pages.has(page)) continue;
    const next = await api.getEvents({...options, page});
    pages.set(page, next.data);
  }
  const records = [...pages.entries()].sort(([a], [b]) => a - b).flatMap(([, rows]) => rows);
  const unique = [...new Map(records.map(event => [event.public_id, event])).values()];
  if (unique.length !== first.total_count || (first.total_count === 0 && first.data.length !== 0)) {
    // Unstable server page boundaries can duplicate a row and omit another.
    // One bounded read can establish completeness; never loop or show partial success.
    const snapshot = await api.getEvents({...options, page: 1, pageSize: 100});
    const snapshotRows = [...new Map(snapshot.data.map(event => [event.public_id, event])).values()];
    if (!Number.isSafeInteger(snapshot.total_count) || snapshot.total_count > 100 ||
        snapshotRows.length !== snapshot.total_count) {
      throw new Error("Unable to read the complete event list. Please refresh and try again.");
    }
    return {...first, total_count: snapshot.total_count, records: discoveryView(snapshotRows), complete: true};
  }
  return {...first, records: discoveryView(unique), complete: true};
}
