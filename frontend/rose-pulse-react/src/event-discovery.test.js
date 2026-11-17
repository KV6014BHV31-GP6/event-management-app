import { describe, it, expect, vi } from 'vitest';
import { COMMUNITY_EVENT_IDS, EXERCISE_EVENT_IDS, discoveryView, eventGroup, readDiscovery } from './event-discovery.js';
const community = [...COMMUNITY_EVENT_IDS].map((public_id, i) => ({public_id, title: `Community ${i}`}));
const exercises = [...EXERCISE_EVENT_IDS].map(public_id => ({public_id, title: 'Community exercise title'}));
describe('explicit release discovery', () => {
  it('classifies by ID, keeps unknown records and never guesses from a title', () => {
    expect(eventGroup({public_id: 'unknown', title: 'Synthetic lifecycle'})).toBe('other');
    const rows = [...exercises, ...community, {public_id:'unknown'}];
    expect(discoveryView(rows).slice(0,6)).toEqual(community);
    expect(discoveryView(rows,'community')).toHaveLength(6);
    expect(discoveryView(rows,'demo')).toEqual(exercises);
    expect(discoveryView(rows)).toHaveLength(9);
  });
  it('reads both server pages before grouping, retaining keyword and abort signal', async () => {
    const rows = [...exercises, ...community], signal = new AbortController().signal;
    const api = {getEvents:vi.fn(async ({page}) => ({data: rows.slice((page-1)*6,page*6), page, total_pages:2, total_count:8}))};
    const result = await readDiscovery(api,{page:1,pageSize:6,keyword:'community',signal});
    expect(result.records.slice(0,6)).toEqual(community);
    expect(result.records.slice(6)).toEqual(exercises);
    expect(api.getEvents).toHaveBeenLastCalledWith({page:2,pageSize:6,keyword:'community',signal});
  });
  it('never presents a partial list when another server page fails', async () => {
    const api = {getEvents:vi.fn().mockResolvedValueOnce({data:community,page:1,total_pages:2}).mockRejectedValueOnce(new Error('read failed'))};
    await expect(readDiscovery(api,{page:1,pageSize:6})).rejects.toThrow('read failed');
  });
});


it('produces the same complete ordering when navigation initially requests page 1 or page 2', async () => {
  const rows = [...exercises, ...community];
  const api = {getEvents:vi.fn(async ({page, pageSize}) => ({data:rows.slice((page-1)*pageSize,page*pageSize),page,total_pages:2,total_count:8}))};
  const fromFirst = await readDiscovery(api,{page:1,pageSize:6});
  const fromSecond = await readDiscovery(api,{page:2,pageSize:6});
  expect(fromSecond.records).toEqual(fromFirst.records);
  expect(fromSecond.records.slice(0,6)).toEqual(community);
  expect(fromSecond.records.slice(6)).toEqual(exercises);
});


it('recovers duplicate pagination and a missing source event with exactly one bounded snapshot read', async () => {
  const rows = [...exercises, ...community], signal = new AbortController().signal;
  const api = {getEvents:vi.fn(async ({page,pageSize}) => {
    if (pageSize === 100) return {data:rows,page:1,total_pages:1,total_count:8};
    const pages = [[...exercises,community[1]], [community[2],community[3],community[4]], [community[5],community[2]]];
    return {data:pages[page-1],page,total_pages:3,total_count:8};
  })};
  const result = await readDiscovery(api,{page:1,pageSize:3,keyword:'community',signal});
  expect(result.records).toHaveLength(8);
  expect(discoveryView(result.records,'community')).toEqual(community);
  expect(api.getEvents).toHaveBeenCalledTimes(4);
  expect(api.getEvents).toHaveBeenLastCalledWith({page:1,pageSize:100,keyword:'community',signal});
});

it.each([
  {data:[community[0]],page:1,total_pages:1,total_count:2},
  {data:[community[0]],page:1,total_pages:2,total_count:101},
])('fails closed when the one bounded snapshot cannot prove completeness', async snapshot => {
  const api = {getEvents:vi.fn(async ({page,pageSize}) => pageSize === 100 ? snapshot : ({data:[community[0]],page,total_pages:2,total_count:2}))};
  await expect(readDiscovery(api,{page:1,pageSize:1})).rejects.toThrow('complete');
  expect(api.getEvents).toHaveBeenCalledTimes(3);
});

it('keeps known exercises out of public results while retaining every unknown event', async () => {
  const { publicDiscovery } = await import('./event-discovery.js');
  const newEvent = {public_id:'new-id', title:'New community workshop'};
  expect(publicDiscovery([...exercises, ...community, newEvent])).toEqual([...community, newEvent]);
  expect(publicDiscovery(exercises)).toEqual([]);
  expect(discoveryView(exercises, 'demo')).toEqual(exercises);
});
