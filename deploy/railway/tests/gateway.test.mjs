import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
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
function duplicateHostRequest(port){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port},()=>socket.write(
      'GET /__container_health HTTP/1.1\r\nHost: healthcheck.railway.app\r\n'
      +'Host: healthcheck.railway.app\r\nConnection: close\r\n\r\n'));
    let response='';
    socket.on('data',chunk=>response+=chunk);
    socket.on('end',()=>resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(response)?.[1])));
    socket.on('error',reject);
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
test('Railway Host reaches only exact read-only readiness and retains upstream failure',async()=>{
  let upstreamMode='ready';
  let eventsReads=0;
  const backend=http.createServer((req,res)=>{
    eventsReads++;
    assert.equal(req.method,'GET');
    assert.equal(req.url,'/api/v1/events?page=1&pageSize=1');
    if(upstreamMode==='unavailable')return req.socket.destroy();
    res.writeHead(upstreamMode==='ready'?200:500,{'Content-Type':'application/json'});
    res.end(upstreamMode==='ready'?'{"events":[]}':'{"detail":"not ready"}');
  });
  let gateway;
  try{
    const upstreamPort=await listen(backend);
    gateway=createGateway({origin:'https://rosepulse.up.railway.app',root:process.cwd(),
      uploadRoot:null,upstream:`http://127.0.0.1:${upstreamPort}`});
    const port=await listen(gateway);
    const platform='healthcheck.railway.app';
    const get=await request(port,{host:platform,path:'/__container_health'});
    assert.equal(get.status,200);
    assert.match(get.body,/"status":"ready"/);
    const head=await request(port,{host:platform,path:'/__container_health',method:'HEAD'});
    assert.equal(head.status,200);
    assert.equal(head.body,'');
    assert.equal(eventsReads,2);
    assert.equal(await duplicateHostRequest(port),403);
    for(const options of [
      {host:platform,path:'/__container_health',origin:'https://attacker.example'},
      {host:platform,path:'/__container_health',origin:''},
      {host:'HEALTHCHECK.RAILWAY.APP',path:'/__container_health'},
      {host:platform,path:'/__container_health',method:'POST'},
      {host:platform,path:'/api/v1/events'},
      {host:platform,path:'/'},
      {host:platform,path:'/docs'},
      {host:platform,path:'/__container_health?x=1'},
      {host:platform,path:'/__container_health/'},
    ])assert.equal((await request(port,options)).status,403,JSON.stringify(options));
    assert.equal(eventsReads,2);
    upstreamMode='not-ready';
    assert.equal((await request(port,{host:platform,path:'/__container_health'})).status,503);
    upstreamMode='unavailable';
    assert.equal((await request(port,{host:platform,path:'/__container_health'})).status,503);
    assert.equal(eventsReads,4);
  }finally{if(gateway)await close(gateway);await close(backend);}
});
test('invalid or missing public origin is rejected at startup',()=>{
  assert.throws(()=>createGateway({origin:null}),/canonical HTTPS origin/);
  assert.throws(()=>createGateway({origin:'http://rosepulse.up.railway.app'}),/canonical HTTPS origin/);
});
