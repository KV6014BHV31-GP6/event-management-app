/* Bounded production React -> proxy -> FastAPI E2E. No mocks or storage writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {chromium} = require(path.join(process.env.NU_BROWSER_TOOLS, 'node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const out = process.env.NU_CI_OUTPUT;
const privateDir = process.env.NU_BROWSER_PRIVATE;
const base = process.env.NU_BROWSER_URL;
const sha = process.env.NU_BROWSER_SOURCE_SHA;
const mode = process.env.NU_BROWSER_EXECUTION_MODE;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (name, value, dir = out) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
const report = {schema:'nu.demo-browser-e2e/1',status:'FAIL',source_sha:sha,execution_mode:mode,
  helper_sha256:hash(fs.readFileSync(__filename)),api:[],fixture_api:[],checkpoints:[],page_errors:0,
  document_viewer:{status:'NOT_RUN'},offline:{status:'NOT_RUN'},
  full_40ac:'NOT_RUN; separate fixed-SHA independent acceptance required'};
let phase = 'preflight';
function checkpoint(name, value = {}) {
  report.checkpoints.push({name,at:new Date().toISOString(),...value});
  json('browser-e2e.json', report);
}
function png() {
  function crc(bytes) { let c=0xffffffff; for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; }
  function chunk(type, bytes) { const t=Buffer.from(type), n=Buffer.alloc(4), c=Buffer.alloc(4);n.writeUInt32BE(bytes.length);c.writeUInt32BE(crc(Buffer.concat([t,bytes])));return Buffer.concat([n,t,bytes,c]); }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(16);ihdr.writeUInt32BE(16,4);ihdr[8]=8;ihdr[9]=2;
  const rows=Buffer.alloc(16*(1+16*3));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const p=y*49+1+x*3;rows[p]=32+x*8;rows[p+1]=96+y*5;rows[p+2]=140;}
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
async function stored(page) {
  // Read-only inspection. Product UI alone creates/queues/reconciles every row.
  return page.evaluate(async () => {
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rose-pulse-offline-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('IndexedDB read failed'));});
    try { const result={};for(const name of ['events','drafts','batches'])result[name]=await new Promise((resolve,reject)=>{const r=db.transaction(name,'readonly').objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('IndexedDB read failed'));});return result; }
    finally { db.close(); }
  });
}
function draftIdentity(rows) {
  return rows.map(row=>({id:row.client_submission_id,event:row.event_public_id,application:row.application})).sort((a,b)=>a.id.localeCompare(b.id));
}
async function main() {
  assert(out && privateDir && base && /^[0-9a-f]{40}$/.test(sha),'Explicit output/private/base/full SHA required');
  assert(['GITHUB_HOSTED','AUTHOR_LOCAL'].includes(mode),'Explicit evidence execution mode required');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sha,'Actual checkout SHA differs');
  assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'','Tracked checkout must be clean');
  if(mode==='GITHUB_HOSTED')assert(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_SHA===sha,'Hosted source binding required');
  if(mode==='GITHUB_HOSTED')assert(!process.env.NU_BROWSER_EXECUTABLE,'Hosted browser must use pinned bundled Chromium');
  fs.mkdirSync(out,{recursive:true});fs.mkdirSync(privateDir,{recursive:true});
  const profile=path.join(privateDir,'profile');assert(!fs.existsSync(profile),'Fresh task-owned browser profile required');
  const context=await chromium.launchPersistentContext(profile,{headless:true,
    ...(process.env.NU_BROWSER_EXECUTABLE?{executablePath:process.env.NU_BROWSER_EXECUTABLE}:{}),
    viewport:{width:1440,height:1000},locale:'en-GB',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  report.browser=context.browser().version();
  report.browser_source=mode==='GITHUB_HOSTED'?'pinned Playwright bundled Chromium':'AUTHOR_LOCAL installed Chrome; not hosted Chromium equivalence';
  const requests=[];const responses=[];const pageErrors=[];
  page.on('pageerror',()=>pageErrors.push('pageerror'));
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,method:request.method()});});
  page.on('response',response=>{
    const url=new URL(response.url());if(url.pathname.startsWith('/api/')){
      const item={path:url.pathname,method:response.request().method(),status:response.status()};
      if(/^\/api\/v2\/files\/[^/]+\/content$/.test(url.pathname)){
        item.authenticated=Boolean(response.request().headers().authorization);
        item.private_no_store=/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers()['cache-control']||'');
      }
      responses.push(item);report.api.push(item);
    }
  });
  let fixture={};let fixtureSequence=0;
  async function api(route,{method='GET',data,token,multipart,expected=200}={}) {
    // Persist intent before any fixture mutation; do not retry unknown outcomes.
    const intent=++fixtureSequence;
    if(method!=='GET')json(`fixture-intent-${intent}.json`,{route,method,data,multipart:multipart?{purpose:multipart.purpose,file_sha256:hash(multipart.file.buffer)}:undefined},privateDir);
    const response=await context.request.fetch(new URL(route,base).href,{method,data,multipart,
      headers:token?{Authorization:`Bearer ${token}`}:{},maxRedirects:0});
    report.fixture_api.push({path:route,method,status:response.status()});
    if(method!=='GET')json(`fixture-outcome-${intent}.json`,{route,method,status:response.status()},privateDir);
    assert.equal(response.status(),expected,`Fixture ${method} ${route} status`);
    return response.json();
  }
  const button=name=>page.getByRole('button',{name,exact:true});
  async function login(username,password) {
    await page.goto(new URL('?view=login',base).href,{waitUntil:'networkidle'});
    await page.getByLabel('Username',{exact:true}).fill(username);
    await page.getByLabel('Password',{exact:true}).fill(password);
    await button('Log in').click();await button('Log out').waitFor();
    assert.equal(await page.getByLabel('Password',{exact:true}).count(),0,'Credential form cleared before screenshots');
  }
  try {
    phase='public-signup-login';
    await page.goto(new URL('?view=events&keyword=Synthetic%20community%20event',base).href,{waitUntil:'networkidle'});
    await page.getByText('Synthetic community event 1',{exact:true}).first().waitFor();
    await page.screenshot({path:path.join(out,'public-browse.png')});
    await page.goto(new URL('?view=signup',base).href);
    await page.getByLabel('Username',{exact:true}).fill(process.env.NU_SMOKE_USERNAME);
    await page.getByLabel('Password',{exact:true}).fill(process.env.NU_SMOKE_PASSWORD);
    json('signup-intent.json',{username:process.env.NU_SMOKE_USERNAME},privateDir);
    await button('Create account').click();
    await page.getByText(/Account .* was created\. Log in to continue\./).waitFor();
    await login(process.env.NU_SMOKE_USERNAME,process.env.NU_SMOKE_PASSWORD);
    await page.reload({waitUntil:'networkidle'});await button('Log out').waitFor();
    assert(responses.some(r=>r.path==='/api/v1/users'&&r.method==='POST'&&r.status===201));
    assert(responses.some(r=>r.path==='/api/v1/users/me'&&r.status===200));
    await page.getByText(sha,{exact:false}).first().waitFor();
    checkpoint(phase,{ui_signup:true,authenticated_reload:true,build_sha_visible:true});

    phase='new-synthetic-fixtures';
    const owner=await api('/api/v1/auth/login',{method:'POST',data:{username:'demo_organizer',password:process.env.SEED_PASSWORD}});
    const participant=await api('/api/v1/auth/login',{method:'POST',data:{username:process.env.NU_SMOKE_USERNAME,password:process.env.NU_SMOKE_PASSWORD}});
    const bytes=png();fs.writeFileSync(path.join(privateDir,'synthetic.png'),bytes);
    const image=await api('/api/v2/files',{method:'POST',token:owner.access_token,expected:201,multipart:{purpose:'event_image',file:{name:'ci-synthetic.png',mimeType:'image/png',buffer:bytes}}});
    const document=await api('/api/v2/files',{method:'POST',token:participant.access_token,expected:201,multipart:{purpose:'supporting_document',file:{name:'ci-private-synthetic.png',mimeType:'image/png',buffer:bytes}}});
    const now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
    const envelope=(data,version=null)=>({contract_version:'rose.demo-journey.v1',operation_id:crypto.randomUUID(),expected_version:version,data});
    const created=await api('/api/v2/operations/events',{method:'POST',token:owner.access_token,data:envelope({
      event:{title:'CI browser '+process.env.NU_SMOKE_USERNAME,overview:'Synthetic CI fixture only. Generated geometric PNG; no real participant or external delivery.',location:'Synthetic CI hall',start_time:iso(3600000),end_time:iso(7200000),online_quota:2,offline_quota:5,image_file_ids:[image.id]},
      timezone:'Asia/Kuala_Lumpur',registration_opens_at:iso(-86400000),registration_closes_at:iso(3500000),
      policy:{allocation_mode:'separate_pools_offer',offer_minutes:10,walkin_pool:'offline',checkin_opens_at:iso(3000000),checkin_closes_at:iso(7500000),reminder_hours:1,low_demand_ratio:0.5}})});
    fixture={event_public_id:created.resource_id,document_id:document.id,document_sha256:hash(bytes),username:process.env.NU_SMOKE_USERNAME};json('fixture.json',fixture,privateDir);
    await api(`/api/v2/operations/events/${fixture.event_public_id}/publish`,{method:'POST',token:owner.access_token,data:envelope({},created.resource_version)});
    const registration=await api(`/api/v1/events/${fixture.event_public_id}/registrations`,{method:'POST',token:participant.access_token,expected:201,data:{first_name:'CIOnline',last_name:'Synthetic',gender:'female',date_of_birth:'1990-01-01',phone:'0000000000',national_id:process.env.NU_SMOKE_USERNAME+'-online',file_ids:[document.id]}});
    fixture.registration_id=registration.id;json('fixture.json',fixture,privateDir);checkpoint(phase,{private_fixture_ledger:true});

    phase='document-viewer';
    await button('Log out').click();await login('demo_organizer',process.env.SEED_PASSWORD);
    await page.goto(new URL(`?view=operations&event=${fixture.event_public_id}`,base).href,{waitUntil:'networkidle'});
    await button('Read current event').click();
    await page.getByRole('heading',{name:'CI browser '+process.env.NU_SMOKE_USERNAME,exact:true}).waitFor();
    await page.getByText('Registration review and booking',{exact:true}).click();
    await button('Choose a registration').click();
    await page.getByLabel('Participant',{exact:true}).selectOption(fixture.registration_id);await button('Read registration').click();
    const thumbnail=page.getByRole('img',{name:'Document thumbnail: ci-private-synthetic.png',exact:true});
    await thumbnail.waitFor();await page.waitForFunction(()=>{const img=document.querySelector('.document-card img');return img?.complete&&img.naturalWidth===16&&img.naturalHeight===16;});
    await button('Preview ci-private-synthetic.png').click();
    const dialog=page.getByRole('dialog',{name:'ci-private-synthetic.png',exact:true});await dialog.waitFor();
    await page.waitForFunction(()=>{const img=document.querySelector('.document-stage img');return img?.complete&&img.naturalWidth===16&&img.naturalHeight===16;});
    await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();await dialog.getByText('125%',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Fit',exact:true}).click();await dialog.getByText('100%',{exact:true}).waitFor();
    const downloadEvent=page.waitForEvent('download');await dialog.getByRole('link',{name:'Download',exact:true}).click();
    const download=await downloadEvent;const downloaded=path.join(privateDir,'downloaded-private.png');await download.saveAs(downloaded);
    assert.equal(hash(fs.readFileSync(downloaded)),fixture.document_sha256,'Actual private download bytes differ');
    await page.screenshot({path:path.join(out,'document-viewer.png')});
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    const privateResponses=responses.filter(r=>r.path===`/api/v2/files/${document.id}/content`&&r.status===200);
    assert(privateResponses.length>=2,'Thumbnail and modal must use real private GET');
    assert(privateResponses.every(r=>r.method==='GET'&&r.authenticated&&r.private_no_store),'Private GET must be authenticated and no-store');
    // Retain only Boolean authorization/cache evidence, never token/header values.
    const authEvidence=await page.evaluate(()=>({modalClosed:!document.querySelector('[role=dialog]')}));
    assert(authEvidence.modalClosed);
    report.document_viewer={status:'PASS',authenticated_get:privateResponses.length>=2,preview_decoded:true,download_hash_match:true,private_no_store:true,private_get_count:privateResponses.length,source_png_sha256:hash(bytes),decoded_size:[16,16],zoom_fit_escape:true};
    checkpoint(phase);

    phase='offline-save-reload';
    await page.goto(new URL(`?view=offline&event=${fixture.event_public_id}`,base).href,{waitUntil:'networkidle'});
    await button('Load available events').click();
    await page.getByLabel('Online event',{exact:true}).selectOption(fixture.event_public_id);
    await button('Download selected event').click();
    await page.getByLabel('Downloaded event',{exact:true}).selectOption(fixture.event_public_id);
    const initial=await stored(page);assert.equal(initial.drafts.length,0,'Fresh profile must have no old drafts');
    await button('Simulated Offline').click();const offlineStart=requests.length;
    for(let i=1;i<=3;i++){
      for(const [label,value]of Object.entries({'First name':'CIOffline'+i,'Last name':'Synthetic','Phone':'000000000'+i,'National ID':process.env.NU_SMOKE_USERNAME+'-offline-'+i,'Date of birth':'1990-01-01'}))await page.getByLabel(label,{exact:true}).fill(value);
      await page.getByLabel('Gender',{exact:true}).selectOption('female');
      await page.getByLabel('I confirm every value is synthetic test data.',{exact:true}).check();
      json(`local-save-intent-${i}.json`,{ordinal:i,event_public_id:fixture.event_public_id},privateDir);
      await button('Save draft on this device').click();
      await page.getByRole('heading',{name:'Local synthetic draft '+i,exact:true}).waitFor();
      await button('Queue for manual sync').last().click();
      await page.getByText('Draft added to the local pending queue. Nothing has been sent.',{exact:true}).waitFor();
    }
    const before=await stored(page);assert.equal(before.drafts.length,3);assert(before.drafts.every(row=>row.state==='pending_sync'));
    json('offline-before-reload.json',before,privateDir);
    await page.reload({waitUntil:'networkidle'});
    // A reload loses live auth. Unlock only the product's previously verified synthetic identity.
    const unlock=button('Unlock local synthetic drafts');
    if(await unlock.count()){
      await page.getByLabel('I understand this unlocks unencrypted synthetic local data only.',{exact:true}).check();await unlock.click();
    }
    await page.getByRole('heading',{name:'Local synthetic draft 3',exact:true}).waitFor();
    const after=await stored(page);json('offline-after-reload.json',after,privateDir);
    assert.deepEqual(draftIdentity(after.drafts),draftIdentity(before.drafts),'IDs/application payloads must survive actual reload');
    assert(after.drafts.every(row=>row.state==='pending_sync'));
    const offlineRequests=requests.slice(offlineStart);assert.equal(offlineRequests.length,0,'Simulated offline capture/reload issued a real API request');
    await page.screenshot({path:path.join(out,'offline-reloaded.png')});
    report.offline={status:'IN_PROGRESS',draft_count:3,ids_preserved:true,payloads_preserved:true,offline_api_requests:offlineRequests.length,
      draft_identity_sha256:hash(JSON.stringify(draftIdentity(after.drafts)))};checkpoint(phase);

    phase='restore-manual-lost-ack-get';
    const restoreStart=requests.length;await button('Restore Connection').click();await page.waitForLoadState('networkidle');
    const autoPosts=requests.slice(restoreStart).filter(r=>r.method==='POST');assert.equal(autoPosts.length,0,'Restore automatically POSTed');
    // Fresh server login is required; do not edit storage or inject credentials.
    if(await button('Log out').count())await button('Log out').click();
    await login('demo_organizer',process.env.SEED_PASSWORD);
    await page.goto(new URL(`?view=offline&event=${fixture.event_public_id}`,base).href,{waitUntil:'networkidle'});
    await page.getByLabel('Downloaded event',{exact:true}).selectOption(fixture.event_public_id);
    await page.getByRole('heading',{name:'Local synthetic draft 3',exact:true}).waitFor();
    let sentEnvelope;
    // Read the outgoing request and durably preserve its IDs before continuing it unchanged.
    await page.route('**/api/v2/events/*/offline-batches',async route=>{
      const request=route.request();assert.equal(request.method(),'POST');assert(!sentEnvelope,'No second POST is allowed');
      sentEnvelope=request.postDataJSON();json('sent-envelope.json',sentEnvelope,privateDir);await route.continue();
    });
    await button('Lose next sync acknowledgement').click();
    const sendStart=responses.length;await button('Manually sync selected event').click();
    await page.getByText('Saved batch needs reconciliation',{exact:true}).waitFor();
    assert(sentEnvelope);const unknown=await stored(page);json('unknown-after-real-success.json',unknown,privateDir);
    assert.equal(unknown.batches.length,1);assert.equal(unknown.batches[0].batch_id,sentEnvelope.batch_id);assert.equal(unknown.batches[0].state,'needs_review');
    assert.deepEqual(sentEnvelope.items.map(i=>i.client_submission_id).sort(),before.drafts.map(d=>d.client_submission_id).sort());
    await page.screenshot({path:path.join(out,'lost-ack-needs-review.png')});
    await button('Reconcile saved batch').click();
    await page.getByText('Saved batch needs reconciliation',{exact:true}).waitFor({state:'detached'});
    const reconciled=await stored(page);json('reconciled.json',reconciled,privateDir);
    assert.equal(reconciled.batches[0].state,'synced');assert(reconciled.drafts.every(d=>d.state==='synced'&&d.batch_id===sentEnvelope.batch_id));
    const sync=responses.slice(sendStart);const posts=sync.filter(r=>r.path.endsWith('/offline-batches')&&r.method==='POST');
    const gets=sync.filter(r=>r.path.endsWith('/offline-batches/'+sentEnvelope.batch_id)&&r.method==='GET');
    assert.equal(posts.length,1);assert.equal(posts[0].status,200);assert.equal(gets.length,1);assert.equal(gets[0].status,200);
    Object.assign(report.offline,{status:'PASS',restore_auto_posts:autoPosts.length,batch_post_count:posts.length,batch_post_status:posts[0].status,
      unknown_visible:true,receipt_get_count:gets.length,receipt_get_status:gets[0].status,recovered_same_batch:true,
      batch_id:sentEnvelope.batch_id,submission_ids:sentEnvelope.items.map(i=>i.client_submission_id),request_sha256:hash(JSON.stringify(sentEnvelope))});
    await page.screenshot({path:path.join(out,'receipt-reconciled.png')});checkpoint(phase);
    report.page_errors=pageErrors.length;assert.equal(pageErrors.length,0,'Unexpected pageerror');
    report.status='PASS';checkpoint('complete');
  } catch(error) {
    report.page_errors=pageErrors.length;report.failed_phase=phase;
    // Assertion/locator details may include form data. Keep public failure bounded.
    report.failure='E2E assertion or operation failed; inspect private checkpoint before any retry';
    json('failure-private.json',{phase,error:String(error.stack)},privateDir);checkpoint('failed');
    throw new Error('Browser E2E failed at '+phase+'; preserved checkpoint, no automatic retry');
  } finally { await context.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
