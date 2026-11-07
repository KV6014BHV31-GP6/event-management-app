import { describe, expect, it, vi } from "vitest";
import { createApi } from "../../live/api.mjs";
import { createSession } from "../../live/session.mjs";
import { resources } from "./i18n/index.js";
import {
  ApiError,
  createRuntime,
  createSignupController,
  signupPayload,
} from "./service.js";

const ID = "01K00000000000000000000001";
const ORGANIZER = {
  id: ID,
  username: "synthetic-organizer",
  role: "organizer",
};
const USER = { id: ID, username: "synthetic-user", role: "user" };
const EVENT = {
  id: 1,
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  organizer_id: ID,
  title: "Synthetic community activity",
  overview: null,
  location: "Synthetic hall",
  start_time: "2027-03-15T10:00:00Z",
  end_time: "2027-03-15T12:00:00Z",
  online_quota: 1,
  offline_quota: 0,
  status: "active",
  created_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
};
const PARTICIPANT = {
  first_name: "Synthetic",
  last_name: "Example",
  gender: "female",
  date_of_birth: "1990-01-01",
  phone: "TEST",
  address: "",
  national_id: "SYNTHETIC-ONLY-001",
  income_band_code: "",
  marriage_status: "single",
};
const values = {
  title: EVENT.title,
  location: EVENT.location,
  overview: "",
  start_time: "2027-03-15T10:00",
  end_time: "2027-03-15T12:00",
  online_quota: "1",
  offline_quota: "0",
};
const storage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    map,
  };
};
async function runtimeFor(role = USER, methods = {}) {
  const api = {
    login: vi.fn().mockResolvedValue("synthetic-token"),
    getMe: vi.fn().mockResolvedValue(role),
    ...methods,
  };
  const runtime = createRuntime({ api, storage: storage() });
  await runtime.signIn({
    username: role.username,
    password: "synthetic-password",
  });
  await runtime.restore();
  return { runtime, api };
}

describe("React adapter preserves the reviewed write boundary", () => {
  it("preserves exact username Unicode and rejects whitespace-only and bcrypt byte overflow", () => {
    expect(
      signupPayload({ username: " ABC ", password: "123456" }).username,
    ).toBe(" ABC ");
    expect(() =>
      signupPayload({ username: "   ", password: "123456" }),
    ).toThrow("3–20");
    expect(() =>
      signupPayload({ username: "測試用戶", password: "密".repeat(25) }),
    ).toThrow("72 UTF-8");
  });
  it("sends signup once while in flight and retains an uncertain lock", async () => {
    let reject;
    const api = {
      createUser: vi.fn(
        () =>
          new Promise((_, failed) => {
            reject = failed;
          }),
      ),
    };
    const controller = createSignupController({ api });
    const first = controller.submit({
      username: "synthetic",
      password: "123456",
    });
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(api.createUser).toHaveBeenCalledTimes(1);
    reject(new ApiError("network", "Lost response"));
    await first;
    expect(controller.state.status).toBe("uncertain");
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(api.createUser).toHaveBeenCalledTimes(1);
  });
  it("allows correcting a known duplicate rejection without an automatic retry", async () => {
    const api = {
      createUser: vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("duplicate", "Duplicate username", 400),
        )
        .mockResolvedValue({ id: ID, username: "changed", role: "user" }),
    };
    const controller = createSignupController({ api });
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(controller.state.status).toBe("error");
    expect(api.createUser).toHaveBeenCalledTimes(1);
    await controller.submit({ username: "changed", password: "123456" });
    expect(controller.state.status).toBe("success");
  });
  it("uses strict API signup validation, including rejection of a privileged success response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: ID,
          username: "synthetic",
          role: "organizer",
          created_at: EVENT.created_at,
          updated_at: EVENT.updated_at,
        }),
        { status: 201 },
      ),
    );
    const api = createApi({ fetchImpl });
    const controller = createSignupController({ api });
    await controller.submit({ username: "synthetic", password: "123456" });
    expect(controller.state.status).toBe("uncertain");
    const options = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(options.body)).toEqual({
      username: "synthetic",
      password: "123456",
    });
    expect(options.headers.Authorization).toBeUndefined();
  });
  it("retains failed identity instead of allowing anonymous guest submission", async () => {
    const kept = storage();
    kept.setItem("rose.live.access-token", "synthetic-token");
    const api = {
      getMe: vi
        .fn()
        .mockRejectedValue(new ApiError("network", "No connection")),
      registerGuestForEvent: vi.fn(),
    };
    const runtime = createRuntime({ api, storage: kept });
    await runtime.restore();
    expect(runtime.getSnapshot()).toMatchObject({
      hasToken: true,
      user: null,
      checking: false,
    });
    const controller = runtime.store("guest", { event: EVENT }).controller;
    await controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
    runtime.logout();
    expect(runtime.getSnapshot()).toMatchObject({
      hasToken: false,
      user: null,
    });
  });
  it("retains a sticky failed identity after restore401 removes the token, until explicit Logout", async () => {
    const kept = storage();
    kept.setItem("rose.live.access-token", "synthetic-token");
    const api = {
      getMe: vi
        .fn()
        .mockRejectedValue(new ApiError("unauthorized", "Expired login", 401)),
      registerGuestForEvent: vi.fn().mockResolvedValue({
        event_id: 1,
        created_by_user_id: null,
        channel: "online",
        status: "pending",
      }),
    };
    const runtime = createRuntime({ api, storage: kept });
    await runtime.restore();
    expect(runtime.getSnapshot()).toMatchObject({
      identityBlocked: true,
      hasToken: false,
      user: null,
    });
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
    runtime.logout();
    expect(runtime.getSnapshot().identityBlocked).toBe(false);
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).toHaveBeenCalledTimes(1);
  });
  it("does not turn an authenticated registration401 into Guest mode", async () => {
    const { runtime, api } = await runtimeFor(USER, {
      registerForEvent: vi
        .fn()
        .mockRejectedValue(new ApiError("unauthorized", "Expired login", 401)),
      registerGuestForEvent: vi.fn(),
    });
    await runtime
      .store("registration", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(runtime.getSnapshot()).toMatchObject({
      identityBlocked: true,
      hasToken: false,
      user: null,
    });
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).not.toHaveBeenCalled();
  });
  it("resets only completed Signup and Edit operations and preserves uncertain Signup locks", async () => {
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      createUser: vi
        .fn()
        .mockResolvedValue({ id: ID, username: "synthetic", role: "user" }),
      getEvent: vi.fn().mockResolvedValue(EVENT),
      updateEvent: vi.fn().mockResolvedValue({ ...EVENT, title: "Changed" }),
    });
    const signup = runtime.store("signup");
    expect(runtime.beginAnotherSignup()).toBe(false);
    await signup.controller.submit({
      username: "synthetic",
      password: "123456",
    });
    expect(runtime.beginAnotherSignup()).toBe(true);
    expect(runtime.store("signup")).not.toBe(signup);
    api.createUser.mockRejectedValueOnce(
      new ApiError("network", "Lost response"),
    );
    await runtime
      .store("signup")
      .controller.submit({ username: "synthetic", password: "123456" });
    expect(runtime.beginAnotherSignup()).toBe(false);
    const edit = runtime.store("edit", { event: EVENT });
    expect(runtime.beginAnotherEdit(EVENT.public_id)).toBe(false);
    await edit.controller.load(EVENT.public_id);
    api.getEvent.mockResolvedValueOnce({ ...EVENT, title: "Changed" });
    await edit.controller.submit({ title: "Changed" });
    expect(edit.controller.state.status).toBe("success");
    expect(runtime.beginAnotherEdit(EVENT.public_id)).toBe(true);
    expect(runtime.store("edit", { event: EVENT })).not.toBe(edit);
  });
  it("retains the same guest uncertain controller across route visits and never resends", async () => {
    const api = {
      registerGuestForEvent: vi
        .fn()
        .mockRejectedValue(new ApiError("timeout", "Lost response")),
    };
    const runtime = createRuntime({ api, storage: storage() });
    await runtime.restore();
    const first = runtime.store("guest", { event: EVENT });
    await first.controller.submit(PARTICIPANT);
    const revisited = runtime.store("guest", { event: { ...EVENT } });
    expect(revisited).toBe(first);
    await revisited.controller.submit(PARTICIPANT);
    expect(api.registerGuestForEvent).toHaveBeenCalledTimes(1);
    expect(first.controller.state.status).toBe("uncertain");
  });
  it("suppresses a guest receipt if the account changes during its write", async () => {
    let resolve;
    const api = {
      registerGuestForEvent: vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    const runtime = createRuntime({ api, storage: storage() });
    await runtime.restore();
    const controller = runtime.store("guest", { event: EVENT }).controller;
    const write = controller.submit(PARTICIPANT);
    runtime.logout();
    resolve({
      event_id: 1,
      created_by_user_id: null,
      channel: "online",
      status: "pending",
    });
    await write;
    expect(controller.state).toMatchObject({
      status: "uncertain",
      receipt: null,
    });
  });
  it("does not persist participant values or receipts in browser storage", async () => {
    const kept = storage();
    const api = {
      registerGuestForEvent: vi.fn().mockResolvedValue({
        id: ID,
        event_id: 1,
        created_by_user_id: null,
        channel: "online",
        status: "pending",
      }),
    };
    const runtime = createRuntime({ api, storage: kept });
    await runtime.restore();
    await runtime
      .store("guest", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(kept.map.size).toBe(0);
  });
  it("blocks create for leader and participant identities", async () => {
    for (const role of ["leader", "user"]) {
      const { runtime, api } = await runtimeFor(
        { ...USER, role },
        { createEvent: vi.fn() },
      );
      await runtime.store("create").controller.submit(values);
      expect(api.createEvent).not.toHaveBeenCalled();
    }
  });
  it("offers an explicit new create only after a confirmed success", async () => {
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      createEvent: vi.fn().mockResolvedValue(EVENT),
    });
    const first = runtime.store("create");
    expect(runtime.beginAnotherEvent()).toBe(false);
    await first.controller.submit(values);
    expect(api.createEvent).toHaveBeenCalledTimes(1);
    expect(runtime.beginAnotherEvent()).toBe(true);
    expect(runtime.store("create")).not.toBe(first);
    expect(runtime.store("create").controller.state.status).toBe("idle");
  });
  it("does not unlock an uncertain create through the new-event action", async () => {
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      createEvent: vi
        .fn()
        .mockRejectedValue(new ApiError("network", "Lost response")),
    });
    const store = runtime.store("create");
    await store.controller.submit(values);
    expect(runtime.beginAnotherEvent()).toBe(false);
    await store.controller.submit(values);
    expect(api.createEvent).toHaveBeenCalledTimes(1);
  });
  it("re-verifies participant identity before an application and makes no write on verification failure", async () => {
    const { runtime, api } = await runtimeFor(USER, {
      registerForEvent: vi.fn(),
    });
    api.getMe.mockRejectedValueOnce(new ApiError("network", "Lost profile"));
    await runtime
      .store("registration", { event: EVENT })
      .controller.submit(PARTICIPANT);
    expect(api.registerForEvent).not.toHaveBeenCalled();
  });
  it("re-verifies the organizer before approval and locks a lost result across a reread", async () => {
    const record = {
      id: ID,
      event_id: 1,
      participant_id: ID,
      created_by_user_id: null,
      status: "pending",
    };
    const { runtime, api } = await runtimeFor(ORGANIZER, {
      getOrganizerRegistrations: vi.fn().mockResolvedValue([record]),
      approveRegistration: vi
        .fn()
        .mockRejectedValue(new ApiError("network", "Lost response")),
    });
    const controller = runtime.store("records", {
      mode: "organizer",
    }).controller;
    await controller.load();
    await controller.approve(ID);
    await controller.load();
    await controller.approve(ID);
    expect(api.approveRegistration).toHaveBeenCalledTimes(1);
    expect(controller.locked(ID)).toBe(true);
    expect(api.getMe.mock.calls.length).toBeGreaterThan(3);
  });
  it("requires explicit cancellation confirmation and server ownership", async () => {
    const record = {
      id: ID,
      event_id: 1,
      participant_id: ID,
      created_by_user_id: USER.id,
      status: "pending",
    };
    const { runtime, api } = await runtimeFor(USER, {
      getMyRegistrations: vi.fn().mockResolvedValue([record]),
      cancelRegistration: vi
        .fn()
        .mockResolvedValue({ ...record, status: "cancelled" }),
    });
    const controller = runtime.store("records", { mode: "my" }).controller;
    await controller.load();
    await controller.cancel(ID);
    expect(api.cancelRegistration).not.toHaveBeenCalled();
    await controller.cancel(ID, { confirmed: true });
    expect(api.cancelRegistration).toHaveBeenCalledTimes(1);
  });
  it("refuses to display a participant list attributed to a different account", async () => {
    const { runtime } = await runtimeFor(USER, {
      getMyRegistrations: vi.fn().mockResolvedValue([
        {
          id: ID,
          event_id: 1,
          participant_id: ID,
          created_by_user_id: "different",
          status: "pending",
        },
      ]),
    });
    const controller = runtime.store("records", { mode: "my" }).controller;
    await controller.load();
    expect(controller.state.status).toBe("error");
    expect(controller.state.records).toEqual([]);
  });
});

// Deterministic completion order; credentials stay in memory and assertions expose only Booleans/counts.
const rirDeferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return {promise,resolve,reject};
};
const rirOutcome = promise => promise.then(() => ({resolved:true}), error => ({resolved:false,kind:error.kind,status:error.status,
  localized:Object.hasOwn(resources.en.translation,error.message)&&Object.hasOwn(resources.ms.translation,error.message)}));
const rirCredentials = actor => ({username:actor.username,password:crypto.randomUUID()});
function rirFixture({stored=false,writeFails=false}={}) {
  const a={id:crypto.randomUUID(),username:'synthetic-runtime-a',role:'leader'};
  const b={id:crypto.randomUUID(),username:'synthetic-runtime-b',role:'leader'};
  const tokenA=crypto.randomUUID(),tokenB=crypto.randomUUID(),kept=storage();
  if(stored)kept.setItem('rose.live.access-token',tokenA);
  if(writeFails)kept.setItem=()=>{throw new Error('Controlled unavailable persistence.');};
  const forbidden=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw new Error('Real fetch is forbidden in runtime fixtures.');});
  const api={
    login:vi.fn(async values=>values.username===a.username?tokenA:tokenB),
    getMe:vi.fn(async token=>token===tokenA?a:b),
    submitOfflineBatch:vi.fn(async()=>{throw new ApiError('network','Controlled lost result.');}),
    getOfflineBatch:vi.fn(async()=>{throw new ApiError('network','Controlled lost result.');}),
    registerGuestForEvent:vi.fn(),
  };
  const runtime=createRuntime({api,storage:kept,offlineAccessStorage:storage()});
  return {a,b,tokenA,tokenB,kept,api,runtime,close:async()=>{await runtime.offline.close();expect(forbidden.mock.calls.length).toBe(0);}};
}
function rirPreserved(f,before) {
  const after=f.runtime.getSnapshot();
  expect({actor:after.user?.id===f.b.id,revision:after.revision===before.revision,
    token:after.hasToken,stored:f.kept.getItem('rose.live.access-token')===f.tokenB,
    unblocked:after.identityBlocked===false,offline:after.offlineActor?.id===f.b.id,
    candidate:after.offlineCandidate?.id===f.b.id}).toEqual({actor:true,revision:true,token:true,stored:true,unblocked:true,offline:true,candidate:true});
}
async function rirUsable(f) {
  let callback=0,correct=false;
  const result=await rirOutcome(f.runtime.withVerifiedAccount(async(token,profile)=>{callback++;correct=token===f.tokenB&&profile.id===f.b.id;}));
  expect({resolved:result.resolved,once:callback===1,correct}).toEqual({resolved:true,once:true,correct:true});
}
it.each(['refusal','success'])('RIR01/02 old login %s preserves a later actor and its usable bearer',async kind=>{
  const f=rirFixture(),old=rirDeferred();
  f.api.login.mockImplementationOnce(()=>old.promise);
  try{
    const pending=rirOutcome(f.runtime.signIn(rirCredentials(f.a)));
    await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();
    if(kind==='refusal')old.reject(new ApiError('unauthorized','Controlled old refusal.',401));else old.resolve(f.tokenA);
    expect((await pending).resolved).toBe(false);rirPreserved(f,before);await rirUsable(f);
    expect(f.api.login.mock.calls.length).toBe(2);
  }finally{await f.close();}
});
for(const method of ['freshOfflineIdentity','withVerifiedAccount']){
  it.each(['401','403','success','mismatch'])(`RIR03 ${method} old %s cannot affect a newer identity`,async kind=>{
    const f=rirFixture(),old=rirDeferred(),started=rirDeferred();let hold=false,callbacks=0;
    f.api.getMe.mockImplementation(async token=>{if(token===f.tokenA&&hold){started.resolve();return old.promise;}return token===f.tokenA?f.a:f.b;});
    try{
      await f.runtime.signIn(rirCredentials(f.a));hold=true;
      const pending=rirOutcome(method==='freshOfflineIdentity'?f.runtime.freshOfflineIdentity(f.a):f.runtime.withVerifiedAccount(async()=>{callbacks++;}));
      await started.promise;await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();
      if(kind==='401'||kind==='403')old.reject(new ApiError('unauthorized','Controlled old identity refusal.',Number(kind)));
      else old.resolve(kind==='success'?f.a:f.b);
      expect((await pending).resolved).toBe(false);expect(callbacks).toBe(0);rirPreserved(f,before);await rirUsable(f);
    }finally{await f.close();}
  });
}
it.each(['success','401'])('RIR04 already-sent callback %s stays uncertain after actor change without replay',async kind=>{
  const f=rirFixture(),old=rirDeferred(),started=rirDeferred();let calls=0,correctToken=false;
  try{
    await f.runtime.signIn(rirCredentials(f.a));
    const pending=rirOutcome(f.runtime.withVerifiedAccount(async token=>{calls++;correctToken=token===f.tokenA;started.resolve();return old.promise;}));
    await started.promise;await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();
    if(kind==='success')old.resolve(true);else old.reject(new ApiError('unauthorized','Controlled sent-operation refusal.',401));
    expect((await pending).kind==='uncertain').toBe(true);expect(calls).toBe(1);expect(correctToken).toBe(true);
    rirPreserved(f,before);await rirUsable(f);
  }finally{await f.close();}
});
it.each(['success','refusal'])('RIR04 explicit logout survives pending login %s',async kind=>{
  const f=rirFixture(),old=rirDeferred();f.api.login.mockImplementationOnce(()=>old.promise);
  try{
    const pending=rirOutcome(f.runtime.signIn(rirCredentials(f.a)));f.runtime.logout();const before=f.runtime.getSnapshot();
    if(kind==='success')old.resolve(f.tokenA);else old.reject(new ApiError('unauthorized','Controlled old refusal.',401));
    expect((await pending).resolved).toBe(false);const after=f.runtime.getSnapshot();
    expect({empty:!after.user&&!after.hasToken&&!after.offlineActor,unblocked:after.identityBlocked===false,
      revision:after.revision===before.revision,message:after.message===before.message}).toEqual({empty:true,unblocked:true,revision:true,message:true});
  }finally{await f.close();}
});
for(const method of ['freshOfflineIdentity','withVerifiedAccount']){
  it.each(['success','401'])(`RIR04 explicit logout survives pending ${method} %s`,async kind=>{
    const f=rirFixture(),old=rirDeferred(),started=rirDeferred();let callbacks=0;
    try{
      await f.runtime.signIn(rirCredentials(f.a));
      f.api.getMe.mockImplementationOnce(()=>{started.resolve();return old.promise;});
      const pending=rirOutcome(method==='freshOfflineIdentity'?f.runtime.freshOfflineIdentity(f.a):f.runtime.withVerifiedAccount(async()=>{callbacks++;}));
      await started.promise;f.runtime.logout();const before=f.runtime.getSnapshot();
      if(kind==='success')old.resolve(f.a);else old.reject(new ApiError('unauthorized','Controlled old verification refusal.',401));
      expect((await pending).resolved).toBe(false);const after=f.runtime.getSnapshot();
      expect({empty:!after.user&&!after.hasToken&&!after.offlineActor,unblocked:!after.identityBlocked,
        revision:after.revision===before.revision,message:after.message===before.message,noCallback:callbacks===0}).toEqual({empty:true,unblocked:true,revision:true,message:true,noCallback:true});
    }finally{await f.close();}
  });
}
it('RIR04 a current role mismatch refuses the callback under the existing policy',async()=>{
  const f=rirFixture();let callbacks=0;
  try{
    await f.runtime.signIn(rirCredentials(f.a));
    const result=await rirOutcome(f.runtime.withVerifiedAccount(async()=>{callbacks++;},{roles:['organizer']}));
    expect({forbidden:result.status===403,noCallback:callbacks===0,current:f.runtime.getSnapshot().user?.id===f.a.id,
      unblocked:!f.runtime.getSnapshot().identityBlocked}).toEqual({forbidden:true,noCallback:true,current:true,unblocked:true});
  }finally{await f.close();}
});
it('RIR04 current login refusal stays blocked until explicit logout',async()=>{
  const f=rirFixture();f.api.login.mockRejectedValueOnce(new ApiError('unauthorized','Controlled current refusal.',401));
  try{
    expect((await rirOutcome(f.runtime.signIn(rirCredentials(f.a)))).resolved).toBe(false);
    const after=f.runtime.getSnapshot();expect({blocked:after.identityBlocked,empty:!after.user&&!after.hasToken&&!after.offlineActor}).toEqual({blocked:true,empty:true});
    f.runtime.logout();expect(f.runtime.getSnapshot().identityBlocked).toBe(false);
  }finally{await f.close();}
});
it.each(['fresh401','fresh403','verified401','verifiedMismatch'])('RIR04 current %s retains its existing refusal policy',async kind=>{
  const f=rirFixture();let callbacks=0;
  try{
    await f.runtime.signIn(rirCredentials(f.a));
    if(kind==='verifiedMismatch')f.api.getMe.mockResolvedValueOnce(f.b);
    else f.api.getMe.mockRejectedValueOnce(new ApiError('unauthorized','Controlled current refusal.',kind==='fresh403'?403:401));
    const result=await rirOutcome(kind.startsWith('fresh')?f.runtime.freshOfflineIdentity(f.a):f.runtime.withVerifiedAccount(async()=>{callbacks++;}));
    expect(result.resolved).toBe(false);expect(callbacks).toBe(0);
    const after=f.runtime.getSnapshot();
    if(kind==='verifiedMismatch')expect({token:after.hasToken,blocked:after.identityBlocked}).toEqual({token:true,blocked:false});
    else expect({blocked:after.identityBlocked,locked:after.offlineActor===null,token:after.hasToken}).toEqual({blocked:true,locked:true,token:kind==='fresh403'});
  }finally{await f.close();}
});
async function rirOffline(f) {
  await f.runtime.signIn(rirCredentials(f.a));
  await f.runtime.offline.saveEvent(f.a,EVENT,{verifiedOnline:true});
  const draft=await f.runtime.offline.saveDraft(f.a,{event_public_id:EVENT.public_id,application:{first_name:'Synthetic runtime fixture'},syntheticConfirmed:true});
  await f.runtime.offline.queue(f.a,draft.client_submission_id);
}
async function rirRetained(f,original) {
  const rows=await f.runtime.offline.batches(f.a),drafts=await f.runtime.offline.drafts(f.a);
  expect({one:rows.length===1,id:rows[0]?.batch_id===original.batch_id,
    request:JSON.stringify(rows[0]?.request)===JSON.stringify(original.request),fingerprint:rows[0]?.payload_fingerprint===original.payload_fingerprint,
    batch:rows[0]?.state==='needs_review',draft:drafts.length===1&&drafts[0].state==='needs_review',
    other:(await f.runtime.offline.batches(f.b)).length===0,released:f.runtime.manualSync.busy===false}).toEqual({one:true,id:true,request:true,fingerprint:true,batch:true,draft:true,other:true,released:true});
}
it.each(['POST401','GET403'])('RIR05 late manual %s keeps original unresolved work and preserves B',async kind=>{
  const f=rirFixture(),old=rirDeferred(),started=rirDeferred();let correct=false,original;
  try{
    await rirOffline(f);
    if(kind==='GET403'){original=await f.runtime.offline.prepareBatch(f.a,EVENT.public_id);await f.runtime.offline.markUnknown(f.a,original.batch_id);}
    const apiMethod=kind==='POST401'?f.api.submitOfflineBatch:f.api.getOfflineBatch;
    apiMethod.mockImplementation(async(_event,_body,token,actor)=>{correct=token===f.tokenA&&actor.id===f.a.id;started.resolve();return old.promise;});
    const pending=rirOutcome(kind==='POST401'?f.runtime.manualSync.sync(f.a,EVENT.public_id):f.runtime.manualSync.reconcile(f.a,original.batch_id));
    await started.promise;if(!original)[original]=await f.runtime.offline.batches(f.a);
    await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();
    old.reject(new ApiError('unauthorized','Controlled old manual refusal.',kind==='POST401'?401:403));
    expect((await pending).status===(kind==='POST401'?401:403)).toBe(true);expect(correct).toBe(true);
    await rirRetained(f,original);rirPreserved(f,before);await rirUsable(f);
    expect(f.api.submitOfflineBatch.mock.calls.length).toBe(kind==='POST401'?1:0);
    expect(f.api.getOfflineBatch.mock.calls.length).toBe(kind==='GET403'?1:0);
  }finally{await f.close();}
});
it('RIR05 current manual401 still logs out and retains original unknown batch',async()=>{
  const f=rirFixture();f.api.submitOfflineBatch.mockRejectedValueOnce(new ApiError('unauthorized','Controlled current manual refusal.',401));
  try{
    await rirOffline(f);const revision=f.runtime.getSnapshot().revision;
    expect((await rirOutcome(f.runtime.manualSync.sync(f.a,EVENT.public_id))).status===401).toBe(true);
    const after=f.runtime.getSnapshot();expect({empty:!after.user&&!after.hasToken&&!after.offlineActor,blocked:after.identityBlocked,advanced:after.revision>revision}).toEqual({empty:true,blocked:true,advanced:true});
    const [original]=await f.runtime.offline.batches(f.a);await rirRetained(f,original);expect(f.api.submitOfflineBatch.mock.calls.length).toBe(1);
  }finally{await f.close();}
});
it.each(['prepareBatch','batch'])('RIR06 transition during actual %s prevents old-context dispatch',async method=>{
  const f=rirFixture(),ready=rirDeferred(),release=rirDeferred();let original;
  try{
    await rirOffline(f);
    if(method==='batch'){original=await f.runtime.offline.prepareBatch(f.a,EVENT.public_id);await f.runtime.offline.markUnknown(f.a,original.batch_id);}
    const actual=f.runtime.offline[method].bind(f.runtime.offline);
    vi.spyOn(f.runtime.offline,method).mockImplementationOnce(async(...args)=>{const row=await actual(...args);ready.resolve(row);await release.promise;return row;});
    const pending=rirOutcome(method==='prepareBatch'?f.runtime.manualSync.sync(f.a,EVENT.public_id):f.runtime.manualSync.reconcile(f.a,original.batch_id));
    original=await ready.promise;await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();
    expect((await rirOutcome(f.runtime.manualSync.sync(f.b,EVENT.public_id))).resolved).toBe(false);
    release.resolve();const result=await pending;
    expect({rejected:!result.resolved,localized:result.localized}).toEqual({rejected:true,localized:true});
    expect(f.api.submitOfflineBatch.mock.calls.length).toBe(0);expect(f.api.getOfflineBatch.mock.calls.length).toBe(0);
    await rirRetained(f,original);rirPreserved(f,before);await rirUsable(f);
  }finally{await f.close();}
});
it('RIR06 a rejected busy attempt keeps the current action context and original API binding',async()=>{
  const f=rirFixture(),ready=rirDeferred(),release=rirDeferred();let correct=false;
  try{
    await rirOffline(f);const actual=f.runtime.offline.prepareBatch.bind(f.runtime.offline);
    vi.spyOn(f.runtime.offline,'prepareBatch').mockImplementationOnce(async(...args)=>{const batch=await actual(...args);ready.resolve(batch);await release.promise;return batch;});
    f.api.submitOfflineBatch.mockImplementation(function(eventId,body,token,actor){
      correct=this===f.api&&eventId===EVENT.public_id&&token===f.tokenA&&actor.id===f.a.id;
      return Promise.resolve({items:body.items.map(row=>({client_submission_id:row.client_submission_id,outcome:'accepted',code:'RECORDED',registration_status_at_recording:'pending'}))});
    });
    const pending=rirOutcome(f.runtime.manualSync.sync(f.a,EVENT.public_id));const original=await ready.promise;
    expect((await rirOutcome(f.runtime.manualSync.sync(f.b,EVENT.public_id))).resolved).toBe(false);
    release.resolve();expect((await pending).resolved).toBe(true);expect(correct).toBe(true);
    expect(f.api.submitOfflineBatch.mock.calls.length).toBe(1);expect(f.api.getOfflineBatch.mock.calls.length).toBe(0);
    const [saved]=await f.runtime.offline.batches(f.a),[draft]=await f.runtime.offline.drafts(f.a);
    expect({id:saved.batch_id===original.batch_id,body:JSON.stringify(saved.request)===JSON.stringify(original.request),
      fingerprint:saved.payload_fingerprint===original.payload_fingerprint,synced:draft.state==='synced',released:!f.runtime.manualSync.busy}).toEqual({id:true,body:true,fingerprint:true,synced:true,released:true});
  }finally{await f.close();}
});
it('RIR06 actor transition during replay GET404 prevents a new POST and keeps original IDs',async()=>{
  const f=rirFixture(),ready=rirDeferred(),release=rirDeferred();
  try{
    await rirOffline(f);const original=await f.runtime.offline.prepareBatch(f.a,EVENT.public_id);
    await f.runtime.offline.markUnknown(f.a,original.batch_id);await f.runtime.offline.markReconciledMissing(f.a,original.batch_id);
    f.api.getOfflineBatch.mockImplementationOnce(async()=>{ready.resolve();await release.promise;throw new ApiError('not_found','Controlled absent receipt.',404);});
    const pending=rirOutcome(f.runtime.manualSync.replayExact(f.a,original.batch_id));
    await ready.promise;await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();release.resolve();
    expect((await pending).resolved).toBe(false);expect(f.api.getOfflineBatch.mock.calls.length).toBe(1);expect(f.api.submitOfflineBatch.mock.calls.length).toBe(0);
    await rirRetained(f,original);rirPreserved(f,before);await rirUsable(f);
  }finally{await f.close();}
});
it('RIR07 discarded restore cannot erase the newer login persistence warning',async()=>{
  const f=rirFixture({stored:true,writeFails:true}),old=rirDeferred(),started=rirDeferred();
  f.api.getMe.mockImplementation(async token=>{if(token===f.tokenA){started.resolve();return old.promise;}return f.b;});
  try{
    const pending=f.runtime.restore();await started.promise;await f.runtime.signIn(rirCredentials(f.b));const before=f.runtime.getSnapshot();
    expect(Boolean(before.message)&&before.persistent===false).toBe(true);old.resolve(f.a);await pending;
    const after=f.runtime.getSnapshot();expect({actor:after.user?.id===f.b.id,revision:after.revision===before.revision,warning:after.message===before.message,unblocked:!after.identityBlocked,offline:after.offlineActor?.id===f.b.id}).toEqual({actor:true,revision:true,warning:true,unblocked:true,offline:true});
  }finally{await f.close();}
});
it.each(['success','401'])('RIR07 discarded restore %s cannot erase explicit logout feedback',async kind=>{
  const f=rirFixture({stored:true}),old=rirDeferred(),started=rirDeferred();
  f.api.getMe.mockImplementation(()=>{started.resolve();return old.promise;});
  try{
    const pending=f.runtime.restore();await started.promise;f.runtime.logout();const before=f.runtime.getSnapshot();
    if(kind==='success')old.resolve(f.a);else old.reject(new ApiError('unauthorized','Controlled old restore refusal.',401));await pending;
    const after=f.runtime.getSnapshot();expect({empty:!after.user&&!after.hasToken&&!after.offlineActor,unblocked:!after.identityBlocked,revision:after.revision===before.revision,message:after.message===before.message}).toEqual({empty:true,unblocked:true,revision:true,message:true});
  }finally{await f.close();}
});
it.each(['success','no-token','network','401'])('RIR07 current restore %s retains its existing policy',async kind=>{
  const f=rirFixture({stored:kind!=='no-token'});
  if(kind==='401'||kind==='network')f.api.getMe.mockRejectedValueOnce(new ApiError(kind==='401'?'unauthorized':'network','Controlled restore refusal.',kind==='401'?401:undefined));
  try{
    await f.runtime.restore();const after=f.runtime.getSnapshot();expect(after.checking).toBe(false);
    expect({user:after.user?.id===f.a.id,token:after.hasToken,blocked:after.identityBlocked,offline:after.offlineActor?.id===f.a.id}).toEqual({user:kind==='success',token:kind==='success'||kind==='network',blocked:kind==='401'||kind==='network',offline:kind==='success'});
  }finally{await f.close();}
});
it('RIR-control readonly Session epoch guard rejects old401 without clearing B',async()=>{
  const f=rirFixture(),old=rirDeferred(),started=rirDeferred();let hold=false,operations=0;
  const api={login:f.api.login,getMe:async token=>{if(token===f.tokenA&&hold){started.resolve();return old.promise;}return {...(token===f.tokenA?f.a:f.b),role:'user'};},getMyRegistrations:async()=>{operations++;return [];}};
  const session=createSession({api,storage:storage()});
  try{
    await session.signIn(rirCredentials(f.a));hold=true;const pending=rirOutcome(session.getMyRegistrations());await started.promise;
    await session.signIn(rirCredentials(f.b));const revision=session.revision;old.reject(new ApiError('unauthorized','Controlled old Session refusal.',401));
    expect((await pending).resolved).toBe(false);expect({actor:session.user?.id===f.b.id,revision:session.revision===revision,token:session.hasToken,noOperation:operations===0}).toEqual({actor:true,revision:true,token:true,noOperation:true});
  }finally{await f.close();}
});
