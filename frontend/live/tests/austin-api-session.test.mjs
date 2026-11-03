import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi, validateRegistrationRead, validatedQuota } from '../api.mjs';
import { createSession } from '../session.mjs';
import { safeImagePath, createEventImage } from '../image-path.mjs';
import { createQuotaView } from '../booking-state-view.mjs';

const id = '01J00000000000000000000001', other = '01J00000000000000000000002';
const reg = { id, participant_id:other, created_by_user_id:id, event_id:7, channel:'online', status:'pending',
  created_at:'2026-10-27T00:00:00Z',updated_at:'2026-10-27T00:00:00Z',first_name:'Synthetic',last_name:'User',national_id:'DO_NOT_KEEP',medical_record:'DO_NOT_KEEP' };
const json = (body,status=200)=>new Response(JSON.stringify(body),{status});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const profile={id,username:'synthetic',role:'user'};

test('read contract accepts five states separately from strict pending POST and omits private details',()=>{
  for(const status of ['pending','approved','waiting','rejected','cancelled']){
    const data=validateRegistrationRead({...reg,status});assert.equal(data.status,status);
    assert(!Object.hasOwn(data,'national_id'));assert(!Object.hasOwn(data,'medical_record'));
  }
  for(const patch of [{status:'confirmed'},{event_id:'7'},{id:123},{created_by_user_id:'anonymous'},{channel:'unknown'}])assert.throws(()=>validateRegistrationRead({...reg,...patch}),ApiError);
});
test('offline readback is accepted without changing strict online creation receipts',async()=>{
  assert.equal(validateRegistrationRead({...reg,channel:'offline'}).channel,'offline');
  const api=createApi({fetchImpl:async()=>json([{...reg,channel:'offline'}])});
  assert.equal((await api.getOrganizerRegistrations('token'))[0].channel,'offline');
});
test('own and organizer reads call different real routes with allowed status and bearer',async()=>{
  const calls=[];const api=createApi({fetchImpl:async(url,options)=>{calls.push({url,options});return json([reg]);}});
  await api.getMyRegistrations('token',{status:'pending'});await api.getOrganizerRegistrations('token');
  assert.equal(calls[0].url,'/api/v1/me/registrations?status=pending');assert.equal(calls[1].url,'/api/v1/registrations');
  assert.equal(calls[0].options.headers.Authorization,'Bearer token');assert.equal(calls[0].options.credentials,'omit');
  await assert.rejects(api.getMyRegistrations('token',{status:'confirmed'}),{kind:'validation'});assert.equal(calls.length,2);
});
test('cancel and approve validate HTTP200, exact record and independent resulting states',async()=>{
  for(const [operation,status,path] of [['cancelRegistration','cancelled',`/api/v1/me/registrations/${id}/cancel`],['approveRegistration','waiting',`/api/v1/registrations/${id}/approve`]]){
    const api=createApi({fetchImpl:async(url,options)=>{assert.equal(url,path);assert.equal(options.method,'POST');assert.equal(options.body,undefined);return json({...reg,status});}});
    assert.equal((await api[operation](id,'token')).status,status);
  }
  for(const result of [{...reg,status:'pending'},{...reg,id:other,status:'cancelled'}]){
    const api=createApi({fetchImpl:async()=>json(result)});await assert.rejects(api.cancelRegistration(id,'token'),{kind:'contract'});
  }
});
test('new mutation server failures are visible and never automatically replayed',async()=>{
  let calls=0;const api=createApi({fetchImpl:async()=>{calls++;return json({detail:'untrusted traceback'},500);}});
  await assert.rejects(api.approveRegistration(id,'token'),e=>e.kind==='server'&&!e.message.includes('traceback'));assert.equal(calls,1);
});
test('upload sends multipart without manually supplying boundary and accepts only valid201',async()=>{
  const file=new File([new Uint8Array([1,2,3])],'image.png',{type:'image/png'});
  const api=createApi({fetchImpl:async(url,options)=>{
    assert.equal(url,'/api/v1/files');assert.equal(options.headers['Content-Type'],undefined);
    assert(options.body instanceof FormData);assert.equal(options.body.get('folder'),'events');
    assert.equal(options.body.get('file').name,'image.png');
    return json({filename:'image.png',provider:'local',url:'/uploads/events/test.png'},201);
  }});
  assert.equal((await api.uploadEventImage(file,'token')).url,'/uploads/events/test.png');
  for(const code of [200,202])await assert.rejects(createApi({fetchImpl:async()=>json({filename:'image.png',provider:'local',url:'/uploads/events/test.png'},code)}).uploadEventImage(file,'token'),{kind:'contract'});
});
test('upload size/type and hostile returned locations fail closed',async()=>{
  let calls=0;const api=createApi({fetchImpl:async()=>{calls++;return json({filename:'image.png',provider:'local',url:'data:image/png,evil'},201);}});
  await assert.rejects(api.uploadEventImage(new File(['x'],'file.html',{type:'text/html'}),'token'),{kind:'validation'});
  await assert.rejects(api.uploadEventImage(new File([new Uint8Array(900*1024+1)],'image.png',{type:'image/png'}),'token'),{kind:'validation'});assert.equal(calls,0);
  await assert.rejects(api.uploadEventImage(new File(['x'],'image.png',{type:'image/png'}),'token'),{kind:'contract'});assert.equal(calls,1);
});
test('image URLs reject local file, traversal, credentials and executable formats',()=>{
  for(const value of ['file:///E:/secret','E:\\secret.png','blob:x','data:image/png,x','javascript:alert(1)','//host/image.png','/uploads/../secret.png','/uploads/%2e%2e/secret.png','/uploads/test.svg','https://user:pw@example.test/a.png'])assert.equal(safeImagePath(value),null);
  assert.equal(safeImagePath('/uploads/events/a.png'),'/uploads/events/a.png');assert.equal(safeImagePath('https://example.test/a.webp'),'https://example.test/a.webp');
});
test('raster renderer hides broken image and never injects HTML',()=>{
  const img={addEventListener(name,fn){this[name]=fn;}};const rendered=createEventImage('/uploads/events/a.png',{createElement:tag=>{assert.equal(tag,'img');return img;}});
  assert.equal(rendered.src,'/uploads/events/a.png');assert.equal(rendered.referrerPolicy,'no-referrer');rendered.error();assert.equal(rendered.hidden,true);
});
test('trusted quota displays source counts, rejects inconsistent or absent values and never infers remaining',()=>{
  const quota={online:{approved:1,capacity:2},offline:{approved:0,capacity:1},total:{approved:1,capacity:3},waitingCount:4};
  assert.deepEqual(validatedQuota(quota),quota);
  for(const value of [null,{}, {...quota,total:{approved:0,capacity:3}}, {...quota,offline:{approved:null,capacity:1}}])assert.equal(validatedQuota(value),null);
  class N {constructor(tag){this.tag=tag;this.children=[];}append(...v){this.children.push(...v);}}
  const doc={createElement:t=>new N(t)};const view=createQuotaView(quota,doc);assert.deepEqual(view.children.filter(x=>x.tag==='dd').map(x=>x.textContent),['1 / 2','0 / 1','1 / 3','4']);
  assert(!view.children.some(x=>/remaining|available|confirmed/i.test(x.textContent)));
});
async function sessionWith(role='user',extra={}){
  const api={login:async()=>'token',getMe:async()=>({...profile,role}),...extra};
  const session=createSession({api});await session.signIn({username:'synthetic',password:'not-sent-by-fixture'});return {session,api};
}
test('Session verifies identity then reads owned records and rejects other owner rows',async()=>{
  const {session,api}=await sessionWith('user',{getMyRegistrations:async()=>[reg]});assert.equal((await session.getMyRegistrations())[0].id,id);
  api.getMyRegistrations=async()=>[{...reg,created_by_user_id:other}];await assert.rejects(session.getMyRegistrations(),{kind:'contract'});
});
test('Session blocks ordinary organizer surfaces before any privileged call',async()=>{
  let calls=0;const {session}=await sessionWith('user',{getOrganizerRegistrations:async()=>{calls++;},uploadEventImage:async()=>{calls++;},approveRegistration:async()=>{calls++;}});
  await assert.rejects(session.getOrganizerRegistrations(),{kind:'forbidden'});await assert.rejects(session.uploadEventImage({}),{kind:'forbidden'});await assert.rejects(session.approveRegistration(id),{kind:'forbidden'});assert.equal(calls,0);
});
test('Session fails changed DB role before write; does not downgrade to Guest',async()=>{
  let calls=0;const {session,api}=await sessionWith('organizer',{uploadEventImage:async()=>{calls++;}});
  api.getMe=async()=>profile;await assert.rejects(session.uploadEventImage({}),{kind:'forbidden'});assert.equal(calls,0);assert.equal(session.user,null);
});
test('Session clears identity on expired token and sends no action',async()=>{
  let calls=0;const {session,api}=await sessionWith('user',{cancelRegistration:async()=>{calls++;}});
  api.getMe=async()=>{throw new ApiError('unauthorized','Expired',401);};await assert.rejects(session.cancelRegistration(id),{kind:'unauthorized'});assert.equal(calls,0);assert.equal(session.hasToken,false);
});
test('Session classifies logout during write as uncertain and hides late result',async()=>{
  const pending=deferred();const {session}=await sessionWith('user',{cancelRegistration:()=>pending.promise});
  const action=session.cancelRegistration(id);await new Promise(setImmediate);session.logout();pending.resolve({...reg,status:'cancelled'});
  await assert.rejects(action,{kind:'uncertain'});
});
test('Session discards late read after logout',async()=>{
  const pending=deferred();const {session}=await sessionWith('user',{getMyRegistrations:()=>pending.promise});
  const action=session.getMyRegistrations();await new Promise(setImmediate);session.logout();pending.resolve([reg]);await assert.rejects(action,{kind:'aborted'});
});
