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
// Read every matching server page before grouping; a failed page fails the whole read.
export async function readDiscovery(api, options) {
  const first = await api.getEvents(options);
  if (first.total_pages <= 1) return {...first, records: discoveryView(first.data), complete: true};
  const pages = new Map([[first.page, first.data]]);
  for (let page = 1; page <= first.total_pages; page++) {
    if (page === first.page) continue;
    const next = await api.getEvents({...options, page});
    pages.set(page, next.data);
  }
  const records = [...pages.entries()].sort(([a], [b]) => a - b).flatMap(([, rows]) => rows);
  const unique = [...new Map(records.map(event => [event.public_id, event])).values()];
  return {...first, records: discoveryView(unique), complete: true};
}
