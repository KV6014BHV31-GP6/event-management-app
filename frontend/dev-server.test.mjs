import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createDevServer} from './dev-server.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

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
