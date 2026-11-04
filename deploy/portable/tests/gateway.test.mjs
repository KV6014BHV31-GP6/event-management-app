// Container adapter only: local temporary files + read-only public API stub.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGateway} from '../runtime/server.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
let dir,upstream,gateway,base,apiPort,requests=[];
function start(server){return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port)));}
function close(server){server.closeAllConnections();return new Promise(r=>server.close(r));}
function raw(path,headers={}){return new Promise((resolve,reject)=>{const req=http.request(base,{path,headers,method:'GET'},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end();});}
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'nu-docker-contract-'));await mkdir(join(dir,'assets'));await mkdir(join(dir,'uploads'));
 await writeFile(join(dir,'index.html'),'<title>NU packaging fixture, not product UI</title>');
 await writeFile(join(dir,'assets/app.js'),'console.log("static fixture");');
 await writeFile(join(dir,'sw.js'),'// synthetic service worker fixture');
 await writeFile(join(dir,'manifest.webmanifest'),'{}');
 upstream=http.createServer((req,res)=>{requests.push({method:req.method,url:req.url});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[],total_count:0}));});apiPort=await start(upstream);
 gateway=await createGateway({webRoot:dir,proxyModule:join(root,'release/source/frontend/dev-server.mjs'),upstream:`http://127.0.0.1:${apiPort}`,uploadRoot:join(dir,'uploads')});base=`http://127.0.0.1:${await start(gateway)}`;
});
after(async()=>{await close(gateway);await close(upstream);await rm(dir,{recursive:true,force:true});});
test('root serves static page without rebuilding React',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/NU packaging fixture/);});
test('query-based router still serves index',async()=>{assert.equal((await fetch(base+'/?view=events')).status,200);});
test('JS assets preserve content type',async()=>{const r=await fetch(base+'/assets/app.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);});
test('service worker remains a static source file',async()=>{const r=await fetch(base+'/sw.js');assert.equal(r.status,200);assert.match(await r.text(),/fixture/);});
test('manifest remains accessible',async()=>{assert.equal((await fetch(base+'/manifest.webmanifest')).status,200);});
test('public GET API still uses original proxy',async()=>{const r=await fetch(base+'/api/v1/events?page=1&pageSize=1');assert.equal(r.status,200);assert.equal((await r.json()).total_count,0);});
test('read-only readiness checks API/schema availability',async()=>{const r=await fetch(base+'/__container_health');assert.equal(r.status,200);assert.equal((await r.json()).status,'ready');});
test('readiness response cannot claim product acceptance',async()=>{const r=await fetch(base+'/__container_health');assert.match((await r.json()).scope,/not feature acceptance/);});
test('nonlocal host denied',async()=>{assert.equal((await raw('/',{Host:'public.invalid'})).status,403);});
test('cross-origin denied',async()=>{assert.equal((await raw('/',{Origin:'https://external.invalid'})).status,403);});
test('source documentation not exposed',async()=>{assert.equal((await fetch(base+'/docs/AGENTS.md')).status,404);});
test('invalid percent encoding safely refused',async()=>{assert.equal((await raw('/%zz')).status,400);});
test('path traversal refused',async()=>{assert.equal((await raw('/%2e%2e/secret.txt')).status,403);});
test('unknown static file not a fake success',async()=>{assert.equal((await fetch(base+'/missing.png')).status,404);});
test('no business/authentication writes reached stub',()=>{assert.ok(requests.length>0);assert.ok(requests.every(x=>x.method==='GET'));});
