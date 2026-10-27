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
