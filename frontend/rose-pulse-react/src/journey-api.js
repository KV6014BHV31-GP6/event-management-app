import {demoTransport} from './demo-transport.js';
import {payloadFingerprint} from './offline/queue.js';
const VERSION='rose.demo-journey.v1',PREFIX='/api/v2/operations';
const rollbackCodes=new Set(['STALE_VERSION','EVENT_CLOSED','WINDOW_CLOSED','CAPACITY_UNAVAILABLE','OFFER_EXPIRED','PENDING_ATTENDANCE','INVALID_TRANSITION','INVALID_INPUT','ALREADY_ARRIVED']);
const applicationKey=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
export function offerDecision(path) { return /^\/offers\/([^/]+)\/(accept|decline)$/.exec(path); }
export function createJourneyClient({fetchImpl=demoTransport.fetch,storage=globalThis.localStorage,keyStorage=globalThis.sessionStorage,authorize,guestReference,guestHeaders=()=>({})}={}){
 const key=actor=>`rose.demo.synthetic.operations.${actor}`,privateKey=id=>`rose.demo.application-key.${id}`;
 function pending(actor){try{return JSON.parse(storage.getItem(key(actor))||'[]');}catch{throw new Error('Saved operation references could not be read.');}}
 function save(actor,rows){const text=JSON.stringify(rows);storage.setItem(key(actor),text);if(storage.getItem(key(actor))!==text)throw new Error('Operation reference was not confirmed saved. Nothing was sent.');}
 function patch(actor,id,change){save(actor,pending(actor).map(row=>row.body.operation_id===id?{...row,...change}:row));}
 function archive(actor,row,reason){const historyKey=key(actor)+'.refused';const rows=JSON.parse(storage.getItem(historyKey)||'[]');const text=JSON.stringify([...rows,{...row,terminal_reason:reason}]);storage.setItem(historyKey,text);if(storage.getItem(historyKey)!==text)throw new Error('The refusal could not be saved. Keep the original reference.');save(actor,pending(actor).filter(r=>r.body.operation_id!==row.body.operation_id));keyStorage?.removeItem(privateKey(row.body.operation_id));}
 function boundHeaders(id){const saved=keyStorage?.getItem(privateKey(id));return saved?{'X-Application-Key':saved}:{};}
 async function request(path,{token,headers={},method='GET',body}={}){const response=await fetchImpl(PREFIX+path,{method,headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...guestHeaders(path),...headers,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error'});let data;try{data=await response.json();}catch{throw new Error('The response could not be verified. Reconcile before sending again.');}if(!response.ok){const error=new Error(data.detail?.message||'The operation was refused. Read the current record.');error.status=response.status;error.code=data.detail?.code;throw error;}return data;}
 function guestOffer(actor, token, path) { return actor === 'guest' && !token && offerDecision(path); }
 function requireGuestOfferScope(row, legacy = false) {
   if (!guestReference || (row.guest_registration_id !== guestReference &&
       !(legacy && row.guest_registration_id === undefined)))
     throw new Error('The saved offer request could not be verified for this booking.');
 }
 function validateReceipt(data, id, path, guestDecision) {
   const invalid = () => new Error('The operation receipt could not be verified.');
   if (data?.contract_version !== VERSION || data.operation_id !== id || data.outcome !== 'applied')
     throw invalid();
   if (path?.endsWith('/applications')) {
     const reference = data.effects?.registration_id;
     if (data.kind !== 'application_create' || data.effects?.status !== 'pending' ||
       typeof reference !== 'string' || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(reference) ||
       data.resource_id !== reference) throw invalid();
   }
   if (guestDecision) {
     const [, offerId, decision] = guestDecision;
     if (data.kind !== 'offer_' + decision || data.resource_id !== offerId ||
         data.effects?.registration_id !== guestReference ||
         data.effects?.status !== (decision === 'accept' ? 'approved' : 'cancelled')) throw invalid();
   }
   return data;
 }
 function finish(actor,id){save(actor,pending(actor).filter(r=>r.body.operation_id!==id));keyStorage?.removeItem(privateKey(id));}
 async function receipt(actor, id, token) {
   const row = pending(actor).find(item => item.body.operation_id === id);
   const decision = guestOffer(actor, token, row?.path);
   if (decision) requireGuestOfferScope(row, true);
   try {
     const data = validateReceipt(await request('/receipts/' + id, {token, headers: boundHeaders(id)}), id, row?.path, decision);
     finish(actor, id);
     return data;
   } catch (error) {
     if (error.status === 404 && row && (!decision || row.guest_registration_id))
       patch(actor, id, {missing_receipts: Math.min(2, (row.missing_receipts || 0) + 1)});
     throw error;
   }
 }
 // Legacy rows have no local booking binding. The caller's grant must authorize the original receipt.
 async function reconcileLegacyGuestOffers(actor, token) {
   if (actor !== 'guest' || token || !guestReference)
     throw new Error('Verify this booking before checking saved offer receipts.');
   for (const row of pending(actor)) {
     if (!offerDecision(row.path) || row.guest_registration_id !== undefined) continue;
     try {
       return await receipt(actor, row.body.operation_id, token);
     } catch (error) {
       if (error.status !== 403 && error.status !== 404) throw error;
     }
   }
   throw new Error('No saved offer receipt could be verified for this booking.');
 }
 async function send(actor,row,token,body=row.body){try{const data=validateReceipt(await request(row.path,{method:'POST',token,headers:boundHeaders(body.operation_id),body}),body.operation_id,row.path,guestOffer(actor,token,row.path));finish(actor,body.operation_id);return data;}catch(error){if([400,422,429].includes(error.status)||(error.status===409&&rollbackCodes.has(error.code))){archive(actor,row,error.code||String(error.status));error.terminal=true;error.refusal={operation_id:body.operation_id,path:row.path,code:error.code,fingerprint:row.fingerprint,attendance_operation_id:body.data?.attendance_operation_id};}else if(error.status===409&&error.code==='IMMUTABLE_CONFLICT')patch(actor,row.body.operation_id,{immutable_conflict:true});throw error;}}
 return {pending,refused:actor=>JSON.parse(storage.getItem(key(actor)+'.refused')||'[]'),get:(path,options={})=>authorize(token=>request(path,{...options,token})),publicGet:(path,options)=>request(path,options),publicPost:(path,body,headers)=>request(path,{method:'POST',body,headers}),
 mutate:(path,data,expectedVersion)=>authorize(async(token,actor)=>{const actorId=actor?.id||'guest';const decision=guestOffer(actorId,token,path);if(decision&&!guestReference)throw new Error('Verify this booking before responding to an offer.');if(pending(actorId).some(r=>r.path===path))throw new Error('This action has an unresolved reference. Reconcile it first.');const body={contract_version:VERSION,operation_id:crypto.randomUUID(),...(expectedVersion!==undefined?{expected_version:expectedVersion}:{}),data};const fingerprint=await payloadFingerprint(body);const sensitive=path==='/accounts';const row={path,body:sensitive?{...body,data:{...data,password:undefined}}:body,fingerprint,sensitive,created_at:new Date().toISOString(),anonymous_application:!token&&path.endsWith('/applications'),...(decision?{guest_registration_id:guestReference}:{})};if(row.anonymous_application){const secret=applicationKey();keyStorage.setItem(privateKey(body.operation_id),secret);if(keyStorage.getItem(privateKey(body.operation_id))!==secret)throw new Error('Private application recovery key was not confirmed saved. Nothing was sent.');}const current=pending(actorId);if(current.some(r=>r.path===path))throw new Error('This action has an unresolved reference. Reconcile it first.');save(actorId,[...current,row]);return send(actorId,row,token,body);}),
 reconcile:id=>authorize((token,actor)=>receipt(actor?.id||'guest',id,token)),
 reconcileLegacyGuestOffers:()=>authorize((token,actor)=>reconcileLegacyGuestOffers(actor?.id||'guest',token)),
 replayExact:id=>authorize(async(token,actor)=>{const actorId=actor?.id||'guest';const row=pending(actorId).find(r=>r.body.operation_id===id);if(!row||row.sensitive||row.immutable_conflict||(row.missing_receipts||0)<2)throw new Error('Reconcile twice before an explicit exact same-ID retry. Sensitive or immutable conflicts cannot be replayed.');if(guestOffer(actorId,token,row.path))requireGuestOfferScope(row);if(await payloadFingerprint(row.body)!==row.fingerprint)throw new Error('The saved immutable request has changed.');try{return await receipt(actorId,id,token);}catch(error){if(error.status!==404)throw error;}return send(actorId,row,token);}),
 };
}
