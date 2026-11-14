import { it, expect, vi } from 'vitest';
import { createJourneyClient } from './journey-api.js';
it('persists immutable request before send and reconciles unknown rather than resending', async () => {
  const saved = new Map();
  const storage = {
    getItem: k => saved.get(k) || null,
    setItem: (k, v) => saved.set(k, v),
    removeItem: k => saved.delete(k)
  };
  const fetch = vi.fn(async () => {
    expect(saved.size).toBe(1);
    throw new TypeError('lost');
  });
  const c = createJourneyClient({
    fetchImpl: fetch,
    storage,
    authorize: fn => fn('token', {
      id: 'actor'
    })
  });
  await expect(c.mutate('/events/a/publish', {}, 1)).rejects.toThrow();
  expect(c.pending('actor')).toHaveLength(1);
  const request = JSON.parse([...saved.values()][0])[0];
  expect(request.body.operation_id).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('retains identity and immutable conflicts for reconciliation and never repeats a send', async () => {
  for (const status of [401, 403, 409]) {
    const saved = new Map();
    const storage = {
      getItem: k => saved.get(k) || null,
      setItem: (k, v) => saved.set(k, v)
    };
    const fetch = vi.fn(async () => ({
      ok: false,
      status,
      json: async () => ({
        detail: {
          code: 'IMMUTABLE_CONFLICT',
          message: 'locked'
        }
      })
    }));
    const c = createJourneyClient({
      storage,
      fetchImpl: fetch,
      authorize: fn => fn('token', {
        id: 'actor'
      })
    });
    await expect(c.mutate('/events/a/publish', {}, 1)).rejects.toThrow('locked');
    expect(c.pending('actor')).toHaveLength(1);
    await expect(c.mutate('/events/a/publish', {}, 1)).rejects.toThrow(/unresolved/);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});
it('never persists account passwords while preserving operation ID and fingerprint', async () => {
  const saved = new Map();
  const storage = {
    getItem: k => saved.get(k) || null,
    setItem: (k, v) => saved.set(k, v)
  };
  const c = createJourneyClient({
    storage,
    fetchImpl: async () => {
      throw new Error('lost');
    },
    authorize: fn => fn('token', {
      id: 'actor'
    })
  });
  await expect(c.mutate('/accounts', {
    username: 'synthetic',
    password: 'CANARY_SECRET',
    role: 'user',
    synthetic: true
  })).rejects.toThrow();
  expect([...saved.values()].join()).not.toContain('CANARY_SECRET');
  expect(c.pending('actor')[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
});
it('archives a proven rollback refusal but retains immutable conflict and supports bounded exact same-ID recovery',async()=>{const saved=new Map();const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};let mode='stale',posted=[];const fetch=vi.fn(async(path,options)=>{if(options.method==='POST'){const body=JSON.parse(options.body);posted.push(body);if(mode==='stale')return {ok:false,status:409,json:async()=>({detail:{code:'STALE_VERSION',message:'Read current version'}})};if(mode==='lost'){mode='missing';throw new Error('lost');}return {ok:true,status:200,json:async()=>({contract_version:body.contract_version,operation_id:body.operation_id,outcome:'applied'})};}return {ok:false,status:404,json:async()=>({detail:{code:'NOT_FOUND'}})};});const c=createJourneyClient({fetchImpl:fetch,storage,authorize:fn=>fn('token',{id:'actor'})});await expect(c.mutate('/events/a/publish',{},1)).rejects.toThrow();expect(c.pending('actor')).toHaveLength(0);expect([...saved.keys()].some(k=>k.endsWith('.refused'))).toBe(true);mode='lost';await expect(c.mutate('/events/a/publish',{},2)).rejects.toThrow();const row=c.pending('actor')[0];await expect(c.replayExact(row.body.operation_id)).rejects.toThrow(/twice/);await expect(c.reconcile(row.body.operation_id)).rejects.toThrow();await expect(c.reconcile(row.body.operation_id)).rejects.toThrow();mode='success';await c.replayExact(row.body.operation_id);expect(posted.at(-1)).toEqual(posted.at(-2));expect(c.pending('actor')).toHaveLength(0);});
it('binds anonymous application POST and receipt read to the same private application key',async()=>{const saved=new Map(),privateSaved=new Map();const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},keyStorage={getItem:k=>privateSaved.get(k)||null,setItem:(k,v)=>privateSaved.set(k,v),removeItem:k=>privateSaved.delete(k)};let secret;const fetch=vi.fn(async(path,options)=>{if(options.method==='POST'){secret=options.headers['X-Application-Key'];expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);throw new Error('lost');}expect(options.headers['X-Application-Key']).toBe(secret);const id=path.split('/').at(-1),reference='01K00000000000000000000001';return {ok:true,status:200,json:async()=>({contract_version:'rose.demo-journey.v1',operation_id:id,outcome:'applied',kind:'application_create',resource_id:reference,effects:{registration_id:reference,status:'pending'}})};});const c=createJourneyClient({storage,keyStorage,fetchImpl:fetch,authorize:fn=>fn(null,{id:'guest'})});await expect(c.mutate('/events/a/applications',{application:{}})).rejects.toThrow();expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);expect([...saved.values()].join()).not.toContain(secret);await c.reconcile(c.pending('guest')[0].body.operation_id);expect(privateSaved.size).toBe(0);});

it.each([
  {kind: 'registration_review'},
  {resource_id: '01K00000000000000000000002'},
  {effects: {registration_id: '01K00000000000000000000001', status: 'approved'}},
  {effects: {registration_id: '', status: 'pending'}},
])('retains the original application operation when an applied envelope has mismatched effects %j', async (override) => {
  const reference = '01K00000000000000000000001';
  const fetchImpl = vi.fn(async (_path, options) => {
    const body = JSON.parse(options.body);
    return {ok: true, json: async () => ({
      contract_version: body.contract_version,
      operation_id: body.operation_id,
      outcome: 'applied',
      kind: 'application_create',
      resource_id: reference,
      effects: {registration_id: reference, status: 'pending'},
      ...override,
    })};
  });
  const client = createJourneyClient({fetchImpl, authorize: fn => fn('token', {id: 'actor'})});
  const path = '/events/ABCDEFGHIJKLMNOPQRSTU/applications';
  await expect(client.mutate(path, {})).rejects.toThrow('The operation receipt could not be verified.');
  expect(client.pending('actor')).toHaveLength(1);
  await expect(client.mutate(path, {})).rejects.toThrow(/unresolved reference/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
