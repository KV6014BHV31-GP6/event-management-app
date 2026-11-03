import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep, basename} from 'node:path';
import {createDevServer} from './dev-server.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO7sAAAAASUVORK5CYII=', 'base64');
const EVENT_ID = 'A'.repeat(20) + '-';

test('journey proxy admits explicit operations and preserves scoped guest headers without broadening methods', async () => {
  const observed = [];
  const upstream = http.createServer(async (req, res) => {
    observed.push({path:req.url, grant:req.headers['x-guest-grant'], challenge:req.headers['x-demo-challenge'], application:req.headers['x-application-key']});
    for await (const part of req) {};
    res.writeHead(403, {'Content-Type':'application/json'});
    res.end(JSON.stringify({detail:{code:'FORBIDDEN',message:'Synthetic denied actor'}}));
  });
  const upstreamUrl = await listen(upstream);
  const server = createDevServer({upstream:upstreamUrl}); const base = await listen(server);
  try {
    const suffixes = ['/accounts', `/events/${EVENT_ID}/promotion/pause`, `/events/${EVENT_ID}/attendance/intents`];
    for (const suffix of suffixes) {
      const response = await fetch(base+'/api/v2/operations'+suffix,{method:'POST',headers:{'Content-Type':'application/json','X-Guest-Grant':'synthetic-grant','X-Demo-Challenge':'synthetic-challenge','X-Application-Key':'synthetic-capability-forwarding-fixture'},body:'{}'});
      assert.equal(response.status,403);
      assert.equal((await response.json()).detail.code,'FORBIDDEN');
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
    assert.equal(observed.length,3);
    assert(observed.every(row=>row.grant==='synthetic-grant'&&row.challenge==='synthetic-challenge'&&row.application==='synthetic-capability-forwarding-fixture'));
    for (const [method,suffix] of [['DELETE','/accounts'],['POST','/arbitrary'],['GET','/accounts/../../private']]) {
      const response=await fetch(base+'/api/v2/operations'+suffix,{method});
      assert([403,405].includes(response.status));
    }
    assert.equal(observed.length,3);
  } finally {await close(server);await close(upstream);}
});
const requestRaw = (base, path, method = 'GET') => new Promise((resolve, reject) => {
  const url = new URL(base);
  const request = http.request({hostname:url.hostname, port:url.port, path, method}, response => {
    const parts = [];
    response.on('data', part => parts.push(part));
    response.on('end', () => resolve({status:response.statusCode, headers:response.headers, body:Buffer.concat(parts)}));
  });
  request.on('error', reject); request.end();
});
async function imageFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'nu-proxy-'));
  const uploads = join(directory, 'uploads');
  await mkdir(join(uploads, 'events'), {recursive:true});
  await mkdir(join(directory, 'outside'));
  await writeFile(join(uploads, 'events', 'pixel.png'), PNG);
  await writeFile(join(directory, 'outside', 'pixel.png'), PNG);
  return {directory, uploads, async remove() {
    // Only remove this exact mkdtemp-owned directory, never a calculated parent.
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert.ok(basename(directory).startsWith('nu-proxy-'));
    await rm(directory, {recursive:true, force:true});
  }};
}

test('proxy preserves JSON body, bearer header, query and API failure status', async () => {
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    assert.equal(req.url, '/api/v1/auth/login?page=2');
    assert.equal(req.headers.authorization, 'Bearer synthetic-test-token');
    assert.deepEqual(JSON.parse(body), {username:'synthetic',password:'synthetic'});
    res.writeHead(401, {'Content-Type':'application/json'}); res.end('{"detail":"Incorrect username or password"}');
  });
  const upstreamUrl = await listen(upstream);
  const server = createDevServer({upstream:upstreamUrl}); const base = await listen(server);
  try {
    const result = await fetch(base + '/api/v1/auth/login?page=2', {method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic-test-token'}, body:JSON.stringify({username:'synthetic',password:'synthetic'})});
    assert.equal(result.status, 401); assert.match((await result.json()).detail, /Incorrect/);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  } finally { await close(server); await close(upstream); }
});

test('static server serves module MIME, blocks private files and cross-site calls', async () => {
  const server = createDevServer(); const base = await listen(server);
  try {
    const script = await fetch(base + '/dev-server.mjs');
    assert.equal(script.status,200); assert.match(script.headers.get('content-type'),/javascript/);
    for (const path of ['/.env', '/%2e%2e%2fbackend/.env']) assert.equal((await fetch(base + path)).status,403);
    assert.equal((await fetch(base + '/api/v1/events', {headers:{Origin:'https://example.invalid'}})).status,403);
    const hostStatus = await new Promise((resolve, reject) => {
      const request = http.get(base + '/', {headers:{Host:'example.invalid'}}, response => {response.resume(); resolve(response.statusCode);});
      request.on('error', reject);
    });
    assert.equal(hostStatus,403);
    assert.equal((await fetch(base + '/api/v1/events', {method:'DELETE'})).status,405);
  } finally { await close(server); }
});

test('unavailable backend is a visible 502; no mock data is substituted', async () => {
  const dummy = http.createServer(); const upstream = await listen(dummy); await close(dummy);
  const server = createDevServer({upstream}); const base = await listen(server);
  try { const result = await fetch(base + '/api/v1/events'); assert.equal(result.status,502); assert.match((await result.json()).detail,/unavailable/); }
  finally { await close(server); }
});

test('proxy refuses remote upstream origins', () => {
  for (const upstream of ['https://example.com', 'http://example.com', 'http://127.0.0.1:8000/other']) assert.throws(() => createDevServer({upstream}), /loopback/);
});

test('v2 proxy admits only exact reviewed sync/file/organizer routes and preserves no-store auth boundary', async () => {
  const calls = []; const fileId = '01K00000000000000000000001'; const uuid = '12345678-1234-4234-8234-123456789abc';
  const upstream = http.createServer(async (req, res) => { req.resume(); calls.push({ path: req.url, method: req.method, auth: req.headers.authorization, cookie: req.headers.cookie }); res.writeHead(200, {'Content-Type':req.url.includes('/content') ? 'application/pdf' : 'application/json', 'Content-Disposition':'attachment; filename="synthetic.pdf"'}); res.end('{}'); });
  const server = createDevServer({upstream:await listen(upstream)}); const base = await listen(server);
  try {
    for (const [method, path] of [['GET', `/api/v2/files/${fileId}/content`], ['GET', '/api/v2/me/events?page=1&pageSize=6'], ['GET', '/api/v2/analytics/registrations'], ['POST', `/api/v2/registrations/${fileId}/cancel`], ['POST', `/api/v2/events/${EVENT_ID}/offline-batches`], ['GET', `/api/v2/events/${EVENT_ID}/offline-batches/${uuid}`], ['GET', `/api/v2/events/${EVENT_ID}/offline-submissions/${uuid}`]]) {
      const result = await fetch(base + path, {method, headers:{Authorization:'Bearer synthetic',Cookie:'must-not-forward'}, body:method==='POST' ? '{}' : undefined}); assert.equal(result.status,200,path); assert.equal(result.headers.get('cache-control'),'no-store'); if (path.includes('/content')) assert.match(result.headers.get('content-disposition'),/synthetic.pdf/);
    }
    for (const [method,path] of [['GET','/api/v2/unknown'],['DELETE',`/api/v2/files/${fileId}/content`],['POST',`/api/v2/events/${EVENT_ID}/offline-batches/${uuid}`],['GET',`/api/v2/files/${fileId}/content/`],['GET',`/api/v2/files/%30${fileId.slice(1)}/content`],['GET',`/api/v2/events/${EVENT_ID}/offline-batches/${uuid.toUpperCase()}`]]) assert.equal((await fetch(base+path,{method})).status,405,path);
    assert.equal(calls.length,7); assert.ok(calls.every(row=>row.auth==='Bearer synthetic' && row.cookie===undefined));
  } finally { await close(server); await close(upstream); }
});

test('larger body allowance applies only to authenticated v2 file path, preserving old 1MiB routes', async () => {
  let requests=0; const upstream=http.createServer(async(req,res)=>{ requests++; const parts=[];for await(const part of req)parts.push(part);assert.equal(req.url,'/api/v2/files');assert.equal(Buffer.concat(parts).length,1024*1024+1);res.writeHead(201,{'Content-Type':'application/json'});res.end('{}'); });
  const server=createDevServer({upstream:await listen(upstream)});const base=await listen(server);
  try { assert.equal((await fetch(base+'/api/v2/files',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:Buffer.alloc(1024*1024+1)})).status,201);assert.equal((await fetch(base+'/api/v2/files',{method:'POST',body:Buffer.alloc(8*1024*1024+64*1024+1)})).status,413);assert.equal((await fetch(base+`/api/v2/events/${EVENT_ID}/offline-batches`,{method:'POST',body:Buffer.alloc(1024*1024+1)})).status,413);assert.equal(requests,1); } finally{await close(server);await close(upstream);}
});

test('PATCH is forwarded only for an exact public event identifier', async () => {
  const receipts = [];
  const upstream = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    receipts.push({method:req.method, path:req.url, body:Buffer.concat(parts).toString(), auth:req.headers.authorization});
    res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"saved":true}');
  });
  const upstreamUrl = await listen(upstream);
  const server = createDevServer({upstream:upstreamUrl}); const base = await listen(server);
  const id = EVENT_ID;
  try {
    const response = await fetch(`${base}/api/v1/events/${id}`, {method:'PATCH', headers:{'Content-Type':'application/json', Authorization:'Bearer synthetic'}, body:'{"title":"Revised"}'});
    assert.equal(response.status, 200);
    assert.deepEqual(receipts, [{method:'PATCH', path:`/api/v1/events/${id}`, body:'{"title":"Revised"}', auth:'Bearer synthetic'}]);
    for (const path of ['/api/v1/users', '/api/v1/events', `/api/v1/events/${id}/registrations`, '/api/v1/events/short', `/api/v1/events/${id}/`, `/api/v1/events/%41${id.slice(1)}`]) {
      assert.equal((await fetch(base + path, {method:'PATCH', body:'{}'})).status, 405, path);
    }
    assert.equal(receipts.length, 1);
  } finally { await close(server); await close(upstream); }
});

test('multipart upload preserves bytes and boundary within the existing body limit', async () => {
  const boundary = 'nu-synthetic-boundary';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\nevents\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pixel.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  let requests = 0;
  const upstream = http.createServer(async (req, res) => {
    requests += 1;
    const parts = []; for await (const part of req) parts.push(part);
    assert.equal(req.url, '/api/v1/files');
    assert.equal(req.headers['content-type'], `multipart/form-data; boundary=${boundary}`);
    assert.deepEqual(Buffer.concat(parts), payload);
    assert.equal(req.headers.cookie, undefined);
    res.writeHead(201, {'Content-Type':'application/json', 'Set-Cookie':'refresh_token=synthetic; Secure; HttpOnly'});
    res.end('{"filename":"pixel.png","url":"/uploads/events/pixel.png","provider":"local"}');
  });
  const server = createDevServer({upstream:await listen(upstream)}); const base = await listen(server);
  try {
    const response = await fetch(base + '/api/v1/files', {method:'POST', headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`, Cookie:'refresh_token=synthetic'}, body:payload});
    assert.equal(response.status, 201);
    assert.equal((await response.json()).url, '/uploads/events/pixel.png');
    assert.equal(response.headers.get('set-cookie'), null);
    const oversized = await fetch(base + '/api/v1/files', {method:'POST', headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`}, body:Buffer.alloc(1024 * 1024 + 1)});
    assert.equal(oversized.status, 413);
    assert.equal(requests, 1);
  } finally { await close(server); await close(upstream); }
});

test('POST and PATCH timeout outcomes stay unknown and are not replayed', async () => {
  let requests = 0;
  const upstream = http.createServer((req, res) => { requests += 1; req.resume(); });
  const server = createDevServer({upstream:await listen(upstream), timeout:35}); const base = await listen(server);
  try {
    for (const [method, path] of [['POST', '/api/v1/files'], ['PATCH', `/api/v1/events/${EVENT_ID}`]]) {
      const result = await fetch(base + path, {method, body:'synthetic'});
      assert.equal(result.status, 504);
      assert.match((await result.json()).detail, /unknown.*Do not submit it again/);
    }
    assert.equal(requests, 2);
  } finally { await close(server); await close(upstream); }
});

test('a disconnected write is a visible unknown 502, not a retry instruction', async () => {
  const dummy = http.createServer(); const upstream = await listen(dummy); await close(dummy);
  const server = createDevServer({upstream}); const base = await listen(server);
  try {
    const response = await fetch(base + '/api/v1/files', {method:'POST', body:'synthetic'});
    assert.equal(response.status, 502);
    assert.match((await response.json()).detail, /unknown.*Do not submit it again/);
  } finally { await close(server); }
});

test('local image serving is explicit, read-only, raster-only and byte-preserving', async () => {
  assert.throws(() => createDevServer({uploadRoot:'uploads'}), /absolute/);
  const fixture = await imageFixture();
  const unconfigured = createDevServer(); const noImages = await listen(unconfigured);
  const server = createDevServer({uploadRoot:fixture.uploads}); const base = await listen(server);
  try {
    assert.equal((await fetch(noImages + '/uploads/events/pixel.png')).status, 404);
    const image = await fetch(base + '/uploads/events/pixel.png');
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
    const head = await requestRaw(base, '/uploads/events/pixel.png', 'HEAD');
    assert.equal(head.status, 200); assert.equal(Number(head.headers['content-length']), PNG.length); assert.equal(head.body.length, 0);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await requestRaw(base, '/uploads/events/pixel.png', method)).status, 405);
    for (const [name, bytes] of [['fake.png','<html>not an image</html>'], ['vector.svg','<svg/>'], ['secret.txt','synthetic-only'], ['.env','synthetic-only']]) {
      await writeFile(join(fixture.uploads, name), bytes);
      assert.equal((await requestRaw(base, '/uploads/' + name)).status, 403, name);
    }
    assert.equal((await fetch(base + '/uploads/events/')).status, 403);
    assert.equal((await fetch(base + '/uploads/missing.png')).status, 404);
  } finally { await close(server); await close(unconfigured); await fixture.remove(); }
});

test('local images reject traversal, backslashes and Windows alternate streams', async () => {
  const fixture = await imageFixture(); const server = createDevServer({uploadRoot:fixture.uploads}); const base = await listen(server);
  try {
    for (const path of ['/uploads/../outside/pixel.png', '/uploads/%2e%2e/outside/pixel.png', '/uploads/%2e%2e%2foutside/pixel.png', '/uploads/events%5c..%5c..%5coutside%5cpixel.png', '/uploads/events/pixel.png:secret.png']) {
      assert.equal((await requestRaw(base, path)).status, 403, path);
    }
  } finally { await close(server); await fixture.remove(); }
});

test('local images reject an external symlink or Windows junction', async t => {
  const fixture = await imageFixture();
  let server;
  try {
    try { await symlink(join(fixture.directory, 'outside'), join(fixture.uploads, 'linked'), 'junction'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip(`OS refused synthetic symlink/junction: ${error.code}`); return; }
      throw error;
    }
    server = createDevServer({uploadRoot:fixture.uploads}); const base = await listen(server);
    const response = await fetch(base + '/uploads/linked/pixel.png');
    assert.equal(response.status, 403);
    assert.notDeepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  } finally { if (server) await close(server); await fixture.remove(); }
});
