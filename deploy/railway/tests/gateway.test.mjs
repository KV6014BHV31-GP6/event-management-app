import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGateway} from '../gateway.mjs';

function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
  });
}
function close(server){return new Promise(resolve=>server.close(resolve));}
function request(port,{path='/',host='rosepulse.up.railway.app',origin,method='GET',body}={}){
  return new Promise((resolve,reject)=>{
    const headers={Host:host};
    if(origin!==undefined)headers.Origin=origin;
    if(body)headers['Content-Type']='application/json';
    const req=http.request({hostname:'127.0.0.1',port,path,method,headers},res=>{
      const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>resolve({status:res.statusCode,
        body:Buffer.concat(parts).toString(),headers:res.headers}));
    });
    req.on('error',reject);
    req.end(body);
  });
}
test('railway gateway enforces strict Host and Origin while retaining real API delegation',async()=>{
  let received=0;
  const backend=http.createServer((req,res)=>{
    if(req.url.startsWith('/api/v1/events') && req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"events":[]}');
    }
    if(req.url==='/api/v1/events'&&req.method==='POST'){
      received++;res.writeHead(201,{'Content-Type':'application/json'});return res.end('{"public_id":"synthetic"}');
    }
    res.writeHead(404);res.end();
  });
  const dir=await mkdtemp(join(tmpdir(),'nu-railway-test-'));
  let gateway;
  try{
    await writeFile(join(dir,'index.html'),'<h1>ROSE PULSE</h1>');
    const upstreamPort=await listen(backend);
    gateway=createGateway({origin:'https://rosepulse.up.railway.app',root:dir,uploadRoot:null,
      upstream:`http://127.0.0.1:${upstreamPort}`});
    const port=await listen(gateway);
    const good=await request(port);assert.equal(good.status,200);assert.match(good.body,/ROSE PULSE/);
    assert.equal((await request(port,{host:'elsewhere.up.railway.app'})).status,403);
    assert.equal((await request(port,{origin:'https://attacker.example',method:'POST',
      path:'/api/v1/events',body:'{}'})).status,403);
    assert.equal(received,0);
    assert.equal((await request(port,{path:'/docs'})).status,404);
    assert.equal((await request(port,{path:'/__container_health'})).status,200);
    const accepted=await request(port,{origin:'https://rosepulse.up.railway.app',method:'POST',
      path:'/api/v1/events',body:'{}'});
    assert.equal(accepted.status,201);assert.equal(received,1);
    assert.equal(accepted.headers['x-robots-tag'],'noindex');
  }finally{if(gateway)await close(gateway);await close(backend);await rm(dir,{recursive:true,force:true});}
});
test('invalid or missing public origin is rejected at startup',()=>{
  assert.throws(()=>createGateway({origin:null}),/canonical HTTPS origin/);
  assert.throws(()=>createGateway({origin:'http://rosepulse.up.railway.app'}),/canonical HTTPS origin/);
});
