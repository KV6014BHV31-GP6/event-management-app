import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api.mjs';
import { createSession } from '../session.mjs';
import { eventPayload, createEventController, createEventImageController, validateEventImageFile, MAX_EVENT_IMAGE_BYTES, mountCreateEvent } from '../create-event.mjs';
import { eventFormValues, editEventPayload, createEditEventController, mountEditEvent } from '../edit-event.mjs';

const values = { title:'Synthetic event', overview:'Synthetic only', location:'Hall', start_time:'2027-02-02T09:00', end_time:'2027-02-02T10:00', online_quota:'1', offline_quota:'0' };
const original = { ...eventPayload(values), id:7, public_id:'synthetic-event-00001', organizer_id:'organizer-1', status:'active', image_path:'/uploads/events/original.png', created_at:'2027-01-01T00:00:00Z', updated_at:'2027-01-01T00:00:00Z' };
const file = () => new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'synthetic.png', { type:'image/png' });
const session = overrides => ({ user:{ id:'organizer-1', role:'organizer' }, revision:1, ...overrides });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };

test('Create keeps its original seven fields and includes only an explicit safe image URL', () => {
  assert.equal(Object.keys(eventPayload(values)).length, 7);
  assert.equal(eventPayload({ ...values, image_path:'/uploads/events/pixel.png' }).image_path, '/uploads/events/pixel.png');
  assert.equal(eventPayload({ ...values, image_path:null }).image_path, null);
  for (const image_path of ['blob:https://example.invalid/123', 'data:image/png;base64,AA', 'C:\\private\\image.png', 'javascript:alert(1)', '/backend/.env']) {
    assert.throws(() => eventPayload({ ...values, image_path }), e => e.kind === 'validation');
  }
});

test('image selection validates raster extension, MIME and bounded upload size', () => {
  assert.equal(validateEventImageFile(file()).name, 'synthetic.png');
  for (const invalid of [null, {name:'synthetic.svg',type:'image/svg+xml',size:100}, {name:'synthetic.png',type:'text/html',size:100}, {name:'synthetic.png',type:'image/png',size:0}, {name:'synthetic.png',type:'image/png',size:MAX_EVENT_IMAGE_BYTES + 1}]) {
    assert.throws(() => validateEventImageFile(invalid), e => e.kind === 'validation');
  }
});

test('image upload is organizer-only and never posts invalid selection', async () => {
  for (const user of [null, {id:'user-1',role:'user'}, {id:'leader-1',role:'leader'}]) {
    let calls=0;
    const controller=createEventImageController({ session:session({user,uploadEventImage:async()=>{calls++;}}) });
    await controller.upload(file()); assert.equal(calls,0); assert.equal(controller.state.status,'error');
  }
  let calls=0;
  const controller=createEventImageController({session:session({uploadEventImage:async()=>{calls++;}})});
  await controller.upload(null); assert.equal(calls,0); assert.equal(controller.state.status,'error');
});

test('pending and successful image uploads are single writes with a retained server URL', async () => {
  const pending=deferred(); let calls=0;
  const controller=createEventImageController({session:session({uploadEventImage:()=>{calls++;return pending.promise;}})});
  const first=controller.upload(file()); await controller.upload(file());
  assert.equal(calls,1); assert.equal(controller.state.status,'submitting');
  pending.resolve({filename:'synthetic.png',url:'/uploads/events/pixel.png',provider:'local'}); await first;
  await controller.upload(file()); assert.equal(calls,1); assert.equal(controller.state.status,'success'); assert.equal(controller.state.url,'/uploads/events/pixel.png');
});

test('unknown or malformed upload results lock resubmission', async () => {
  for (const result of [() => {throw new ApiError('network','Disconnected');}, () => {throw new ApiError('timeout','Timed out');}, () => {throw new ApiError('server','Failed',500);}, () => ({url:'blob:untrusted'})]) {
    let calls=0;
    const controller=createEventImageController({session:session({uploadEventImage:async()=>{calls++;return result();}})});
    await controller.upload(file()); await controller.upload(file());
    assert.equal(calls,1); assert.equal(controller.state.status,'uncertain'); assert.equal(controller.state.url,null); assert.match(controller.state.message,/Do not upload again/);
  }
});

test('a known upload rejection permits correction, but does not upload automatically', async () => {
  let calls=0;
  const controller=createEventImageController({session:session({uploadEventImage:async()=>{calls++;throw new ApiError('validation','Choose a supported image.',422);}})});
  await controller.upload(file()); assert.equal(calls,1); assert.equal(controller.state.status,'error');
  await controller.upload(file()); assert.equal(calls,2);
  assert.equal(controller.clearSelection(),true);assert.equal(controller.state.status,'idle');assert.equal(calls,2);
});

test('image upload permits an explicit retry after Session verification fails before any write', async () => {
  let unavailable=false, writes=0;
  const identity=createSession({storage:{getItem:()=> 'synthetic-token'},api:{
    getMe:async()=>{if(unavailable)throw new ApiError('network','Offline');return {id:'organizer-1',role:'organizer'};},
    uploadEventImage:async()=>{writes++;return {url:'/uploads/events/pixel.png'};},
  }});
  await identity.restore(); unavailable=true;
  const controller=createEventImageController({session:identity});
  await controller.upload(file());
  assert.equal(writes,0);assert.equal(controller.state.status,'error');assert.match(controller.state.message,/No action was sent/);
  unavailable=false;await new Promise(setImmediate);assert.equal(writes,0);
  await controller.upload(file());assert.equal(writes,1);assert.equal(controller.state.status,'success');
});

test('clearing a selection cannot unlock pending, successful or uncertain uploads', async () => {
  const pending=deferred();const controller=createEventImageController({session:session({uploadEventImage:()=>pending.promise})});
  const upload=controller.upload(file());assert.equal(controller.clearSelection(),false);
  pending.resolve({url:'/uploads/events/pixel.png'});await upload;
  assert.equal(controller.clearSelection(),false);assert.equal(controller.state.url,'/uploads/events/pixel.png');
  const uncertain=createEventImageController({session:session({uploadEventImage:async()=>{throw new ApiError('network','Offline');}})});
  await uncertain.upload(file());assert.equal(uncertain.clearSelection(),false);assert.equal(uncertain.state.status,'uncertain');
});

test('account or revision changes hide late and previously completed upload results', async () => {
  for (const change of [s=>{s.user=null;},s=>{s.revision++;},s=>{s.user={id:'other',role:'organizer'};}]) {
    const pending=deferred(); const identity=session({uploadEventImage:()=>pending.promise});
    const controller=createEventImageController({session:identity}); const first=controller.upload(file());
    change(identity); pending.resolve({url:'/uploads/events/pixel.png'}); await first;
    assert.equal(controller.state.status,'uncertain'); assert.equal(controller.state.url,null);
  }
  const identity=session({uploadEventImage:async()=>({url:'/uploads/events/pixel.png'})});
  const controller=createEventImageController({session:identity}); await controller.upload(file()); identity.revision++;
  assert.equal(controller.state.status,'uncertain'); assert.equal(controller.state.url,null);
});

test('a failed Create retains the uploaded URL and never re-uploads', async () => {
  let uploads=0, creates=0;
  const identity=session({uploadEventImage:async()=>{uploads++;return {url:'/uploads/events/pixel.png'};}, createEvent:async payload=>{creates++;assert.equal(payload.image_path,'/uploads/events/pixel.png');throw new ApiError('server','Backend failed',500);}});
  const media=createEventImageController({session:identity}); await media.upload(file());
  const create=createEventController({session:identity}); await create.submit({...values,image_path:media.state.url});
  assert.equal(create.state.status,'uncertain'); assert.equal(media.state.status,'success'); assert.equal(media.state.url,'/uploads/events/pixel.png'); assert.equal(uploads,1); assert.equal(creates,1);
});

test('Edit sends only changed schema fields and preserves untouched timestamp precision', () => {
  const precise={...original,start_time:'2027-02-02T01:00:35Z',end_time:'2027-02-02T02:00:45Z'};
  const form=eventFormValues(precise);
  assert.deepEqual(editEventPayload({...form,title:'Revised',id:99,organizer_id:'other'},precise),{title:'Revised'});
  assert.deepEqual(editEventPayload({...form,image_path:null},precise),{image_path:null});
  assert.throws(()=>editEventPayload(form,precise), e=>e.kind==='validation');
  assert.throws(()=>editEventPayload({...form,status:'approved'},precise), e=>e.kind==='validation');
});

test('Edit preserves distinct server timestamps within one displayed minute', () => {
  const precise={...original,start_time:'2027-02-02T01:00:10Z',end_time:'2027-02-02T01:00:50Z'};
  const form=eventFormValues(precise);
  assert.equal(form.start_time,form.end_time);
  assert.deepEqual(editEventPayload({...form,title:'Revised'},precise),{title:'Revised'});
  const later=eventFormValues({...precise,end_time:'2027-02-02T01:01:00Z'}).end_time;
  assert.deepEqual(editEventPayload({...form,end_time:later},precise),{end_time:'2027-02-02T01:01:00.000Z'});
  assert.throws(()=>editEventPayload({...form,start_time:later},precise), e=>e.kind==='validation');
});

test('Edit can preserve or remove an unsupported old image without accepting a new unsafe URL', () => {
  const legacy={...original,image_path:'/uploads/events/legacy.svg'};
  const form=eventFormValues(legacy);
  assert.deepEqual(editEventPayload({...form,title:'Revised'},legacy),{title:'Revised'});
  assert.deepEqual(editEventPayload({...form,image_path:null},legacy),{image_path:null});
  assert.deepEqual(editEventPayload({...form,image_path:'/uploads/events/replacement.png'},legacy),{image_path:'/uploads/events/replacement.png'});
  assert.throws(()=>editEventPayload({...form,image_path:'/uploads/events/other.svg'},legacy), e=>e.kind==='validation');
});

test('failed Event GET prevents editing and cannot be replaced with cached event data', async () => {
  let patches=0;
  const controller=createEditEventController({api:{getEvent:async()=>{throw new ApiError('server','The service is temporarily unavailable.',500);}}, session:session({updateEvent:async()=>{patches++;}})});
  await controller.load(original.public_id); assert.equal(controller.state.status,'error'); assert.equal(controller.state.event,null); assert.match(controller.state.message,/editing is unavailable/);
  await controller.submit({...eventFormValues(original),title:'Revised'}); assert.equal(patches,0);
});

test('Edit requires valid public ID, organizer identity and event ownership before any PATCH', async () => {
  let reads=0,patches=0;
  const api={getEvent:async()=>{reads++;return original;}};
  const denied=createEditEventController({api,session:session({user:{id:'u',role:'user'},updateEvent:async()=>{patches++;}})});
  await denied.load(original.public_id); assert.equal(reads,0);
  const other=createEditEventController({api,session:session({user:{id:'other',role:'organizer'},updateEvent:async()=>{patches++;}})});
  await other.load(original.public_id); assert.equal(other.state.event,null); assert.match(other.state.message,/Only the event organizer/);
  await other.submit({...eventFormValues(original),title:'Revised'}); assert.equal(patches,0);
  await other.load('123'); assert.equal(reads,1);
});

test('Edit only reports success after PATCH and a matching fresh GET', async () => {
  const pending=deferred(); const changed={...original,title:'Revised'}; let reads=0,patches=0;
  const controller=createEditEventController({api:{getEvent:async()=>{reads++;return reads===1?original:changed;}},session:session({updateEvent:(id,payload)=>{patches++;assert.equal(id,original.public_id);assert.deepEqual(payload,{title:'Revised'});return pending.promise;}})});
  await controller.load(original.public_id); const first=controller.submit({...eventFormValues(original),title:'Revised'}); await controller.submit({...eventFormValues(original),title:'Revised'});
  assert.equal(patches,1); assert.equal(reads,1); assert.equal(controller.state.status,'submitting');
  pending.resolve(changed); await first;
  assert.equal(reads,2); assert.equal(controller.state.status,'success'); assert.match(controller.state.message,/read back/);
  await controller.submit({...eventFormValues(original),title:'Again'}); assert.equal(patches,1);
});

test('Edit permits an explicit retry after Session verification fails before any PATCH', async () => {
  let unavailable=false, reads=0, writes=0;
  const changed={...original,title:'Revised'};
  const api={
    getMe:async()=>{if(unavailable)throw new ApiError('network','Offline');return {id:'organizer-1',role:'organizer'};},
    getEvent:async()=>{reads++;return writes?changed:original;},
    updateEvent:async()=>{writes++;return changed;},
  };
  const identity=createSession({api,storage:{getItem:()=> 'synthetic-token'}});
  await identity.restore();
  const controller=createEditEventController({api,session:identity});
  await controller.load(original.public_id);unavailable=true;
  const values={...eventFormValues(original),title:'Revised'};
  await controller.submit(values);
  assert.equal(writes,0);assert.equal(reads,1);assert.equal(controller.state.status,'error');assert.match(controller.state.message,/No action was sent/);
  unavailable=false;await new Promise(setImmediate);assert.equal(writes,0);
  await controller.submit(values);assert.equal(writes,1);assert.equal(reads,2);assert.equal(controller.state.status,'success');
});

test('PATCH failure or unverifiable readback remains uncertain without automatic resend', async () => {
  for (const mode of ['patch500','read500','readOld','readWrongId']) {
    let reads=0,patches=0;
    const changed={...original,title:'Revised'};
    const controller=createEditEventController({api:{getEvent:async()=>{reads++;if(reads===1)return original;if(mode==='read500')throw new ApiError('server','Failed',500);return mode==='readOld'?original:mode==='readWrongId'?{...changed,id:99}:changed;}},session:session({updateEvent:async()=>{patches++;if(mode==='patch500')throw new ApiError('server','Failed',500);return changed;}})});
    await controller.load(original.public_id); await controller.submit({...eventFormValues(original),title:'Revised'});
    assert.equal(controller.state.status,'uncertain',mode); assert.match(controller.state.message,/Do not submit/);
    await controller.submit({...eventFormValues(original),title:'Revised'}); await controller.load(original.public_id); assert.equal(patches,1);
  }
});

test('Edit discards a late PATCH success after logout or identity revision change', async () => {
  for (const logout of [false,true]) {
    const pending=deferred(); let reads=0;
    const identity=session({updateEvent:()=>pending.promise});
    const controller=createEditEventController({api:{getEvent:async()=>{reads++;return original;}},session:identity});
    await controller.load(original.public_id); const first=controller.submit({...eventFormValues(original),title:'Revised'});
    if(logout)identity.user=null; else identity.revision++;
    pending.resolve({...original,title:'Revised'}); await first;
    assert.equal(controller.state.status,'uncertain'); assert.equal(reads,1);
  }
});

class Element {
  constructor() { this.handlers={}; this.children=[]; this.hidden=false; this.disabled=false; this.files=[]; }
  addEventListener(name,handler) { this.handlers[name]=handler; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=[...nodes]; }
  setAttribute(name,value) { this[name]=value; }
  reportValidity() { return true; }
}
async function withFormDOM(ids, fetchImpl, callback) {
  const nodes=Object.fromEntries(ids.map(id=>['#'+id,new Element()]));
  nodes['#event-fields'].disabled=true;
  const globals={document:{querySelector:id=>nodes[id],createElement:()=>new Element()},
    location:{search:'?event='+original.public_id},addEventListener(){},
    sessionStorage:{getItem:()=> 'synthetic-token',removeItem(){}},fetch:fetchImpl,
    FormData:class {
      constructor(form) {this.fields=new Map(form?Object.entries(values):[]);}
      append(key,value) {this.fields.set(key,value);}
      [Symbol.iterator]() {return this.fields.entries();}
    }};
  const saved=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try {
    for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    await callback(nodes);
  } finally {
    for(const [key,descriptor] of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const tick=()=>new Promise(setImmediate);

test('Create DOM requires an explicit upload and preserves its URL after Create fails', async () => {
  const ids=['account','auth-notice','create-event-form','event-fields','create-progress','create-result','login-prompt','organizer-prompt','create-timezone','created-title','created-id','created-view','created-edit','create-submit','event-image-file','upload-event-image','upload-progress','upload-preview','uploaded-image-url'];
  const pending=deferred(); let uploads=0,creates=0;
  await withFormDOM(ids,async(url,options)=>{
    if(url.endsWith('/users/me'))return json({id:'organizer-1',username:'synthetic',role:'organizer'});
    if(url.endsWith('/files')){uploads++;return pending.promise;}
    creates++; assert.equal(JSON.parse(options.body).image_path,'/uploads/events/pixel.png');return json({},500);
  },async nodes=>{
    mountCreateEvent(); await tick();
    nodes['#event-image-file'].files=[file()]; nodes['#event-image-file'].handlers.change();
    const submit=()=>nodes['#create-event-form'].handlers.submit({preventDefault(){}});
    submit(); assert.equal(uploads,0); assert.equal(creates,0); assert.equal(nodes['#create-submit'].disabled,true);
    nodes['#upload-event-image'].handlers.click(); await tick(); submit();
    assert.equal(uploads,1); assert.equal(creates,0); assert.equal(nodes['#event-fields'].disabled,true);
    pending.resolve(json({filename:'synthetic.png',provider:'local',url:'/uploads/events/pixel.png'},201));await tick();
    assert.equal(nodes['#uploaded-image-url'].textContent,'/uploads/events/pixel.png');assert.equal(nodes['#create-submit'].disabled,false);
    submit(); await tick(); assert.equal(creates,1); assert.match(nodes['#create-progress'].textContent,/unknown/);
    assert.equal(nodes['#uploaded-image-url'].textContent,'/uploads/events/pixel.png');assert.equal(nodes['#upload-event-image'].disabled,true);
    submit();nodes['#upload-event-image'].handlers.click();await tick();assert.equal(creates,1);assert.equal(uploads,1);
  });
});

test('Edit DOM keeps the form hidden and disabled when real-contract GET returns 500', async () => {
  const ids=['account','auth-notice','edit-event-form','event-fields','edit-progress','login-prompt','organizer-prompt','edit-retry','edited-view','remove-image','edit-timezone','event-image-file','upload-event-image','upload-progress','upload-preview','uploaded-image-url','edit-submit'];
  let reads=0,patches=0;
  await withFormDOM(ids,async(url,options)=>{
    if(url.endsWith('/users/me'))return json({id:'organizer-1',username:'synthetic',role:'organizer'});
    if(options.method==='PATCH')patches++;else reads++;
    return json({},500);
  },async nodes=>{
    mountEditEvent();await tick();
    assert.equal(reads,1);assert.equal(nodes['#event-fields'].disabled,true);assert.equal(nodes['#edit-event-form'].hidden,true);
    assert.match(nodes['#edit-progress'].textContent,/editing is unavailable/);assert.equal(nodes['#edit-retry'].hidden,false);
    nodes['#edit-event-form'].handlers.submit({preventDefault(){}});await tick();assert.equal(patches,0);
  });
});
