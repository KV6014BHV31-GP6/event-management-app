import {openDB} from 'idb';
export function createAttendanceStore({name='rose-demo-synthetic-attendance-v1',now=()=>Date.now()}={}){
 let opening;const db=()=>opening||(opening=openDB(name,1,{upgrade(d){d.createObjectStore('rosters',{keyPath:'key'});d.createObjectStore('actions',{keyPath:'key'});}}));
 const actorId=actor=>{if(!actor?.id||!['organizer','leader'].includes(actor.role))throw new Error('A verified staff identity is required.');return actor.id;};
 const key=(actor,event)=>`${actorId(actor)}:${event}`;
 const save=async(table,row)=>{const d=await db();await d.put(table,row);const read=await d.get(table,row.key);if(JSON.stringify(read)!==JSON.stringify(row))throw new Error('Attendance storage readback failed. Nothing was confirmed saved.');return read;};
 const api={async saveRoster(actor,eventId,snapshot){return save('rosters',{key:key(actor,eventId),actor_id:actorId(actor),event_id:eventId,snapshot:structuredClone(snapshot),saved_at:now(),synthetic_only:true});},async roster(actor,eventId){return (await db()).get('rosters',key(actor,eventId));},async pending(actor,eventId){return (await (await db()).getAll('actions')).filter(r=>r.actor_id===actorId(actor)&&r.event_id===eventId).sort((a,b)=>a.created_at-b.created_at);},async capture(actor,eventId,registrationId){const roster=await api.roster(actor,eventId);const row=roster?.snapshot.rows.find(r=>r.registration_id===registrationId);if(!row||row.status!=='approved'||row.arrived)throw new Error('Only a preloaded approved booking can be queued. A cancelled booking cannot become a walk-in.');const actions=await api.pending(actor,eventId);if(actions.some(a=>a.registration_id===registrationId&&!['rejected','discarded'].includes(a.state)))throw new Error('This booking already has a saved attendance action.');const id=crypto.randomUUID();const d=await db();const tx=d.transaction('actions','readwrite');const existing=await tx.store.getAll();if(existing.some(a=>a.actor_id===actor.id&&a.event_id===eventId&&a.registration_id===registrationId&&!['rejected','discarded'].includes(a.state))){tx.abort();throw new Error('This booking already has a saved attendance action.');}const value={key:key(actor,eventId)+':'+id,actor_id:actor.id,event_id:eventId,attendance_operation_id:id,device_id:crypto.randomUUID(),registration_id:registrationId,participant_name:[row.first_name,row.last_name].filter(Boolean).join(' '),state:'pending',reason:'',created_at:now(),schema_version:'rose.attendance-action.v1'};await tx.store.put(value);await tx.done;const read=await d.get('actions',value.key);if(JSON.stringify(read)!==JSON.stringify(value))throw new Error('Attendance storage readback failed.');return read;},async update(actor,eventId,id,patch){const k=key(actor,eventId)+':'+id;const row=await (await db()).get('actions',k);if(!row)throw new Error('Attendance action unavailable for this account.');return save('actions',{...row,...patch,updated_at:now()});},async unresolved(actor,eventId){return (await api.pending(actor,eventId)).some(r=>!['accepted','discarded'].includes(r.state));},async close(){if(opening)(await opening).close();opening=null;}};return api;
}
const localLocks = new Map();
async function actionLock(actor,eventId,id,operation){
 const name=`rose.attendance.${actor.id}.${eventId}.${id}`;
 if(globalThis.navigator?.locks?.request)return navigator.locks.request(name,operation);
 const previous=localLocks.get(name)||Promise.resolve();let release;const current=new Promise(resolve=>release=resolve);const tail=previous.catch(()=>{}).then(()=>current);localLocks.set(name,tail);await previous.catch(()=>{});
 try{return await operation();}finally{release();if(localLocks.get(name)===tail)localLocks.delete(name);}
}
const refusalCodes=new Set(['INVALID_TRANSITION','EVENT_CLOSED','WINDOW_CLOSED','STALE_VERSION','CAPACITY_UNAVAILABLE','INVALID_INPUT','ALREADY_ARRIVED','PENDING_ATTENDANCE','OFFER_EXPIRED']);
function refusalProof(refusal,root,row){
 if(!refusal||refusal.path!==root+'/attendance/intents'||!refusalCodes.has(refusal.code)||refusal.attendance_operation_id!==row.attendance_operation_id||!/^[0-9a-f-]{36}$/.test(refusal.operation_id||'')||!/^[0-9a-f]{64}$/.test(refusal.fingerprint||''))return null;
 return {...refusal,classification:'intent_refused_before_creation'};
}
function archivedProof(client,actor,root,row){
 const saved=(client.refused?.(actor.id)||[]).filter(op=>op.path===root+'/attendance/intents'&&op.body?.data?.attendance_operation_id===row.attendance_operation_id).at(-1);
 return saved?refusalProof({path:saved.path,code:saved.terminal_reason,operation_id:saved.body.operation_id,fingerprint:saved.fingerprint,attendance_operation_id:saved.body.data.attendance_operation_id},root,row):null;
}
async function currentAction(store,actor,eventId,id){const row=(await store.pending(actor,eventId)).find(action=>action.attendance_operation_id===id);if(!row)throw new Error('Attendance action unavailable for this account.');return row;}
export async function reconcileAttendanceAction({store,actor,eventId,action,client,discard=false}){
 return actionLock(actor,eventId,action.attendance_operation_id,async()=>{
  const row=await currentAction(store,actor,eventId,action.attendance_operation_id);if(['accepted','discarded'].includes(row.state))return row;
  const root=`/events/${eventId}`;let result;
  try{result=await client.get(root+'/attendance/'+row.attendance_operation_id);}catch(error){
   if(error.status!==404)throw error;
   // A missing GET alone never proves an attempted write had no effect.
   const proof=row.no_intent_proof||((row.phase==='intent_submitting')?archivedProof(client,actor,root,row):null);
   if(proof&&refusalProof(proof,root,row))return store.update(actor,eventId,row.attendance_operation_id,{state:discard?'discarded':'conflict',no_intent_proof:proof,reason:discard?'Explicitly discarded after a bound terminal refusal and missing-intent readback.':'The server refused this intent. Reconcile before explicitly discarding the local action.'});
   return store.update(actor,eventId,row.attendance_operation_id,{state:'needs_review',reason:'Attendance outcome remains unknown. Reconcile the immutable operation receipt before another send.'});
  }
  // Existing server state always wins over a prior local refusal or snapshot.
  if(result.state==='arrived')return store.update(actor,eventId,row.attendance_operation_id,{state:'accepted',no_intent_proof:null,reason:''});
  if(result.state==='cancelled')return store.update(actor,eventId,row.attendance_operation_id,{state:discard?'discarded':'rejected',no_intent_proof:null,reason:'Server cancelled this attendance intent.'});
  if(result.state!=='pending')throw new Error('The attendance response could not be verified.');
  if(discard){const event=await client.get(root);await client.mutate(root+'/attendance/'+row.attendance_operation_id+'/discard',{reason:'Presenter reconciled and discarded synthetic attendance intent.'},event.workflow.version);return store.update(actor,eventId,row.attendance_operation_id,{state:'discarded',no_intent_proof:null,reason:'Explicitly discarded after server readback.'});}
  return store.update(actor,eventId,row.attendance_operation_id,{state:'needs_review',phase:'intent_recorded',no_intent_proof:null,reason:'Server intent remains pending; arrival is not confirmed.'});
 });
}
export async function syncAttendance({store,actor,eventId,client,verify}){
 const verified=await verify();if(verified?.id!==actor.id||!['leader','organizer'].includes(verified.role))throw new Error('Log in with the same account before attendance sync.');
 const root=`/events/${eventId}`;const rows=await store.pending(actor,eventId);
 for(const candidate of rows.filter(row=>['pending','needs_review'].includes(row.state)))await actionLock(actor,eventId,candidate.attendance_operation_id,async()=>{
  const row=await currentAction(store,actor,eventId,candidate.attendance_operation_id);if(!['pending','needs_review'].includes(row.state))return;
  let attempted=false,stage='preflight';
  try{
   for(const op of (client.pending?.(actor.id)||[]).filter(op=>op.body?.data?.attendance_operation_id===row.attendance_operation_id||op.path.includes(row.attendance_operation_id)))await client.reconcile(op.body.operation_id);
   let server=null;if(row.state==='needs_review'){try{server=await client.get(root+'/attendance/'+row.attendance_operation_id);}catch(error){if(error.status===404){const proof=row.phase==='intent_submitting'?archivedProof(client,actor,root,row):null;if(proof){await store.update(actor,eventId,row.attendance_operation_id,{state:'conflict',no_intent_proof:proof,reason:'The server refused this intent. Reconcile before explicitly discarding the local action.'});return;}throw new Error('Attendance outcome remains unknown. Reconcile the immutable operation receipt before another send.');}throw error;}}
   if(server?.state==='arrived'){await store.update(actor,eventId,row.attendance_operation_id,{state:'accepted',no_intent_proof:null,reason:''});return;}
   if(server?.state==='cancelled'){await store.update(actor,eventId,row.attendance_operation_id,{state:'rejected',no_intent_proof:null,reason:'Server cancelled this attendance intent.'});return;}
   const data={device_id:row.device_id,attendance_operation_id:row.attendance_operation_id,registration_id:row.registration_id};
   if(!server){const event=await client.get(root);await store.update(actor,eventId,row.attendance_operation_id,{state:'needs_review',phase:'intent_submitting',reason:'Sync in progress; reconcile if interrupted.'});attempted=true;stage='intent';await client.mutate(root+'/attendance/intents',data,event.workflow.version);await store.update(actor,eventId,row.attendance_operation_id,{state:'needs_review',phase:'intent_recorded',reason:'Intent recorded; arrival is still pending.'});}
   stage='apply';const event=await client.get(root);attempted=true;await client.mutate(root+'/attendance',data,event.workflow.version);
   const result=await client.get(root+'/attendance/'+row.attendance_operation_id);if(result.state!=='arrived')throw new Error('Arrival has not been confirmed by the server.');await store.update(actor,eventId,row.attendance_operation_id,{state:'accepted',no_intent_proof:null,reason:''});
  }catch(error){const proof=stage==='intent'&&error.terminal?refusalProof(error.refusal,root,row):null;await store.update(actor,eventId,row.attendance_operation_id,{state:[409,422].includes(error.status)?'conflict':!attempted&&row.state==='pending'?'pending':'needs_review',...(proof?{no_intent_proof:proof}:{}),reason:!attempted&&row.state==='pending'?'Not sent. '+error.message:error.message});if([401,403].includes(error.status))throw error;}
 });
 return store.pending(actor,eventId);
}
